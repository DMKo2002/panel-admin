// Lista de emails con acceso superadmin
// Configurar en Vercel: SUPERADMIN_EMAILS=dmko2002@gmail.com,arambeck1972@gmail.com
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const list = (process.env.SUPERADMIN_EMAILS ?? 'dmko2002@gmail.com,arambeck1972@gmail.com')
    .split(',')
    .map(e => e.trim().toLowerCase())
  return list.includes(email.toLowerCase())
}
