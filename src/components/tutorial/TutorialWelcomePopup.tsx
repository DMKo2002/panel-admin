'use client'

// Popup "¿Querés ver el tutorial?" — se muestra una vez por usuario (no por
// tenant, ver migración add_users_tutorial_dismissed) hasta que elige "No
// volver a mostrar". "No, gracias" solo cierra por esta vez — vuelve a
// aparecer la próxima vez que entre. Se monta en dashboard/layout.tsx, así
// que corre en todas las páginas del panel, pero solo pregunta una vez por
// sesión de verdad (el chequeo es contra la base, no local).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTutorial } from './TutorialProvider'

export default function TutorialWelcomePopup() {
  const supabase = createClient()
  const { startFullTour } = useTutorial()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: rows } = await supabase.from('users').select('tutorial_dismissed').eq('id', user.id).limit(1)
      const dismissed = rows?.[0]?.tutorial_dismissed
      if (!dismissed) setVisible(true)
    }
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDontShowAgain() {
    setVisible(false)
    try {
      const res = await fetch('/api/tutorial/dismiss', { method: 'POST' })
      if (!res.ok) console.error('[tutorial] no se pudo guardar "no volver a mostrar"', await res.text())
    } catch (e) {
      console.error('[tutorial] no se pudo guardar "no volver a mostrar"', e)
    }
  }

  function handleNo() {
    setVisible(false)
  }

  function handleYes() {
    setVisible(false)
    startFullTour()
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[10002] bg-black/50 flex items-center justify-center p-6 animate-modal-overlay">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-modal-card">
        <h2 className="text-lg font-semibold text-zinc-900 mb-2">¿Querés ver un tutorial rápido?</h2>
        <p className="text-sm text-zinc-600 mb-6 leading-relaxed">
          Te muestro, paso a paso, para qué sirve cada configuración del panel — empezando por{' '}
          <strong className="text-zinc-800">General</strong> y{' '}
          <strong className="text-zinc-800">Pagos y Finanzas</strong>. Podés salir cuando quieras, y
          después siempre podés repetirlo con el botón{' '}
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-zinc-100 text-zinc-400 text-[10px] font-bold align-middle">?</span>{' '}
          de cada sección.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={handleYes} className="btn-primary justify-center">Sí, mostrame</button>
          <button onClick={handleNo} className="btn-secondary justify-center">No, gracias</button>
          <button onClick={handleDontShowAgain} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors mt-1">
            No volver a mostrar
          </button>
        </div>
      </div>
    </div>
  )
}
