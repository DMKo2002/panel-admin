'use client'

// Signo de pregunta en el header de cada página de configuración, al lado
// del nombre (ej. "General"). Reproduce el tutorial COMPLETO de esa página
// (todos sus features en orden) — no navega a otras páginas. Hover: "¿Repetir
// tutorial?".
import { HelpCircle } from 'lucide-react'
import { useTutorial } from './TutorialProvider'

export default function PageTutorialButton({ pageKey }: { pageKey: string }) {
  const { startPageTour } = useTutorial()
  return (
    <button
      type="button"
      onClick={() => startPageTour(pageKey)}
      className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-primary-600 hover:bg-primary-50 transition-colors flex-shrink-0"
      title="¿Repetir tutorial?"
    >
      <HelpCircle size={17} />
    </button>
  )
}
