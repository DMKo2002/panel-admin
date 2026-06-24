'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Función exportada para que tienda/page.tsx pueda llamarla al cambiar tema
export function applyTheme(theme: string) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export default function ThemeProvider() {
  useEffect(() => {
    // Sync theme from DB (localStorage ya fue seteado por el inline script en layout)
    async function syncFromDb() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow?.tenant_id) return
      const { data: cfg } = await supabase
        .from('store_config')
        .select('panel_theme')
        .eq('tenant_id', userRow.tenant_id)
        .single()
      if (!cfg) return
      const theme = (cfg as any).panel_theme ?? 'default'
      localStorage.setItem('pa-theme', theme)
      applyTheme(theme)
    }
    syncFromDb()
  }, [])

  return null
}
