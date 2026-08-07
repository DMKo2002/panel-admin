'use client'

// Signo de pregunta chico al lado de un feature puntual (ej. "Pedido mínimo").
// Al clickear muestra SOLO el paso de tutorial de ESE feature — no el resto
// de la página. Usa el mismo motor (TutorialProvider) que el tour completo,
// así el spotlight/oscurecido se ve igual en todos lados.
import { HelpCircle } from 'lucide-react'
import { useTutorial, type TutorialStep } from './TutorialProvider'

export default function TutorialHint({ pageKey, step }: { pageKey: string; step: TutorialStep }) {
  const { startFieldTour } = useTutorial()
  return (
    <button
      type="button"
      onClick={() => startFieldTour(pageKey, step.id)}
      className="w-5 h-5 rounded-full flex items-center justify-center text-zinc-300 hover:text-primary-600 hover:bg-primary-50 transition-colors flex-shrink-0"
      title="Ver ayuda de esto"
    >
      <HelpCircle size={15} />
    </button>
  )
}
