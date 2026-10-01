'use client'

import { useState } from 'react'

export interface ChartBar {
  key: string | number
  total: number
  /** Texto debajo de la barra (vacío = no se muestra) */
  axisLabel: string
  /** Segunda línea del tooltip, ej. "Día 12" o "Marzo" */
  tooltipLabel: string
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

export default function RevenueChart({
  data,
  periodLabel,
  title = 'Ingresos por día',
  totalLabel = 'Total del mes',
  barGap = 3,
}: {
  data: ChartBar[]
  periodLabel: string
  title?: string
  totalLabel?: string
  barGap?: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  const max = Math.max(1, ...data.map(d => d.total))
  const total = data.reduce((acc, d) => acc + d.total, 0)

  const chartHeight = 180
  const width = 100 / data.length

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-700">{title}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{periodLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-400">{totalLabel}</p>
          <p className="text-sm font-semibold text-zinc-900">{formatPrice(total)}</p>
        </div>
      </div>

      <div className="relative" style={{ height: chartHeight + 24 }}>
        {hovered !== null && (
          <div
            className="absolute -top-1 z-10 bg-zinc-900 text-white text-xs rounded-lg px-2.5 py-1.5 pointer-events-none whitespace-nowrap shadow-lg"
            style={{
              left: `${(hovered + 0.5) * width}%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="font-medium">{formatPrice(data[hovered].total)}</div>
            <div className="text-zinc-400">{data[hovered].tooltipLabel}</div>
          </div>
        )}

        <div className="flex items-end" style={{ height: chartHeight, gap: barGap }}>
          {data.map((d, i) => {
            const barHeight = Math.max(2, (d.total / max) * chartHeight)
            const isHovered = hovered === i
            return (
              <div
                key={d.key}
                className="flex-1 flex items-end h-full cursor-pointer"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <div
                  className={`w-full rounded-t transition-colors ${
                    d.total > 0
                      ? isHovered ? 'bg-primary-600' : 'bg-primary-400'
                      : 'bg-zinc-100'
                  }`}
                  style={{ height: barHeight }}
                />
              </div>
            )
          })}
        </div>

        <div className="flex mt-1.5" style={{ gap: barGap }}>
          {data.map(d => (
            <div key={d.key} className="flex-1 text-center">
              {d.axisLabel && <span className="text-[10px] text-zinc-400">{d.axisLabel}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
