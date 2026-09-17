import sharp from 'sharp'

// Espeja los 3 niveles de calidad que ya existen del lado cliente en
// productos/nuevo/page.tsx (resizeImageTo, canvas + toBlob) — mismas
// dimensiones y tope de bytes por nivel, para que una imagen migrada por
// el importador de CSV pese/luzca igual que una subida a mano desde el
// Panel. Acá corre server-side (sharp) porque el importador procesa
// imágenes descargadas de la tienda vieja, no archivos elegidos en un
// <input> del navegador — no hay DOM/canvas disponible en la API route.
export type ImageQuality = 'alta' | 'estandar' | 'baja'
export type ImageRatio = '1:1' | '2:3'

const PRESETS: Record<ImageQuality, Record<ImageRatio, { w: number; h: number; maxBytes: number }>> = {
  alta: {
    '1:1': { w: 3000, h: 3000, maxBytes: 1200 * 1024 },
    '2:3': { w: 2000, h: 3000, maxBytes: 1200 * 1024 },
  },
  estandar: {
    '1:1': { w: 2048, h: 2048, maxBytes: 700 * 1024 },
    '2:3': { w: 1365, h: 2048, maxBytes: 700 * 1024 },
  },
  baja: {
    '1:1': { w: 1200, h: 1200, maxBytes: 200 * 1024 },
    '2:3': { w: 800, h: 1200, maxBytes: 200 * 1024 },
  },
}

/**
 * Redimensiona (center-crop) y comprime a JPEG bajando la calidad en pasos
 * de 10 (arranca en 85, piso en 30) hasta entrar en el tope de bytes del
 * nivel elegido — mismo algoritmo que el `tryCompress` del canvas del
 * lado cliente, reimplementado con sharp.
 */
export async function processImageForUpload(
  input: Buffer,
  ratio: ImageRatio,
  quality: ImageQuality
): Promise<Buffer> {
  const preset = PRESETS[quality][ratio]
  const base = sharp(input).rotate() // rotate() sin argumentos = auto-orienta por EXIF
    .resize(preset.w, preset.h, { fit: 'cover', position: 'centre' })

  let q = 85
  let out = await base.clone().jpeg({ quality: q, mozjpeg: true }).toBuffer()
  while (out.byteLength > preset.maxBytes && q > 30) {
    q -= 10
    out = await base.clone().jpeg({ quality: q, mozjpeg: true }).toBuffer()
  }
  return out
}

export function ratioFromStoreConfig(productImageRatio: string | null | undefined): ImageRatio {
  return productImageRatio === '1:1' ? '1:1' : '2:3'
}
