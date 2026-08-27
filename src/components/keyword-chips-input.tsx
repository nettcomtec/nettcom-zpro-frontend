"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

/**
 * Input de múltiplas palavras-chave com "digite e pressione Enter para adicionar".
 * Armazena/edita uma STRING separada por vírgula (`a,b,c`) — compatível com colunas
 * de texto que o backend já trata via split(","). Chips removíveis. Dedupe case-insensitive.
 */
interface KeywordChipsInputProps {
  value: string; // comma-separated
  onChange: (value: string) => void;
  placeholder?: string;
}

export function KeywordChipsInput({ value, onChange, placeholder }: KeywordChipsInputProps) {
  const [draft, setDraft] = useState("");
  const list = (value || "").split(",").map((k) => k.trim()).filter(Boolean);

  const add = () => {
    const v = draft.trim();
    if (v && !list.some((k) => k.toLowerCase() === v.toLowerCase())) {
      onChange([...list, v].join(","));
    }
    setDraft("");
  };
  const remove = (idx: number) => onChange(list.filter((_, i) => i !== idx).join(","));

  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {list.map((kw, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {kw}
              <button type="button" onClick={() => remove(i)} className="hover:text-destructive">×</button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default KeywordChipsInput;
