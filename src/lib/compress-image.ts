// Compresión de imágenes en el browser antes de subir a Supabase Storage.
//
// Por qué existe: las fotos de producto ya se comprimen (resizeImageTo en
// productos/), pero los assets de Apariencia (hero, moodboard, logo) se subían
// crudos — un hero de 3-4 MB del celular servido en cada visita al home fue lo
// que reventó el cached egress de Supabase (12.5 GB en julio 2026).
//
// Reglas:
// - Videos, SVG y GIF pasan sin tocar (SVG es chico, GIF perdería animación).
// - Logos/favicons (keepAlpha): resize a máx 800px manteniendo PNG (transparencia).
// - Resto: resize a máx maxDim px y JPEG bajando calidad hasta ≤ targetKB.
// - Si el resultado sale más pesado que el original, se conserva el original.

export interface CompressOptions {
  maxDim?: number // lado mayor máximo en px
  targetKB?: number // peso objetivo
  keepAlpha?: boolean // true para logos: PNG con transparencia
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDim = 1920, targetKB = 400, keepAlpha = false } = opts

  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file

  let img: HTMLImageElement
  try {
    img = await loadImage(file)
  } catch {
    return file // si no se puede decodificar, subir el original
  }

  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, w, h)

  let best: Blob | null = null

  if (keepAlpha) {
    best = await toBlob(canvas, 'image/png')
  } else {
    // Bajar calidad JPEG hasta cumplir el objetivo
    for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      best = await toBlob(canvas, 'image/jpeg', q)
      if (best && best.size <= targetKB * 1024) break
    }
  }

  if (!best || best.size >= file.size) return file

  const ext = keepAlpha ? 'png' : 'jpg'
  const base = file.name.replace(/\.[^.]+$/, '')
  return new File([best], `${base}.${ext}`, { type: best.type })
}
