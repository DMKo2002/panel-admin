// Utilidades de color compartidas entre el editor de producto (cliente,
// VariantMatrix.tsx) y la API de borrado de columnas/filas (servidor,
// api/variants/delete-group). Viven acá — sin "use client" — para poder
// importarse tanto desde componentes de cliente como desde route handlers
// sin cruzar el boundary de RSC.

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  if (!/^[0-9A-Fa-f]{6}$/.test(full)) return null
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) }
}

// Nombre viejo guardado como código hex (bug legacy previo a separar
// nombre/hex) — nunca es un nombre "tipeado a propósito" por el tenant.
export function isHexLikeName(name: string): boolean {
  return /^#[0-9A-Fa-f]{3,8}$/.test((name ?? '').trim())
}

// Paleta estándar de nombres de color HTML/CSS (los 147 "named colors" de la
// especificación, traducidos) — fuente para SUGERIR un nombre por default
// cuando el tenant elige un hex con el cuentagotas/selector.
export const CSS_NAMED_COLORS: [string, string][] = [
  ['Azul Alicia', '#F0F8FF'], ['Blanco Antiguo', '#FAEBD7'], ['Aqua', '#00FFFF'], ['Aguamarina', '#7FFFD4'],
  ['Azur', '#F0FFFF'], ['Beige', '#F5F5DC'], ['Bizcocho', '#FFE4C4'], ['Negro', '#000000'],
  ['Almendra', '#FFEBCD'], ['Azul', '#0000FF'], ['Azul Violeta', '#8A2BE2'], ['Marrón', '#A52A2A'],
  ['Madera', '#DEB887'], ['Azul Cadete', '#5F9EA0'], ['Verde Chartreuse', '#7FFF00'], ['Chocolate', '#D2691E'],
  ['Coral', '#FF7F50'], ['Azul Aciano', '#6495ED'], ['Seda de Maíz', '#FFF8DC'], ['Carmesí', '#DC143C'],
  ['Cian', '#00FFFF'], ['Azul Oscuro', '#00008B'], ['Cian Oscuro', '#008B8B'], ['Dorado Oscuro', '#B8860B'],
  ['Gris Oscuro', '#A9A9A9'], ['Verde Oscuro', '#006400'], ['Caqui Oscuro', '#BDB76B'], ['Magenta Oscuro', '#8B008B'],
  ['Verde Oliva Oscuro', '#556B2F'], ['Naranja Oscuro', '#FF8C00'], ['Orquídea Oscuro', '#9932CC'], ['Rojo Oscuro', '#8B0000'],
  ['Salmón Oscuro', '#E9967A'], ['Verde Mar Oscuro', '#8FBC8F'], ['Azul Pizarra Oscuro', '#483D8B'], ['Gris Pizarra Oscuro', '#2F4F4F'],
  ['Turquesa Oscuro', '#00CED1'], ['Violeta Oscuro', '#9400D3'], ['Rosa Intenso', '#FF1493'], ['Celeste Intenso', '#00BFFF'],
  ['Gris Tenue', '#696969'], ['Azul Dodger', '#1E90FF'], ['Ladrillo', '#B22222'], ['Blanco Floral', '#FFFAF0'],
  ['Verde Bosque', '#228B22'], ['Fucsia', '#FF00FF'], ['Gris Perla', '#DCDCDC'], ['Blanco Fantasma', '#F8F8FF'],
  ['Dorado', '#FFD700'], ['Vara de Oro', '#DAA520'], ['Gris', '#808080'], ['Verde', '#008000'],
  ['Verde Amarillento', '#ADFF2F'], ['Verde Melón', '#F0FFF0'], ['Rosa Fuerte', '#FF69B4'], ['Rojo Indio', '#CD5C5C'],
  ['Índigo', '#4B0082'], ['Marfil', '#FFFFF0'], ['Caqui', '#F0E68C'], ['Lavanda', '#E6E6FA'],
  ['Rosa Lavanda', '#FFF0F5'], ['Verde Césped', '#7CFC00'], ['Amarillo Limón', '#FFFACD'], ['Celeste', '#ADD8E6'],
  ['Coral Claro', '#F08080'], ['Cian Claro', '#E0FFFF'], ['Amarillo Dorado Claro', '#FAFAD2'], ['Gris Claro', '#D3D3D3'],
  ['Verde Claro', '#90EE90'], ['Rosa Claro', '#FFB6C1'], ['Salmón Claro', '#FFA07A'], ['Verde Mar Claro', '#20B2AA'],
  ['Celeste Cielo Claro', '#87CEFA'], ['Gris Pizarra Claro', '#778899'], ['Azul Acero Claro', '#B0C4DE'], ['Amarillo Claro', '#FFFFE0'],
  ['Lima', '#00FF00'], ['Verde Lima', '#32CD32'], ['Lino', '#FAF0E6'], ['Magenta', '#FF00FF'],
  ['Granate', '#800000'], ['Aguamarina Medio', '#66CDAA'], ['Azul Medio', '#0000CD'], ['Orquídea Medio', '#BA55D3'],
  ['Púrpura Medio', '#9370DB'], ['Verde Mar Medio', '#3CB371'], ['Azul Pizarra Medio', '#7B68EE'], ['Verde Primavera Medio', '#00FA9A'],
  ['Turquesa Medio', '#48D1CC'], ['Rojo Violeta Medio', '#C71585'], ['Azul Medianoche', '#191970'], ['Crema de Menta', '#F5FFFA'],
  ['Rosa Neblina', '#FFE4E1'], ['Mocasín', '#FFE4B5'], ['Blanco Navajo', '#FFDEAD'], ['Azul Marino', '#000080'],
  ['Encaje Antiguo', '#FDF5E6'], ['Oliva', '#808000'], ['Verde Oliva', '#6B8E23'], ['Naranja', '#FFA500'],
  ['Rojo Anaranjado', '#FF4500'], ['Orquídea', '#DA70D6'], ['Dorado Pálido', '#EEE8AA'], ['Verde Pálido', '#98FB98'],
  ['Turquesa Pálido', '#AFEEEE'], ['Rojo Violeta Pálido', '#DB7093'], ['Papaya', '#FFEFD5'], ['Durazno', '#FFDAB9'],
  ['Perú', '#CD853F'], ['Rosa', '#FFC0CB'], ['Ciruela', '#DDA0DD'], ['Azul Polvo', '#B0E0E6'],
  ['Púrpura', '#800080'], ['Púrpura Rebecca', '#663399'], ['Rojo', '#FF0000'], ['Marrón Rosado', '#BC8F8F'],
  ['Azul Real', '#4169E1'], ['Marrón Silla', '#8B4513'], ['Salmón', '#FA8072'], ['Marrón Arena', '#F4A460'],
  ['Verde Mar', '#2E8B57'], ['Concha de Mar', '#FFF5EE'], ['Siena', '#A0522D'], ['Plateado', '#C0C0C0'],
  ['Celeste Cielo', '#87CEEB'], ['Azul Pizarra', '#6A5ACD'], ['Gris Pizarra', '#708090'], ['Blanco Nieve', '#FFFAFA'],
  ['Verde Primavera', '#00FF7F'], ['Azul Acero', '#4682B4'], ['Bronceado', '#D2B48C'], ['Verde Azulado', '#008080'],
  ['Cardo', '#D8BFD8'], ['Tomate', '#FF6347'], ['Turquesa', '#40E0D0'], ['Violeta', '#EE82EE'],
  ['Trigo', '#F5DEB3'], ['Blanco', '#FFFFFF'], ['Humo Blanco', '#F5F5F5'], ['Amarillo', '#FFFF00'],
  ['Verde Amarillo', '#9ACD32'],
]

// Nombre HTML/CSS más cercano al hex elegido, por distancia RGB — se usa
// para sugerir un nombre por default cuando el tenant elige un hex y
// todavía no le puso nombre propio, y también server-side para saber a qué
// nombre "visible" corresponde una variante legacy guardada como hex.
export function nearestColorName(hex: string): string {
  const target = hexToRgb(hex)
  if (!target) return ''
  let best = ''
  let bestDist = Infinity
  for (const [label, h] of CSS_NAMED_COLORS) {
    const rgb = hexToRgb(h)
    if (!rgb) continue
    const dist = (rgb.r - target.r) ** 2 + (rgb.g - target.g) ** 2 + (rgb.b - target.b) ** 2
    if (dist < bestDist) { bestDist = dist; best = label }
  }
  return best
}

// "nuevo" / "nuevo-2" son los placeholders que pone addColor() en
// VariantMatrix; un nombre que es literalmente un código hex (ej:
// "#CD5C5C") es el resto de datos viejos de antes de separar nombre/hex —
// en ningún caso es un nombre "tipeado a propósito" por el tenant, así que
// en ambos casos está bien pisarlo con la sugerencia automática.
export function isPlaceholderName(name: string): boolean {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return true
  if (/^nuevo(-\d+)?$/i.test(trimmed)) return true
  if (isHexLikeName(trimmed)) return true
  return false
}

// Dado el listado crudo de variantes de un producto (color + color_hex),
// arma el mapa "valor crudo en la base" -> "nombre que ve el tenant en
// pantalla", con el mismo criterio que usa el editor: si el color guardado
// es un hex legacy, se reemplaza por el nombre HTML/CSS más cercano; si dos
// colores distintos caen en el mismo nombre sugerido, el segundo se
// desambigua agregando " 2", " 3", etc.
export function buildDisplayNameByRawColor(
  variants: { color: string | null; color_hex: string | null }[]
): Record<string, string> {
  const displayByRaw: Record<string, string> = {}
  for (const v of variants) {
    const raw = v.color ?? ''
    if (!raw || displayByRaw[raw]) continue
    displayByRaw[raw] = isHexLikeName(raw) ? (nearestColorName(v.color_hex || raw) || raw) : raw
  }
  const usedNames = new Set<string>()
  for (const raw of Object.keys(displayByRaw)) {
    const base = displayByRaw[raw]
    let name = base
    let n = 2
    while (usedNames.has(name)) { name = `${base} ${n++}` }
    usedNames.add(name)
    displayByRaw[raw] = name
  }
  return displayByRaw
}
