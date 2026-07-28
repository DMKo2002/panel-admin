'use client'

// "Mi tienda" se reorganizó en varias páginas por dominio (General, Pagos,
// Envíos, Catálogo, Contacto). Este archivo queda solo como redirect para
// links/bookmarks viejos.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TiendaRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/general')
  }, [router])
  return null
}
