// Validação client-side de imagem para o feed do Instagram — feedback
// imediato na seleção do arquivo. Espelha a validação autoritativa do
// backend (NormalizeInstagramImageZPRO): AR entre 4:5 e 1.91:1, largura
// mínima 320px. Formatos que o browser não decodifica (ex.: HEIC) passam
// e ficam por conta do backend, que converte/valida.
export const IG_MIN_ASPECT_RATIO = 4 / 5;
export const IG_MAX_ASPECT_RATIO = 1.91;
export const IG_MIN_WIDTH = 320;
const AR_TOLERANCE = 0.01;

export type IgImageCheck =
  | { ok: true }
  | { ok: false; reason: "aspect" | "tooSmall"; width: number; height: number };

const loadDimensions = (src: string) =>
  new Promise<{ width: number; height: number } | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });

export async function checkIgImageUrl(url: string): Promise<IgImageCheck> {
  const dims = await loadDimensions(url);
  if (!dims || !dims.width || !dims.height) return { ok: true };
  const ar = dims.width / dims.height;
  if (ar < IG_MIN_ASPECT_RATIO - AR_TOLERANCE || ar > IG_MAX_ASPECT_RATIO + AR_TOLERANCE) {
    return { ok: false, reason: "aspect", width: dims.width, height: dims.height };
  }
  if (dims.width < IG_MIN_WIDTH) {
    return { ok: false, reason: "tooSmall", width: dims.width, height: dims.height };
  }
  return { ok: true };
}

export async function checkIgImageFile(file: File): Promise<IgImageCheck> {
  if (!file.type.startsWith("image/")) return { ok: true };
  const url = URL.createObjectURL(file);
  try {
    return await checkIgImageUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
