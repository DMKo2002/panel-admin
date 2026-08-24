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
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { CallBackProps, Step as JoyrideStep } from 'react-joyride'

const Joyride = dynamic(() => import('react-joyride'), { ssr: false })

// ── Por qué el tooltip "saltaba" (y cómo lo arreglamos de raíz) ────────────
// Leyendo el source real de react-joyride: cuando cambia de paso, primero
// MONTA el tooltip contra la posición ACTUAL del target (todavía sin
// scrollear) y recién en el próximo ciclo dispara su propio scroll y
// reposiciona el popper ya abierto — por eso se veía aparecer en un lugar
// y después saltar/deslizarse al correcto (ver globals.css, que solo
// suaviza ESE reposicionamiento, no lo evita).
//
// Acá lo evitamos directamente: desactivamos el scroll propio de Joyride
// (disableScrolling en cada paso, ver joyrideSteps más abajo) y ANTES de
// decirle a Joyride que muestre un paso, scrolleamos nosotros el target al
// centro de la pantalla y esperamos a que el scroll termine. Cuando Joyride
// recién ahí monta el tooltip, el layout ya está asentado y Popper calcula
// bien la posición desde el primer render — nace ya en su lugar, sin
// reposicionarse nunca.
const REVEAL_DELAY_MS = 420 // tiene que alcanzar para que el scroll suave termine antes de revelar

function getTargetElement(selector: string): HTMLElement | null {
  if (typeof document === 'undefined' || !selector) return null
  try {
    return document.querySelector<HTMLElement>(selector)
  } catch {
    return null
  }
}

// Si el target ya está cómodamente a la vista no hace falta scrollear ni
// esperar nada — evita una demora artificial en los pasos que no la
// necesitan (la mayoría, dentro de una misma página). Margen de arriba más
// grande que el de abajo porque casi todas las páginas del panel tienen un
// header sticky (título + "Instrucciones de uso") que tapa los primeros
// ~110px del área de scroll.
function isComfortablyInView(el: HTMLElement, topMargin = 130, bottomMargin = 40): boolean {
  const rect = el.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight
  return rect.top >= topMargin && rect.bottom <= vh - bottomMargin
}

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
  { key: 'general',         href: '/dashboard/general',         label: 'General' },
  { key: 'pagos',            href: '/dashboard/pagos',           label: 'Pagos y Finanzas' },
  { key: 'envios',           href: '/dashboard/envios',          label: 'Envíos' },
  { key: 'catalogo-config',  href: '/dashboard/catalogo-config', label: 'Catálogo' },
  { key: 'contacto',         href: '/dashboard/contacto',        label: 'Contacto y Redes' },
  { key: 'dominio',          href: '/dashboard/dominio',         label: 'Dominio' },
  { key: 'notificaciones',  href: '/dashboard/notificaciones',  label: 'Notificaciones' },
  { key: 'apariencia',      href: '/dashboard/apariencia',      label: 'Apariencia' },
  { key: 'seo',             href: '/dashboard/seo',             label: 'SEO' },
  { key: 'legal',           href: '/dashboard/legal',           label: 'Legal' },
  { key: 'cuentas',         href: '/dashboard/cuentas',         label: 'Cuentas' },
  { key: 'uso',             href: '/dashboard/uso',             label: 'Plan y uso' },
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

  // Timeout pendiente entre "arrancamos el scroll" y "revelamos el paso" —
  // se puede pisar (nuevo paso antes de que termine el anterior) o cancelar
  // (el usuario sale del tour a mitad de camino).
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearRevealTimeout = useCallback(() => {
    if (revealTimeoutRef.current) {
      clearTimeout(revealTimeoutRef.current)
      revealTimeoutRef.current = null
    }
  }, [])

  useEffect(() => clearRevealTimeout, [clearRevealTimeout])

  // Arranca (o reinicia) el tour ya con pageSteps[index] centrado en
  // pantalla ANTES de que Joyride monte el tooltip. Ver el comentario
  // grande más arriba.
  const beginRun = useCallback((pageSteps: TutorialStep[], index = 0) => {
    clearRevealTimeout()
    setSteps(pageSteps)
    setStepIndex(index)
    const target = getTargetElement(pageSteps[index]?.target ?? '')
    if (target && !isComfortablyInView(target)) {
      setRun(false)
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      revealTimeoutRef.current = setTimeout(() => {
        setRun(true)
        revealTimeoutRef.current = null
      }, REVEAL_DELAY_MS)
    } else {
      setRun(true)
    }
  }, [clearRevealTimeout])

  // Avanza/retrocede un paso DENTRO de un tour ya corriendo — mismo
  // criterio: primero centrar el target, recién después mover stepIndex
  // (Joyride remonta el tooltip en cada cambio de índice, así que ese
  // remount ya nace con el layout asentado).
  const goToStep = useCallback((nextIndex: number) => {
    clearRevealTimeout()
    const target = getTargetElement(steps[nextIndex]?.target ?? '')
    if (target && !isComfortablyInView(target)) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      revealTimeoutRef.current = setTimeout(() => {
        setStepIndex(nextIndex)
        revealTimeoutRef.current = null
      }, REVEAL_DELAY_MS)
    } else {
      setStepIndex(nextIndex)
    }
  }, [steps, clearRevealTimeout])

  const exitTour = useCallback(() => {
    clearRevealTimeout()
    setRun(false)
    setMode(null)
    setCurrentPageKey(null)
    setPendingPageKey(null)
    setTransition(null)
    setStepIndex(0)
  }, [clearRevealTimeout])

  const registerSteps = useCallback((pageKey: string, pageSteps: TutorialStep[]) => {
    registryRef.current[pageKey] = pageSteps
    setPendingPageKey(prevPending => {
      if (prevPending !== pageKey) return prevPending
      setCurrentPageKey(pageKey)
      beginRun(pageSteps, 0)
      return null
    })
  }, [beginRun])

  const startFullTour = useCallback(() => {
    const first = TOUR_PAGES[0]
    if (!first) return
    setMode('full')
    setTransition(null)
    setCurrentPageKey(first.key)
    const existing = registryRef.current[first.key]
    if (pathname === first.href && existing) {
      beginRun(existing, 0)
    } else {
      setPendingPageKey(first.key)
      if (pathname !== first.href) router.push(first.href)
    }
  }, [pathname, router, beginRun])

  const startPageTour = useCallback((pageKey: string) => {
    const s = registryRef.current[pageKey]
    if (!s || s.length === 0) return
    setMode('page')
    setCurrentPageKey(pageKey)
    beginRun(s, 0)
  }, [beginRun])

  const startFieldTour = useCallback((pageKey: string, stepId: string) => {
    const s = (registryRef.current[pageKey] ?? []).filter(x => x.id === stepId)
    if (s.length === 0) return
    setMode('field')
    setCurrentPageKey(pageKey)
    beginRun(s, 0)
  }, [beginRun])

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
      goToStep(index + (action === 'prev' ? -1 : 1))
    }
  }, [mode, currentPageKey, exitTour, goToStep])

  const joyrideSteps: JoyrideStep[] = steps.map(s => ({
    target: s.target,
    title: s.title,
    content: s.content,
    disableBeacon: true,
    placement: 'auto',
    // Scroll propio desactivado a propósito: lo hacemos nosotros ANTES de
    // revelar el paso (ver beginRun/goToStep) para que el tooltip nazca ya
    // en su posición final. Si Joyride hiciera también el suyo, además de
    // redundante podría competir con el nuestro.
    disableScrolling: true,
  }))

  return (
    <TutorialContext.Provider value={{ registerSteps, startFullTour, startPageTour, startFieldTour }}>
      {children}

      {/* El scroll-antes-de-revelar vive en beginRun/goToStep (más arriba) y
          en disableScrolling de cada paso (joyrideSteps) — acá no queda
          nada de eso por hacer. globals.css además le da transición suave
          a .__floater/.react-joyride__spotlight como red de seguridad para
          otros reposicionamientos (resize, scroll manual del usuario con
          el tooltip ya abierto), aunque para el caso reportado (aparece en
          un lugar y salta al correcto) el fix real es este pre-scroll. */}
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
        <div className="fixed inset-0 z-[10001] bg-black/60 flex items-center justify-center p-6 animate-modal-overlay">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-modal-card">
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
