"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

export interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** descarta as alterações e prossegue com a navegação */
  onDiscard: () => void;
  /** salva e depois prossegue. Omitido = botão não aparece. */
  onSave?: () => void;
  saving?: boolean;
  labels: {
    title: string;
    message: string;
    stay: string;
    discard: string;
    save?: string;
  };
}

/**
 * Confirmação de saída com alterações não salvas.
 * Todas as strings chegam por prop (`labels`) — nada visível é hardcoded aqui.
 */
export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onDiscard,
  onSave,
  saving = false,
  labels,
}: UnsavedChangesDialogProps) {
  const showSave = typeof onSave === "function" && !!labels.save;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <span>{labels.title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription>{labels.message}</AlertDialogDescription>
        </AlertDialogHeader>

        {/*
          Ordem no DOM: [ficar] [descartar] [salvar].
          O footer é flex-col-reverse no mobile, então o primário (salvar) fica no
          topo da pilha e "continuar editando" na base, perto do polegar.
        */}
        <AlertDialogFooter className="gap-2">
          {/* Nunca desabilitado: é a saída segura, o usuário não pode ficar preso. */}
          <AlertDialogCancel>{labels.stay}</AlertDialogCancel>

          <AlertDialogAction
            disabled={saving}
            className={buttonVariants({ variant: "destructive" })}
            onClick={onDiscard}
          >
            {labels.discard}
          </AlertDialogAction>

          {showSave && (
            <AlertDialogAction
              disabled={saving}
              // preventDefault mantém o diálogo aberto durante o salvamento;
              // quem fecha é o pai, depois que a gravação termina.
              onClick={(e) => {
                e.preventDefault();
                onSave?.();
              }}
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {labels.save}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
