"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";

const PREVIEW_SIZE = 280;
const OUTPUT_SIZE = 512;

interface ImageCropModalProps {
  imageSrc: string;
  onConfirm: (file: File) => void;
  onClose: () => void;
}

export function ImageCropModal({ imageSrc, onConfirm, onClose }: ImageCropModalProps) {
  const t = useTranslations("imageCropModal");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [fitZoom, setFitZoom] = useState(1);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      imgRef.current = img;
      setFitZoom(PREVIEW_SIZE / Math.min(img.naturalWidth, img.naturalHeight));
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setOffset(p => ({ x: p.x + dx, y: p.y + dy }));
  };
  const onMouseUp = () => { dragging.current = false; };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    dragging.current = true;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastPos.current.x;
    const dy = e.touches[0].clientY - lastPos.current.y;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setOffset(p => ({ x: p.x + dx, y: p.y + dy }));
  };
  const onTouchEnd = () => { dragging.current = false; };

  const handleConfirm = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d")!;
    const s = OUTPUT_SIZE / PREVIEW_SIZE;
    ctx.translate(OUTPUT_SIZE / 2 + offset.x * s, OUTPUT_SIZE / 2 + offset.y * s);
    ctx.rotate((rotation * Math.PI) / 180);
    const totalScale = fitZoom * zoom * s;
    ctx.scale(totalScale, totalScale);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    canvas.toBlob(blob => {
      if (!blob) return;
      onConfirm(new File([blob], "profile.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }, [offset, rotation, fitZoom, zoom, onConfirm]);

  const effectiveScale = fitZoom * zoom;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div
            className="relative overflow-hidden rounded-full border-2 border-primary/30 bg-muted cursor-grab active:cursor-grabbing select-none"
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "auto",
                height: "auto",
                maxWidth: "none",
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotation}deg) scale(${effectiveScale})`,
                transformOrigin: "center center",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          </div>

          <p className="text-xs text-muted-foreground -mt-2">{t("hint")}</p>

          <div className="flex items-center gap-3 w-full max-w-[280px]">
            <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 h-2 appearance-none rounded-full bg-muted accent-primary cursor-pointer"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRotation(r => r - 90)}>
              <RotateCcw className="h-4 w-4 mr-1.5" />{t("rotateLeft")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRotation(r => r + 90)}>
              <RotateCw className="h-4 w-4 mr-1.5" />{t("rotateRight")}
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1.5" />{t("cancel")}
          </Button>
          <Button onClick={handleConfirm}>
            <Check className="h-4 w-4 mr-1.5" />{t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
