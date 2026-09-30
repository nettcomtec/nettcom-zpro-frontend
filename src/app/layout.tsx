import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LiveModeProvider } from "@/components/providers/live-mode-provider";
import { readBrandingServer } from "@/lib/branding-server";
import { LocaleProvider } from "@/i18n/locale-provider";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  preload: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { appName, pwaIconTimestamp } = await readBrandingServer();
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3101").replace(/\/$/, "");
  const t = pwaIconTimestamp > 0 ? `?t=${pwaIconTimestamp}` : "";
  const appleIcon180 = `${apiBase}/publicPwaIcon/apple-icon-180x180.png${t}`;
  const appleIcon1024 = `${apiBase}/publicPwaIcon/apple-icon-1024x1024.png${t}`;
  // Favicon whitelabel global via API (endpoint no-cache sem ?t=, sempre fresco).
  // Emitir no SSR garante que a 1ª pintura — inclusive em guia anônima / cache frio,
  // antes de qualquer JS ou localStorage — já mostre o favicon custom em vez do
  // favicon.ico padrão do build. O favicon por-tenant continua sendo aplicado no
  // client após o login (dashboard layout), pois o SSR não conhece o tenant.
  const faviconUrl = `${apiBase}/publicFavicon`;
  // Open Graph explícito. Sem og:image, WhatsApp/Telegram/iMessage escolhem "alguma"
  // imagem da página — na prática o maior apple-touch-icon —, e em instalação cujo
  // conjunto custom não tinha o 1024 isso mostrava a marca padrão ao compartilhar o
  // link. O 512 existe em todo conjunto custom já gerado (inclusive os anteriores ao
  // 1024) e atende o mínimo de 300px de largura do WhatsApp para o card grande.
  const description = "Sistema de atendimento multicanal";
  const ogImage = `${apiBase}/publicPwaIcon/icon-512x512.png${t}`;
  return {
    title: appName,
    description,
    openGraph: {
      title: appName,
      description,
      siteName: appName,
      type: "website",
      images: [{ url: ogImage, width: 512, height: 512, alt: appName }],
    },
    twitter: {
      card: "summary",
      title: appName,
      description,
      images: [ogImage],
    },
    icons: {
      icon: faviconUrl,
      apple: [
        { url: appleIcon180, sizes: "180x180" },
        { url: appleIcon1024, sizes: "1024x1024" },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: appName,
    },
    other: {
      "mobile-web-app-capable": "yes",
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica favicon e appName customizados do tenant ANTES da pintura para evitar flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var apiBase='${process.env.NEXT_PUBLIC_API_URL||''}';var auth=JSON.parse(localStorage.getItem('zpro-auth')||'null');var tId=auth&&auth.state&&auth.state.user&&auth.state.user.tenantId;var faviconHref=null;var titleSet=false;if(tId){var tb=JSON.parse(localStorage.getItem('zpro-tenant-branding-'+tId)||'null');if(tb){if(tb.customAppName){document.title=tb.customAppName;titleSet=true;}if(tb.customFaviconTimestamp>0)faviconHref=apiBase+'/publicFavicon?t='+tb.customFaviconTimestamp+'&tenantId='+tId;}}var gb=JSON.parse(localStorage.getItem('zpro-branding')||'null');if(!titleSet&&gb&&gb.appName){document.title=gb.appName;}if(!faviconHref&&gb&&gb.logoTimestamp){faviconHref=apiBase+'/publicFavicon?t='+gb.logoTimestamp;}if(faviconHref){var link=document.querySelector('link[rel=icon][data-zpro-favicon]')||document.createElement('link');link.rel='icon';link.setAttribute('data-zpro-favicon','');link.href=faviconHref;if(!link.parentNode){document.head.appendChild(link);}}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {/* Aplica paleta de cores do localStorage ANTES da primeira pintura para evitar flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('storedColors');if(!s)return;var colors=JSON.parse(s);if(!Array.isArray(colors)||!colors.length)return;var flat={};colors.forEach(function(item){Object.keys(item).forEach(function(k){if(k!=='label')flat[k]=item[k];});});function hexToHsl(hex){var c=hex.replace('#','');if(c.length!==6)return'';var r=parseInt(c.slice(0,2),16)/255,g=parseInt(c.slice(2,4),16)/255,b=parseInt(c.slice(4,6),16)/255;var mx=Math.max(r,g,b),mn=Math.min(r,g,b),h=0,s=0,l=(mx+mn)/2;if(mx!==mn){var d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);if(mx===r)h=((g-b)/d+(g<b?6:0))/6;else if(mx===g)h=((b-r)/d+2)/6;else h=((r-g)/d+4)/6;}return Math.round(h*360)+' '+Math.round(s*100)+'% '+Math.round(l*100)+'%';}var MAP={primary:['--primary','--ring','--sidebar-primary'],accent:['--accent','--sidebar-accent'],warning:['--warning'],negative:['--destructive'],positive:['--success']};var root=document.documentElement;var isDark=root.classList.contains('dark');Object.keys(flat).forEach(function(k){var v=flat[k];if(!v)return;root.style.setProperty('--q-'+k,v);if(!isDark&&MAP[k]){var hsl=hexToHsl(v);if(hsl){MAP[k].forEach(function(cv){root.style.setProperty(cv,hsl);});if(k==='accent'){var lParts=hsl.split(' ');var lVal=parseFloat(lParts[2]);var fg=lVal<50?'0 0% 98%':'240 5.9% 10%';root.style.setProperty('--accent-foreground',fg);root.style.setProperty('--sidebar-accent-foreground',fg);}}}});}catch(e){}})();`,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LocaleProvider>
            <LiveModeProvider>
              {children}
            </LiveModeProvider>
          </LocaleProvider>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
