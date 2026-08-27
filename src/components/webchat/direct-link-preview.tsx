"use client";

import React from "react";
import { Mic, Paperclip, Send, Volume2 } from "lucide-react";

/**
 * Réplica React da página pública do link direto (WebChatPageServiceZPRO):
 * mesma estrutura, cores e medidas do HTML servido pelo backend, para a
 * pré-visualização acompanhar o rascunho enquanto o admin digita (o iframe da
 * página real só mostra o que já foi salvo).
 *
 * Os textos padrão abaixo espelham DEFAULT_LABELS do backend de propósito: a
 * página do visitante os renderiza assim independentemente do idioma do painel,
 * e é exatamente isso que a aba "Textos da página" existe para sobrescrever.
 */

const DEFAULT_COLOR = "#2196F3";
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

const DEFAULT_STATUS_ONLINE = "Online";
const DEFAULT_INPUT_PLACEHOLDER = "Digite sua mensagem...";
const DEFAULT_PRECHAT_TITLE = "Antes de começar";
const DEFAULT_PRECHAT_SUBTITLE = "Preencha os dados abaixo para iniciar a conversa.";
const DEFAULT_START_CHAT = "Iniciar conversa";
const DEFAULT_PRIVACY_LINK = "Política de privacidade";

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  cpf: "CPF",
};

export interface DirectLinkPreviewProps {
  /** Fallback do título quando a aparência não define um (igual ao backend). */
  channelName: string;
  title: string;
  color: string;
  logoUrl: string;
  welcomeMessage: string;
  placeholder: string;
  preChatEnabled: boolean;
  preChatFields: string[];
  preChatRequired: string[];
  privacyText: string;
  privacyUrl: string;
  /** Override da aba "Textos da página" para o título do formulário inicial. */
  labelFormTitle: string;
  /** Override da aba "Textos da página" para o botão de iniciar conversa. */
  labelStart: string;
  /** true = desenhar a tela do formulário inicial em vez da conversa. */
  showPreChat: boolean;
}

export function DirectLinkPreview({
  channelName,
  title,
  color,
  logoUrl,
  welcomeMessage,
  placeholder,
  preChatEnabled,
  preChatFields,
  preChatRequired,
  privacyText,
  privacyUrl,
  labelFormTitle,
  labelStart,
  showPreChat,
}: DirectLinkPreviewProps) {
  const rawColor = color.trim();
  const brand = COLOR_RE.test(rawColor) ? rawColor : DEFAULT_COLOR;
  const headTitle = title.trim() || channelName || "Chat";
  const rawLogo = logoUrl.trim();
  const logo = /^https?:\/\//i.test(rawLogo) ? rawLogo : "/webchat-logo.png";
  const welcome = welcomeMessage.trim();
  const inputPlaceholder = placeholder.trim() || DEFAULT_INPUT_PLACEHOLDER;
  const formTitle = labelFormTitle.trim() || DEFAULT_PRECHAT_TITLE;
  const startLabel = labelStart.trim() || DEFAULT_START_CHAT;
  const privacy = privacyText.trim();
  const privacyHref = privacyUrl.trim();

  // A página real esconde o campo de digitação enquanto o formulário inicial
  // está aberto — o mock faz o mesmo para não prometer um layout inexistente.
  const preChatScreen = showPreChat && preChatEnabled;

  return (
    <div
      style={{ colorScheme: "light" }}
      className="mx-auto flex h-[600px] w-full max-w-[420px] flex-col overflow-hidden rounded-lg border bg-[#f7fafd] font-sans text-[#1f2937]"
    >
      {/* Cabeçalho */}
      <header
        style={{ backgroundColor: brand }}
        className="flex flex-none items-center gap-3 px-4 py-3 text-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          className="h-[38px] w-[38px] flex-none rounded-full bg-white object-contain p-[3px]"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold leading-tight">{headTitle}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] opacity-90">
            <span className="h-2 w-2 flex-none rounded-full bg-[#4ade80]" />
            {DEFAULT_STATUS_ONLINE}
          </div>
        </div>
        <Volume2 className="h-5 w-5 flex-none" />
      </header>

      {preChatScreen ? (
        /* Formulário inicial (pré-chat) */
        <div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-6">
          <div className="my-auto w-full max-w-[380px] rounded-2xl bg-white p-5 shadow-[0_4px_24px_rgba(15,23,42,.08)]">
            <h2 className="text-[18px] font-semibold text-[#0f172a]">{formTitle}</h2>
            <p className="mb-4 mt-1 text-[13.5px] text-[#64748b]">{DEFAULT_PRECHAT_SUBTITLE}</p>
            {preChatFields.map((field) => (
              <div key={field} className="mb-3">
                <label className="mb-1 block text-[13px] font-semibold text-[#334155]">
                  {FIELD_LABELS[field] || field}
                  {preChatRequired.includes(field) ? " *" : ""}
                </label>
                <div className="h-[42px] w-full rounded-[10px] border border-[#cbd5e1] bg-white" />
              </div>
            ))}
            {privacy && (
              <div className="my-3 flex items-start gap-2 text-[12.5px] text-[#475569]">
                <span className="mt-[3px] h-[13px] w-[13px] flex-none rounded-[3px] border border-[#94a3b8] bg-white" />
                <span>
                  {privacy}{" "}
                  {privacyHref && (
                    <span style={{ color: brand }} className="underline">
                      {DEFAULT_PRIVACY_LINK}
                    </span>
                  )}
                </span>
              </div>
            )}
            <div
              style={{ backgroundColor: brand }}
              className="mt-1 rounded-[10px] py-3 text-center text-[15px] font-semibold text-white"
            >
              {startLabel}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Conversa */}
          <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
            {welcome && (
              <div className="mb-2 max-w-[80%] self-start whitespace-pre-wrap rounded-[14px] rounded-bl-[4px] border border-[#dbeafe] bg-[#eef6ff] px-3 py-2 text-[14.5px] leading-[1.35] shadow-[0_1px_1px_rgba(15,23,42,.05)]">
                {welcome}
              </div>
            )}
          </div>

          {/* Campo de digitação */}
          <footer className="flex flex-none items-end gap-1 border-t border-[#e2e8f0] bg-[#f0f5fa] px-3 py-2.5">
            <span
              style={{ color: brand }}
              className="flex h-10 w-10 flex-none items-center justify-center"
            >
              <Paperclip className="h-[22px] w-[22px]" />
            </span>
            <div className="flex min-h-[40px] flex-1 items-center rounded-[18px] border border-[#cbd5e1] bg-white px-3.5 py-2 text-[15px] text-[#94a3b8]">
              <span className="truncate">{inputPlaceholder}</span>
            </div>
            <span
              style={{ color: brand }}
              className="flex h-10 w-10 flex-none items-center justify-center"
            >
              <Mic className="h-[22px] w-[22px]" />
            </span>
            <span
              style={{ color: brand }}
              className="flex h-10 w-10 flex-none items-center justify-center"
            >
              <Send className="h-[22px] w-[22px]" />
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
