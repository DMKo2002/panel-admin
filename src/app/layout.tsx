import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Panel Admin',
  description: 'Plataforma de gestión para locales de ropa',
}

// Script que corre ANTES de que React hidrate — evita el flash de tema
const themeScript = `
  try {
    var t = localStorage.getItem('pa-theme') || 'default';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch(e) {}
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={dmSans.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-zinc-50 text-zinc-900 antialiased">{children}</body>
    </html>
  )
}
