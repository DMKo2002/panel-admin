import clsx from 'clsx'

type BadgeVariant = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'zinc'

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variants: Record<BadgeVariant, string> = {
  green:  'bg-emerald-50 text-emerald-700 border border-emerald-100',
  amber:  'bg-amber-50 text-amber-700 border border-amber-100',
  red:    'bg-red-50 text-red-600 border border-red-100',
  blue:   'bg-blue-50 text-blue-700 border border-blue-100',
  violet: 'bg-violet-50 text-violet-700 border border-violet-100',
  zinc:   'bg-zinc-100 text-zinc-600 border border-zinc-200',
}

export default function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}

// Helpers para los estados más frecuentes
export function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending:   { label: 'Pendiente',  variant: 'amber' },
    confirmed: { label: 'Confirmado', variant: 'blue' },
    shipped:   { label: 'Enviado',    variant: 'violet' },
    delivered: { label: 'Entregado',  variant: 'green' },
    cancelled: { label: 'Cancelado',  variant: 'red' },
  }
  const cfg = map[status] ?? { label: status, variant: 'zinc' as BadgeVariant }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending:        { label: 'Pend. pago',         variant: 'amber' },
    paid:           { label: 'Pagado',             variant: 'green' },
    refund_pending: { label: 'Reembolso pendiente', variant: 'red' },
    refunded:       { label: 'Reembolsado',        variant: 'blue' },
    failed:         { label: 'Fallido',            variant: 'red' },
  }
  const cfg = map[status] ?? { label: status, variant: 'zinc' as BadgeVariant }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

export function CustomerTypeBadge({ type }: { type: string }) {
  return type === 'wholesale'
    ? <Badge variant="amber">Mayorista</Badge>
    : <Badge variant="blue">Minorista</Badge>
}
