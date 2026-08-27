import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json({ url, title: new URL(url).hostname });
    }

    const html = await res.text();

    const get = (prop: string): string => {
      const ogMatch = html.match(
        new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i")
      ) || html.match(
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i")
      );
      if (ogMatch) return ogMatch[1];
      const nameMatch = html.match(
        new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i")
      ) || html.match(
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${prop}["']`, "i")
      );
      return nameMatch?.[1] || "";
    };

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const rawTitle = get("title") || titleMatch?.[1]?.trim() || "";
    const ERROR_PAGE = /^(404|403|500|502|503|page not found|not found|access denied|forbidden|error)\b/i;
    const title = rawTitle && !ERROR_PAGE.test(rawTitle) ? rawTitle : new URL(url).hostname;
    const description = get("description");
    const image = ERROR_PAGE.test(rawTitle) ? "" : get("image");

    // Make image URL absolute
    let imageUrl = image;
    if (imageUrl && !imageUrl.startsWith("http")) {
      const base = new URL(url);
      imageUrl = imageUrl.startsWith("/")
        ? `${base.protocol}//${base.host}${imageUrl}`
        : `${base.protocol}//${base.host}/${imageUrl}`;
    }

    return NextResponse.json({
      url,
      title: title.substring(0, 200),
      description: description.substring(0, 300),
      image: imageUrl,
      hostname: new URL(url).hostname,
    });
  } catch {
    return NextResponse.json({ url, hostname: (() => { try { return new URL(url).hostname; } catch { return url; } })() });
  }
}
