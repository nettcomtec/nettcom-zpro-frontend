#!/bin/sh
# docker-entrypoint.sh — substitui o placeholder __ZPRO_API_URL__ baked nos
# bundles do Next pelo valor de $API_URL (env runtime). Permite UMA imagem
# servir N domínios — necessário porque NEXT_PUBLIC_* são inlined at build
# time no Next.js, e setar a env no container não tem efeito sem isto.
set -e

if [ -z "${API_URL:-}" ]; then
  echo "[zpro-frontend] ERRO: variavel API_URL nao definida." >&2
  echo "[zpro-frontend] Configure no compose:" >&2
  echo "[zpro-frontend]   environment:" >&2
  echo "[zpro-frontend]     API_URL: https://api.seudominio.com.br" >&2
  exit 1
fi

# Normaliza: remove trailing slash (consistencia com .replace(/\/\$/, ""))
API_URL="${API_URL%/}"

# INTERACTIVE_BAILEYS (opcional, default false) — liga o grupo avancado de
# interativos Baileys (CTA Buttons / Menu de texto / Enquete / Catalogo /
# Carrossel) via placeholder __ZPRO_INTERACTIVE_BAILEYS__, mesmo mecanismo do
# API_URL. Aceita true/1/yes/on (case-insensitive); qualquer outro valor = false.
case "$(printf '%s' "${INTERACTIVE_BAILEYS:-false}" | tr '[:upper:]' '[:lower:]')" in
  true|1|yes|on) INTERACTIVE_BAILEYS_VALUE="true" ;;
  *)             INTERACTIVE_BAILEYS_VALUE="false" ;;
esac

# Sed nos bundles compilados — .next/static (chunks client), .next/server
# (SSR pages) e public/sw.js (service worker compilado pelo serwist).
# O '+' no -exec batches files numa unica chamada de sed (rapido).
echo "[zpro-frontend] Aplicando API_URL=${API_URL} e INTERACTIVE_BAILEYS=${INTERACTIVE_BAILEYS_VALUE} nos bundles..."
find .next public -type f -name '*.js' -exec sed -i \
  -e "s|__ZPRO_API_URL__|${API_URL}|g" \
  -e "s|__ZPRO_INTERACTIVE_BAILEYS__|${INTERACTIVE_BAILEYS_VALUE}|g" {} +
echo "[zpro-frontend] Pronto."

exec "$@"
