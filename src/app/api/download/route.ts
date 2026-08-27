import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") || "arquivo";
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeout);

    if (!res.ok || !res.body) {
      return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
    }

    const headers = new Headers();
    const safeFilename = filename.replace(/[^\w.\-() ]/g, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    const ct = res.headers.get("content-type");
    if (ct) headers.set("Content-Type", ct);
    const cl = res.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    headers.set("Cache-Control", "private, no-store");

    return new NextResponse(res.body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
}
