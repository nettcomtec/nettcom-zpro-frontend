// Meta Business Partner badge — exibido nas telas de login, assinatura e app-waba
// A imagem bmpartner.png fica em /public e é servida diretamente pelo Next.js
// Sempre usa /public — NÃO é substituível pelo sistema de branding do tenant.

interface MetaPartnerBadgeProps {
  className?: string;
}

export function MetaPartnerBadge({ className = "" }: MetaPartnerBadgeProps) {
  return (
    <div className={`flex justify-center items-center mt-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bmpartner.png"
        alt="Meta Business Partner"
        className="h-7 object-contain select-none pointer-events-none opacity-90 rounded-md"
        draggable={false}
      />
    </div>
  );
}
