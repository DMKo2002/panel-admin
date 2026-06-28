import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/superadmin'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user && isSuperAdmin(user.email)) {
    redirect('/superadmin')
  }
  redirect('/dashboard')
}
