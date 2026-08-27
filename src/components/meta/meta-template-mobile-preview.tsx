"use client";

import { MessageCircle, Instagram, Camera, Globe, Phone, CornerUpLeft, Link2, ImageIcon, Receipt } from "lucide-react";
import { sanitize } from "@/lib/sanitize";

type Channel = "messenger" | "instagram";

function channelTheme(channel: Channel) {
  if (channel === "instagram") {
    return {
      label: "Instagram Direct",
      headerClass: "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400",
      Icon: Instagram,
      btnClass: "border-pink-200 text-pink-600",
    };
  }
  return {
    label: "Messenger",
    headerClass: "bg-gradient-to-r from-blue-600 to-blue-500",
    Icon: MessageCircle,
    btnClass: "border-blue-200 text-blue-600",
  };
}

/**
 * Pre-visualizacao estilo celular de um template estruturado (HEADER/BODY/BUTTONS)
 * do Messenger — espelha o WabaTemplateMobilePreview com o tema do canal Meta.
 */
export function MessengerTemplatePreview({
  template,
  channel = "messenger",
}: {
  template: any;
  channel?: Channel;
}) {
  if (!template) return null;
  const components: any[] = template.components || [];
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const buttons = components.find((c) => c.type === "BUTTONS");
  const theme = channelTheme(channel);
  const HeaderIcon = theme.Icon;

  const formatBodyText = (text: string) =>
    (text || "")
      .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/\n/g, "<br/>");

  return (
    <div className="flex justify-center">
      <div className="w-64 bg-gray-800 rounded-3xl p-3 shadow-xl">
        <div className="bg-white rounded-2xl overflow-hidden min-h-80">
          <div className={`${theme.headerClass} px-3 py-2 flex items-center gap-2`}>
            <div className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center">
              <HeaderIcon className="w-3 h-3 text-white" />
            </div>
            <span className="text-white text-xs font-medium">{theme.label}</span>
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
              <div className="flex justify-end mt-1">
                <span className="text-xs text-gray-300">12:00</span>
              </div>
            </div>
            {buttons && Array.isArray(buttons.buttons) && buttons.buttons.length > 0 && (
              <div className="mt-1 space-y-1">
                {buttons.buttons.map((btn: any, i: number) => (
                  <div
                    key={i}
                    className={`bg-white rounded border ${theme.btnClass} text-center py-1 px-2 text-xs font-medium shadow-sm flex items-center justify-center gap-1`}
                  >
                    {btn.type === "URL" && <Globe className="w-3 h-3 shrink-0" />}
                    {btn.type === "PHONE_NUMBER" && <Phone className="w-3 h-3 shrink-0" />}
                    {btn.type === "QUICK_REPLY" && <CornerUpLeft className="w-3 h-3 shrink-0" />}
                    {/* Cobrança (ORDER_DETAILS) — preview estático: só ícone e rótulo, sem ação. */}
                    {btn.type === "ORDER_DETAILS" && <Receipt className="w-3 h-3 shrink-0" />}
                    <span>
                      {btn.text ||
                        (btn.type === "URL"
                          ? btn.url || "URL"
                          : btn.type === "PHONE_NUMBER"
                          ? btn.phone_number || "Telefone"
                          : btn.type === "ORDER_DETAILS"
                          ? "Pagar"
                          : "Resposta")}
                    </span>
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

type PreviewGenericButton = { type?: string; title?: string; url?: string; payload?: string };
type PreviewGenericElement = {
  title?: string;
  subtitle?: string;
  image_url?: string;
  default_action_url?: string;
  buttons?: PreviewGenericButton[];
};

/**
 * Pre-visualizacao de um Generic Template (carrossel de cards) do Instagram/Messenger.
 * Aceita o mesmo formato estruturado do GenericTemplateBuilder.
 */
export function GenericTemplatePreview({
  channel = "messenger",
  elements,
}: {
  channel?: Channel;
  elements: PreviewGenericElement[];
}) {
  const theme = channelTheme(channel);
  const HeaderIcon = theme.Icon;
  const cards = (elements || []).filter((el) => (el.title || "").trim() || (el.image_url || "").trim());
  const list = cards.length > 0 ? cards : [{ title: "", subtitle: "", image_url: "", buttons: [] }];

  return (
    <div className="rounded-2xl border bg-gray-50 overflow-hidden">
      <div className={`${theme.headerClass} px-3 py-2 flex items-center gap-2`}>
        <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center">
          <HeaderIcon className="w-3 h-3 text-white" />
        </div>
        <span className="text-white text-xs font-medium">{theme.label}</span>
      </div>
      <div className="p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((el, i) => (
            <div key={i} className="w-44 shrink-0 bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="w-full h-24 bg-gray-200 relative flex items-center justify-center">
                <ImageIcon className="w-7 h-7 text-gray-400" />
                {(el.image_url || "").trim() && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={el.image_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
              </div>
              <div className="p-2 space-y-0.5">
                <p className="text-xs font-semibold text-gray-900 truncate">
                  {(el.title || "").trim() || "Título do card"}
                </p>
                {(el.subtitle || "").trim() && (
                  <p className="text-[11px] text-gray-500 line-clamp-2">{el.subtitle}</p>
                )}
              </div>
              {(el.default_action_url || "").trim() && (
                <div className="px-2 pb-1">
                  <span className="text-[10px] text-gray-400 flex items-center gap-1 truncate">
                    <Link2 className="w-2.5 h-2.5 shrink-0" /> {el.default_action_url}
                  </span>
                </div>
              )}
              {Array.isArray(el.buttons) && el.buttons.filter((b) => (b.title || "").trim()).length > 0 && (
                <div className="border-t divide-y">
                  {el.buttons
                    .filter((b) => (b.title || "").trim())
                    .map((b, j) => (
                      <div
                        key={j}
                        className={`text-center py-1.5 text-[11px] font-medium flex items-center justify-center gap-1 ${theme.btnClass}`}
                      >
                        {b.type === "web_url" ? <Globe className="w-3 h-3 shrink-0" /> : <CornerUpLeft className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{b.title}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MessengerTemplatePreview;
