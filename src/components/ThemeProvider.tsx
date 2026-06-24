'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ThemeProvider() {
  useEffect(() => {
    // Apply stored theme immediately
    const stored = localStorage.getItem('pa-theme') ?? 'default'
    const storedAccent = localStorage.getItem('pa-accent') ?? ''
    applyTheme(stored, storedAccent)

    // Then sync from DB (in case tenant changed it on another device)
    async function syncFromDb() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow?.tenant_id) return
      const { data: cfg } = await supabase.from('store_config').select('panel_theme, panel_accent_color').eq('tenant_id', userRow.tenant_id).single()
      if (!cfg) return
      const theme = (cfg as any).panel_theme ?? 'default'
      const accent = (cfg as any).panel_accent_color ?? ''
      localStorage.setItem('pa-theme', theme)
      if (accent) localStorage.setItem('pa-accent', accent)
      applyTheme(theme, accent)
    }
    syncFromDb()
  }, [])

  return null
}

export function applyTheme(theme: string, accent?: string) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  if (accent) {
    // Derive hover color by darkening slightly (simple hex manipulation)
    root.style.setProperty('--pa-accent', accent)
    root.style.setProperty('--pa-accent-hover', darken(accent, 20))
    root.style.setProperty('--pa-accent-ring', accent + '40')
  } else {
    root.style.removeProperty('--pa-accent')
    root.style.removeProperty('--pa-accent-hover')
    root.style.removeProperty('--pa-accent-ring')
  }
}

function darken(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const r = Math.max(0, parseInt(clean.slice(0,2), 16) - amount)
  const g = Math.max(0, parseInt(clean.slice(2,4), 16) - amount)
  const b = Math.max(0, parseInt(clean.slice(4,6), 16) - amount)
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('')
}
