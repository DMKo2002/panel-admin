// El registro self-serve ahora vive en gounuri.com (registro + onboarding de
// template y plan). Esta ruta queda como redirect para links viejos.
import { redirect } from 'next/navigation'

const GOUNURI_URL = process.env.NEXT_PUBLIC_GOUNURI_URL ?? 'https://gounuri.com'

export default function RegistroPage() {
  redirect(`${GOUNURI_URL}/registro`)
}
