"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { acceptTermsForTenant } from "@/services/tenants";

interface AcceptTermsModalProps {
  open: boolean;
  tenantId: number;
  onAccepted: () => void;
}

const POLICY_BASE = "https://ajuda.zdg.com.br/diretrizes-e-politicas";

const TABS = [
  { value: "termos",      label: "Termos de Uso", url: `${POLICY_BASE}/termos-e-condicoes-gerais-de-uso-e-licenciamento` },
  { value: "privacidade", label: "Privacidade",   url: `${POLICY_BASE}/aviso-de-privacidade` },
  { value: "suporte",     label: "Suporte",       url: `${POLICY_BASE}/politica-de-suporte-tecnico` },
  { value: "manutencao",  label: "Manutenção",    url: `${POLICY_BASE}/manutencao-e-seguranca` },
] as const;

type TabValue = typeof TABS[number]["value"];

export function AcceptTermsModal({ open, tenantId, onAccepted }: AcceptTermsModalProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>("termos");
  // Lazy-mount: so carrega o iframe da aba apos ela ser visitada (evita N requests no open).
  const [visited, setVisited] = useState<Set<string>>(() => new Set<string>(["termos"]));
  // Botao de aceite so habilita quando todas as abas foram visitadas (gate de leitura).
  const allVisited = visited.size === TABS.length;
  // O site de termos (GitBook em ajuda.zdg.com.br) envia CSP `frame-ancestors https:`,
  // entao so pode ser embutido num iframe quando o painel roda sob HTTPS. Em http
  // (ex.: http://localhost:3000 no dev) o browser bloqueia o iframe com
  // ERR_BLOCKED_BY_RESPONSE ("conteudo bloqueado"). Nesse caso caimos num fallback
  // amigavel com "abrir em nova aba". Default true = producao (HTTPS), sem flash.
  const [canEmbed, setCanEmbed] = useState(true);
  useEffect(() => {
    setCanEmbed(typeof window !== "undefined" && window.location.protocol === "https:");
  }, []);

  async function handleAccept() {
    setLoading(true);
    try {
      await acceptTermsForTenant(tenantId);
      toast.success("Termos aceitos com sucesso.");
      onAccepted();
    } catch {
      toast.error("Erro ao aceitar os termos. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabValue);
    setVisited((prev) => {
      if (prev.has(value)) return prev;
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-4xl w-[calc(100vw-1rem)] h-[92vh] max-h-[92vh] flex flex-col p-4 sm:p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Termos e Condições de Uso | Política de Privacidade</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="shrink-0 grid grid-cols-2 sm:grid-cols-4 h-auto gap-0.5">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="text-[11px] sm:text-xs whitespace-normal leading-tight h-auto py-1.5 px-2 gap-1"
              >
                <span>{t.label}</span>
                {visited.has(t.value) && (
                  <Check className="h-3 w-3 text-green-600 dark:text-green-500 shrink-0" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((t) => (
            <TabsContent
              key={t.value}
              value={t.value}
              forceMount
              className="flex-1 mt-2 min-h-0 flex flex-col data-[state=inactive]:hidden"
            >
              <div className="flex items-center justify-end pb-1.5 shrink-0">
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Abrir em nova aba <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex-1 border rounded-md overflow-hidden bg-background min-h-0">
                {!visited.has(t.value) ? (
                  <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                    Carregando...
                  </div>
                ) : canEmbed ? (
                  <iframe
                    src={t.url}
                    title={t.label}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <ExternalLink className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground max-w-md">
                      A pré-visualização só aparece quando o painel roda sob HTTPS. Em
                      ambiente local (http) o site de termos bloqueia a incorporação —
                      abra a página em uma nova aba para ler o conteúdo desta seção.
                    </p>
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      Abrir "{t.label}" em nova aba <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter className="shrink-0 pt-2 border-t sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-muted-foreground order-2 sm:order-1">
            {allVisited
              ? "Todas as seções foram visitadas."
              : `Visite todas as seções para habilitar o aceite (${visited.size}/${TABS.length}).`}
          </p>
          <Button
            onClick={handleAccept}
            disabled={loading || !allVisited}
            className="order-1 sm:order-2"
            title={allVisited ? undefined : "Visite todas as seções antes de aceitar"}
          >
            {loading ? "Aceitando..." : "Li e aceito os Termos e a Política de Privacidade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
