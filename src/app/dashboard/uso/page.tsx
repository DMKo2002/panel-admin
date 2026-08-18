// "Plan y uso" se sacó de la vista de cada tenant el 2026-08-18: mientras el
// pilot de Avellaneda se paga por transferencia y se activa a mano (ver
// /api/superadmin/mark-plan-paid), no tiene sentido mostrarle a cada tenant
// un panel de self-serve billing que ya no pueden operar solos. El uso real
// (storage/productos/visitas) ahora se ve consolidado en /superadmin, para
// poder calibrar mejor los límites de cada plan con datos de todos los
// tenants juntos en vez de tienda por tienda.
//
// Se deja como redirect (mismo patrón que /registro) en vez de borrar la
// página, por si algún link viejo (emails del cron, bookmarks) todavía
// apunta acá — y para poder revertir esto fácil el día que se vuelva a
// habilitar el self-serve.
import { redirect } from 'next/navigation'

export default function UsoPage() {
  redirect('/dashboard')
}
