"use client";

import { Phone, Camera, Globe, Receipt } from "lucide-react";
import { sanitize } from "@/lib/sanitize";
import type { TemplateComponent } from "@/services/waba-meta";

/**
 * Pré-visualização estilo celular WhatsApp de um template WABA.
 * Extraído de configuracoes/meta/page.tsx para reuso em massa/template e outros.
 */
export function WabaTemplateMobilePreview({ template }: { template: any }) {
  if (!template) return null;
  const components: TemplateComponent[] = template.components || [];
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const footer = components.find((c) => c.type === "FOOTER");
  const buttons = components.find((c) => c.type === "BUTTONS");

  const formatBodyText = (text: string) => {
    if (!text) return "";
    return text
      .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/\n/g, "<br/>");
  };

  return (
    <div className="flex justify-center">
      <div className="w-64 bg-gray-800 rounded-3xl p-3 shadow-xl">
        <div className="bg-white rounded-2xl overflow-hidden min-h-80">
          <div className="bg-green-600 px-3 py-2 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center">
              <Phone className="w-3 h-3 text-white" />
            </div>
            <span className="text-white text-xs font-medium">WhatsApp Business</span>
          </div>
          <div className="p-3 bg-gray-50 min-h-48">
            <div className="bg-white rounded-lg shadow-sm p-3 max-w-full">
              {header && (
                <div className="mb-2">
                  {header.format === "IMAGE" && (
                    <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center">
                      <Camera className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  {header.format === "VIDEO" && (
                    <div className="w-full h-24 bg-gray-200 rounded flex items-center justify-center">
                      <span className="text-gray-400 text-xs">VIDEO</span>
                    </div>
                  )}
                  {header.format === "DOCUMENT" && (
                    <div className="w-full h-16 bg-gray-200 rounded flex items-center justify-center">
                      <span className="text-gray-400 text-xs">DOCUMENT</span>
                    </div>
                  )}
                  {(header.format === "TEXT" || !header.format) && header.text && (
                    <p className="font-semibold text-sm text-gray-900">{header.text}</p>
                  )}
                </div>
              )}
              {body?.text && (
                <p
                  className="text-xs text-gray-700 mb-2 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitize(formatBodyText(body.text)) }}
                />
              )}
              {footer?.text && (
                <p className="text-xs text-gray-400 mt-1">{footer.text}</p>
              )}
              <div className="flex justify-end mt-1">
                <span className="text-xs text-gray-300">12:00</span>
              </div>
            </div>
            {buttons && Array.isArray((buttons as any).buttons) && (
              <div className="mt-1 space-y-1">
                {(buttons as any).buttons.map((btn: any, i: number) => (
                  <div
                    key={i}
                    className="bg-white rounded border border-green-200 text-center py-1 px-2 text-xs text-green-600 font-medium shadow-sm flex items-center justify-center gap-1"
                  >
                    {btn.type === "URL" && <Globe className="w-3 h-3 shrink-0" />}
                    {btn.type === "PHONE_NUMBER" && <Phone className="w-3 h-3 shrink-0" />}
                    {/* Cobrança (ORDER_DETAILS) — preview estático: só ícone e rótulo, sem ação. */}
                    {btn.type === "ORDER_DETAILS" && <Receipt className="w-3 h-3 shrink-0" />}
                    <span>{btn.text || (btn.type === "URL" ? btn.url || "URL" : btn.type === "PHONE_NUMBER" ? btn.phone_number || "Telefone" : btn.type === "ORDER_DETAILS" ? "Pagar" : "Resposta Rápida")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
