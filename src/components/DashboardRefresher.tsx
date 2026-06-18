'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DashboardRefresher({ tenantId }: { tenantId: string }) {
  const router = useRouter()

  useEffect(() => {
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => router.refresh(), 30_000)

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
