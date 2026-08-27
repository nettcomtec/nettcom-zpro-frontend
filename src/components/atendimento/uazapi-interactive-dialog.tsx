"use client";

import { useState, useEffect } from "react";
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
  const [tab, setTab] = useState("button");
  const [loading, setLoading] = useState(false);

  // Menu (button/list/poll)
  const [menuType, setMenuType] = useState<UazapiMenuType>("button");
  const [text, setText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [listButton, setListButton] = useState("Ver opções");
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
  const [locText, setLocText] = useState("Por favor, compartilhe sua localização");

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
      toast.error("Erro ao carregar galeria");
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
      toast.success("Enviado com sucesso");
      reset();
      onOpenChange(false);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (e as Error)?.message || "Erro";
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
            <DialogTitle>Envio interativo — UazAPI</DialogTitle>
          </DialogHeader>

          <div className="shrink-0 flex gap-2 rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>Funcionalidade beta.</strong> Os envios interativos UazAPI não são recursos oficiais da Meta/WhatsApp e <strong>podem ser descontinuados</strong> a qualquer momento sem aviso. A entrega não é garantida e a compatibilidade varia por dispositivo, versão do app e tipo de conta. Use com cautela em produção.
            </span>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid grid-cols-5 shrink-0">
              <TabsTrigger value="button">Botões</TabsTrigger>
              <TabsTrigger value="carousel">Carrossel</TabsTrigger>
              <TabsTrigger value="location">Local</TabsTrigger>
              <TabsTrigger value="pix">PIX</TabsTrigger>
              <TabsTrigger value="payment">Cobrança</TabsTrigger>
            </TabsList>

            <TabsContent value="button" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={menuType} onValueChange={v => setMenuType(v as UazapiMenuType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="button">Botões</SelectItem>
                    <SelectItem value="list">Lista</SelectItem>
                    <SelectItem value="poll">Enquete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Texto</Label>
                <Textarea rows={3} value={text} onChange={e => setText(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rodapé (opcional)</Label>
                <Input value={footerText} onChange={e => setFooterText(e.target.value)} />
              </div>
              {menuType === "list" && (
                <div className="space-y-1">
                  <Label className="text-xs">Texto do botão da lista</Label>
                  <Input value={listButton} onChange={e => setListButton(e.target.value)} />
                </div>
              )}
              {menuType === "poll" && (
                <div className="space-y-1">
                  <Label className="text-xs">Nº máximo de seleções</Label>
                  <Input type="number" min={1} value={selectableCount} onChange={e => setSelectableCount(Number(e.target.value) || 1)} />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Opções {menuType === "list" ? "(use [Título] para seções)" : ""}</Label>
                {choices.map((c, i) => (
                  <div key={i} className="flex gap-1">
                    <Input value={c} onChange={e => setChoices(prev => prev.map((x, j) => j === i ? e.target.value : x))} placeholder={`Opção ${i + 1}`} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setChoices(prev => prev.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setChoices(prev => [...prev, ""])}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar opção
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="carousel" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-1">
                <Label className="text-xs">Texto principal</Label>
                <Input value={carText} onChange={e => setCarText(e.target.value)} />
              </div>
              {cards.map((card, ci) => (
                <div key={ci} className="border rounded p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Cartão {ci + 1}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setCards(prev => prev.filter((_, j) => j !== ci))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Image field with gallery picker */}
                  <div className="space-y-1">
                    <Label className="text-xs">Imagem</Label>
                    <div className="flex gap-1.5">
                      <Input
                        placeholder="URL da imagem"
                        value={card.image || ""}
                        onChange={e => setCards(prev => prev.map((c, j) => j === ci ? { ...c, image: e.target.value } : c))}
                        className="flex-1 min-w-0"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        title="Galeria"
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
                        alt={`Cartão ${ci + 1}`}
                        className="h-16 w-auto rounded border object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>

                  <Textarea rows={2} placeholder="Texto do cartão" value={card.text} onChange={e => setCards(prev => prev.map((c, j) => j === ci ? { ...c, text: e.target.value } : c))} />
                  {(card.buttons || []).map((btn, bi) => (
                    <Input key={bi} placeholder={`Botão ${bi + 1}`} value={btn.text} onChange={e => setCards(prev => prev.map((c, j) => j === ci ? { ...c, buttons: (c.buttons || []).map((b, k) => k === bi ? { ...b, text: e.target.value } : b) } : c))} />
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setCards(prev => prev.map((c, j) => j === ci ? { ...c, buttons: [...(c.buttons || []), { text: "", type: "REPLY" }] } : c))}>
                    <Plus className="h-3 w-3 mr-1" /> Botão
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setCards(prev => [...prev, { text: "", image: "", buttons: [{ text: "", type: "REPLY" }] }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar cartão
              </Button>
            </TabsContent>

            <TabsContent value="location" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-1">
                <Label className="text-xs">Texto</Label>
                <Textarea rows={3} value={locText} onChange={e => setLocText(e.target.value)} />
              </div>
            </TabsContent>

            <TabsContent value="pix" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-1">
                <Label className="text-xs">Tipo da chave</Label>
                <Select value={pixType} onValueChange={v => setPixType(v as UazapiPixType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">CPF</SelectItem>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                    <SelectItem value="PHONE">Telefone</SelectItem>
                    <SelectItem value="EMAIL">E-mail</SelectItem>
                    <SelectItem value="EVP">EVP (aleatória)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Chave PIX</Label>
                <Input value={pixKey} onChange={e => setPixKey(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nome do recebedor</Label>
                <Input value={pixName} onChange={e => setPixName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mensagem (opcional)</Label>
                <Textarea rows={2} value={pixBodyText} onChange={e => setPixBodyText(e.target.value)} placeholder="Ex: Segue a chave PIX para pagamento..." />
              </div>
            </TabsContent>

            <TabsContent value="payment" className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nº fatura</Label>
                  <Input value={payInvoice} onChange={e => setPayInvoice(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Título</Label>
                <Input value={payTitle} onChange={e => setPayTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Item</Label>
                <Input value={payItem} onChange={e => setPayItem(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Textarea rows={2} value={payText} onChange={e => setPayText(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo PIX</Label>
                  <Select value={payPixType} onValueChange={v => setPayPixType(v as UazapiPixType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CPF">CPF</SelectItem>
                      <SelectItem value="CNPJ">CNPJ</SelectItem>
                      <SelectItem value="PHONE">Telefone</SelectItem>
                      <SelectItem value="EMAIL">E-mail</SelectItem>
                      <SelectItem value="EVP">EVP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Chave PIX</Label>
                  <Input value={payPixKey} onChange={e => setPayPixKey(e.target.value)} />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
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
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gallery picker modal */}
      <Dialog open={galleryOpen} onOpenChange={(v) => { setGalleryOpen(v); if (!v) { setGallerySearch(""); setGalleryTargetCard(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Images className="h-4 w-4" /> Galeria de imagens
              {galleryTargetCard !== null && (
                <span className="text-xs font-normal text-muted-foreground">— Cartão {galleryTargetCard + 1}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="shrink-0">
            <Input
              value={gallerySearch}
              onChange={e => setGallerySearch(e.target.value)}
              placeholder="Buscar na galeria..."
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
                {galleryImages.length === 0 ? "Nenhuma imagem na galeria" : "Nenhuma imagem encontrada"}
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
            <Button variant="outline" onClick={() => setGalleryOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UazapiInteractiveDialog;
