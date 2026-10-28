"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";

// Miniatura de mapa por tiles do OpenStreetMap (sem chave de API). Usada no balão de
// localização, na janela de envio de localização, em Mensagens rápidas e no nó do fluxo.
// O contêiner (relative + overflow-hidden + altura) fica com quem usa; aqui só os tiles.

const OSM_TILE_SIZE = 256;
const OSM_ZOOM = 15;

interface OsmMapThumbnailProps {
  lat: number;
  lng: number;
  alt: string;
  attribution: string;
  /** Maior largura que a miniatura pode ter (px). Padrão 280, a do balão. */
  width?: number;
  /** Maior altura que a miniatura pode ter (px). Padrão 120, a do balão. */
  height?: number;
}

// Coordenada nova = tentativa nova: um tile que falhou não deixa o mapa preso no alfinete.
export function OsmMapThumbnail(props: OsmMapThumbnailProps) {
  return <OsmMapTiles key={`${props.lat}:${props.lng}`} {...props} />;
}

// Monta só os tiles que cobrem a área em volta do ponto e os posiciona em relação ao
// CENTRO do contêiner, então o ponto fica centrado em qualquer largura; o excedente fica
// fora do overflow-hidden de quem usa.
function OsmMapTiles({ lat, lng, alt, attribution, width = 280, height = 120 }: OsmMapThumbnailProps) {
  const [failed, setFailed] = useState(false);
  if (failed || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return <MapPin className="h-12 w-12 text-muted-foreground" />;
  }

  const halfW = Math.max(1, width) / 2;
  const halfH = Math.max(1, height) / 2;
  const n = 2 ** OSM_ZOOM;
  const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const pointX = ((lng + 180) / 360) * n * OSM_TILE_SIZE;
  const pointY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * OSM_TILE_SIZE;

  const tiles: { key: string; src: string; dx: number; dy: number }[] = [];
  const firstY = Math.floor((pointY - halfH) / OSM_TILE_SIZE);
  const lastY = Math.floor((pointY + halfH) / OSM_TILE_SIZE);
  const firstX = Math.floor((pointX - halfW) / OSM_TILE_SIZE);
  const lastX = Math.floor((pointX + halfW) / OSM_TILE_SIZE);
  for (let ty = firstY; ty <= lastY; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = firstX; tx <= lastX; tx++) {
      const wrappedX = ((tx % n) + n) % n;
      tiles.push({
        key: `${tx}-${ty}`,
        src: `https://tile.openstreetmap.org/${OSM_ZOOM}/${wrappedX}/${ty}.png`,
        dx: tx * OSM_TILE_SIZE - pointX,
        dy: ty * OSM_TILE_SIZE - pointY,
      });
    }
  }

  return (
    <div role="img" aria-label={alt} className="absolute inset-0">
      {tiles.map((tile) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={tile.key}
          src={tile.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          className="absolute max-w-none select-none"
          style={{
            width: OSM_TILE_SIZE,
            height: OSM_TILE_SIZE,
            left: `calc(50% + ${tile.dx}px)`,
            top: `calc(50% + ${tile.dy}px)`,
          }}
          onError={() => setFailed(true)}
        />
      ))}
      <MapPin
        className="absolute h-6 w-6 -translate-x-1/2 -translate-y-full text-red-600 fill-red-500/40 drop-shadow"
        style={{ left: "50%", top: "50%" }}
        aria-hidden="true"
      />
      <span className="absolute top-1 right-1 rounded bg-background/80 px-1 text-[9px] leading-tight text-muted-foreground">
        {attribution}
      </span>
    </div>
  );
}
