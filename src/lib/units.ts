// Unidades de peso/contenido y de medidas.
//
// OJO — regla de oro de este proyecto: el valor numérico guardado en
// `products.weight_kg` / `width_cm` / `length_cm` / `height_cm` está en la
// unidad que eligió el tenant (o el producto), NO en kilos ni en centímetros.
// El sufijo "_kg"/"_cm" de esas columnas es histórico. Nunca asumir la unidad
// a partir del nombre de la columna: leerla de products.weight_unit /
// dimension_unit, y si es null, de store_config.

export const MASS_UNITS = ['mg', 'g', 'kg'] as const
export const VOLUME_UNITS = ['ml', 'l'] as const
export const LENGTH_UNITS = ['mm', 'cm', 'm', 'in'] as const

export type WeightUnit = typeof MASS_UNITS[number] | typeof VOLUME_UNITS[number]
export type LengthUnit = typeof LENGTH_UNITS[number]

// Etiquetas para los selectores del Panel.
export const WEIGHT_UNIT_LABELS: Record<string, string> = {
  kg: 'Kilogramos (kg)',
  g: 'Gramos (g)',
  mg: 'Miligramos (mg)',
  l: 'Litros (l)',
  ml: 'Mililitros (ml)',
}
export const LENGTH_UNIT_LABELS: Record<string, string> = {
  cm: 'Centímetros (cm)',
  mm: 'Milímetros (mm)',
  m: 'Metros (m)',
  in: 'Pulgadas (in)',
}

const TO_GRAMS: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 }
const TO_ML: Record<string, number> = { ml: 1, l: 1000 }

export function isMassUnit(u?: string | null): boolean {
  return !!u && u in TO_GRAMS
}
export function isVolumeUnit(u?: string | null): boolean {
  return !!u && u in TO_ML
}

export function toGrams(value: number, unit?: string | null): number {
  return value * (TO_GRAMS[unit ?? 'g'] ?? 1)
}
export function toMilliliters(value: number, unit?: string | null): number {
  return value * (TO_ML[unit ?? 'ml'] ?? 1)
}

// Redondeo "lindo": saca los decimales que no aportan (2.500 -> 2,5).
export function formatNumber(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',')
}

// Elige la unidad más legible para un total. 1500 g -> "1,5 kg";
// 0.4 g -> "400 mg". Se usa para el peso total de un envío, donde los
// productos pueden venir cargados en unidades distintas.
export function formatMassTotal(grams: number): string {
  if (grams >= 1000) return `${formatNumber(grams / 1000)} kg`
  if (grams > 0 && grams < 1) return `${formatNumber(grams * 1000)} mg`
  return `${formatNumber(grams)} g`
}

export function formatVolumeTotal(ml: number): string {
  if (ml >= 1000) return `${formatNumber(ml / 1000)} l`
  return `${formatNumber(ml)} ml`
}

// Unidad efectiva de un producto: la propia si la tiene, si no la de la
// tienda, si no el default histórico.
export function effectiveWeightUnit(productUnit?: string | null, storeUnit?: string | null): string {
  return productUnit || storeUnit || 'kg'
}
export function effectiveDimensionUnit(productUnit?: string | null, storeUnit?: string | null): string {
  return productUnit || storeUnit || 'cm'
}
