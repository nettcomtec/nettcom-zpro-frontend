import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/masterkey", "/reset", "/signup", "/precos", "/politica-de-privacidade", "/termos-de-uso", "/agendar", "/validate-a2f", "/api", "/_next", "/favicon", "/icons", "/public", "/sw.js", "/manifest"];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Allow access to static files (images, fonts, etc.)
  if (/\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i.test(pathname)) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for auth flag cookie set by auth-store on login
  const authCookie = req.cookies.get("zpro_auth")?.value;

  if (!authCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
