"use client";

import React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

// Evento ouvido pelo flow-editor para abrir o Dialog de confirmação de remoção
export const FLOW_EDGE_REMOVE_EVENT = "zpro-flow-edge-remove";

// Edge de condição do flow-builder: smoothstep com o LABEL ancorado junto ao
// handle de ORIGEM (bolinha da condição) — no meio do caminho os labels de
// edges paralelas se empilhavam sobre os nós. O X remove a CONDIÇÃO do nó de
// origem (via deleteElements → onEdgesDelete do editor; Desfazer reverte).
export function ConditionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  data,
}: EdgeProps) {
  const t = useTranslations("flowBuilderEditor");
  const edgeData = (data as { offset?: number; kind?: string } | undefined) || {};
  const offset = edgeData.offset ?? 20;
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
    offset,
  });

  const text =
    edgeData.kind === "US" ? t("edgeDefault") : edgeData.kind === "A" ? "⚡ auto" : label;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {text ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(${sourceX + 12}px, ${sourceY}px) translateY(-50%)`,
            }}
            className="nodrag nopan pointer-events-auto z-10 flex max-w-[160px] items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[10px] text-foreground shadow-sm"
          >
            <span className="truncate">{text}</span>
            <button
              type="button"
              title={t("edgeRemove")}
              onClick={(e) => {
                e.stopPropagation();
                // Confirmação via Dialog do editor (não usar confirm nativo)
                window.dispatchEvent(
                  new CustomEvent(FLOW_EDGE_REMOVE_EVENT, {
                    detail: { id, label: typeof text === "string" ? text : "" },
                  })
                );
              }}
              className="shrink-0 rounded text-muted-foreground hover:text-destructive"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
