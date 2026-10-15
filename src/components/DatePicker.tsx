'use client'

// Reemplazo drop-in de <input type="date"> con calendario propio (esquinas
// redondeadas, sombra suave, día elegido con el color primario). El calendario
// nativo lo dibuja el navegador/SO y no se puede restylear con CSS.
//
// Uso: <DatePicker value="YYYY-MM-DD" onChange={e => set(e.target.value)} className="input text-sm" />
// onChange recibe { target: { value }, currentTarget: { value } } como Select.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

export interface DatePickerChangeEvent { target: { value: string }; currentTarget: { value: string } }

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> {
  value: string
  onChange?: (e: DatePickerChangeEvent) => void
  min?: string
  max?: string
  placeholder?: string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function parse(iso: string): { y: number; m: number; d: number } | null {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!mt) return null
  return { y: +mt[1], m: +mt[2] - 1, d: +mt[3] }
}

function todayIso() {
  const n = new Date()
  return toIso(n.getFullYear(), n.getMonth(), n.getDate())
}

function formatLabel(iso: string) {
  const p = parse(iso)
  return p ? `${pad(p.d)}/${pad(p.m + 1)}/${p.y}` : ''
}

export default function DatePicker({ value, onChange, min, max, placeholder = 'dd/mm/aaaa', className = '', disabled, onKeyDown, ...rest }: Props) {
  const sel = parse(value)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = sel ?? parse(todayIso())!
    return { y: base.y, m: base.m }
  })
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const [dark, setDark] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const PANEL_W = 288
  const PANEL_H = 340

  const place = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const up = below < PANEL_H && r.top - 12 > below
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8))
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left, up })
  }, [])

  function openPanel() {
    if (disabled) return
    setDark(document.documentElement.classList.contains('dark') || /bg-zinc-(8|9)00/.test(className))
    const base = parse(value) ?? parse(todayIso())!
    setView({ y: base.y, m: base.m })
    place()
    setOpen(true)
  }

  function emit(v: string) {
    onChange?.({ target: { value: v }, currentTarget: { value: v } })
  }

  function pick(iso: string) {
    setOpen(false)
    btnRef.current?.focus()
    if (iso !== value) emit(iso)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    const onMove = () => place()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, place])

  function shiftMonth(delta: number) {
    setView(v => {
      const t = v.y * 12 + v.m + delta
      return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }
    })
  }

  // Grilla del mes, semana desde lunes.
  const first = new Date(view.y, view.m, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = todayIso()
  const display = /(^|\s)(input|w-full|flex-1)(\s|$)/.test(className) ? 'flex' : 'inline-flex'
  const muted = dark ? 'text-zinc-400' : 'text-zinc-500'
  const navBtn = `p-1.5 rounded-full transition-colors ${dark ? 'hover:bg-zinc-700' : 'hover:bg-zinc-100'}`

  const panel = open && pos && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="Calendario"
      style={{
        position: 'fixed', left: pos.left, width: PANEL_W, zIndex: 9999,
        ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
      }}
      className={`select-panel rounded-2xl border p-4 shadow-2xl ${
        dark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-800'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => shiftMonth(-1)} className={navBtn} aria-label="Mes anterior">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold capitalize">{MESES[view.m]} {view.y}</span>
        <button type="button" onClick={() => shiftMonth(1)} className={navBtn} aria-label="Mes siguiente">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DIAS.map(d => (
          <div key={d} className={`text-center text-[11px] font-medium uppercase tracking-wide py-1 ${muted}`}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />
          const iso = toIso(view.y, view.m, d)
          const isSel = iso === value
          const isToday = iso === today
          const off = (!!min && iso < min) || (!!max && iso > max)
          return (
            <button
              key={i}
              type="button"
              disabled={off}
              onClick={() => pick(iso)}
              aria-pressed={isSel}
              className={`mx-auto h-9 w-9 rounded-full text-sm transition-colors ${
                isSel
                  ? 'bg-primary-600 text-white font-semibold shadow-sm'
                  : off
                    ? 'opacity-30 cursor-not-allowed'
                    : `${dark ? 'hover:bg-zinc-700' : 'hover:bg-zinc-100'} ${isToday ? 'ring-1 ring-primary-500 font-semibold' : ''}`
              }`}
            >
              {d}
            </button>
          )
        })}
      </div>

      <div className={`flex items-center justify-between mt-3 pt-3 border-t ${dark ? 'border-zinc-700' : 'border-zinc-100'}`}>
        <button
          type="button"
          onClick={() => { if (value) pick('') }}
          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${muted} ${dark ? 'hover:bg-zinc-700' : 'hover:bg-zinc-100'}`}
        >
          Borrar
        </button>
        <button
          type="button"
          disabled={(!!min && today < min) || (!!max && today > max)}
          onClick={() => pick(today)}
          className="text-xs font-medium px-3 py-1.5 rounded-full text-primary-600 hover:bg-primary-50 disabled:opacity-30 transition-colors"
        >
          Hoy
        </button>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onKeyDown}
        className={`${className} ${display} items-center justify-between gap-2 text-left ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        {...rest}
      >
        <span className={`min-w-0 flex-1 truncate ${value ? '' : 'text-zinc-400'}`}>{value ? formatLabel(value) : placeholder}</span>
        <CalendarDays size={16} className="flex-shrink-0 opacity-50" />
      </button>
      {panel}
    </>
  )
}
