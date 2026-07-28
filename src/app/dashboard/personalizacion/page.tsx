'use client'

// "Personalización" se renombró a "Apariencia" y se separó Contacto/Legal en
// sus propias páginas. Este archivo queda solo como redirect para links/
// bookmarks viejos.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PersonalizacionRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/apariencia')
  }, [router])
  return null
}
