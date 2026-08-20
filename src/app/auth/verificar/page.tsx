'use client'

// /auth/verificar?token_hash=...&type=signup — página de "un último click"
// para confirmar la cuenta creada en /registro. No confirma solo con cargar
// la página (ver comentario en /api/auth/confirmar) porque algunos clientes
// de mail pre-visitan los links para escanearlos por seguridad y "queman"
// un link de un solo uso antes de que el usuario real llegue a hacer click.

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'

function VerificarInner() {
  const searchParams = useSearchParams()
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const linkValido = !!tokenHash && (type === 'signup' || type === 'magiclink')

  const [estado, setEstado] = useState<'idle' | 'confirmando' | 'error'>('idle')

  async function handleConfirmar() {
    setEstado('confirmando')
    try {
      const res = await fetch('/api/auth/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_hash: tokenHash, type }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.redirectTo) {
        // Navegación completa (no router.push) para que el resto de Panel
        // Admin vea la sesión recién creada desde el arranque.
        window.location.href = data.redirectTo
        return
      }
    } catch {
      // cae al estado de error de abajo
    }
    setEstado('error')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-sm text-center">
        {linkValido ? (
          estado === 'error' ? (
            <>
              <h1 className="text-xl font-semibold text-zinc-900">El link ya no es válido</h1>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Puede haber expirado o ya haber sido usado. Volvé a{' '}
                <a href="/registro" className="text-primary-600 hover:underline font-medium">registrarte</a>{' '}
                para recibir un link nuevo.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-600">
                <ShieldCheck size={22} className="text-white" />
              </div>
              <h1 className="mt-6 text-xl font-semibold text-zinc-900">Confirmá tu cuenta</h1>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Un último click y arrancás tus 7 días de prueba gratis.
              </p>
              <button
                type="button"
                onClick={handleConfirmar}
                disabled={estado === 'confirmando'}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {estado === 'confirmando' ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Confirmando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} /> Confirmar mi cuenta
                  </>
                )}
              </button>
            </>
          )
        ) : (
          <p className="text-sm text-zinc-500">Este link no es válido.</p>
        )}
      </div>
    </div>
  )
}

export default function VerificarPage() {
  return (
    <Suspense fallback={null}>
      <VerificarInner />
    </Suspense>
  )
}
