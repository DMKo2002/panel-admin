#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Depura un CSV de clientes antes de importarlo en Panel Admin (Importar clientes).

  analizar  ENTRADA.csv                  -> detecta bots/spam, duplicados, typos de dominio.
                                            NO modifica nada: escribe ENTRADA_analisis.json y
                                            muestra el informe.
  generar   ENTRADA.csv --aceptar ...    -> aplica SOLO lo que se confirmó y escribe
                                            ENTRADA_depurado.csv (formato del importador) y
                                            ENTRADA_descartados.csv (registro de lo que se sacó).

Acepta: export de usuarios de WordPress/WooCommerce (user_email, billing_*...),
export "Customers" de WooCommerce, o un CSV que ya esté en formato del importador.
Nunca copia contraseñas (user_pass) ni tokens de sesión a la salida, ni los imprime.
El archivo original no se toca.
"""
import argparse, collections, csv, datetime, difflib, io, json, os, re, sys, unicodedata

csv.field_size_limit(10**9)


# ───────────────────────── utilidades ─────────────────────────
def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn')


def norm_text(s):
    return re.sub(r'\s+', ' ', strip_accents(s).lower()).strip()


def smart_title(s):
    """Si viene TODO EN MAYÚSCULAS o todo en minúsculas lo pasa a Nombre Propio; si ya está mixto, no lo toca."""
    s = (s or '').strip()
    if not s:
        return ''
    if s == s.upper() or s == s.lower():
        parts = re.split(r'(\s+|-)', s.lower())
        out = []
        for i, p in enumerate(parts):
            if p in ('caba', 'gba'):
                out.append(p.upper())
            else:
                out.append(p if p in ('de', 'del', 'la', 'las', 'los', 'y', 'e') and i > 0 else p[:1].upper() + p[1:])
        return ''.join(out)
    return s


PROVINCIAS = {
    'C': 'Ciudad Autónoma de Buenos Aires', 'B': 'Buenos Aires', 'K': 'Catamarca', 'H': 'Chaco', 'U': 'Chubut',
    'X': 'Córdoba', 'W': 'Corrientes', 'E': 'Entre Ríos', 'P': 'Formosa', 'Y': 'Jujuy', 'L': 'La Pampa',
    'F': 'La Rioja', 'M': 'Mendoza', 'N': 'Misiones', 'Q': 'Neuquén', 'R': 'Río Negro', 'A': 'Salta',
    'J': 'San Juan', 'D': 'San Luis', 'Z': 'Santa Cruz', 'S': 'Santa Fe', 'G': 'Santiago del Estero',
    'V': 'Tierra del Fuego', 'T': 'Tucumán',
}


def provincia(v):
    """Códigos de WooCommerce (T, C, B...) -> nombre completo, como los guarda el checkout de las tiendas."""
    v = (v or '').strip()
    m = re.fullmatch(r'(?:AR-)?([A-Za-z])', v)
    return PROVINCIAS.get(m.group(1).upper(), v) if m else v


def clean_phone(v):
    v = (v or '').strip()
    digits = re.sub(r'\D', '', v)
    if len(digits) < 6:
        return ''
    return ('+' if v.startswith('+') else '') + digits


def clean_cuit(v):
    d = re.sub(r'\D', '', v or '')
    return d if len(d) == 11 else ''


def parse_dt(v):
    v = (v or '').strip()
    for f in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.datetime.strptime(v[:19] if '%H' in f else v[:10], f)
        except Exception:
            pass
    return None


# ───────────────────────── lectura ─────────────────────────
def read_rows(path):
    raw = open(path, 'rb').read().decode('utf-8-sig', errors='replace')
    return list(csv.DictReader(io.StringIO(raw, newline='')))


def pick(r, *names):
    for n in names:
        for k in r.keys():
            if k and k.strip().lower() == n.lower():
                v = (r[k] or '').strip()
                if v:
                    return v
    return ''


def to_record(r, idx):
    email = pick(r, 'user_email', 'email', 'billing_email', 'e-mail', 'correo').lower()
    nombre = pick(r, 'billing_first_name', 'first_name', 'nombre', 'first name')
    apellido = pick(r, 'billing_last_name', 'last_name', 'apellido', 'last name')
    if not nombre and not apellido:
        full = pick(r, 'name')
        if full and ' ' in full:
            nombre, apellido = full.split(' ', 1)
        else:
            nombre = full
    calle = pick(r, 'billing_address_1', 'direccion_calle', 'address_1')
    calle2 = pick(r, 'billing_address_2') if calle else ''
    if not calle:
        calle, calle2 = pick(r, 'shipping_address_1'), pick(r, 'shipping_address_2')
    rec = {
        'fila': idx, 'email': email,
        'nombre': smart_title(nombre), 'apellido': smart_title(apellido),
        'telefono': clean_phone(pick(r, 'billing_phone', 'telefono', 'phone')),
        'direccion_calle': (calle + (', ' + calle2 if calle2 else '')).strip(),
        'direccion_localidad': smart_title(pick(r, 'billing_city', 'direccion_localidad', 'shipping_city', 'city')),
        'direccion_provincia': provincia(pick(r, 'billing_state', 'direccion_provincia', 'shipping_state', 'region')),
        'direccion_cp': pick(r, 'billing_postcode', 'direccion_cp', 'shipping_postcode', 'postal code'),
        'cuit': clean_cuit(pick(r, 'cuit', 'billing_vat')),
        'empresa': pick(r, 'billing_company', 'empresa', 'shipping_company'),
        'tipo': pick(r, 'tipo') or 'retail',
        'activo': pick(r, 'activo') or '1',
        'alta': parse_dt(pick(r, 'user_registered', 'date registered', 'alta')),
        'pedidos': int(re.sub(r'\D', '', pick(r, '_order_count', 'orders', 'pedidos')) or 0),
        'pagador': pick(r, 'paying_customer') == '1',
    }
    rec['datos'] = sum(1 for k in ('nombre', 'apellido', 'telefono', 'direccion_calle', 'direccion_localidad', 'cuit', 'empresa') if rec[k])
    return rec


# ───────────────────────── detectores ─────────────────────────
EMAIL_RE = re.compile(r'^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+$')
DOMINIOS_OK = ['gmail.com', 'hotmail.com', 'hotmail.com.ar', 'hotmail.es', 'outlook.com', 'outlook.es', 'outlook.com.ar',
               'yahoo.com', 'yahoo.com.ar', 'yahoo.es', 'live.com', 'live.com.ar', 'icloud.com', 'me.com', 'msn.com',
               'protonmail.com', 'speedy.com.ar', 'fibertel.com.ar', 'arnet.com.ar']
DESCARTABLES = {'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com',
                'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com',
                'fakeinbox.com', 'mohmal.com', 'emailondeck.com', 'tempail.com', 'mailnesia.com', 'guerrillamail.net'}
TLD_SOSPECHOSOS = {'top', 'xyz', 'click', 'link', 'work', 'icu', 'buzz', 'cyou', 'sbs', 'cfd', 'rest', 'monster', 'quest',
                   'gq', 'cf', 'ml', 'tk', 'ga', 'bid', 'win', 'loan', 'party', 'review', 'stream', 'download', 'racing'}
DOMINIOS_RUSOS = {'rambler.ru', 'mail.ru', 'yandex.ru', 'bk.ru', 'inbox.ru', 'list.ru', 'yandex.com', 'ya.ru'}
SPAM_RE = re.compile(r'https?://|www\.|\.com\b|casino|viagra|crypto|bitcoin|\bseo\b|loan|porn|\bsex|escort|invest|forex|click here', re.I)


def domain_of(e):
    return e.split('@', 1)[1].lower() if '@' in e else ''


def local_of(e):
    return e.split('@', 1)[0].lower() if '@' in e else ''


def email_key(e):
    """Clave de comparación: sin mayúsculas, sin +tag y (gmail) sin puntos."""
    u, d = local_of(e), domain_of(e)
    if d == 'googlemail.com':
        d = 'gmail.com'
    u = u.split('+')[0]
    if d == 'gmail.com':
        u = u.replace('.', '')
    return u + '@' + d


def sugerir_dominio(d):
    if not d or d in DOMINIOS_OK or d in DESCARTABLES:
        return None
    if d == 'gmail.com.ar':
        return 'gmail.com'
    m = difflib.get_close_matches(d, DOMINIOS_OK, n=1, cutoff=0.86)
    return m[0] if m else None


def local_aleatorio(u):
    s = re.sub(r'[^a-z0-9]', '', u)
    if len(s) < 8:
        return False
    dig = sum(c.isdigit() for c in s) / len(s)
    runs = max((len(m.group(0)) for m in re.finditer(r'[^aeiou0-9]+', s)), default=0)
    return dig > 0.45 or runs >= 6 or (len(s) >= 20 and dig > 0.2)


def puntaje_cuenta(r):
    return r['pedidos'] * 10 + (5 if r['pagador'] else 0) + r['datos'] + (1 if r['alta'] else 0)


def analizar(recs):
    h = {'bots': [], 'duplicados': [], 'typos': [], 'invalidos': []}

    # ráfagas de altas (≥4 en 15 minutos)
    con_alta = sorted([r for r in recs if r['alta']], key=lambda r: r['alta'])
    en_rafaga = set()
    for i, r in enumerate(con_alta):
        ventana = [x for x in con_alta[i:] if (x['alta'] - r['alta']).total_seconds() <= 900]
        if len(ventana) >= 4:
            en_rafaga.update(x['email'] for x in ventana)

    # emails inválidos y typos de dominio
    typo_de = {}
    for r in recs:
        e = r['email']
        if not e:
            continue
        if not EMAIL_RE.match(e):
            h['invalidos'].append({'email': e, 'motivo': 'formato de email inválido', 'accion': 'eliminar'})
            continue
        sug = sugerir_dominio(domain_of(e))
        if sug:
            nuevo = local_of(e) + '@' + sug
            typo_de[e] = nuevo
            h['typos'].append({'email': e, 'sugerido': nuevo, 'motivo': 'dominio "%s" parece un error de "%s"' % (domain_of(e), sug), 'accion': 'corregir'})

    # bots / spam: por puntaje. Quien tiene pedidos o ya pagó queda protegido.
    for r in recs:
        e = r['email']
        if not e or not EMAIL_RE.match(e):
            continue
        d, u = domain_of(e), local_of(e)
        pts, why = 0, []
        if d in DESCARTABLES:
            pts += 4; why.append('dominio de email descartable')
        tld = d.rsplit('.', 1)[-1]
        if tld in TLD_SOSPECHOSOS:
            pts += 3; why.append('dominio .%s típico de spam' % tld)
        if d in DOMINIOS_RUSOS or tld in ('ru', 'su'):
            pts += 3; why.append('dominio ruso (raro para esta tienda)')
        if local_aleatorio(u):
            pts += 1; why.append('usuario con aspecto aleatorio')
        if e in en_rafaga:
            pts += 2; why.append('alta dentro de una ráfaga de registros')
        texto = ' '.join([r['nombre'], r['apellido'], r['empresa'], r['direccion_calle']])
        if SPAM_RE.search(texto):
            pts += 3; why.append('texto de spam en nombre/dirección')
        if r['datos'] == 0 and not r['pedidos'] and not r['pagador']:
            pts += 1; why.append('sin ningún dato ni pedidos')
        if r['pedidos'] or r['pagador']:
            continue
        if pts >= 3:
            h['bots'].append({'email': e, 'confianza': 'alta' if pts >= 4 else 'revisar', 'motivo': '; '.join(why),
                              'alta': str(r['alta'] or ''), 'accion': 'eliminar'})

    # duplicados por email (ignorando mayúsculas, puntos/+ de gmail y typos de dominio)
    grupos = collections.defaultdict(list)
    for r in recs:
        if r['email'] and EMAIL_RE.match(r['email']):
            grupos[email_key(typo_de.get(r['email'], r['email']))].append(r)
    vistos = set()
    for k, g in grupos.items():
        if len(g) < 2:
            continue
        # se conserva la cuenta con más actividad/datos; a igualdad, la que no tiene el typo de dominio
        g = sorted(g, key=lambda r: (-puntaje_cuenta(r), r['email'] in typo_de, r['alta'] or datetime.datetime.max))
        h['duplicados'].append({'confianza': 'alta', 'criterio': 'mismo email (ignorando mayúsculas, puntos/+ de gmail y typos de dominio)',
                                'conservar': g[0]['email'], 'descartar': [x['email'] for x in g[1:]], 'accion': 'fusionar'})
        vistos.update(x['email'] for x in g)

    # mismo teléfono + nombre parecido
    por_tel = collections.defaultdict(list)
    for r in recs:
        if len(r['telefono']) >= 8 and r['email'] not in vistos:
            por_tel[r['telefono'][-8:]].append(r)
    for k, g in por_tel.items():
        if len(g) < 2:
            continue
        nombres = [norm_text(x['nombre'] + ' ' + x['apellido']) for x in g]
        if all((not n) or (not nombres[0]) or difflib.SequenceMatcher(None, nombres[0], n).ratio() >= 0.7 for n in nombres[1:]):
            g = sorted(g, key=lambda r: -puntaje_cuenta(r))
            h['duplicados'].append({'confianza': 'revisar', 'criterio': 'mismo teléfono y nombre parecido',
                                    'conservar': g[0]['email'], 'descartar': [x['email'] for x in g[1:]], 'accion': 'fusionar'})
            vistos.update(x['email'] for x in g)

    # mismo nombre completo + misma localidad
    por_nom = collections.defaultdict(list)
    for r in recs:
        n = norm_text(r['nombre'] + ' ' + r['apellido'])
        if len(n) >= 6 and ' ' in n and r['email'] not in vistos:
            por_nom[(n, norm_text(r['direccion_localidad']))].append(r)
    for k, g in por_nom.items():
        if len(g) < 2:
            continue
        g = sorted(g, key=lambda r: -puntaje_cuenta(r))
        h['duplicados'].append({'confianza': 'revisar', 'criterio': 'mismo nombre completo y localidad',
                                'conservar': g[0]['email'], 'descartar': [x['email'] for x in g[1:]], 'accion': 'fusionar'})

    sin_datos = [r['email'] for r in recs if r['datos'] == 0 and not r['pedidos'] and not r['pagador']]
    return h, sin_datos


# ───────────────────────── comandos ─────────────────────────
def base_path(entrada, salida_dir):
    d = salida_dir or os.path.dirname(os.path.abspath(entrada))
    return os.path.join(d, os.path.splitext(os.path.basename(entrada))[0])


def cargar(entrada):
    rows = read_rows(entrada)
    recs = [to_record(r, i + 2) for i, r in enumerate(rows)]
    return rows, [r for r in recs if r['email'] or r['nombre']]


def cmd_analizar(a):
    rows, recs = cargar(a.entrada)
    h, sin_datos = analizar(recs)
    out = {'entrada': os.path.basename(a.entrada), 'filas': len(rows), 'hallazgos': h, 'sin_datos': len(sin_datos)}
    p = base_path(a.entrada, a.salida_dir) + '_analisis.json'
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    bots_a = [x for x in h['bots'] if x['confianza'] == 'alta']
    bots_r = [x for x in h['bots'] if x['confianza'] == 'revisar']
    dup_a = [x for x in h['duplicados'] if x['confianza'] == 'alta']
    dup_r = [x for x in h['duplicados'] if x['confianza'] == 'revisar']
    print('ANÁLISIS de %s: %d filas' % (out['entrada'], len(rows)))
    print('  bots/spam  alta: %d | a revisar: %d' % (len(bots_a), len(bots_r)))
    print('  duplicados alta: %d grupo(s) | a revisar: %d grupo(s)' % (len(dup_a), len(dup_r)))
    print('  typos de dominio corregibles: %d | emails inválidos: %d' % (len(h['typos']), len(h['invalidos'])))
    print('  cuentas sin ningún dato personal ni pedidos (solo email): %d de %d' % (len(sin_datos), len(recs)))
    for titulo, lst in (('BOTS/SPAM (alta)', bots_a), ('BOTS/SPAM (revisar)', bots_r)):
        if lst:
            print('\n' + titulo)
            for x in lst:
                print('  - %s  [%s]  alta=%s' % (x['email'], x['motivo'], x['alta'][:10]))
    for titulo, lst in (('DUPLICADOS (alta)', dup_a), ('DUPLICADOS (revisar)', dup_r)):
        if lst:
            print('\n' + titulo)
            for x in lst:
                print('  - conservar %s | descartar %s  [%s]' % (x['conservar'], ', '.join(x['descartar']), x['criterio']))
    if h['typos']:
        print('\nTYPOS DE DOMINIO (propuesta de corrección)')
        for x in h['typos']:
            print('  - %s -> %s' % (x['email'], x['sugerido']))
    if h['invalidos']:
        print('\nEMAILS INVÁLIDOS')
        for x in h['invalidos']:
            print('  - ' + x['email'])
    print('\nDetalle completo: ' + p)


def cmd_generar(a):
    rows, recs = cargar(a.entrada)
    h, sin_datos = analizar(recs)
    aceptar = {x.strip() for x in (a.aceptar or '').split(',') if x.strip()}
    permitidos = {'bots_alta', 'bots_revisar', 'duplicados_alta', 'duplicados_revisar', 'typos', 'invalidos'}
    mal = aceptar - permitidos
    if mal:
        sys.exit('--aceptar desconocido: %s. Opciones: %s' % (sorted(mal), sorted(permitidos)))
    mantener = {x.strip().lower() for x in (a.mantener or '').split(',') if x.strip()}
    extra = {x.strip().lower() for x in (a.excluir or '').split(',') if x.strip()}

    eliminar, fusiones = {}, []
    for x in h['bots']:
        if ('bots_' + x['confianza']) in aceptar:
            eliminar[x['email']] = 'bot/spam: ' + x['motivo']
    if 'invalidos' in aceptar:
        for x in h['invalidos']:
            eliminar[x['email']] = 'email inválido'
    for x in h['duplicados']:
        if ('duplicados_' + x['confianza']) in aceptar:
            fusiones.append(x)
    typo_map = {x['email']: x['sugerido'] for x in h['typos']}
    corregir = dict(typo_map) if 'typos' in aceptar else {}
    for e in extra:
        eliminar[e] = 'excluido manualmente'
    for e in mantener:
        eliminar.pop(e, None)

    por_email = {r['email']: r for r in recs}
    campos = ['nombre', 'apellido', 'telefono', 'direccion_calle', 'direccion_localidad', 'direccion_provincia', 'direccion_cp', 'cuit', 'empresa']
    for f in fusiones:
        keep = por_email.get(f['conservar'])
        for d in f['descartar']:
            if d in mantener or d not in por_email or keep is None or d == f['conservar']:
                continue
            for c in campos:      # el registro que se conserva hereda los datos que le falten
                if not keep[c] and por_email[d][c]:
                    keep[c] = por_email[d][c]
            keep['pedidos'] += por_email[d]['pedidos']
            eliminar.setdefault(d, 'duplicado de %s — %s' % (f['conservar'], f['criterio']))
        # si la cuenta que se conserva tiene el typo y la que se descarta es su versión correcta,
        # el email conservado pasa a ser el correcto (aunque no se haya aceptado "typos")
        corr = typo_map.get(f['conservar'])
        if corr and any(email_key(d) == email_key(corr) for d in f['descartar']):
            corregir[f['conservar']] = corr

    descartados, salida = [], []

    def descartar(r, motivo):
        descartados.append({'email': r['email'], 'motivo': motivo, 'alta': str(r['alta'] or ''), 'pedidos': r['pedidos']})

    for r in recs:
        e = r['email']
        if e in eliminar:
            descartar(r, eliminar[e]); continue
        if a.solo_con_datos and r['datos'] == 0 and not r['pedidos'] and not r['pagador']:
            descartar(r, 'cuenta sin datos personales ni pedidos'); continue
        if e in corregir:
            r['email_original'] = e
            r['email'] = corregir[e]
        salida.append(r)

    # último control: nunca dejar emails repetidos en la salida (el importador los duplicaría)
    vistos, final = {}, []
    for r in salida:
        k = email_key(r['email']) if r['email'] else None
        if k and k in vistos:
            descartar(r, 'repetido en la salida (igual a %s)' % vistos[k]); continue
        if k:
            vistos[k] = r['email']
        final.append(r)

    cols = ['nombre', 'apellido', 'telefono', 'direccion_calle', 'direccion_localidad', 'direccion_provincia',
            'direccion_cp', 'cuit', 'empresa', 'email', 'tipo', 'activo']
    b = base_path(a.entrada, a.salida_dir)
    with open(b + '_depurado.csv', 'w', encoding='utf-8', newline='') as f:   # sin BOM: el importador lee la 1ª columna por nombre
        w = csv.writer(f)
        w.writerow(cols)
        for r in final:
            w.writerow([r[c] for c in cols])
    with open(b + '_descartados.csv', 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['email', 'motivo', 'alta', 'pedidos'])
        for d in descartados:
            w.writerow([d['email'], d['motivo'], d['alta'], d['pedidos']])
    print('Filas de entrada: %d | descartadas: %d | emails corregidos: %d | filas en el CSV depurado: %d'
          % (len(recs), len(descartados), sum(1 for r in final if 'email_original' in r), len(final)))
    print('Escribí: ' + b + '_depurado.csv')
    print('Escribí: ' + b + '_descartados.csv')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    p1 = sp.add_parser('analizar')
    p1.add_argument('entrada')
    p1.add_argument('--salida-dir')
    p2 = sp.add_parser('generar')
    p2.add_argument('entrada')
    p2.add_argument('--salida-dir')
    p2.add_argument('--aceptar', help='lista separada por comas: bots_alta,bots_revisar,duplicados_alta,duplicados_revisar,typos,invalidos')
    p2.add_argument('--mantener', help='emails (coma) que NO se deben tocar aunque estén marcados')
    p2.add_argument('--excluir', help='emails (coma) a sacar además de lo detectado')
    p2.add_argument('--solo-con-datos', action='store_true', help='sacar también las cuentas sin datos personales ni pedidos')
    a = ap.parse_args()
    {'analizar': cmd_analizar, 'generar': cmd_generar}[a.cmd](a)
