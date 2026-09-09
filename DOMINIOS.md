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

Para cada tenant, en todo momento debe existir **una sola dirección** que:
1. Resuelva a la app (no dé error de DNS ni de certificado), y
2. Devuelva contenido real (no un redirect).

Todas las demás direcciones asociadas a esa tienda (el fallback
`{slug}.gounuri.com`, cualquier subdominio que el tenant haya conectado antes
de tener dominio propio, dominios de prueba) deben:
- Estar dadas de alta en Vercel como **"Redirect to Another Domain"** (308) →
  hacia la dirección primaria, **no** como "Connect to an Environment", o
- Estar eliminadas del proyecto en Vercel si ya no tienen ningún uso.

## Procedimiento al conectar un dominio propio nuevo

1. El tenant conecta su dominio propio (ej. `mimarca.com`) desde el Panel
   Admin → se agrega en Vercel con "Connect to an Environment" (Production).
2. Confirmar que `mimarca.com` resuelve bien y tiene SSL válido (esperar
   propagación de DNS si hace falta — ver runbook de DNS de septiembre 2026).
3. Ir al proyecto en Vercel → Domains → localizar la dirección anterior que
   el tenant usaba (`{slug}.gounuri.com`, o cualquier `shop.*`/subdominio
   propio que haya configurado antes).
4. Cambiar esa dirección anterior a **"Redirect to Another Domain"**, destino
   `mimarca.com`, tipo **308 (permanente)**. No dejarla como "Connect to an
   Environment" sirviendo el mismo contenido en paralelo.
   - Excepción: el fallback `{slug}.gounuri.com` puede mantenerse SIN
     redirect (sirviendo contenido) solo si el tenant todavía no tiene un
     dominio propio — es la dirección que usa mientras tanto. En cuanto haya
     dominio propio, pasa a redirect.
5. Verificar en el navegador que la dirección anterior ahora redirige (no
   que tira 404 ni que sigue mostrando contenido propio).
6. Si la dirección anterior ya estaba indexada en Google con contenido
   viejo/incorrecto (se puede chequear buscando `site:direccion-anterior`),
   usar Search Console → Eliminar URLs, para acelerar que desaparezca de los
   resultados mientras Google re-rastrea el redirect.

## Checklist rápido (para dejar tildado en cada alta de dominio propio)

- [ ] Dominio propio conectado y resolviendo con SSL válido
- [ ] Dirección anterior puesta en "Redirect to Another Domain" (308) → dominio propio
- [ ] Verificado en navegador que la dirección anterior redirige
- [ ] Si estaba indexada con contenido viejo: URL removida en Search Console
