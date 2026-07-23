'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import clsx from 'clsx'

const tabs = [
  { label: 'Resumen', href: '/dashboard/estadisticas' },
  { label: 'Productos', href: '/dashboard/estadisticas/productos' },
]

export default function StatsTabs() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mes = searchParams.get('mes')
  const suffix = mes ? `?mes=${mes}` : ''

  return (
    <div className="flex gap-1 border-b border-zinc-200">
      {tabs.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${suffix}`}
            className={clsx(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              active
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
