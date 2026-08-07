'use client'

// Motor del tutorial guiado del Panel Admin.
//
// Tres modos de uso:
//   - "full"  → recorrido completo, arranca en General y al terminar sus
//               pasos navega solo a la siguiente página (TOUR_PAGES) con un
//               cartel de transición en el medio. Se dispara desde el popup
//               de bienvenida (TutorialWelcomePopup).
//   - "page"  → recorre TODOS los pasos de la página actual, sin saltar a
//               otra. Lo dispara el botón (?) del header ("¿Repetir tutorial?").
//   - "field" → un solo paso, el de un campo puntual. Lo dispara el botón (?)
//               chico al lado de cada feature (TutorialHint).
//
// Cada página registra sus propios pasos al montarse (registerSteps) — así
// agregar el tutorial a una página nueva es autocontenido ahí, sin tocar
// este archivo salvo para sumarla a TOUR_PAGES si va a formar parte del
// recorrido completo.
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { CallBackProps, Step as JoyrideStep } from 'react-joyride'

const Joyride = dynamic(() => import('react-joyride'), { ssr: false })

export interface TutorialStep {
  id: string
  target: string
  title: string
  content: string
}

interface TourPageDef {
  key: string
  href: string
  label: string
}

// Orden del recorrido completo. Para sumar una página nueva al tour "full":
// agregarla acá (en el orden en que se debe mostrar) y hacer que esa página
// llame a registerSteps con sus propios pasos.
const TOUR_PAGES: TourPageDef[] = [
  { key: 'general', href: '/dashboard/general', label: 'General' },
  { key: 'pagos',   href: '/dashboard/pagos',   label: 'Pagos y Finanzas' },
]

type Mode = 'full' | 'page' | 'field' | null

interface TransitionState {
  toLabel: string
  toHref: string
  toKey: string
}

interface TutorialContextValue {
  registerSteps: (pageKey: string, steps: TutorialStep[]) => void
  startFullTour: () => void
  startPageTour: (pageKey: string) => void
  startFieldTour: (pageKey: string, stepId: string) => void
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext)
  if (!ctx) throw new Error('useTutorial() tiene que usarse dentro de <TutorialProvider>')
  return ctx
}

export default function TutorialProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const registryRef = useRef<Record<string, TutorialStep[]>>({})

  const [run, setRun] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [steps, setSteps] = useState<TutorialStep[]>([])
  const [mode, setMode] = useState<Mode>(null)
  const [currentPageKey, setCurrentPageKey] = useState<string | null>(null)
  const [pendingPageKey, setPendingPageKey] = useState<string | null>(null)
  const [transition, setTransition] = useState<TransitionState | null>(null)

  const exitTour = useCallback(() => {
    setRun(false)
    setMode(null)
    setCurrentPageKey(null)
    setPendingPageKey(null)
    setTransition(null)
    setStepIndex(0)
  }, [])

  const registerSteps = useCallback((pageKey: string, pageSteps: TutorialStep[]) => {
    registryRef.current[pageKey] = pageSteps
    setPendingPageKey(prevPending => {
      if (prevPending !== pageKey) return prevPending
      setCurrentPageKey(pageKey)
      setSteps(pageSteps)
      setStepIndex(0)
      setRun(true)
      return null
    })
  }, [])

  const startFullTour = useCallback(() => {
    const first = TOUR_PAGES[0]
    if (!first) return
    setMode('full')
    setTransition(null)
    setCurrentPageKey(first.key)
    const existing = registryRef.current[first.key]
    if (pathname === first.href && existing) {
      setSteps(existing)
      setStepIndex(0)
      setRun(true)
    } else {
      setPendingPageKey(first.key)
      if (pathname !== first.href) router.push(first.href)
    }
  }, [pathname, router])

  const startPageTour = useCallback((pageKey: string) => {
    const s = registryRef.current[pageKey]
    if (!s || s.length === 0) return
    setMode('page')
    setCurrentPageKey(pageKey)
    setSteps(s)
    setStepIndex(0)
    setRun(true)
  }, [])

  const startFieldTour = useCallback((pageKey: string, stepId: string) => {
    const s = (registryRef.current[pageKey] ?? []).filter(x => x.id === stepId)
    if (s.length === 0) return
    setMode('field')
    setCurrentPageKey(pageKey)
    setSteps(s)
    setStepIndex(0)
    setRun(true)
  }, [])

  const continueTransition = useCallback(() => {
    if (!transition) return
    setPendingPageKey(transition.toKey)
    setCurrentPageKey(transition.toKey)
    router.push(transition.toHref)
    setTransition(null)
  }, [transition, router])

  const handleCallback = useCallback((data: CallBackProps) => {
    const { action, index, status, type } = data

    if (status === 'skipped') {
      exitTour()
      return
    }

    if (status === 'finished') {
      if (mode === 'full' && currentPageKey) {
        const idx = TOUR_PAGES.findIndex(p => p.key === currentPageKey)
        const next = TOUR_PAGES[idx + 1]
        setRun(false)
        if (next) {
          setTransition({ toLabel: next.label, toHref: next.href, toKey: next.key })
        } else {
          exitTour()
        }
      } else {
        exitTour()
      }
      return
    }

    if (type === 'step:after') {
      setStepIndex(index + (action === 'prev' ? -1 : 1))
    }
  }, [mode, currentPageKey, exitTour])

  const joyrideSteps: JoyrideStep[] = steps.map(s => ({
    target: s.target,
    title: s.title,
    content: s.content,
    disableBeacon: true,
    placement: 'auto',
  }))

  return (
    <TutorialContext.Provider value={{ registerSteps, startFullTour, startPageTour, startFieldTour }}>
      {children}

      <Joyride
        steps={joyrideSteps}
        run={run}
        stepIndex={stepIndex}
        continuous
        showSkipButton
        showProgress={steps.length > 1}
        disableOverlayClose={false}
        callback={handleCallback}
        locale={{ back: 'Atrás', close: 'Cerrar', last: 'Listo', next: 'Continuar', skip: 'Salir del tutorial' }}
        styles={{
          options: {
            arrowColor: '#fff',
            backgroundColor: '#fff',
            overlayColor: 'rgba(24, 24, 27, 0.65)',
            primaryColor: '#18181b',
            textColor: '#3f3f46',
            zIndex: 10000,
          },
          tooltip: { borderRadius: 14, padding: 20 },
          tooltipTitle: { fontSize: 15, fontWeight: 600, marginBottom: 4, textAlign: 'left' },
          tooltipContent: { fontSize: 13, padding: '4px 0', textAlign: 'left', lineHeight: 1.5 },
          buttonNext: { backgroundColor: '#18181b', borderRadius: 8, fontSize: 13, padding: '8px 14px' },
          buttonBack: { color: '#71717a', fontSize: 13, marginRight: 8 },
          buttonSkip: { color: '#a1a1aa', fontSize: 12 },
        }}
      />

      {transition && (
        <div className="fixed inset-0 z-[10001] bg-black/60 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <p className="text-xs font-medium text-primary-600 uppercase tracking-wide mb-1">Tutorial guiado</p>
            <h2 className="text-lg font-semibold text-zinc-900 mb-2">¡Listo! Ahora vamos a {transition.toLabel}</h2>
            <p className="text-sm text-zinc-500 mb-5">Te muestro para qué sirve cada configuración de esta sección.</p>
            <div className="flex gap-3">
              <button onClick={continueTransition} className="btn-primary flex-1 justify-center">Continuar</button>
              <button onClick={exitTour} className="btn-secondary flex-1 justify-center">Salir del tutorial</button>
            </div>
          </div>
        </div>
      )}
    </TutorialContext.Provider>
  )
}
