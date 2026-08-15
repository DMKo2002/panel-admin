// POST /api/account/set-password — crea/cambia la contraseña propia del
// usuario logueado ahora mismo (llamado desde /dashboard/mi-cuenta).
//
// Por qué no se hace con supabase.auth.updateUser({password}) directo
// desde el cliente (como se hizo en la primera versión): confirmado en
// GitHub (supabase/auth#2085 y discusión #37737) que updateUser({password})
// setea la contraseña y el login funciona, pero NO crea la fila
// provider='email' en auth.identities — "ghost password", getUserIdentities()
// sigue mostrando "no vinculado" aunque la contraseña ya sirve para entrar.
// El workaround confirmado por la comunidad es, del lado del servidor con
// la service role key, además de setear la contraseña, hacer un segundo
// updateUserById con el mismo email — eso fuerza a Supabase a (re)crear la
// identidad 'email'. Por eso esto tiene que vivir en un API route (la
// service role key nunca va al browser) en vez de en el cliente.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { password } = await req.json()
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'La contraseña tiene que tener al menos 8 caracteres.' }, { status: 400 })
  }

  const service = createServiceClient()

  const { error: pwError } = await service.auth.admin.updateUserById(user.id, { password })
  if (pwError) {
    return NextResponse.json({ error: pwError.message }, { status: 400 })
  }

  // Workaround de #2085 — sin esto, la identidad 'email' no aparece en
  // getUserIdentities() aunque la contraseña ya funcione para loguearse.
  if (user.email) {
    const { error: identityError } = await service.auth.admin.updateUserById(user.id, { email: user.email })
    if (identityError) {
      console.error('[set-password] no se pudo refrescar la identidad email:', identityError.message)
      // La contraseña ya quedó guardada y funciona — no cortamos acá, solo
      // logueamos. En el peor caso la UI va a seguir mostrando "no vinculado"
      // un rato más, pero el login con contraseña ya sirve.
    }
  }

  return NextResponse.json({ ok: true })
}
