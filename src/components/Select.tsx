'use client'

// Reemplazo drop-in de <select> con lista desplegable propia (esquinas
// redondeadas, sombra suave, tilde en la opción elegida). El <select> nativo
// deja que el navegador/SO dibuje la lista y no se puede restylear con CSS.
//
// Uso idéntico al nativo: <select value onChange className disabled> con
// <option value="x">Texto</option> adentro. onChange recibe un objeto con
// target.value / currentTarget.value (alcanza para todos los usos del panel).
// Los <option> solo se leen como datos, nunca se renderizan.

import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

interface Opt { value: string; label: string; disabled: boolean }

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as any).children)
  return ''
}

function collectOptions(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, child => {
    if (!isValidElement(child)) return
    const p = child.props as any
    if (child.type === Fragment) { collectOptions(p.children, out); return }
    if (child.type === 'optgroup') { collectOptions(p.children, out); return }
    if (child.type === 'option') {
      const label = textOf(p.children)
      out.push({ value: p.value !== undefined ? String(p.value) : label, label, disabled: !!p.disabled })
    }
  })
  return out
}

export interface SelectChangeEvent { target: { value: string }; currentTarget: { value: string } }

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value' | 'children'> {
  value: string | number | null | undefined
  onChange?: (e: SelectChangeEvent) => void
  children?: ReactNode
}

export default function Select({ value, onChange, children, className = '', disabled, onKeyDown, ...rest }: Props) {
  const options = useMemo(() => collectOptions(children), [children])
  const current = value === null || value === undefined ? '' : String(value)
  const selected = options.find(o => o.value === current)

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean; maxH: number } | null>(null)
  const [dark, setDark] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const place = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = below < 180 && above > below
    const maxH = Math.max(120, Math.min(288, up ? above : below))
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: r.width, up, maxH })
  }, [])

  function openList() {
    if (disabled) return
    setDark(document.documentElement.classList.contains('dark') || /bg-zinc-(8|9)00/.test(className))
    place()
    const idx = options.findIndex(o => o.value === current && !o.disabled)
    setActive(idx >= 0 ? idx : options.findIndex(o => !o.disabled))
    setOpen(true)
  }

  function choose(o: Opt) {
    if (o.disabled) return
    setOpen(false)
    btnRef.current?.focus()
    if (o.value !== current) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } })
  }

  // Cerrar al clickear afuera; reposicionar al scrollear/redimensionar.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onMove = (e: Event) => {
      if (e.type === 'scroll' && panelRef.current?.contains(e.target as Node)) return
      place()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, place])

  // Mantener visible la opción activa (teclado).
  useLayoutEffect(() => {
    if (!open || active < 0) return
    panelRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, pos])

  function step(dir: 1 | -1) {
    if (options.length === 0) return
    let i = active
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length
      if (!options[i].disabled) { setActive(i); return }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(e)
    if (e.defaultPrevented || disabled) return
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(options.findIndex(o => !o.disabled)) }
    else if (e.key === 'End') { e.preventDefault(); for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) { setActive(i); break } }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) choose(options[active]) }
    else if (e.key === 'Tab') setOpen(false)
  }

  const display = /(^|\s)(input|w-full|flex-1)(\s|$)/.test(className) ? 'flex' : 'inline-flex'

  const panel = open && pos && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      id={listId}
      role="listbox"
      style={{
        position: 'fixed', left: pos.left, minWidth: pos.width, maxWidth: 'min(92vw, 28rem)', maxHeight: pos.maxH, zIndex: 9999,
        ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
      }}
      className={`select-panel overflow-y-auto rounded-xl border p-1.5 shadow-xl ${
        dark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-800'
      }`}
    >
      {options.map((o, i) => {
        const isSel = o.value === current
        return (
          <div
            key={`${o.value}-${i}`}
            data-idx={i}
            role="option"
            aria-selected={isSel}
            aria-disabled={o.disabled}
            onMouseEnter={() => !o.disabled && setActive(i)}
            onClick={() => choose(o)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm select-none ${
              o.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            } ${
              i === active && !o.disabled ? (dark ? 'bg-zinc-700' : 'bg-zinc-100') : ''
            } ${isSel ? 'font-medium' : ''}`}
          >
            <span className="flex-1 min-w-0">{o.label}</span>
            {isSel && <Check size={14} className="flex-shrink-0 opacity-70" />}
          </div>
        )
      })}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        className={`${className} ${display} items-center justify-between gap-2 text-left ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        {...rest}
      >
        <span className="min-w-0 flex-1 truncate">{selected ? selected.label : (options[0] && !current ? options[0].label : '')}</span>
        <ChevronDown size={16} className={`flex-shrink-0 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {panel}
    </>
  )
}
