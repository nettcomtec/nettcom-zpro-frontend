# frontendNovo Dockerfile — Next.js standalone (multi-stage)
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar dependências
COPY package.json package-lock.json* ./
# Atualiza o npm (o 10.9.x da imagem tem bug 'edgesOut' ao resolver deps) e
# instala sem depender de package-lock (evita lock ausente/dessincronizado).
RUN npm install -g npm@11 && npm install --no-package-lock --force

# Variáveis NEXT_PUBLIC_* precisam estar disponíveis no BUILD (baked into bundle).
# Defaults __ZPRO_API_URL__ e __ZPRO_INTERACTIVE_BAILEYS__ são placeholders — o
# docker-entrypoint.sh substitui pelos valores de $API_URL e $INTERACTIVE_BAILEYS
# (envs runtime) no startup do container, permitindo que UMA imagem publicada
# sirva N domínios/configs diferentes (multi-tenant SaaS via pull).
# Para builds tradicionais com valores fixos, sobrescreva:
#   --build-arg NEXT_PUBLIC_API_URL=https://api.cliente.com
#   --build-arg NEXT_PUBLIC_INTERACTIVE_BAILEYS=true|false
ARG NEXT_PUBLIC_API_URL=__ZPRO_API_URL__
ARG NEXT_PUBLIC_DEFAULT_ENCRYPTION_KEY=zpro-passaporte-2024-encryption-key
ARG NEXT_PUBLIC_INTERACTIVE_BAILEYS=__ZPRO_INTERACTIVE_BAILEYS__
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_DEFAULT_ENCRYPTION_KEY=${NEXT_PUBLIC_DEFAULT_ENCRYPTION_KEY}
ENV NEXT_PUBLIC_INTERACTIVE_BAILEYS=${NEXT_PUBLIC_INTERACTIVE_BAILEYS}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Copiar código fonte e compilar
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Imagem final (runner) — apenas o necessário para produção
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=4444

# Copiar saída standalone do Next.js
COPY --from=builder /app/.next/standalone ./
# Arquivos estáticos precisam estar fora do standalone
COPY --from=builder /app/.next/static ./.next/static
# Pasta public (inclui sw.js gerado pelo serwist e service-worker killswitch Quasar)
COPY --from=builder /app/public ./public

# Entrypoint substitui __ZPRO_API_URL__ pelo valor de $API_URL nos bundles
# compilados antes de iniciar. Imprescindível quando a imagem é pull (multi-tenant).
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

# ─── Backend em Redis + Cluster: o FRONTEND não muda ───
# Quando o backend roda clusterizado (Socket.IO distribuído via Redis Adapter),
# o único cuidado fica no REVERSE PROXY (nginx) na frente do backend: habilitar
# STICKY SESSIONS (ip_hash / hash por cookie) para o Socket.IO e o WebChat WS —
# senão o long-polling e o WS podem cair em workers diferentes. Nenhuma env nem
# rebuild do front é necessária; é só configuração do proxy.

EXPOSE 4444

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
