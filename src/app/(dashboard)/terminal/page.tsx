"use client";

import React, { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Terminal, AlertTriangle } from "lucide-react";
import api from "@/lib/api";

interface HistoryEntry {
  command: string;
  output: string;
  error?: boolean;
}

export default function TerminalPage() {
  const t = useTranslations("terminalPage");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdIndex, setCmdIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
  }, [history]);

  async function runCommand(cmd: string) {
    if (!cmd.trim()) return;
    setLoading(true);
    try {
      const res = await api.post("/command", { command: cmd });
      setHistory((h) => [...h, { command: cmd, output: res.data.output ?? res.data.message ?? "" }]);
    } catch (err: unknown) {
      const failure = err as {
        data?: { error?: string };
        response?: { data?: { error?: string } };
      };
      const code = failure?.data?.error ?? failure?.response?.data?.error;
      const msg =
        code === "ERR_TERMINAL_DISABLED"
          ? t("disabledByServer")
          : code ?? "Erro ao executar comando.";
      setHistory((h) => [...h, { command: cmd, output: msg, error: true }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const cmd = input.trim();
      if (!cmd) return;
      setCmdHistory((h) => [cmd, ...h]);
      setCmdIndex(-1);
      setInput("");
      runCommand(cmd);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(cmdIndex + 1, cmdHistory.length - 1);
      setCmdIndex(next);
      setInput(cmdHistory[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(cmdIndex - 1, -1);
      setCmdIndex(next);
      setInput(next === -1 ? "" : cmdHistory[next] ?? "");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />

      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{t("warning")}</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b rounded-t-lg">
            <Terminal className="h-4 w-4" />
            <span className="text-sm font-medium">{t("terminalLabel")}</span>
          </div>

          <div
            className="bg-black text-green-400 font-mono text-sm p-4 h-[500px] overflow-y-auto rounded-b-lg"
            ref={outputRef}
            onClick={() => inputRef.current?.focus()}
          >
            {history.map((entry, i) => (
              <div key={i} className="mb-2">
                <div className="flex gap-2">
                  <span className="text-green-600 select-none">$</span>
                  <span className="text-white">{entry.command}</span>
                </div>
                <pre
                  className={`whitespace-pre-wrap break-all ml-4 ${entry.error ? "text-red-400" : "text-green-300"}`}
                >
                  {entry.output}
                </pre>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 animate-pulse">
                <span className="text-green-600 select-none">$</span>
                <span className="text-white">executando...</span>
              </div>
            )}

            {!loading && (
              <div className="flex gap-2 items-center">
                <span className="text-green-600 select-none">$</span>
                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent outline-none text-white caret-green-400"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
