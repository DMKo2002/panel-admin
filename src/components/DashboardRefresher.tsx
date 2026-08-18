'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DashboardRefresher({ tenantId }: { tenantId: string }) {
  const router = useRouter()

  useEffect(() => {
    // Auto-refresh every 30 seconds — pero solo si la pestaña está visible.
    // Antes corría siempre, incluso en pestañas de fondo: un cliente con
    // varias pestañas del panel abiertas (algo común) suma un pedido cada
    // 30s por cada una, todo el tiempo, aporte innecesario al tráfico total
    // (ver incidente 2026-08-18 — un refresh token roto ya generaba miles
    // de pedidos por su cuenta, esto solo lo empeoraba). Los pedidos nuevos
    // ya se enteran solos vía Realtime más abajo, así que el poll es nada
    // más un respaldo — no hace falta que corra en pestañas que nadie está
    // mirando.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 30_000)

    // Also refresh via Supabase Realtime when a new order arrives
    const supabase = createClient()
    const channel = supabase
      .channel('dash-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        () => { router.refresh() }
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [tenantId, router])

  return null
}
