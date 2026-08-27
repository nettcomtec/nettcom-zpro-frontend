"use client";

// Error boundary GLOBAL do App Router. Captura erros lançados no layout raiz
// (onde o error.tsx comum não alcança) e substitui o documento inteiro — por
// isso precisa renderizar <html>/<body> próprios. Roda FORA dos providers
// (i18n, tema, etc.), então: sem hooks de contexto, texto bilíngue fixo
// (PT + EN discreto) e estilo inline (Tailwind pode não estar carregado aqui).

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sem logger do app aqui (roda fora dos providers) — console direto.
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fafafa",
          color: "#18181b",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: "26rem",
            padding: "2rem 1.5rem",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: "3rem",
              height: "3rem",
              margin: "0 auto 1rem",
              borderRadius: "9999px",
              backgroundColor: "#eef2ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#5d5fef",
              fontSize: "1.5rem",
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            !
          </div>
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", fontWeight: 600 }}>
            Algo deu errado
          </h1>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.875rem", color: "#52525b" }}>
            Ocorreu um erro inesperado. Tente novamente.
          </p>
          <p style={{ margin: "0 0 1.25rem", fontSize: "0.75rem", color: "#a1a1aa" }}>
            Something went wrong. Please try again.
          </p>
          {error?.digest ? (
            <p
              style={{
                margin: "0 0 1.25rem",
                fontSize: "0.6875rem",
                color: "#a1a1aa",
                fontFamily: 'ui-monospace, "JetBrains Mono", Consolas, monospace',
              }}
            >
              Ref: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: "inline-block",
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#5d5fef",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
