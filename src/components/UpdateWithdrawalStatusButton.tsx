'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, Check } from 'lucide-react'

type Status = 'pendiente' | 'en_proceso' | 'resuelto'

const LABELS: Record<Status, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
}

const STYLES: Record<Status, string> = {
  pendiente: 'bg-amber-50 text-amber-700',
  en_proceso: 'bg-blue-50 text-blue-700',
  resuelto: 'bg-emerald-50 text-emerald-700',
}

interface Props {
  requestId: string
  currentStatus: Status
}

// Update directo contra Supabase (no una API route) -- withdrawal_requests
// ya tiene policy de UPDATE para authenticated escopeada por tenant_id (ver
// migracion_legales_footer.sql), mismo criterio que el resto del Panel
// (ej. dashboard/legal/page.tsx contra store_config).
export default function UpdateWithdrawalStatusButton({ requestId, currentStatus }: Props) {
  const [status, setStatus] = useState<Status>(currentStatus)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSelect(next: Status) {
    if (next === status) { setOpen(false); return }
    setSaving(true)
    setOpen(false)
    const supabase = createClient()
    const { error } = await supabase
      .from('withdrawal_requests')
      .update({
        status: next,
        resolved_at: next === 'resuelto' ? new Date().toISOString() : null,
      })
      .eq('id', requestId)
    setSaving(false)
    if (!error) setStatus(next)
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity disabled:opacity-50 ${STYLES[status]}`}
      >
        {LABELS[status]}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white border border-zinc-200 rounded-lg shadow-lg py-1">
          {(Object.keys(LABELS) as Status[]).map(s => (
            <button
              key={s}
              onClick={() => handleSelect(s)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 text-left"
            >
              {LABELS[s]}
              {s === status && <Check size={12} className="text-zinc-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
