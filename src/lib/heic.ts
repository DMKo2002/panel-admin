// Soporte HEIC/HEIF (fotos de iPhone/iPad).
//
// Por qué existe: iOS guarda las fotos en HEIC por defecto. Chrome, Firefox,
// Edge y Windows no lo muestran, y el canvas del browser tampoco lo decodifica,
// así que subir un .heic crudo termina en una imagen rota en la tienda.
// Solución: antes de procesar/subir, se convierte a JPEG en el browser.
// La librería (heic2any, ~1MB) se carga recién cuando aparece un HEIC.

export function isHeic(file: File): boolean {
  const t = (file.type || '').toLowerCase()
  if (t === 'image/heic' || t === 'image/heif' || t === 'image/heic-sequence' || t === 'image/heif-sequence') return true
  // Windows/Chrome suelen dejar file.type vacío para .heic
  return /\.(heic|heif)$/i.test(file.name)
}

// true si es una imagen que el panel puede procesar (incluye HEIC aunque el type venga vacío)
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || isHeic(file)
}

// Devuelve el mismo archivo si no es HEIC; si lo es, lo convierte a JPEG.
// Lanza error si la conversión falla (para no subir un HEIC crudo).
export async function ensureBrowserImage(file: File): Promise<File> {
  if (!isHeic(file)) return file
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
  const blob = Array.isArray(out) ? out[0] : out
  const base = file.name.replace(/\.[^.]+$/, '') || 'foto'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
