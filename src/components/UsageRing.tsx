// Anillo de progreso estilo Supabase — SVG puro, server-renderable.
// pct puede superar 100 (uso excedido): el anillo se muestra completo en rojo.

export default function UsageRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(pct, 100))
  const dash = (clamped / 100) * c

  const color =
    pct >= 100 ? '#ef4444' : // rojo — excedido
    pct >= 80  ? '#f59e0b' : // ámbar — cerca del límite
                 '#18181b'   // negro — normal

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#e4e4e7"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size / 4.5}
        fontWeight="600"
        fill={color}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  )
}
