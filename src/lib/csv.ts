// Utilidades CSV mínimas (sin dependencias externas) — cubren el subset de
// RFC 4180 que necesitamos: comillas dobles, comas y saltos de línea dentro
// de un campo, y separador secundario ";" para listas dentro de una celda
// (ej: varias URLs de imagen en una sola columna).

export function toCsvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  // BOM UTF-8 al principio para que Excel abra bien los acentos/ñ.
  const BOM = '﻿'
  return BOM + rows.map(row => row.map(toCsvField).join(',')).join('\r\n')
}

/**
 * Parser CSV tolerante: soporta campos entre comillas con comas/saltos de
 * línea/comillas escapadas (""), y detecta el separador automáticamente
 * (algunas planillas exportan con ";" en configuraciones regionales que usan
 * coma decimal).
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Detectar separador mirando la primera línea no vacía, fuera de comillas.
  const firstLine = clean.split('\n').find(l => l.trim().length > 0) ?? ''
  let inQuotes = false
  let commaCount = 0
  let semiCount = 0
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch === ',') commaCount++
    else if (!inQuotes && ch === ';') semiCount++
  }
  const delimiter = semiCount > commaCount ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  inQuotes = false
  let i = 0
  while (i < clean.length) {
    const ch = clean[i]
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue }
    if (ch === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
      i++; continue
    }
    field += ch; i++
  }
  // último campo/fila si el archivo no termina en salto de línea
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''))
}

/** Convierte filas crudas (con header en la fila 0) a objetos por nombre de columna. */
export function csvRowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(r => {
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim() })
    return obj
  })
}
