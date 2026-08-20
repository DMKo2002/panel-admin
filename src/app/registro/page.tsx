// 2026-08-20: gounuri.com dejó de ofrecer alta self-serve (ver
// creart_avellaneda_pilot_plan en la memoria del proyecto) — el alta de
// cuentas ahora es 100% manual (David/Aram la crean a mano en Supabase).
// Esta ruta ya NO manda a gounuri.com/registro (ese flujo de pago online
// sigue existiendo en el código pero no queremos exponerlo desde acá):
// ahora redirige a la home de gounuri.com, que es la vidriera de templates
// con el botón "Contactanos".
import { redirect } from 'next/navigation'

const GOUNURI_URL = process.env.NEXT_PUBLIC_GOUNURI_URL ?? 'https://gounuri.com'

export default function RegistroPage() {
  redirect(GOUNURI_URL)
}
