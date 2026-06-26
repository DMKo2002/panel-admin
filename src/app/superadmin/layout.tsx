import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const SUPERADMIN_EMAIL = 'dmko2002@gmail.com'

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== SUPERADMIN_EMAIL) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center text-xs font-bold">
            SA
          </div>
          <span className="text-sm font-semibold text-zinc-100">CreArt Superadmin</span>
        </div>
        <a
          href="/dashboard"
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Volver a mi panel
        </a>
      </header>
      <main className="px-8 py-8">{children}</main>
    </div>
  )
}
