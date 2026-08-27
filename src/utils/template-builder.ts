// Extração de variáveis e montagem de components de template HSM (WABA/Gupshup/Dialog360).
// Compartilhado entre o builder do chatbot (flow-builder/node-form) e a configuração
// de template de despedida do canal (sessoes/farewell-template-manager).
//
// data derivada: templateComponents (definição completa, usada na bolha do backend),
// templateVars (estado da UI), components (shape amigável enviada aos senders),
// message (fallback texto p/ canais sem suporte a HSM).

import {
  emptyOrderDetailsItem,
  isOrderDetailsTemplate,
  type OrderDetailsGoodsType,
  type OrderDetailsPaymentKind,
  type OrderDetailsValue,
} from "@/lib/order-details";

export interface TemplateVarEntry {
  key: string;
  label: string;
  value: string;
}

export type TemplateBuilderTFunc = (key: string, values?: Record<string, unknown>) => string;

/**
 * Corpo com variavel ({{1}} ou {{nome}}). Usado para decidir se o botao OTP precisa
 * de campo proprio: quando o corpo TEM variavel o backend reusa o codigo digitado
 * ali; sem variavel nao ha de onde derivar e a Meta recusa o envio com 131008
 * ("Button at index N of type Url requires a parameter").
 */
export function templateBodyHasVariables(components: any[]): boolean {
  return (components || []).some(
    (comp: any) =>
      comp?.type === "BODY" && typeof comp.text === "string" && /\{\{[^}]+\}\}/.test(comp.text)
  );
}

export function extractTemplateVars(components: any[], t: TemplateBuilderTFunc): TemplateVarEntry[] {
  const vars: TemplateVarEntry[] = [];
  (components || []).forEach((comp: any) => {
    if (comp?.type === "HEADER" && comp.format && comp.format !== "TEXT" && comp.format !== "NONE") {
      vars.push({ key: "header_link", label: t("templateVarHeaderMedia", { format: comp.format }), value: "" });
    }
    if ((comp?.type === "BODY" || comp?.type === "HEADER") && typeof comp.text === "string") {
      // WABA numera variáveis por componente (header e body independentes) —
      // prefixo header_/body_ evita colisão de {{1}} entre eles.
      const keyPrefix = comp.type === "HEADER" ? "header_" : "body_";
      const labelPrefix = comp.type === "HEADER" ? "Header — " : "";
      const named = [...comp.text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
      named.forEach((m: RegExpMatchArray) => {
        const k = `${keyPrefix}named_variable_${m[1]}`;
        if (!vars.some((v) => v.key === k)) {
          vars.push({ key: k, label: labelPrefix + t("templateVarLabel", { placeholder: `{{${m[1]}}}` }), value: "" });
        }
      });
      const positional = [...comp.text.matchAll(/\{\{(\d+)\}\}/g)];
      positional.forEach((m: RegExpMatchArray) => {
        const k = `${keyPrefix}variable_${m[1]}`;
        if (!vars.some((v) => v.key === k)) {
          vars.push({ key: k, label: labelPrefix + t("templateVarLabel", { placeholder: `{{${m[1]}}}` }), value: "" });
        }
      });
    }
    if (comp?.type === "BUTTONS" && Array.isArray(comp.buttons)) {
      comp.buttons.forEach((btn: any, idx: number) => {
        // Botao OTP so ganha campo proprio quando o corpo nao tem variavel: com
        // variavel o backend reaproveita o codigo do corpo (templates de autenticacao).
        const otpNeedsValue = btn?.type === "OTP" && !templateBodyHasVariables(components);
        if (
          btn?.type === "COPY_CODE" ||
          otpNeedsValue ||
          (btn?.type === "URL" && btn.url && /\{\{1\}\}/.test(btn.url))
        ) {
          vars.push({ key: `button_${idx}`, label: t("templateVarButton", { index: idx + 1 }), value: "" });
        }
      });
    }
  });
  return vars;
}

export function buildTemplateFriendlyComponents(tplComponents: any[], vars: TemplateVarEntry[]): any[] {
  const components: any[] = [];
  const headerComp = (tplComponents || []).find((c: any) => c?.type === "HEADER");
  if (headerComp) {
    if (headerComp.format === "TEXT") {
      const headerPositional = vars.filter((v) => v.key.startsWith("header_variable_"));
      const headerNamed = vars.filter((v) => v.key.startsWith("header_named_variable_"));
      if (headerPositional.length > 0) {
        const variables: string[] = [];
        headerPositional
          .sort((a, b) => parseInt(a.key.replace("header_variable_", "")) - parseInt(b.key.replace("header_variable_", "")))
          .forEach((v, i) => { variables[i] = v.value.trim() || " "; });
        components.push({ type: "HEADER", format: "TEXT", variables });
      } else if (headerNamed.length > 0) {
        components.push({
          type: "HEADER",
          format: "TEXT",
          parameters: headerNamed.map((v) => ({ type: "text", text: v.value.trim() || " ", name: v.key.replace("header_named_variable_", "") })),
        });
      }
    } else {
      const headerLinkVar = vars.find((v) => v.key === "header_link");
      if (headerLinkVar?.value) {
        components.push({ type: "HEADER", format: headerComp.format, value: headerLinkVar.value });
      }
    }
  }
  const positionalVars = vars.filter((v) => v.key.startsWith("body_variable_"));
  const namedVars = vars.filter((v) => v.key.startsWith("body_named_variable_"));
  if (positionalVars.length > 0) {
    const variables: string[] = [];
    positionalVars
      .sort((a, b) => parseInt(a.key.replace("body_variable_", "")) - parseInt(b.key.replace("body_variable_", "")))
      .forEach((v, i) => { variables[i] = v.value; });
    components.push({ type: "BODY", variables });
  } else if (namedVars.length > 0) {
    components.push({
      type: "BODY",
      parameters: namedVars.map((v) => ({ type: "text", text: v.value.trim() || " ", name: v.key.replace("body_named_variable_", "") })),
    });
  }
  const buttonVars = vars.filter((v) => v.key.startsWith("button_"));
  if (buttonVars.length > 0) {
    const buttonsComp = (tplComponents || []).find((c: any) => c?.type === "BUTTONS");
    if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
      const buttonParams: any[] = [];
      buttonsComp.buttons.forEach((btn: any, idx: number) => {
        const varEntry = buttonVars.find((v) => v.key === `button_${idx}`);
        if (btn?.type === "COPY_CODE" && varEntry) {
          buttonParams.push({
            type: "button",
            sub_type: "copy_code",
            index: String(idx),
            parameters: [{ type: "coupon_code", coupon_code: varEntry.value }],
          });
        } else if (btn?.type === "OTP" && varEntry) {
          // A Meta espera o botao OTP no formato de botao de URL (o link .../otp/code/
          // recebe o codigo como parametro), nao um sub_type "otp".
          buttonParams.push({
            type: "button",
            sub_type: "url",
            index: String(idx),
            parameters: [{ type: "text", text: varEntry.value }],
          });
        } else if (btn?.type === "URL" && btn.url && /\{\{1\}\}/.test(btn.url) && varEntry) {
          buttonParams.push({
            type: "button",
            sub_type: "url",
            index: String(idx),
            parameters: [{ type: "text", text: varEntry.value }],
          });
        }
      });
      if (buttonParams.length > 0) components.push({ type: "BUTTONS", buttons: buttonParams });
    }
  }
  return components;
}

// Clona os components COMPLETOS do template (HEADER/BODY/FOOTER/BUTTONS) com as
// variáveis preenchidas no texto de HEADER/BODY — pronto para o WabaTemplateMobilePreview
// (mock estilo WhatsApp, o mesmo usado em massa/template e configuracoes/meta).
// Espelha buildPreviewTemplate/buildPreviewText, mas no esquema de chaves do
// node-form/util (header_/body_). Valor preenchido vai em *negrito* p/ destacar a
// variável; vazio mantém o placeholder {{...}}.
export function buildTemplatePreviewComponents(tplComponents: any[], vars: TemplateVarEntry[]): any[] {
  if (!Array.isArray(tplComponents)) return [];
  const clone = JSON.parse(JSON.stringify(tplComponents));
  const subText = (text: string, prefix: "header_" | "body_"): string => {
    let out = text;
    vars
      .filter((v) => v.key.startsWith(`${prefix}variable_`))
      .forEach((v) => {
        const num = v.key.replace(`${prefix}variable_`, "");
        out = out.replace(
          new RegExp(`\\{\\{${num}\\}\\}`, "g"),
          v.value ? `*${v.value}*` : `{{${num}}}`
        );
      });
    vars
      .filter((v) => v.key.startsWith(`${prefix}named_variable_`))
      .forEach((v) => {
        const name = v.key.replace(`${prefix}named_variable_`, "");
        out = out.replace(
          new RegExp(`\\{\\{${name}\\}\\}`, "g"),
          v.value ? `*${v.value}*` : `{{${name}}}`
        );
      });
    return out;
  };
  for (const comp of clone) {
    if (comp && typeof comp.text === "string") {
      if (comp.type === "HEADER") comp.text = subText(comp.text, "header_");
      else if (comp.type === "BODY") comp.text = subText(comp.text, "body_");
    }
  }
  return clone;
}

// ─── Cobrança (ORDER_DETAILS) ───────────────────────────────────────────────
// docs/PLANO_TEMPLATE_ORDER_DETAILS.md — D0/F6. A ficha de cobrança NÃO cabe no
// shape de TemplateVarEntry ({key,label,value} string), então ela não entra em
// `templateVars`: extractTemplateVars ignora o botão ORDER_DETAILS de propósito
// (só COPY_CODE e URL com {{1}} viram variável). Cada consumidor guarda a ficha
// em estado próprio e persiste o payload amigável na chave `orderDetails` do seu
// JSON de configuração — mesmo campo que o envio 1:1 do header.tsx manda ao
// backend. Template comum não ganha chave nenhuma.

export { isOrderDetailsTemplate };
export type { OrderDetailsValue };

// Aceita o template completo (traz sub_category/display_format) OU só o array de
// components — as telas de config persistem apenas `templateComponents`, e é dali
// que a detecção precisa funcionar ao reabrir.
export function isOrderDetailsTemplateLike(templateOrComponents: any): boolean {
  if (Array.isArray(templateOrComponents)) {
    return isOrderDetailsTemplate({ components: templateOrComponents });
  }
  return isOrderDetailsTemplate(templateOrComponents);
}

// Payload persistido → estado do formulário. buildOrderDetailsPayload é via de mão
// única (tax/shipping/discount viram {value}, itens sem nome somem), então a volta
// precisa deste tradutor para a tela reabrir com o que foi salvo.
export function orderDetailsFromPayload(raw: unknown): OrderDetailsValue | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, any>;
  if (!Array.isArray(p.items)) return null;
  const items = p.items
    .filter((i: any) => i && typeof i === "object")
    .map((i: any) => ({
      name: String(i.name ?? ""),
      quantity: Number(i.quantity) > 0 ? Math.round(Number(i.quantity)) : 1,
      amount: Number(i.amount) > 0 ? Math.round(Number(i.amount)) : 0,
    }));
  const pay = (p.payment || {}) as Record<string, any>;
  const kind: OrderDetailsPaymentKind =
    pay.kind === "link" || pay.kind === "boleto" ? pay.kind : "pix";
  const goodsType: OrderDetailsGoodsType =
    p.goodsType === "physical-goods" ? "physical-goods" : "digital-goods";
  return {
    referenceId: typeof p.referenceId === "string" ? p.referenceId : undefined,
    goodsType,
    items: items.length > 0 ? items : [emptyOrderDetailsItem()],
    discount: Number(p.discount?.value) || undefined,
    shipping: Number(p.shipping?.value) || undefined,
    tax: Number(p.tax?.value) || undefined,
    expirationTimestamp: Number(p.expirationTimestamp) || undefined,
    expirationDescription:
      typeof p.expirationDescription === "string" ? p.expirationDescription : undefined,
    payment: {
      kind,
      code: typeof pay.code === "string" ? pay.code : undefined,
      merchantName: typeof pay.merchantName === "string" ? pay.merchantName : undefined,
      key: typeof pay.key === "string" ? pay.key : undefined,
      keyType: pay.keyType,
      uri: typeof pay.uri === "string" ? pay.uri : undefined,
      digitableLine: typeof pay.digitableLine === "string" ? pay.digitableLine : undefined,
    },
  };
}

export function buildTemplateFallbackMessage(tplComponents: any[], vars: TemplateVarEntry[]): string {
  const body = (tplComponents || []).find((c: any) => c?.type === "BODY");
  let text: string = typeof body?.text === "string" ? body.text : "";
  vars.filter((v) => v.key.startsWith("body_variable_")).forEach((v) => {
    text = text.replace(`{{${v.key.replace("body_variable_", "")}}}`, v.value);
  });
  vars.filter((v) => v.key.startsWith("body_named_variable_")).forEach((v) => {
    text = text.replace(`{{${v.key.replace("body_named_variable_", "")}}}`, v.value);
  });
  return text;
}
