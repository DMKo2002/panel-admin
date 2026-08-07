'use client'

// Puente para páginas que son server components (ej. Cuentas, Plan y uso):
// no pueden usar hooks directamente, así que este componente cliente,
// renderizado como hijo desde el server component, hace el registerSteps
// por ellas. Recibe los pasos ya armados (datos planos, serializables).
import { useEffect } from 'react'
import { useTutorial, type TutorialStep } from './TutorialProvider'

export default function TutorialRegister({ pageKey, steps }: { pageKey: string; steps: TutorialStep[] }) {
  const { registerSteps } = useTutorial()

  useEffect(() => {
    registerSteps(pageKey, steps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
