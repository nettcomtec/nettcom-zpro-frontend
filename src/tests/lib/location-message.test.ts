import { describe, expect, it } from "vitest";

import {
  buildGoogleMapsUrl,
  buildLocationShareText,
  buildQuickReplyLocationMessage,
  buildWazeUrl,
  formatCoord,
  getMessageLocation,
  isLocationMediaType,
  isValidLatLng,
  parseCoordInput,
  parseLocationMessage,
  parsePastedLocation,
  parseQuickReplyLocationMessage,
  sanitizeLocationText,
} from "@/lib/location-message";

const SP = { lat: -23.5505, lng: -46.6333 };
const GOOGLE = "https://maps.google.com/?q=-23.5505,-46.6333";
const WAZE = "https://waze.com/ul?ll=-23.5505,-46.6333&navigate=yes";

const coords = (r: { lat: number; lng: number } | null | undefined) => (r ? { lat: r.lat, lng: r.lng } : null);
const near = (r: { lat: number; lng: number } | null | undefined, lat: number, lng: number, tol = 0.0005) =>
  !!r && Math.abs(r.lat - lat) < tol && Math.abs(r.lng - lng) < tol;

describe("números e links", () => {
  it("parseCoordInput aceita vírgula decimal e o menos tipográfico", () => {
    expect(parseCoordInput("-23,5505")).toBe(-23.5505);
    expect(parseCoordInput(" −46.6333 ")).toBe(-46.6333);
    expect(parseCoordInput(-23.5)).toBe(-23.5);
    expect(parseCoordInput("abc")).toBeNull();
    expect(parseCoordInput("1,234,5")).toBeNull();
    expect(parseCoordInput("")).toBeNull();
    expect(parseCoordInput(NaN)).toBeNull();
    expect(parseCoordInput(undefined)).toBeNull();
  });

  it("isValidLatLng: faixa, finito e nunca (0,0)", () => {
    expect(isValidLatLng(-23.5, -46.6)).toBe(true);
    expect(isValidLatLng(0, 32.5)).toBe(true);
    expect(isValidLatLng(0, 0)).toBe(false);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, 181)).toBe(false);
    expect(isValidLatLng(NaN, 1)).toBe(false);
    expect(isValidLatLng("-23.5", "-46.6")).toBe(false);
  });

  it("formatCoord: até 6 casas, sem zero à direita", () => {
    expect(formatCoord(-23.5505)).toBe("-23.5505");
    expect(formatCoord(10)).toBe("10");
    expect(formatCoord(-23.12345678)).toBe("-23.123457");
    expect(formatCoord(-0.0000001)).toBe("0");
  });

  it("links do Google Maps e do Waze (D1)", () => {
    expect(buildGoogleMapsUrl(SP.lat, SP.lng)).toBe(GOOGLE);
    expect(buildWazeUrl(SP.lat, SP.lng)).toBe(WAZE);
  });

  it("isLocationMediaType", () => {
    expect(isLocationMediaType("location")).toBe(true);
    expect(isLocationMediaType("locationMessage")).toBe(true);
    expect(isLocationMediaType("liveLocationMessage")).toBe(true);
    expect(isLocationMediaType("location_request")).toBe(false);
    expect(isLocationMediaType(undefined)).toBe(false);
  });

  it("sanitizeLocationText tira tag, < > e quebra de linha", () => {
    expect(sanitizeLocationText("<b>Loja</b> Centro", 120)).toBe("Loja Centro");
    expect(sanitizeLocationText("Rua A\nNº 1 <x", 250)).toBe("Rua A Nº 1 x");
    expect(sanitizeLocationText("a".repeat(200), 120)).toHaveLength(120);
    expect(sanitizeLocationText(42, 120)).toBe("");
  });
});

describe("texto do encaminhar e da mensagem rápida", () => {
  it("só os links quando não há nome nem endereço", () => {
    expect(buildLocationShareText(SP)).toBe(`${GOOGLE}\n${WAZE}`);
  });

  it("linha nome - endereço antes dos links", () => {
    expect(buildLocationShareText({ ...SP, name: "Padaria do Joao", address: "Rua das Flores, 123" })).toBe(
      `Padaria do Joao - Rua das Flores, 123\n${GOOGLE}\n${WAZE}`,
    );
    expect(buildLocationShareText({ ...SP, address: "Rua das Flores, 123" })).toBe(`Rua das Flores, 123\n${GOOGLE}\n${WAZE}`);
    expect(buildLocationShareText({ ...SP, name: "Mesmo", address: "Mesmo" })).toBe(`Mesmo\n${GOOGLE}\n${WAZE}`);
  });

  it("label pronto (Telegram) vence nome/endereço e passa pela limpeza", () => {
    expect(buildLocationShareText({ ...SP, label: "Padaria - <i>Rua X</i>" })).toBe(`Padaria - Rua X\n${GOOGLE}\n${WAZE}`);
  });

  it("mensagem rápida: ida e volta", () => {
    const message = buildQuickReplyLocationMessage({ ...SP, name: "Loja Centro", address: "Rua X, 123" });
    expect(message).toBe(`Loja Centro\nRua X, 123\n${GOOGLE}\n${WAZE}`);
    expect(parseQuickReplyLocationMessage(message)).toEqual({ ...SP, name: "Loja Centro", address: "Rua X, 123" });
    expect(parseQuickReplyLocationMessage(message.replace(/\n/g, "\r\n"))).toEqual({ ...SP, name: "Loja Centro", address: "Rua X, 123" });
  });

  it("mensagem rápida: uma linha de texto só = nome; sem link = não é localização", () => {
    expect(parseQuickReplyLocationMessage(`Rua X, 123\n${GOOGLE}`)).toEqual({ ...SP, name: "Rua X, 123" });
    expect(parseQuickReplyLocationMessage(`${WAZE}`)).toEqual(SP);
    expect(parseQuickReplyLocationMessage("Loja Centro\nRua X")).toBeNull();
    expect(parseQuickReplyLocationMessage("")).toBeNull();
    expect(parseQuickReplyLocationMessage(null)).toBeNull();
  });
});

describe("parseLocationMessage — formatos gravados pelos canais", () => {
  it("recebida (Baileys, Zapo, WhatsApp Web, Evo, EvoGo, Meow, Z-API, UAzapi, WABA, Dialog360): %2C", () => {
    expect(coords(parseLocationMessage({ body: "https://maps.google.com/maps?q=-23.5505%2C-46.6333&z=17&hl=pt-BR" }))).toEqual(SP);
  });

  it("enviada pelo SendLocation (vírgula literal)", () => {
    expect(coords(parseLocationMessage({ body: "https://maps.google.com/maps?q=-23.5505,-46.6333&z=17&hl=pt-BR" }))).toEqual(SP);
  });

  it("mensagem temporária quebrada (undefined) = sem coordenada", () => {
    expect(parseLocationMessage({ body: "https://maps.google.com/maps?q=undefined%2Cundefined&z=17&hl=pt-BR" })).toBeNull();
  });

  it("tempo real do Baileys/Zapo: ignora o base64 antes do |", () => {
    const body = "data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ,AAAA | https://maps.google.com/maps?q=-23.5505%2C-46.6333&z=17&hl=pt-BR";
    expect(coords(parseLocationMessage({ body }))).toEqual(SP);
    expect(parseLocationMessage({ body: "data:image/png;base64, AAAA" })).toBeNull();
  });

  it("Gupshup [location:LAT,LNG]", () => {
    expect(coords(parseLocationMessage({ body: "[location:-23.5505,-46.6333]" }))).toEqual(SP);
    expect(parseLocationMessage({ body: "[location:undefined,undefined]" })).toBeNull();
    expect(parseLocationMessage({ body: "[location]" })).toBeNull();
  });

  it("corpo do fluxo (WABA/Gupshup/Dialog360) com nome e endereço; 'Local' = sem nome", () => {
    const body = "Localização: Loja Centro\nLatitude: -23.5505\nLongitude: -46.6333\nEndereço: Rua X, 1";
    expect(parseLocationMessage({ body })).toEqual({ ...SP, name: "Loja Centro", address: "Rua X, 1" });
    expect(parseLocationMessage({ body: "Localização: Local\nLatitude: -23.5505\nLongitude: -46.6333" })).toEqual(SP);
  });

  it("Latitude/Longitude numa linha, Location: e Telegram", () => {
    expect(coords(parseLocationMessage({ body: "Latitude: -23.5505 - Longitude: -46.6333" }))).toEqual(SP);
    expect(coords(parseLocationMessage({ body: "Latitude: -23.5505, Longitude: -46.6333" }))).toEqual(SP);
    expect(coords(parseLocationMessage({ body: "Location: -23.5505, -46.6333" }))).toEqual(SP);
    expect(parseLocationMessage({ body: "-23.5505,-46.6333\nPadaria - Rua X" })).toEqual({ ...SP, label: "Padaria - Rua X" });
    expect(coords(parseLocationMessage({ body: "Latitude: 0\nLongitude: 32.5" }))).toEqual({ lat: 0, lng: 32.5 });
    expect(parseLocationMessage({ body: "Latitude: 0\nLongitude: 0" })).toBeNull();
  });

  it("Dialog360 recebido antigo (body vazio) só com dataJson; enviado com nome", () => {
    expect(parseLocationMessage({ body: "" })).toBeNull();
    expect(parseLocationMessage({ body: "Loja", dataJson: JSON.stringify({ location: { lat: -23.5505, lng: -46.6333, name: "Loja" } }) })).toEqual({ ...SP, name: "Loja" });
  });

  it("dataJson cru do Cloud API (importação de histórico do WABA)", () => {
    const dataJson = JSON.stringify({ type: "location", location: { latitude: -23.5505, longitude: -46.6333, name: "A", address: "B" } });
    expect(parseLocationMessage({ body: "[location]", dataJson })).toEqual({ ...SP, name: "A", address: "B" });
  });

  it("linha 'Media download limited' do Baileys/Zapo: a coordenada está no dataJson (A2-6)", () => {
    const dataJson = JSON.stringify({ key: { id: "x" }, message: { locationMessage: { degreesLatitude: -23.5505, degreesLongitude: -46.6333, name: "Condomínio", address: "Rua Y" } } });
    const body = "*System:* \nMedia download limited by the WhatsApp server, please check on the device.";
    expect(parseLocationMessage({ body, dataJson })).toEqual({ ...SP, name: "Condomínio", address: "Rua Y" });
    const wrapped = JSON.stringify({ message: { ephemeralMessage: { message: { liveLocationMessage: { degreesLatitude: -23.5505, degreesLongitude: -46.6333 } } } } });
    expect(coords(parseLocationMessage({ body, dataJson: wrapped }))).toEqual(SP);
  });

  it("dataJson de outra coisa ou quebrado cai no body", () => {
    expect(coords(parseLocationMessage({ body: "[location:-23.5505,-46.6333]", dataJson: '{"voiceNote":true}' }))).toEqual(SP);
    expect(coords(parseLocationMessage({ body: "[location:-23.5505,-46.6333]", dataJson: "{quebrado latitude" }))).toEqual(SP);
    expect(coords(parseLocationMessage({ body: "", dataJson: { location: { latitude: "-23,5505", longitude: "-46,6333" } } }))).toEqual(SP);
  });

  it("nome do dataJson vence, o corpo completa", () => {
    const dataJson = JSON.stringify({ location: { lat: -23.5505, lng: -46.6333 } });
    expect(parseLocationMessage({ body: "Localização: Loja\nLatitude: -23.5505\nLongitude: -46.6333", dataJson })).toEqual({ ...SP, name: "Loja" });
  });

  it("getMessageLocation memoriza por objeto", () => {
    const msg = { body: "[location:-23.5505,-46.6333]" };
    const first = getMessageLocation(msg);
    expect(getMessageLocation(msg)).toBe(first);
    expect(getMessageLocation(null)).toBeNull();
  });
});

describe("parsePastedLocation — campo colar link ou coordenadas", () => {
  it("Google: !3d!4d vence o @ e o nome do lugar vem do caminho", () => {
    const url = "https://www.google.com/maps/place/Padaria+do+Jo%C3%A3o/@-23.55,-46.63,17z/data=!3m1!4b1!4m6!3m5!1s0x94ce:0x1!8m2!3d-23.5505!4d-46.6333!16s%2Fg%2F11";
    const r = parsePastedLocation(url);
    expect(r.kind).toBe("coords");
    if (r.kind === "coords") expect(r.loc).toEqual({ ...SP, name: "Padaria do João" });
  });

  it("Google: @ sozinho, ?q=, api=1&query= e /search/", () => {
    expect(r2c(parsePastedLocation("https://www.google.com/maps/@-23.5505,-46.6333,15z"))).toEqual(SP);
    expect(r2c(parsePastedLocation("https://maps.google.com/?q=-23.5505,-46.6333"))).toEqual(SP);
    expect(r2c(parsePastedLocation("https://www.google.com/maps/search/?api=1&query=-23.5505%2C-46.6333"))).toEqual(SP);
    expect(r2c(parsePastedLocation("https://www.google.com/maps/search/-23.5505,+-46.6333?entry=ttu"))).toEqual(SP);
  });

  it("link curto do Google = explicação, nunca coordenada (D9)", () => {
    expect(parsePastedLocation("https://maps.app.goo.gl/yNWrPg1SFLomwCKX9")).toEqual({ kind: "shortLink" });
    expect(parsePastedLocation("Padaria X\nRua Y, 123\nhttps://maps.app.goo.gl/abc")).toEqual({ kind: "shortLink" });
    expect(parsePastedLocation("https://goo.gl/maps/abc123")).toEqual({ kind: "shortLink" });
  });

  it("Waze (ul, live-map e geohash), Apple e OpenStreetMap", () => {
    expect(r2c(parsePastedLocation(WAZE))).toEqual(SP);
    expect(r2c(parsePastedLocation("https://www.waze.com/live-map/directions?to=ll.-23.5505%2C-46.6333"))).toEqual(SP);
    const geo = parsePastedLocation("https://waze.com/ul/h6gyf4bf8mk");
    expect(geo.kind === "coords" && near(geo.loc, SP.lat, SP.lng)).toBe(true);
    const apple = parsePastedLocation("https://maps.apple.com/?ll=-23.5505,-46.6333&q=Loja%20Centro");
    expect(apple).toEqual({ kind: "coords", loc: { ...SP, name: "Loja Centro" } });
    expect(r2c(parsePastedLocation("https://www.openstreetmap.org/#map=17/-23.5505/-46.6333"))).toEqual(SP);
    expect(r2c(parsePastedLocation("https://www.openstreetmap.org/?mlat=-23.5505&mlon=-46.6333#map=17/-23.5/-46.6"))).toEqual(SP);
  });

  it("Apple Maps unificado (coordinate + name), alfinete do Google com graus e rota do Google", () => {
    const appleNew = parsePastedLocation("https://maps.apple.com/place?coordinate=-23.5505,-46.6333&name=Loja%20Centro");
    expect(appleNew).toEqual({ kind: "coords", loc: { ...SP, name: "Loja Centro" } });
    // Ponto clicado no mapa: o caminho traz os graus, que não viram título do pino.
    const pin = parsePastedLocation(
      "https://www.google.com/maps/place/23%C2%B033'01.8%22S+46%C2%B037'59.9%22W/@-23.5505,-46.6333,17z/data=!3m1!4b1!4m4!3m3!8m2!3d-23.5505!4d-46.6333"
    );
    expect(pin).toEqual({ kind: "coords", loc: SP });
    // Link entre aspas simples ou no fim da frase: a pontuação final não entra no link.
    expect(r2c(parsePastedLocation("Veja 'https://maps.google.com/?q=-23.5505,-46.6333'."))).toEqual(SP);
    // Rota: vale o destino com coordenada; o "@" é só o centro do mapa no meio do trajeto.
    expect(r2c(parsePastedLocation("https://www.google.com/maps/dir/-22.9068,-43.1729/-23.5505,-46.6333/@-23.2,-45.0,8z"))).toEqual(SP);
    expect(parsePastedLocation("https://www.google.com/maps/dir/Rio+de+Janeiro/S%C3%A3o+Paulo/@-23.2,-45.0,8z/data=!3m1!4b1").kind).toBe("none");
  });

  it("coordenadas soltas em vários jeitos", () => {
    expect(r2c(parsePastedLocation("-23.5505, -46.6333"))).toEqual(SP);
    expect(r2c(parsePastedLocation("-23.5505 -46.6333"))).toEqual(SP);
    expect(r2c(parsePastedLocation("-23,5505; -46,6333"))).toEqual(SP);
    expect(r2c(parsePastedLocation("−23.5505, −46.6333"))).toEqual(SP);
    expect(r2c(parsePastedLocation("geo:-23.5505,-46.6333?q=x"))).toEqual(SP);
    expect(r2c(parsePastedLocation("Latitude: -23.5505\nLongitude: -46.6333"))).toEqual(SP);
  });

  it("graus, minutos e segundos (S/W, O = oeste) e graus decimais com hemisfério", () => {
    const dms = parsePastedLocation(`23°33'01.8"S 46°37'59.9"W`);
    expect(dms.kind === "coords" && near(dms.loc, -23.5505, -46.6333)).toBe(true);
    const oeste = parsePastedLocation(`23°33'01.8"S 46°37'59.9"O`);
    expect(oeste.kind === "coords" && near(oeste.loc, -23.5505, -46.6333)).toBe(true);
    const dec = parsePastedLocation("23.5505° S, 46.6333° W");
    expect(dec.kind === "coords" && near(dec.loc, -23.5505, -46.6333)).toBe(true);
    const swapped = parsePastedLocation("46.6333° W, 23.5505° S");
    expect(swapped.kind === "coords" && near(swapped.loc, -23.5505, -46.6333)).toBe(true);
    expect(parsePastedLocation("23.5505° S, 46.6333° S").kind).toBe("none");
  });

  it("nome e endereço das linhas de texto junto do link completo", () => {
    const r = parsePastedLocation(`Loja Centro\nRua X, 123\n${GOOGLE}`);
    expect(r).toEqual({ kind: "coords", loc: { ...SP, name: "Loja Centro", address: "Rua X, 123" } });
  });

  it("texto sem localização, vazio e gigante", () => {
    expect(parsePastedLocation("texto qualquer")).toEqual({ kind: "none" });
    expect(parsePastedLocation("")).toEqual({ kind: "none" });
    expect(parsePastedLocation(null)).toEqual({ kind: "none" });
    expect(parsePastedLocation("https://example.com/página")).toEqual({ kind: "none" });
    expect(parsePastedLocation("x".repeat(10_000)).kind).toBe("none");
    expect(r2c(parsePastedLocation(`-23.5505, -46.6333${" ".repeat(3000)}lixo`))).toEqual(SP);
  });
});

function r2c(r: ReturnType<typeof parsePastedLocation>) {
  return r.kind === "coords" ? coords(r.loc) : r;
}
