'use client'

// Renglón "Instrucciones de uso ?" debajo del subtítulo de cada página de
// configuración (ej. debajo de "Reglas básicas de tu tienda y del panel" en
// General). Reproduce el tutorial COMPLETO de esa página (todos sus features
// en orden) — no navega a otras páginas. Hover: "¿Repetir tutorial?".
import { HelpCircle } from 'lucide-react'
import { useTutorial } from './TutorialProvider'

export default function PageTutorialButton({ pageKey }: { pageKey: string }) {
  const { startPageTour } = useTutorial()
  return (
    <button
      type="button"
      onClick={() => startPageTour(pageKey)}
      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-primary-600 transition-colors mt-1.5"
      title="¿Repetir tutorial?"
    >
      Instrucciones de uso
      <HelpCircle size={13} />
    </button>
  )
}
