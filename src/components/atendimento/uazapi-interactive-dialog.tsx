"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Images, FileText, FileImage, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  sendUazapiMenu, sendUazapiCarousel, sendUazapiLocationButton,
  sendUazapiPixButton, sendUazapiRequestPayment,
  type UazapiMenuType, type UazapiPixType, type UazapiCarouselCard
} from "@/services/uazapi-interactive";
import { fetchGallery, getGalleryPreviewUrl, type GalleryItem } from "@/services/gallery";
import { useRegion } from "@/hooks/use-region";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticketId: number;
  defaultPixKey?: string;
  defaultPixType?: UazapiPixType;
  defaultPixName?: string;
  defaultPixMessage?: string;
}

export function UazapiInteractiveDialog({ open, onOpenChange, ticketId, defaultPixKey, defaultPixType, defaultPixName, defaultPixMessage }: Props) {
  const t = useTranslations("uazapiInteractiveDialog");
  // Padrões que VÃO AO CLIENTE: idioma da Região da empresa (não o da tela do
  // atendente); sem idioma configurado, o literal PT de hoje.
  const { text: regionText, ensureTexts: ensureRegionTexts } = useRegion();
  const defaultListButton = regionText("interactive.listButton", undefined, "Ver opções");
  const defaultLocText = regionText("location.request", undefined, "Por favor, compartilhe sua localização");
  const [tab, setTab] = useState("button");
  const [loading, setLoading] = useState(false);

  // Menu (button/list/poll)
  const [menuType, setMenuType] = useState<UazapiMenuType>("button");
  const [text, setText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [listButton, setListButton] = useState(defaultListButton);
  const [choices, setChoices] = useState<string[]>(["", ""]);
  const [selectableCount, setSelectableCount] = useState(1);

  // Carousel
  const [carText, setCarText] = useState("");
  const [cards, setCards] = useState<UazapiCarouselCard[]>([{ text: "", image: "", buttons: [{ text: "", type: "REPLY" }] }]);

  // Gallery picker (carousel)
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryTargetCard, setGalleryTargetCard] = useState<number | null>(null);

  // Location
  const [locText, setLocText] = useState(defaultLocText);

  // Os textos da Região podem chegar depois da montagem: o campo que o operador
  // não mexeu acompanha o padrão novo; o que ele editou fica como está.
  const regionDefaultsRef = useRef({ listButton: defaultListButton, locText: defaultLocText });
  useEffect(() => {
    const prev = regionDefaultsRef.current;
    regionDefaultsRef.current = { listButton: defaultListButton, locText: defaultLocText };
    if (prev.listButton !== defaultListButton) setListButton(v => (v === prev.listButton ? defaultListButton : v));
    if (prev.locText !== defaultLocText) setLocText(v => (v === prev.locText ? defaultLocText : v));
  }, [defaultListButton, defaultLocText]);
  useEffect(() => {
    if (open) void ensureRegionTexts();
  }, [open, ensureRegionTexts]);

  // Pix
  const [pixType, setPixType] = useState<UazapiPixType>(defaultPixType || "EVP");
  const [pixKey, setPixKey] = useState(defaultPixKey || "");
  const [pixName, setPixName] = useState(defaultPixName || "");
  const [pixBodyText, setPixBodyText] = useState(defaultPixMessage || "");

  useEffect(() => {
    if (open) {
      setPixType(defaultPixType || "EVP");
      setPixKey(defaultPixKey || "");
      setPixName(defaultPixName || "");
      setPixBodyText(defaultPixMessage || "");
    }
  }, [open, defaultPixKey, defaultPixType, defaultPixName, defaultPixMessage]);

  // Payment
  const [payAmount, setPayAmount] = useState("");
  const [payTitle, setPayTitle] = useState("");
  const [payText, setPayText] = useState("");
  const [payPixKey, setPayPixKey] = useState("");
  const [payPixType, setPayPixType] = useState<UazapiPixType>("EVP");
  const [payInvoice, setPayInvoice] = useState("");
  const [payItem, setPayItem] = useState("");

  const reset = () => {
    setText(""); setFooterText(""); setChoices(["", ""]);
    setCarText(""); setCards([{ text: "", image: "", buttons: [{ text: "", type: "REPLY" }] }]);
    setPixKey(defaultPixKey || ""); setPixName(defaultPixName || ""); setPixType(defaultPixType || "EVP"); setPixBodyText(defaultPixMessage || "");
    setPayAmount(""); setPayTitle(""); setPayText(""); setPayPixKey(""); setPayInvoice(""); setPayItem("");
  };

  const openGallery = async (cardIndex: number) => {
    setGalleryTargetCard(cardIndex);
    setGallerySearch("");
    setGalleryOpen(true);
    if (galleryItems.length > 0) return;
    setGalleryLoading(true);
    try {
      const res = await fetchGallery();
      setGalleryItems(res.data);
    } catch {
      toast.error(t("errorLoadingGallery"));
    } finally {
      setGalleryLoading(false);
    }
  };

  const selectGalleryImage = (item: GalleryItem) => {
    if (galleryTargetCard === null) return;
    // Fecha a galeria (Dialog filho) no proximo frame (rAF), nao sincronamente no clique:
    // em touch, desmontar o filho no mesmo clique faz o Radix fechar o Dialog pai junto.
    requestAnimationFrame(() => {
      setCards(prev => prev.map((c, i) => i === galleryTargetCard ? { ...c, image: item.url } : c));
      setGalleryOpen(false);
      setGalleryTargetCard(null);
    });
  };

  const runSend = async (fn: () => Promise<unknown>) => {
    setLoading(true);
    try {
      await fn();
      toast.success(t("sentSuccess"));
      reset();
      onOpenChange(false);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (e as Error)?.message || t("genericError");
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const submitMenu = () => runSend(() => sendUazapiMenu(ticketId, {
    type: menuType,
    text,
    choices: choices.filter(c => c.trim().length > 0),
    footerText: footerText || undefined,
    listButton: menuType === "list" ? listButton : undefined,
    selectableCount: menuType === "poll" ? selectableCount : undefined
  }));

  const submitCarousel = () => runSend(() => sendUazapiCarousel(ticketId, {
    text: carText,
    carousel: cards.map(c => ({
      text: c.text,
      image: c.image || undefined,
      buttons: (c.buttons || []).filter(b => b.text.trim().length > 0)
    }))
  }));

  const submitLocation = () => runSend(() => sendUazapiLocationButton(ticketId, { text: locText }));

  const submitPix = () => runSend(() => sendUazapiPixButton(ticketId, { pixType, pixKey, pixName: pixName || undefined, bodyText: pixBodyText.trim() || undefined }));

  const submitPayment = () => runSend(() => sendUazapiRequestPayment(ticketId, {
    amount: Number(payAmount),
    title: payTitle || undefined,
    text: payText || undefined,
    pixKey: payPixKey || undefined,
    pixType: payPixKey ? payPixType : undefined,
    invoiceNumber: payInvoice || undefined,
    itemName: payItem || undefined
  }));

  // Gallery items filtered to images only
  const galleryImages = galleryItems.filter(item => (item.type || "").toLowerCase().startsWith("image/"));
  const filteredGalleryImages = galleryImages.filter(item =>
    !gallerySearch || item.name.toLowerCase().includes(gallerySearch.toLowerCase())
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>

          <div className="shrink-0 flex gap-2 rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              {t.rich("betaWarning", { strong: (chunks) => <strong>{chunks}</strong> })}
            </span>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid grid-cols-5 shrink-0">
              <TabsTrigger value="button">{t("tabButtons")}</TabsTrigger>
              <TabsTrigger value="carousel">{t("tabCarousel")}</TabsTrigger>
              <TabsTrigger value="location">{t("tabLocation")}</TabsTrigger>
              <TabsTrigger value="pix">{t("tabPix")}</TabsTrigger>
              <TabsTrigger value="payment">{t("tabPayment")}</TabsTrigger>
            </TabsList>

            <TabsContent value="button" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-1">
                <Label className="text-xs">{t("type")}</Label>
                <Select value={menuType} onValueChange={v => setMenuType(v as UazapiMenuType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="button">{t("menuTypeButton")}</SelectItem>
                    <SelectItem value="list">{t("menuTypeList")}</SelectItem>
                    <SelectItem value="poll">{t("menuTypePoll")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("text")}</Label>
                <Textarea rows={3} value={text} onChange={e => setText(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("footerOptional")}</Label>
                <Input value={footerText} onChange={e => setFooterText(e.target.value)} />
              </div>
              {menuType === "list" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("listButtonLabel")}</Label>
                  <Input value={listButton} onChange={e => setListButton(e.target.value)} />
                </div>
              )}
              {menuType === "poll" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("pollMaxSelections")}</Label>
                  <Input type="number" min={1} value={selectableCount} onChange={e => setSelectableCount(Number(e.target.value) || 1)} />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t("options")} {menuType === "list" ? t("optionsListSectionsHint") : ""}</Label>
                {choices.map((c, i) => (
                  <div key={i} className="flex gap-1">
                    <Input value={c} onChange={e => setChoices(prev => prev.map((x, j) => j === i ? e.target.value : x))} placeholder={t("optionPlaceholder", { n: i + 1 })} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setChoices(prev => prev.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setChoices(prev => [...prev, ""])}>
                  <Plus className="h-3 w-3 mr-1" /> {t("addOption")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="carousel" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-1">
                <Label className="text-xs">{t("mainText")}</Label>
                <Input value={carText} onChange={e => setCarText(e.target.value)} />
              </div>
              {cards.map((card, ci) => (
                <div key={ci} className="border rounded p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{t("cardLabel", { n: ci + 1 })}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setCards(prev => prev.filter((_, j) => j !== ci))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Image field with gallery picker */}
                  <div className="space-y-1">
                    <Label className="text-xs">{t("image")}</Label>
                    <div className="flex gap-1.5">
                      <Input
                        placeholder={t("imageUrlPlaceholder")}
                        value={card.image || ""}
                        onChange={e => setCards(prev => prev.map((c, j) => j === ci ? { ...c, image: e.target.value } : c))}
                        className="flex-1 min-w-0"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        title={t("gallery")}
                        onClick={() => openGallery(ci)}
                      >
                        <Images className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Thumbnail preview when URL is set */}
                    {card.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={card.image}
                        alt={t("cardLabel", { n: ci + 1 })}
                        className="h-16 w-auto rounded border object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>

                  <Textarea rows={2} placeholder={t("cardTextPlaceholder")} value={card.text} onChange={e => setCards(prev => prev.map((c, j) => j === ci ? { ...c, text: e.target.value } : c))} />
                  {(card.buttons || []).map((btn, bi) => (
                    <Input key={bi} placeholder={t("buttonPlaceholder", { n: bi + 1 })} value={btn.text} onChange={e => setCards(prev => prev.map((c, j) => j === ci ? { ...c, buttons: (c.buttons || []).map((b, k) => k === bi ? { ...b, text: e.target.value } : b) } : c))} />
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setCards(prev => prev.map((c, j) => j === ci ? { ...c, buttons: [...(c.buttons || []), { text: "", type: "REPLY" }] } : c))}>
                    <Plus className="h-3 w-3 mr-1" /> {t("addButton")}
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setCards(prev => [...prev, { text: "", image: "", buttons: [{ text: "", type: "REPLY" }] }])}>
                <Plus className="h-3 w-3 mr-1" /> {t("addCard")}
              </Button>
            </TabsContent>

            <TabsContent value="location" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-1">
                <Label className="text-xs">{t("text")}</Label>
                <Textarea rows={3} value={locText} onChange={e => setLocText(e.target.value)} />
              </div>
            </TabsContent>

            <TabsContent value="pix" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-1">
                <Label className="text-xs">{t("pixKeyType")}</Label>
                <Select value={pixType} onValueChange={v => setPixType(v as UazapiPixType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">CPF</SelectItem>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                    <SelectItem value="PHONE">{t("pixTypePhone")}</SelectItem>
                    <SelectItem value="EMAIL">{t("pixTypeEmail")}</SelectItem>
                    <SelectItem value="EVP">{t("pixTypeEvpRandom")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pixKey")}</Label>
                <Input value={pixKey} onChange={e => setPixKey(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pixReceiverName")}</Label>
                <Input value={pixName} onChange={e => setPixName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("messageOptional")}</Label>
                <Textarea rows={2} value={pixBodyText} onChange={e => setPixBodyText(e.target.value)} placeholder={t("pixMessagePlaceholder")} />
              </div>
            </TabsContent>

            <TabsContent value="payment" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  {/* Cobrança PIX é só Brasil: o símbolo fica R$ em qualquer idioma/Região */}
                  <Label className="text-xs">{t("payAmount", { symbol: "R$" })}</Label>
                  <Input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("payInvoice")}</Label>
                  <Input value={payInvoice} onChange={e => setPayInvoice(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("payTitle")}</Label>
                <Input value={payTitle} onChange={e => setPayTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("payItem")}</Label>
                <Input value={payItem} onChange={e => setPayItem(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("payDescription")}</Label>
                <Textarea rows={2} value={payText} onChange={e => setPayText(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("payPixType")}</Label>
                  <Select value={payPixType} onValueChange={v => setPayPixType(v as UazapiPixType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CPF">CPF</SelectItem>
                      <SelectItem value="CNPJ">CNPJ</SelectItem>
                      <SelectItem value="PHONE">{t("pixTypePhone")}</SelectItem>
                      <SelectItem value="EMAIL">{t("pixTypeEmail")}</SelectItem>
                      <SelectItem value="EVP">EVP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("pixKey")}</Label>
                  <Input value={payPixKey} onChange={e => setPayPixKey(e.target.value)} />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>{t("cancel")}</Button>
            <Button
              onClick={() => {
                if (tab === "button") submitMenu();
                else if (tab === "carousel") submitCarousel();
                else if (tab === "location") submitLocation();
                else if (tab === "pix") submitPix();
                else if (tab === "payment") submitPayment();
              }}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t("send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gallery picker modal */}
      <Dialog open={galleryOpen} onOpenChange={(v) => { setGalleryOpen(v); if (!v) { setGallerySearch(""); setGalleryTargetCard(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Images className="h-4 w-4" /> {t("galleryTitle")}
              {galleryTargetCard !== null && (
                <span className="text-xs font-normal text-muted-foreground">— {t("cardLabel", { n: galleryTargetCard + 1 })}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="shrink-0">
            <Input
              value={gallerySearch}
              onChange={e => setGallerySearch(e.target.value)}
              placeholder={t("gallerySearchPlaceholder")}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {galleryLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredGalleryImages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {galleryImages.length === 0 ? t("galleryEmpty") : t("galleryNoResults")}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 pr-2 py-1">
                {filteredGalleryImages.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectGalleryImage(item)}
                    className="relative rounded-lg border-2 border-transparent overflow-hidden hover:border-primary transition-all text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getGalleryPreviewUrl(item)}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", height: "96px", objectFit: "cover" }}
                      onError={e => {
                        const el = e.currentTarget.parentElement;
                        if (el) el.innerHTML = `<div class="w-full h-24 bg-muted flex items-center justify-center"><span class="text-[10px] text-muted-foreground px-2 text-center truncate">${item.name}</span></div>`;
                      }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5">
                      <p className="text-[10px] text-white truncate">{item.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGalleryOpen(false)}>{t("cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UazapiInteractiveDialog;
