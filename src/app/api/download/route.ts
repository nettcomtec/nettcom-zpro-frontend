import type { IncomingMessage } from "http";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { BlockedDestinationError, fetchGuarded, parseDownloadUrl } from "../_lib/outbound-guard";

export const runtime = "nodejs";

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "arquivo";
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const target = parseDownloadUrl(url);
  if (!target) return NextResponse.json({ error: "Invalid url" }, { status: 400 });

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "*/*",
  };
  // Só para o próprio backend, só a origem do painel, só no 1º pedido: o /public sem
  // SECURE_URL confere Origin/Referer e recusava o arquivo que redireciona para o S3.
  // Host de fora não recebe (anti-hotlink que aceita Referer vazio continuaria igual).
  const panelOrigin = originOf(req.headers.get("referer")) || originOf(req.headers.get("origin"));
  const toBackend = target.origin === originOf(process.env.NEXT_PUBLIC_API_URL || null);
  const firstHopHeaders = panelOrigin && toBackend ? { Referer: `${panelOrigin}/` } : undefined;

  let res: IncomingMessage | null = null;
  try {
    res = await fetchGuarded(target, upstreamHeaders, 60_000, firstHopHeaders);

    const status = res.statusCode || 0;
    if (status < 200 || status >= 300) {
      res.destroy();
      // Arquivo inexistente na origem segue como 404: a tela diz "não está mais disponível".
      if (status === 404 || status === 410) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
    }

    const headers = new Headers();
    const safeFilename = filename.replace(/[^\w.\-() ]/g, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    const ct = res.headers["content-type"];
    if (ct) headers.set("Content-Type", ct);
    const cl = res.headers["content-length"];
    if (cl) headers.set("Content-Length", cl);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    const body = Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>;
    return new NextResponse(body, { status: 200, headers });
  } catch (err) {
    res?.destroy();
    if (err instanceof BlockedDestinationError) {
      return NextResponse.json({ error: "Destination not allowed" }, { status: 403 });
    }
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
}
