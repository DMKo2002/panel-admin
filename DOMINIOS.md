# Regla de dominios: un solo host indexable por tienda

## Por qué existe esta regla

En septiembre 2026 varias tiendas (Mykonos Love, Yenine Sweaters) aparecían mal
en Google: el buscador indexaba una dirección temporal/demo (`shop.mykonoslove.com`,
o una página secundaria como `/contacto`) en vez de la home del dominio real de
la tienda. La causa de fondo: cuando una tienda conecta su dominio propio, la
dirección anterior (subdominio temporal, `{slug}.gounuri.com`, o cualquier otro
alias) seguía funcionando como sitio propio en vez de redirigir al dominio
nuevo. Google terminó indexando ambas direcciones por separado, y a veces
eligió la "equivocada" para mostrar en resultados — perjudicando directamente
las ventas de esa tienda.

El canonical tag que agregamos en `tienda-core` (ver `src/lib/seo.ts`) ayuda,
pero NO alcanza por sí solo: el canonical se autorreferencia al host real de
cada request, así que si dos hosts distintos sirven el mismo contenido, cada
uno "confirma" su propia URL — no le dice a Google cuál de los dos preferir.
La única forma de evitar el problema de raíz es que **solo un host por tienda
esté vivo y respondiendo contenido** en un momento dado.

## La regla

Para cada tenant, en todo momento debe existir **una sola dirección** que
devuelva contenido real (no un redirect, y no el catálogo demo del template
por error de resolución).

Importante — el fallback `{slug}.gounuri.com` es un caso especial que YA
está resuelto por código, no por configuración manual: `src/middleware.ts`
(en tienda-core) redirige automáticamente `{slug}.gounuri.com` →
`tenants.domain` en cuanto `tenants.domain_status = 'verified'` para ese
tenant. Mientras `domain_status` sea `pending` o `none`, el subdominio sigue
sirviendo contenido normalmente (correcto: es la única dirección que le
funciona al tenant todavía). **No hace falta tocar nada en Vercel para
este caso** — alcanza con que el dominio quede `verified` en la tabla
`tenants`.

El middleware SOLO redirige el patrón `*.gounuri.com`. Cualquier OTRO
subdominio o dominio que el tenant haya conectado por su cuenta (ej.
`shop.mimarca.com`, un dominio de prueba, un dominio viejo) no entra en esa
lógica: si sigue registrado en el proyecto de Vercel pero ya no coincide
con `tenants.domain`, el middleware no encuentra tenant y cae al fallback
del template — es decir, **sirve el catálogo DEMO** con ese dominio ajeno
(esto fue exactamente el bug de `shop.mykonoslove.com` mostrando "Demo
Atelier", ver 2026-09-09). Para estos casos SÍ hay que actuar a mano:
- Eliminarlos del proyecto en Vercel si ya no tienen ningún uso, o
- Dejarlos como **"Redirect to Another Domain"** (308) → la dirección
  primaria, si se quiere conservar el tráfico que llegue ahí.

## Procedimiento al conectar un dominio propio nuevo

1. El tenant conecta su dominio propio (ej. `mimarca.com`) desde el Panel
   Admin → se agrega en Vercel con "Connect to an Environment" (Production).
2. Confirmar que `mimarca.com` resuelve bien y tiene SSL válido (esperar
   propagación de DNS si hace falta — ver runbook de DNS de septiembre 2026).
3. Confirmar en la tabla `tenants` que `domain_status` pasó a `verified`
   para ese tenant — a partir de ahí el propio middleware redirige
   `{slug}.gounuri.com` solo, sin que haya que tocar Vercel.
4. Revisar el proyecto en Vercel → Domains por si el tenant tiene, ADEMÁS
   del `{slug}.gounuri.com`, algún otro subdominio/dominio propio que haya
   conectado antes (ej. `shop.*`) — ese SÍ hay que eliminarlo o pasarlo a
   redirect a mano (no lo cubre el middleware).
5. Si esa dirección extra ya estaba indexada en Google con contenido
   viejo/incorrecto (se puede chequear buscando `site:direccion-anterior`),
   usar Search Console → Eliminar URLs, para acelerar que desaparezca de
   los resultados.

## Checklist rápido (para dejar tildado en cada alta de dominio propio)

- [ ] Dominio propio conectado y resolviendo con SSL válido
- [ ] `tenants.domain_status = 'verified'` para ese tenant (el redirect de `{slug}.gounuri.com` es automático desde acá)
- [ ] Revisado si el tenant tiene algún OTRO subdominio propio (no `.gounuri.com`) — eliminado o puesto en redirect a mano
- [ ] Si había contenido viejo indexado en esa dirección extra: URL removida en Search Console

## Chequeo aparte: tenant recién creado sin dominio propio todavía

Confirmar que `{slug}.gounuri.com` esté agregado en el proyecto de Vercel
del template correspondiente — si falta (pasó con Iruda, ver 2026-09-09),
el tenant no tiene ninguna dirección funcionando hasta que se agregue.
