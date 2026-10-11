# =====================================================================
# datos_prueba.py
# Datos de prueba para la demo. Los usa crear_bd.py --datos / --reiniciar.
# Las fechas son relativas a HOY: así siempre hay préstamos al día y
# vencidos, y certificaciones vigentes, por vencer y vencidas.
#
# Usuarios (CÁMBIENLOS antes de publicar):
#   admin / Admin#2026          rh / Rh#2026          compras / Compras#2026
#   almacen / Almacen#2026 (Central Kepler)
#   almacen.mittal / Almacen#2026 (Colonia de Contratistas)
#   12345678901 / Trabajador#2026 (solicitante: Juan Pérez)
# =====================================================================
from datetime import date, datetime, timedelta

from werkzeug.security import generate_password_hash

ALMACENES = [
    "Colonia de Contratistas (Mittal)",
    "Central Kepler",
    "Área Midrex",
    "Área HYL",
    "Área Laminador",
    "Área Minas",
]
# Proporción de existencias de cada almacén respecto al principal
PROPORCION = [1, 0.7, 0.4, 0.6, 0.3, 0.15]

CURSOS = [
    ("INDUCCION", "Inducción de seguridad"),
    ("BASICO", "Curso básico de seguridad - Externo"),
    ("ALTURAS", "Trabajos en altura"),
    ("CONFINADOS", "Espacios confinados"),
    ("CALIENTE", "Trabajos en caliente (corte y soldadura)"),
    ("LOTO", "Bloqueo y etiquetado (LOTO)"),
    ("IZAJE", "Maniobras e izaje"),
]

# (clave, nombre, tipo, consumible, limite, costoso, curso, certificacion, prefijo serie, piezas o stock, piezas no aptas)
CATALOGO = [
    ("ALT-KEV", "Arnés Kevlar", "EPP", False, 1, True, "ALTURAS", True, "ALT", ["ALT-001", "ALT-002", "ALT-003"], ["ALT-003"]),
    ("ALT-POL", "Arnés Poliéster", "EPP", False, 1, True, "ALTURAS", True, "ALT", ["ALT-024", "ALT-025"], []),
    ("ALT-BAN", "Bandola", "EPP", False, 1, False, "ALTURAS", True, "BAN", ["BAN-010", "BAN-011", "BAN-012"], ["BAN-011"]),
    ("ALT-GAN", "Gancho doble de vida", "EPP", False, 1, False, "ALTURAS", True, "GAN", ["GAN-100", "GAN-101"], []),
    ("HER-MPU", "Minipulidor", "Herramienta", False, 1, True, "CALIENTE", False, "MPU", 3, []),
    ("HER-FLX", "Flexómetro", "Herramienta", False, 1, False, None, False, "FLX", 20, []),
    ("HER-GAS", "Detector de gases", "Equipo", False, 1, True, "CONFINADOS", True, "GAS", 3, []),
    ("EPP-RET", "Retráctil 3 mts", "EPP", False, 1, True, "ALTURAS", True, "RET", 8, []),
    ("HER-MAR", "Marro bola", "Herramienta", False, 1, False, None, False, "MAR", 10, []),
    ("HER-CIN", "Cincel", "Herramienta", False, 2, False, None, False, "CIN", 15, ["CIN-003"]),
    ("HER-EXT", "Extensión eléctrica", "Herramienta", False, 1, False, None, False, "EXT", 9, []),
    ("HER-REF", "Reflector o lámpara", "Herramienta", False, 1, False, None, False, "REF", 7, []),
    # Consumibles: se entregan y no regresan (por cantidad, sin serie)
    ("EPP-CAS", "Casco de seguridad", "EPP", True, 1, False, None, False, None, 40, []),
    ("EPP-LEN", "Lentes de seguridad", "EPP", True, 1, False, None, False, None, 60, []),
    ("EPP-GUA", "Guantes de protección", "EPP", True, 2, False, None, False, None, 120, []),
    ("EPP-PET", "Peto", "EPP", True, 1, False, None, False, None, 25, []),
    ("EPP-POL", "Polainas", "EPP", True, 1, False, None, False, None, 25, []),
    ("HER-D9", 'Discos de corte 9"', "Herramienta", True, 5, False, None, False, None, 80, []),
    ("HER-D45", 'Discos de corte 4 1/2"', "Herramienta", True, 10, False, None, False, None, 120, []),
]
# Días de vigencia de la certificación de cada pieza (por posición): negativo = vencida
PLAZOS_CERTIFICACION = [240, 15, 400, -10, 90, 25, 180, 300]

COMPANIA = "MANTENIMIENTO INDUSTRIAL IMHOTEP S. DE R.L. DE C.V."

# id, nombres, paterno, materno, nss, curp, puesto, área, supervisor, ingreso (días atrás), tallas, activo, baja, cursos [(clave, folio, días de vigencia)]
TRABAJADORES = [
    (1, "Juan", "Pérez", "García", "12345678901", "PEGJ900101HJCRRN01", "Mecánico", "Mantenimiento", "R. Martínez", 30, ("M", "27"), True, None,
     [("INDUCCION", "IND-001", 260), ("BASICO", "130101", 330), ("ALTURAS", "130102", 160), ("CONFINADOS", "130103", 160)]),
    (2, "María Fernanda", "Ruiz", "Lozano", "98765432109", "RULM950312MJCZZR02", "Soldador", "Pailería", "R. Martínez", 70, ("S", "24"), True, None,
     [("INDUCCION", "IND-002", 260), ("BASICO", "130201", 300), ("CALIENTE", "130202", 120)]),
    (3, "Carlos", "Ramírez", "Ortega", "45678912301", "RAOC880720HJCMRR03", "Auxiliar", "Almacén", "J. Torres", 600, ("L", "28"), False, (100, "Término de contrato"),
     [("BASICO", "120301", -260)]),
    (4, "Luis Alberto", "Hernández", "Mora", "23456789012", "HEML980214HJCRRS04", "Estructurista", "Pailería", "J. Torres", 10, ("L", "27"), True, None, []),
    (5, "Ana Sofía", "Torres", "Vega", "34567890123", "TOVA990505MJCRGN05", "Maniobrista", "Mantenimiento", "R. Martínez", 20, ("S", "23"), True, None,
     [("INDUCCION", "IND-005", 260), ("BASICO", "130501", 345), ("ALTURAS", "130502", 345)]),
    (6, "Roberto", "Vega", "Lara", "45678901234", "VELR850909HJCGRB06", "Electricista", "Eléctrico", "J. Torres", 90, ("XL", "29"), True, None,
     [("INDUCCION", "IND-006", 260), ("BASICO", "130601", 280), ("ALTURAS", "130602", -40), ("LOTO", "130603", 280)]),
    (7, "Pedro", "Núñez", "Salas", "56789012345", "NUSP900303HJCXLD07", "Auxiliar", "Almacén", "J. Torres", 220, ("M", "26"), False, (8, "Renuncia voluntaria"),
     [("INDUCCION", "IND-007", 140), ("BASICO", "130701", 140)]),
    (8, "Laura", "Ríos", "Medina", "67890123456", "RIML920618MJCSDR08", "Argonero", "Mantenimiento", "R. Martínez", 140, ("M", "24"), True, None,
     [("INDUCCION", "IND-008", 260), ("BASICO", "130801", 220), ("ALTURAS", "130802", 220), ("CONFINADOS", "130803", 220)]),
]

USUARIOS = [
    ("Administrador", "admin", "Admin#2026", "admin", None, None),
    ("Recursos Humanos", "rh", "Rh#2026", "rh", None, None),
    ("Oscar Salas", "almacen", "Almacen#2026", "almacenista", "Central Kepler", None),
    ("Laura Ríos", "almacen.mittal", "Almacen#2026", "almacenista", "Colonia de Contratistas (Mittal)", None),
    ("Compras", "compras", "Compras#2026", "comprador", None, None),
    ("Juan Pérez García", "12345678901", "Trabajador#2026", "solicitante", None, 1),
]

# Préstamos de ejemplo: (almacén, trabajador id, días atrás, días para devolver, renglones [(clave, serie, cantidad)], devolución)
# devolución: None = sigue prestado; (días atrás, {serie: 'dañado'}) = ya regresó
VALES = [
    ("Colonia de Contratistas (Mittal)", 1, 6, 1, [("ALT-KEV", "ALT-001", 1), ("EPP-RET", "RET-001", 1), ("EPP-GUA", None, 2)], None),
    ("Central Kepler", 8, 9, -2, [("HER-GAS", "GAS-101", 1), ("HER-D45", None, 5)], None),
    ("Área Midrex", 5, 15, -9, [("HER-CIN", "CIN-201", 1), ("HER-CIN", "CIN-202", 1)], (8, {"CIN-201": "dañado"})),
    ("Área HYL", 2, 4, -1, [("HER-EXT", "EXT-301", 1)], None),
    ("Central Kepler", 6, 2, 5, [("HER-FLX", "FLX-101", 1), ("HER-MAR", "MAR-101", 1)], None),
]


def series_de(prefijo, cantidad):
    return [f"{prefijo}-{n:03d}" for n in range(1, cantidad + 1)]


def serie_en_almacen(serie, indice):
    """Las series cambian por almacén para ser únicas: ALT-001 (Mittal) → ALT-101 (Kepler)."""
    base, numero = serie.rsplit("-", 1)
    return f"{base}-{indice * 100 + int(numero):03d}"


def cargar(cur):
    """Inserta todos los datos de prueba con el cursor dado (BD recién creada y vacía)."""
    hoy = date.today()
    ahora = datetime.now().replace(microsecond=0)
    dias = lambda n: hoy + timedelta(days=n)  # noqa: E731

    ids_almacen = {}
    for nombre in ALMACENES:
        cur.execute("INSERT INTO almacen (nombre_almacen) VALUES (%s)", (nombre,))
        ids_almacen[nombre] = cur.lastrowid
    for obra in ["Planta 1 - Paro programado", "Planta 2 - Mantenimiento general", "Taller central"]:
        cur.execute("INSERT INTO obra (nombre) VALUES (%s)", (obra,))

    ids_curso = {}
    for clave, nombre in CURSOS:
        cur.execute("INSERT INTO curso (clave, nombre) VALUES (%s, %s)", (clave, nombre))
        ids_curso[clave] = cur.lastrowid

    # ---------------- Catálogo e inventario ----------------
    ids_catalogo, piezas_ids = {}, {}
    for clave, nombre, tipo, consumible, limite, costoso, curso, cert, prefijo, existencias, no_aptas in CATALOGO:
        cur.execute(
            """INSERT INTO catalogo (clave, nombre, tipo, tipo_seguimiento, tipo_retorno, limite_por_vale,
                   stock_minimo, costoso, id_curso_requerido, requiere_certificacion)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (clave, nombre, tipo, "Granel" if consumible else "Individual", "Consumible" if consumible else "Devolutivo",
             limite, 10 if consumible else 1, costoso, ids_curso.get(curso), cert),
        )
        id_cat = cur.lastrowid
        ids_catalogo[clave] = id_cat
        for i, almacen in enumerate(ALMACENES):
            if consumible:
                cur.execute(
                    "INSERT INTO inventario_almacen_conjunto (id_almacen, id_catalogo, codigo, cantidad) VALUES (%s, %s, %s, %s)",
                    (ids_almacen[almacen], id_cat, clave, round(existencias * PROPORCION[i])),
                )
                continue
            base = existencias if isinstance(existencias, list) else series_de(prefijo, existencias)
            cuantas = max(1, round(len(base) * PROPORCION[i]))
            for posicion, serie in enumerate(base[:cuantas]):
                serie_almacen = serie_en_almacen(serie, i)
                estatus = "dañado" if serie in no_aptas else "disponible"
                vence = dias(PLAZOS_CERTIFICACION[posicion % len(PLAZOS_CERTIFICACION)]) if cert else None
                cur.execute(
                    """INSERT INTO inventario_almacen_individual (id_catalogo, id_almacen, codigo, estatus, ultima_inspeccion, certificacion_vence)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (id_cat, ids_almacen[almacen], serie_almacen, estatus, dias(-10), vence),
                )
                piezas_ids[serie_almacen] = cur.lastrowid

    # ---------------- Trabajadores ----------------
    for (id_t, nombres, paterno, materno, nss, curp, puesto, area, supervisor, ingreso, (ropa, calzado), activo, baja, cursos) in TRABAJADORES:
        vigentes = [c for c in cursos if c[2] >= 0]
        cur.execute(
            """INSERT INTO trabajadores (id_trabajador, num_empleado, numero_tarjeta, nombres, apellido_paterno, apellido_materno,
                   curp, nss, telefono, puesto, area, contrato, supervisor, compania_contratista, administrador, fecha_emision,
                   reglas_oro, fps_nivel0, fecha_ingreso, talla_ropa, talla_calzado, doc_identificacion, doc_comprobante_dom,
                   doc_datos_bancarios, doc_contrato_firmado, doc_alta_imss, induccion_seguridad, activo, fecha_baja, motivo_baja)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                       TRUE, TRUE, TRUE, TRUE, TRUE, %s, %s, %s, %s)""",
            (id_t, f"IMH-{id_t:05d}", f"{10000100 + id_t}", nombres, paterno, materno, curp, nss, f"33{id_t:08d}", puesto, area,
             "LC-2026-001", supervisor, COMPANIA, "Adriana González", dias(-ingreso), bool(cursos), bool(cursos),
             dias(-ingreso), ropa, calzado, any(c[0] == "INDUCCION" for c in vigentes), activo,
             dias(-baja[0]) if baja else None, baja[1] if baja else None),
        )
        for clave, folio, vigencia in cursos:
            cur.execute(
                "INSERT INTO trabajador_curso (id_trabajador, id_curso, folio, vigencia) VALUES (%s, %s, %s, %s)",
                (id_t, ids_curso[clave], folio, dias(vigencia)),
            )

    # ---------------- Usuarios ----------------
    ids_usuario = {}
    for nombre, usuario, password, rol, almacen, trabajador in USUARIOS:
        cur.execute(
            "INSERT INTO usuario (nombre_completo, username, password_hash, rol, id_almacen, id_trabajador) VALUES (%s, %s, %s, %s, %s, %s)",
            (nombre, usuario, generate_password_hash(password), rol, ids_almacen.get(almacen), trabajador),
        )
        ids_usuario[usuario] = cur.lastrowid
    responsable = {"Central Kepler": ids_usuario["almacen"]}

    # ---------------- Préstamos de ejemplo (con su efecto en el inventario) ----------------
    nombres = {t[0]: " ".join(x for x in t[1:4] if x) for t in TRABAJADORES}
    for n, (almacen, id_t, hace, plazo, renglones, devolucion) in enumerate(VALES, start=1):
        id_alm = ids_almacen[almacen]
        id_usuario = responsable.get(almacen, ids_usuario["almacen.mittal"])
        fecha = ahora - timedelta(days=hace)
        regreso = (ahora - timedelta(days=devolucion[0])) if devolucion else None
        cur.execute(
            """INSERT INTO vale (folio, tipo, id_almacen, id_trabajador, nombre_trabajador, numero_empleado, id_usuario,
                   actividad, motivo, fecha, fecha_devolucion, devuelto_en)
               VALUES (%s, 'ENTREGA', %s, %s, %s, %s, %s, 'Mantenimiento general', 'Trabajo programado', %s, %s, %s)""",
            # plazo = días a partir de hoy para devolver (negativo = ya está vencido)
            (f"V-{n:04d}", id_alm, id_t, nombres[id_t], f"IMH-{id_t:05d}", id_usuario, fecha, dias(plazo), regreso),
        )
        id_vale = cur.lastrowid
        for clave, serie, cantidad in renglones:
            id_cat = ids_catalogo[clave]
            id_pieza = piezas_ids.get(serie)
            danado = bool(devolucion and devolucion[1].get(serie) == "dañado")
            consumible = serie is None
            cur.execute(
                """INSERT INTO vale_detalle (id_vale, id_catalogo, id_invalmind, cantidad, condicion_devolucion, devuelto_en)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (id_vale, id_cat, id_pieza, cantidad,
                 None if (consumible or not devolucion) else ("dañado" if danado else "bueno"),
                 None if (consumible or not devolucion) else regreso),
            )
            cur.execute(
                """INSERT INTO movimiento (tipo, id_almacen, id_catalogo, id_invalmind, id_trabajador, id_vale, cantidad, id_usuario, fecha)
                   VALUES ('ENTREGA', %s, %s, %s, %s, %s, %s, %s, %s)""",
                (id_alm, id_cat, id_pieza, id_t, id_vale, cantidad, id_usuario, fecha),
            )
            if consumible:
                cur.execute("UPDATE inventario_almacen_conjunto SET cantidad = cantidad - %s WHERE id_almacen = %s AND id_catalogo = %s",
                            (cantidad, id_alm, id_cat))
            elif devolucion:
                cur.execute(
                    """INSERT INTO movimiento (tipo, id_almacen, id_catalogo, id_invalmind, id_trabajador, id_vale, cantidad, id_usuario, fecha, notas)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    ("DANO" if danado else "DEVOLUCION", id_alm, id_cat, id_pieza, id_t, id_vale, cantidad, id_usuario, regreso,
                     "Regresó con la punta despostillada." if danado else None),
                )
                cur.execute("UPDATE inventario_almacen_individual SET estatus = %s WHERE id_invalmind = %s",
                            ("dañado" if danado else "disponible", id_pieza))
            else:
                cur.execute("UPDATE inventario_almacen_individual SET estatus = 'en uso' WHERE id_invalmind = %s", (id_pieza,))

    # Una solicitud pendiente de María desde su celular
    cur.execute(
        """INSERT INTO solicitud (folio, id_trabajador, id_obra, id_almacen, fecha_devolucion, notas, confirma_induccion)
           VALUES ('VE-2026-0001', 2, 2, %s, %s, 'Trabajo en pailería, nave 3', TRUE)""",
        (ids_almacen["Central Kepler"], dias(5)),
    )
