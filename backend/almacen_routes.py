# =====================================================================
# almacen_routes.py  (backend Flask)
# Endpoints del almacén que consume almacen.service.ts.
#
#   GET  /api/almacen/estado                 inventario y vales de los almacenes del usuario
#   POST /api/almacen/vales                  préstamo (valida stock, cursos, certificación, límite)
#   POST /api/almacen/vales/<folio>/devolucion
#   POST /api/almacen/articulos              alta de artículo / entrada de piezas o cantidad
#   POST /api/almacen/certificaciones        recertificar una pieza
#   GET  /api/almacen/traspasos              historial de traspasos
#   POST /api/almacen/traspasos              mover equipo de un almacén a otro
#
# El almacenista solo ve y mueve SU almacén; admin todos; compras solo consulta.
# El servidor vuelve a validar TODO: la pantalla puede tener datos viejos.
# =====================================================================
import random
from collections import defaultdict
from datetime import date, datetime

from flask import Blueprint, g, jsonify, request

from auth_routes import verificar_sesion
from codigos import SQL_LLAVE, limpiar_codigo, llave_codigo
from comun import (ErrorNegocio, almacenes_permitidos, ejecutar, exigir_almacen, iso, leer_fecha, q,
                   tipo_app, todos_los_almacenes, transaccion, uno)

almacen_bp = Blueprint("almacen", __name__, url_prefix="/api/almacen")

DIAS_AVISO_CERTIFICACION = 30
MAX_FOTOS_POR_RENGLON = 4
MAX_IMAGEN = 1_500_000  # caracteres de una imagen en base64 (~1 MB)


@almacen_bp.before_request
def solo_almacen():
    if request.method == "OPTIONS":
        return None
    return verificar_sesion(("admin", "almacenista", "comprador"))


# =====================================================================
# LECTURA: inventario y vales con la misma forma que usa Angular
# =====================================================================
SQL_CATALOGO = """
    SELECT c.id_catalogo, c.clave, c.nombre, c.tipo, c.tipo_retorno, c.tipo_seguimiento, c.limite_por_vale,
           c.stock_minimo, c.costoso, c.requiere_certificacion, cu.clave AS curso
    FROM catalogo c LEFT JOIN curso cu ON cu.id_curso = c.id_curso_requerido
    WHERE c.activo
"""


def _pieza_json(p):
    return {
        "serie": p.codigo,
        "estado": "no apto" if p.estatus in ("dañado", "en reparación") else "apto",
        "ultimaInspeccion": iso(p.ultima_inspeccion) or "",
        "prestada": p.estatus == "en uso",
        **({"certificacionVence": iso(p.certificacion_vence)} if p.certificacion_vence else {}),
    }


def inventarios_de(ids_almacen):
    """{nombre almacén: [Articulo]} con piezas y existencias."""
    catalogo = {c.id_catalogo: c for c in q(SQL_CATALOGO)}
    nombres = {v: k for k, v in todos_los_almacenes().items()}
    if not ids_almacen:
        return {}
    piezas = defaultdict(list)
    for p in q(
        """SELECT id_almacen, id_catalogo, codigo, estatus, ultima_inspeccion, certificacion_vence
           FROM inventario_almacen_individual WHERE estatus <> 'baja' AND id_almacen IN :ids ORDER BY codigo""",
        ids=ids_almacen,
    ):
        piezas[(p.id_almacen, p.id_catalogo)].append(_pieza_json(p))
    granel = {
        (f.id_almacen, f.id_catalogo): f
        for f in q(
            """SELECT id_almacen, id_catalogo, SUM(cantidad) AS cantidad, SUM(danados) AS danados
               FROM inventario_almacen_conjunto WHERE id_almacen IN :ids GROUP BY id_almacen, id_catalogo""",
            ids=ids_almacen,
        )
    }
    inventarios = {}
    for id_alm in ids_almacen:
        articulos = []
        for id_cat, c in sorted(catalogo.items(), key=lambda x: x[1].clave):
            llave = (id_alm, id_cat)
            if llave not in piezas and llave not in granel:
                continue
            a = {
                "codigo": c.clave,
                "nombre": c.nombre,
                "tipo": tipo_app(c.tipo, c.tipo_retorno),
                "stock": int(granel[llave].cantidad) if llave in granel else 0,
                "limite": c.limite_por_vale,
            }
            if c.tipo_seguimiento == "Individual":
                a["piezas"] = piezas.get(llave, [])
            if llave in granel and granel[llave].danados:
                a["danados"] = int(granel[llave].danados)
            if c.costoso:
                a["costoso"] = True
            if c.curso:
                a["cursoRequerido"] = c.curso
            if c.requiere_certificacion:
                a["requiereCertificacion"] = True
            articulos.append(a)
        inventarios[nombres[id_alm]] = articulos
    return inventarios


def vales_de(ids_almacen=None, folio=None):
    """Vales de entrega con sus renglones, fotos y firma (del más reciente al más antiguo)."""
    filtro = "v.folio = :folio" if folio else "v.id_almacen IN :ids"
    if not folio and not ids_almacen:
        return []
    cabeceras = q(
        f"""SELECT v.id_vale, v.folio, v.fecha, v.fecha_devolucion, v.devuelto_en, v.nombre_trabajador, v.numero_empleado,
                   v.id_trabajador, v.actividad, v.motivo, v.firma, v.autorizo_supervisor, a.nombre_almacen, u.nombre_completo AS almacenista
            FROM vale v JOIN almacen a ON a.id_almacen = v.id_almacen JOIN usuario u ON u.id_usuario = v.id_usuario
            WHERE v.tipo = 'ENTREGA' AND {filtro} ORDER BY v.fecha DESC, v.id_vale DESC""",
        **({"folio": folio} if folio else {"ids": ids_almacen}),
    )
    if not cabeceras:
        return []
    ids_vale = [v.id_vale for v in cabeceras]
    renglones = defaultdict(list)
    for d in q(
        """SELECT d.id_vale_detalle, d.id_vale, d.cantidad, d.condicion_devolucion, d.cantidad_danada, d.notas_devolucion,
                  c.clave, c.nombre, c.tipo, c.tipo_retorno, i.codigo AS serie
           FROM vale_detalle d JOIN catalogo c ON c.id_catalogo = d.id_catalogo
           LEFT JOIN inventario_almacen_individual i ON i.id_invalmind = d.id_invalmind
           WHERE d.id_vale IN :ids ORDER BY d.id_vale_detalle""",
        ids=ids_vale,
    ):
        renglones[d.id_vale].append(d)
    fotos = defaultdict(list)
    for f in q(
        """SELECT f.id_vale_detalle, f.imagen FROM vale_detalle_foto f
           JOIN vale_detalle d ON d.id_vale_detalle = f.id_vale_detalle WHERE d.id_vale IN :ids ORDER BY f.id_vale_detalle_foto""",
        ids=ids_vale,
    ):
        fotos[f.id_vale_detalle].append(f.imagen)

    resultado = []
    for v in cabeceras:
        lineas = []
        for d in renglones[v.id_vale]:
            linea = {"codigo": d.clave, "nombre": d.nombre, "tipo": tipo_app(d.tipo, d.tipo_retorno), "cantidad": d.cantidad}
            if d.serie:
                linea["serie"] = d.serie
            if d.condicion_devolucion:
                linea["recepcion"] = {
                    "condicion": "danado" if d.condicion_devolucion == "dañado" else "bueno",
                    **({"danadas": d.cantidad_danada} if d.cantidad_danada else {}),
                    **({"notas": d.notas_devolucion} if d.notas_devolucion else {}),
                    **({"fotos": fotos[d.id_vale_detalle]} if fotos[d.id_vale_detalle] else {}),
                }
            lineas.append(linea)
        vale = {
            "folio": v.folio,
            "fecha": iso(v.fecha),
            "fechaDevolucion": iso(v.fecha_devolucion) or "",
            "almacen": v.nombre_almacen,
            "almacenista": v.almacenista,
            "empleado": {
                "nombre": v.nombre_trabajador,
                "numeroEmpleado": v.numero_empleado or "",
                "actividad": v.actividad or "",
                "motivo": v.motivo or "",
            },
            "lineas": lineas,
            "firma": v.firma or "",
        }
        if v.autorizo_supervisor:
            vale["autorizoSupervisor"] = v.autorizo_supervisor
        if v.devuelto_en:
            vale["devuelto"] = iso(v.devuelto_en)
        resultado.append(vale)
    return resultado


@almacen_bp.get("/estado")
def estado():
    """GET /api/almacen/estado -> {inventarios, vales} de los almacenes que el usuario puede ver."""
    ids = list(almacenes_permitidos().values())
    return jsonify(inventarios=inventarios_de(ids), vales=vales_de(ids))


# =====================================================================
# PRÉSTAMO
# =====================================================================
def _catalogo_por_clave(clave):
    c = uno(SQL_CATALOGO + f" AND {SQL_LLAVE.format(col='c.clave')} = :llave", llave=llave_codigo(clave))
    if not c:
        raise ErrorNegocio(f"El artículo {clave} no existe.")
    return c


def _cursos_vigentes(id_trabajador):
    return {
        f.clave
        for f in q(
            """SELECT cu.clave FROM trabajador_curso tc JOIN curso cu ON cu.id_curso = tc.id_curso
               WHERE tc.id_trabajador = :t AND tc.vigencia >= CURDATE()""",
            t=id_trabajador,
        )
    }


def _nombre_curso(clave):
    f = uno("SELECT nombre FROM curso WHERE clave = :c", c=clave)
    return f.nombre if f else clave


def _cursos_requeridos(c):
    """El EPP siempre pide la inducción, además del curso propio del artículo."""
    requeridos = ["INDUCCION"] if c.tipo == "EPP" and c.tipo_retorno != "Consumible" else []
    if c.curso and c.curso not in requeridos:
        requeridos.append(c.curso)
    return requeridos


def _buscar_trabajador(empleado):
    """El trabajador de RH del vale: por id (credencial escaneada) o por su número de empleado."""
    id_t = empleado.get("trabajadorId")
    if id_t:
        t = uno("SELECT id_trabajador, nombre_completo, num_empleado, activo FROM trabajadores WHERE id_trabajador = :id", id=id_t)
        if not t:
            raise ErrorNegocio("El trabajador ya no existe en RH.")
        return t
    numero = llave_codigo(empleado.get("numeroEmpleado"))
    if not numero:
        return None
    return uno(
        f"""SELECT id_trabajador, nombre_completo, num_empleado, activo FROM trabajadores
            WHERE {SQL_LLAVE.format(col='num_empleado')} = :n OR {SQL_LLAVE.format(col='numero_tarjeta')} = :n""",
        n=numero,
    )


@almacen_bp.post("/vales")
@transaccion
def crear_vale():
    """POST /api/almacen/vales  {almacen, empleado, fechaDevolucion, lineas[{codigo, serie?, cantidad}], firma, autorizoSupervisor?}"""
    d = request.get_json(silent=True) or {}
    nombre_almacen = d.get("almacen") or ""
    id_alm = exigir_almacen(nombre_almacen, escribir=True)
    empleado = d.get("empleado") or {}
    nombre = str(empleado.get("nombre") or "").strip()[:150]
    if not nombre:
        raise ErrorNegocio("Falta el nombre del trabajador.")
    if not str(d.get("firma") or "").startswith("data:image"):
        raise ErrorNegocio("Falta la firma del trabajador.")
    if len(d["firma"]) > MAX_IMAGEN:
        raise ErrorNegocio("La firma es demasiado grande.")
    lineas = d.get("lineas") or []
    if not lineas:
        raise ErrorNegocio("El vale no tiene artículos.")

    trabajador = _buscar_trabajador(empleado)
    if trabajador and not trabajador.activo:
        raise ErrorNegocio(f"{trabajador.nombre_completo} está dado de baja. No se le puede prestar equipo.")
    cursos = _cursos_vigentes(trabajador.id_trabajador) if trabajador else None

    # ---------- Validar cada renglón (con bloqueo de filas para que dos almacenistas no presten lo mismo) ----------
    hoy = date.today()
    preparados, cantidades, series_vistas, devolutivo = [], defaultdict(int), set(), False
    for linea in lineas:
        c = _catalogo_por_clave(linea.get("codigo"))
        cantidad = int(linea.get("cantidad") or 0)
        if cantidad < 1:
            raise ErrorNegocio(f"Cantidad inválida de {c.nombre}.")
        for clave in _cursos_requeridos(c):
            if cursos is None:
                raise ErrorNegocio(f'{c.nombre} requiere el curso "{_nombre_curso(clave)}": escanea la credencial del trabajador para verificarlo.')
            if clave not in cursos:
                raise ErrorNegocio(f'{c.nombre} requiere el curso "{_nombre_curso(clave)}" vigente, y el trabajador no lo tiene.')
        cantidades[c.id_catalogo] += cantidad
        if cantidades[c.id_catalogo] > c.limite_por_vale and not str(d.get("autorizoSupervisor") or "").strip():
            raise ErrorNegocio(f"{c.nombre}: máximo {c.limite_por_vale} por vale sin autorización de supervisor.")
        if c.tipo_seguimiento == "Individual":
            devolutivo = True
            serie = limpiar_codigo(linea.get("serie"))
            if not serie:
                raise ErrorNegocio(f"{c.nombre}: falta indicar la serie de la pieza.")
            p = uno(
                f"""SELECT id_invalmind, codigo, estatus, certificacion_vence FROM inventario_almacen_individual
                    WHERE id_almacen = :a AND id_catalogo = :c AND {SQL_LLAVE.format(col='codigo')} = :s FOR UPDATE""",
                a=id_alm, c=c.id_catalogo, s=llave_codigo(serie),
            )
            if not p:
                raise ErrorNegocio(f"La serie {serie} no pertenece a {c.nombre} en {nombre_almacen}.")
            if p.codigo in series_vistas:
                raise ErrorNegocio(f"{p.codigo} está dos veces en el vale.")
            series_vistas.add(p.codigo)
            if p.estatus == "en uso":
                raise ErrorNegocio(f"{p.codigo} ya está prestado.")
            if p.estatus != "disponible":
                raise ErrorNegocio(f"{p.codigo} está marcado como NO APTO.")
            if p.certificacion_vence and p.certificacion_vence < hoy:
                raise ErrorNegocio(f"{p.codigo}: su certificación venció el {p.certificacion_vence}. No se puede prestar hasta recertificarla.")
            preparados.append((c, p, 1))
        else:
            if c.tipo_retorno == "Devolutivo":
                devolutivo = True
            hay = uno(
                "SELECT COALESCE(SUM(cantidad), 0) AS n FROM inventario_almacen_conjunto WHERE id_almacen = :a AND id_catalogo = :c FOR UPDATE",
                a=id_alm, c=c.id_catalogo,
            ).n
            if cantidades[c.id_catalogo] > hay:
                raise ErrorNegocio(f"Solo hay {hay} de {c.nombre} en stock.")
            preparados.append((c, None, cantidad))

    fecha_dev = None
    if devolutivo:
        fecha_dev = leer_fecha(d.get("fechaDevolucion"), "Fecha de entrega")
        if fecha_dev < hoy:
            raise ErrorNegocio("La fecha de entrega no puede ser anterior a hoy.")

    # ---------- Guardar ----------
    id_vale = ejecutar(
        """INSERT INTO vale (folio, tipo, id_almacen, id_trabajador, nombre_trabajador, numero_empleado, id_usuario,
               actividad, motivo, fecha_devolucion, firma, autorizo_supervisor)
           VALUES (:folio, 'ENTREGA', :a, :t, :n, :num, :u, :act, :mot, :fd, :firma, :sup)""",
        folio=f"TMP-{random.getrandbits(40)}", a=id_alm, t=trabajador.id_trabajador if trabajador else None, n=nombre,
        num=str(empleado.get("numeroEmpleado") or "").strip()[:30] or None, u=g.usuario.id,
        act=str(empleado.get("actividad") or "")[:150], mot=str(empleado.get("motivo") or "")[:255], fd=fecha_dev,
        firma=d["firma"], sup=str(d.get("autorizoSupervisor") or "").strip()[:100] or None,
    )
    folio = f"V-{id_vale:04d}"
    ejecutar("UPDATE vale SET folio = :f WHERE id_vale = :id", f=folio, id=id_vale)
    for c, p, cantidad in preparados:
        ejecutar(
            "INSERT INTO vale_detalle (id_vale, id_catalogo, id_invalmind, cantidad) VALUES (:v, :c, :p, :n)",
            v=id_vale, c=c.id_catalogo, p=p.id_invalmind if p else None, n=cantidad,
        )
        ejecutar(
            """INSERT INTO movimiento (tipo, id_almacen, id_catalogo, id_invalmind, id_trabajador, id_vale, cantidad, id_usuario)
               VALUES ('ENTREGA', :a, :c, :p, :t, :v, :n, :u)""",
            a=id_alm, c=c.id_catalogo, p=p.id_invalmind if p else None,
            t=trabajador.id_trabajador if trabajador else None, v=id_vale, n=cantidad, u=g.usuario.id,
        )
        if p:
            ejecutar("UPDATE inventario_almacen_individual SET estatus = 'en uso' WHERE id_invalmind = :p", p=p.id_invalmind)
        else:
            _descontar_granel(id_alm, c.id_catalogo, cantidad)
    return jsonify(vales_de(folio=folio)[0]), 201


def _descontar_granel(id_alm, id_cat, cantidad):
    """Resta de las filas de existencias (una por talla) hasta completar la cantidad."""
    for f in q(
        "SELECT id_invalmcon, cantidad FROM inventario_almacen_conjunto WHERE id_almacen = :a AND id_catalogo = :c AND cantidad > 0 ORDER BY cantidad DESC FOR UPDATE",
        a=id_alm, c=id_cat,
    ):
        if cantidad <= 0:
            break
        quita = min(cantidad, f.cantidad)
        ejecutar("UPDATE inventario_almacen_conjunto SET cantidad = cantidad - :n WHERE id_invalmcon = :id", n=quita, id=f.id_invalmcon)
        cantidad -= quita
    if cantidad > 0:
        raise ErrorNegocio("No alcanzan las existencias.")


def _sumar_granel(id_alm, c, cantidad, danados=0):
    fila = uno(
        "SELECT id_invalmcon FROM inventario_almacen_conjunto WHERE id_almacen = :a AND id_catalogo = :c AND talla = '' FOR UPDATE",
        a=id_alm, c=c.id_catalogo,
    )
    if fila:
        ejecutar(
            "UPDATE inventario_almacen_conjunto SET cantidad = cantidad + :n, danados = danados + :d WHERE id_invalmcon = :id",
            n=cantidad, d=danados, id=fila.id_invalmcon,
        )
    else:
        ejecutar(
            "INSERT INTO inventario_almacen_conjunto (id_almacen, id_catalogo, codigo, cantidad, danados) VALUES (:a, :c, :cod, :n, :d)",
            a=id_alm, c=c.id_catalogo, cod=c.clave, n=cantidad, d=danados,
        )


# =====================================================================
# DEVOLUCIÓN
# =====================================================================
@almacen_bp.post("/vales/<folio>/devolucion")
@transaccion
def devolver(folio):
    """POST /api/almacen/vales/<folio>/devolucion  {recepciones: [{condicion, danadas?, notas?, fotos?} | null por renglón]}"""
    v = uno(
        "SELECT v.id_vale, v.id_almacen, v.id_trabajador, v.devuelto_en, a.nombre_almacen FROM vale v JOIN almacen a ON a.id_almacen = v.id_almacen WHERE v.folio = :f AND v.tipo = 'ENTREGA' FOR UPDATE",
        f=folio,
    )
    if not v:
        raise ErrorNegocio("Vale no encontrado.", 404)
    exigir_almacen(v.nombre_almacen, escribir=True)
    if v.devuelto_en:
        raise ErrorNegocio("Ese vale ya se devolvió.", 409)
    recepciones = (request.get_json(silent=True) or {}).get("recepciones") or []
    detalles = q(
        """SELECT d.id_vale_detalle, d.id_catalogo, d.id_invalmind, d.cantidad, c.tipo_retorno, c.clave
           FROM vale_detalle d JOIN catalogo c ON c.id_catalogo = d.id_catalogo WHERE d.id_vale = :v ORDER BY d.id_vale_detalle""",
        v=v.id_vale,
    )
    ahora = datetime.now().replace(microsecond=0)
    for i, d in enumerate(detalles):
        if d.tipo_retorno == "Consumible":
            continue  # los consumibles no regresan
        r = recepciones[i] if i < len(recepciones) and recepciones[i] else {"condicion": "bueno"}
        danado = r.get("condicion") == "danado"
        danadas = d.cantidad if (danado and d.id_invalmind) else min(int(r.get("danadas") or (d.cantidad if danado else 0)), d.cantidad)
        notas = str(r.get("notas") or "").strip()[:500] or None
        ejecutar(
            """UPDATE vale_detalle SET condicion_devolucion = :c, cantidad_danada = :n, notas_devolucion = :notas, devuelto_en = :f
               WHERE id_vale_detalle = :id""",
            c="dañado" if danado else "bueno", n=danadas, notas=notas, f=ahora, id=d.id_vale_detalle,
        )
        for foto in (r.get("fotos") or [])[:MAX_FOTOS_POR_RENGLON]:
            if str(foto).startswith("data:image") and len(foto) <= MAX_IMAGEN:
                ejecutar("INSERT INTO vale_detalle_foto (id_vale_detalle, imagen) VALUES (:d, :img)", d=d.id_vale_detalle, img=foto)
        buenas = d.cantidad - danadas
        for tipo, cantidad in (("DEVOLUCION", buenas), ("DANO", danadas)):
            if cantidad > 0:
                ejecutar(
                    """INSERT INTO movimiento (tipo, id_almacen, id_catalogo, id_invalmind, id_trabajador, id_vale, cantidad, id_usuario, notas, fecha)
                       VALUES (:tipo, :a, :c, :p, :t, :v, :n, :u, :notas, :f)""",
                    tipo=tipo, a=v.id_almacen, c=d.id_catalogo, p=d.id_invalmind, t=v.id_trabajador, v=v.id_vale,
                    n=cantidad, u=g.usuario.id, notas=notas, f=ahora,
                )
        if d.id_invalmind:
            ejecutar("UPDATE inventario_almacen_individual SET estatus = :e WHERE id_invalmind = :p",
                     e="dañado" if danado else "disponible", p=d.id_invalmind)
        else:
            c = _catalogo_por_clave(d.clave)
            _sumar_granel(v.id_almacen, c, buenas, danadas)
    ejecutar("UPDATE vale SET devuelto_en = :f WHERE id_vale = :v", f=ahora, v=v.id_vale)
    return jsonify(vales_de(folio=folio)[0])


# =====================================================================
# ALTA DE ARTÍCULOS (entrada al almacén)
# =====================================================================
TIPOS_BD = {"EPP": "EPP", "Herramienta": "Herramienta", "Consumible": "Herramienta"}


@almacen_bp.post("/articulos")
@transaccion
def agregar_articulo():
    """POST /api/almacen/articulos  {almacen, entrada: {codigo, nombre, tipo, limite, costoso, series, cantidad, cursoRequerido?, requiereCertificacion?, certificacionVence?}}"""
    d = request.get_json(silent=True) or {}
    nombre_almacen = d.get("almacen") or ""
    id_alm = exigir_almacen(nombre_almacen, escribir=True)
    e = d.get("entrada") or {}
    codigo = limpiar_codigo(e.get("codigo"))
    nombre = str(e.get("nombre") or "").strip()[:150]
    tipo = e.get("tipo")
    if tipo not in TIPOS_BD:
        raise ErrorNegocio("Tipo de artículo inválido.")
    consumible = tipo == "Consumible"
    if len(llave_codigo(codigo)) < 2 or len(codigo) > 20:
        raise ErrorNegocio("El código debe tener de 2 a 20 letras o números.")
    if not nombre:
        raise ErrorNegocio("Escribe el nombre del artículo.")
    limite = int(e.get("limite") or 0)
    if limite < 1:
        raise ErrorNegocio("El máximo por vale debe ser 1 o más.")

    existente = uno(SQL_CATALOGO + f" AND {SQL_LLAVE.format(col='c.clave')} = :llave", llave=llave_codigo(codigo))
    if existente and (existente.tipo_retorno == "Consumible") != consumible:
        raise ErrorNegocio(f"{codigo} ya está registrado como {tipo_app(existente.tipo, existente.tipo_retorno)}.")
    con_certificacion = not consumible and (bool(existente.requiere_certificacion) if existente else bool(e.get("requiereCertificacion")))
    vence = None
    if con_certificacion:
        vence = leer_fecha(e.get("certificacionVence"), "Vencimiento de la certificación")
        if vence < date.today():
            raise ErrorNegocio("Indica la fecha en que vence la certificación (hoy o después).")

    series = [limpiar_codigo(s) for s in (e.get("series") or []) if limpiar_codigo(s)]
    cantidad = int(e.get("cantidad") or 0)
    if consumible:
        if cantidad < 1 or cantidad > 100000:
            raise ErrorNegocio("Escribe cuántas unidades entran.")
    else:
        if not series:
            raise ErrorNegocio("La herramienta y el EPP necesitan su número de serie (una por pieza).")
        llaves = [llave_codigo(s) for s in series]
        mala = next((s for s in series if len(llave_codigo(s)) < 2 or len(s) > 30), None)
        if mala:
            raise ErrorNegocio(f"Serie con formato inválido: {mala}.")
        repetida = next((s for i, s in enumerate(series) if llaves.index(llave_codigo(s)) != i), None)
        if repetida:
            raise ErrorNegocio(f"La serie {repetida} está repetida en la lista.")
        ya = uno(
            f"SELECT codigo FROM inventario_almacen_individual WHERE {SQL_LLAVE.format(col='codigo')} IN :llaves LIMIT 1",
            llaves=llaves,
        )
        if ya:
            raise ErrorNegocio(f"La serie {ya.codigo} ya está registrada.")

    if existente:
        c = existente
    else:
        curso = uno("SELECT id_curso FROM curso WHERE clave = :c", c=e.get("cursoRequerido")) if e.get("cursoRequerido") and not consumible else None
        ejecutar(
            """INSERT INTO catalogo (clave, nombre, tipo, tipo_seguimiento, tipo_retorno, limite_por_vale, stock_minimo, costoso,
                   id_curso_requerido, requiere_certificacion)
               VALUES (:clave, :nombre, :tipo, :seg, :ret, :lim, :min, :costoso, :curso, :cert)""",
            clave=codigo, nombre=nombre, tipo=TIPOS_BD[tipo], seg="Granel" if consumible else "Individual",
            ret="Consumible" if consumible else "Devolutivo", lim=limite, min=10 if consumible else 1,
            costoso=bool(e.get("costoso")) and not consumible, curso=curso.id_curso if curso else None, cert=con_certificacion,
        )
        c = _catalogo_por_clave(codigo)

    etiquetas = []
    if consumible:
        _sumar_granel(id_alm, c, cantidad)
        ejecutar(
            "INSERT INTO movimiento (tipo, id_almacen, id_catalogo, cantidad, id_usuario, notas) VALUES ('ENTRADA', :a, :c, :n, :u, 'Alta en almacén')",
            a=id_alm, c=c.id_catalogo, n=cantidad, u=g.usuario.id,
        )
        etiquetas.append({"valor": c.clave, "nombre": c.nombre, "detalle": "Código · consumible", "almacen": nombre_almacen})
    else:
        for serie in series:
            id_p = ejecutar(
                """INSERT INTO inventario_almacen_individual (id_catalogo, id_almacen, codigo, estatus, ultima_inspeccion, certificacion_vence)
                   VALUES (:c, :a, :s, 'disponible', CURDATE(), :v)""",
                c=c.id_catalogo, a=id_alm, s=serie, v=vence,
            )
            ejecutar(
                "INSERT INTO movimiento (tipo, id_almacen, id_catalogo, id_invalmind, cantidad, id_usuario, notas) VALUES ('ENTRADA', :a, :c, :p, 1, :u, 'Alta en almacén')",
                a=id_alm, c=c.id_catalogo, p=id_p, u=g.usuario.id,
            )
            etiquetas.append({"valor": serie, "nombre": c.nombre, "detalle": f"Serie · {c.clave}", "almacen": nombre_almacen})
    return jsonify(etiquetas=etiquetas), 201


# =====================================================================
# CERTIFICACIONES
# =====================================================================
@almacen_bp.post("/certificaciones")
@transaccion
def recertificar():
    """POST /api/almacen/certificaciones  {almacen, serie, vence}"""
    d = request.get_json(silent=True) or {}
    id_alm = exigir_almacen(d.get("almacen") or "", escribir=True)
    vence = leer_fecha(d.get("vence"), "Nueva fecha de vencimiento")
    if vence < date.today():
        raise ErrorNegocio("La nueva fecha de vencimiento debe ser hoy o después.")
    p = uno(
        f"SELECT id_invalmind, codigo FROM inventario_almacen_individual WHERE id_almacen = :a AND {SQL_LLAVE.format(col='codigo')} = :s",
        a=id_alm, s=llave_codigo(d.get("serie")),
    )
    if not p:
        raise ErrorNegocio(f"No encontré la pieza {d.get('serie')}.", 404)
    ejecutar("UPDATE inventario_almacen_individual SET certificacion_vence = :v, ultima_inspeccion = CURDATE() WHERE id_invalmind = :p",
             v=vence, p=p.id_invalmind)
    ejecutar("INSERT INTO inspeccion (id_invalmind, fecha, resultado, id_usuario, notas) VALUES (:p, CURDATE(), 'apto', :u, :n)",
             p=p.id_invalmind, u=g.usuario.id, n=f"Recertificada hasta {vence}")
    return jsonify(ok=True, serie=p.codigo, vence=iso(vence))


# =====================================================================
# TRASPASOS ENTRE ALMACENES
# =====================================================================
@almacen_bp.get("/traspasos")
def traspasos():
    """GET /api/almacen/traspasos -> traspasos donde sale o llega a un almacén del usuario."""
    ids = list(almacenes_permitidos().values())
    if not ids:
        return jsonify([])
    cabeceras = q(
        """SELECT t.id_traspaso, t.folio, t.fecha, t.notas, o.nombre_almacen AS origen, de.nombre_almacen AS destino, u.nombre_completo AS usuario
           FROM traspaso t JOIN almacen o ON o.id_almacen = t.id_almacen_origen JOIN almacen de ON de.id_almacen = t.id_almacen_destino
           JOIN usuario u ON u.id_usuario = t.id_usuario
           WHERE t.id_almacen_origen IN :ids OR t.id_almacen_destino IN :ids ORDER BY t.fecha DESC, t.id_traspaso DESC LIMIT 200""",
        ids=ids,
    )
    lineas = defaultdict(list)
    if cabeceras:
        for m in q(
            """SELECT m.id_traspaso, c.clave, c.nombre, i.codigo AS serie, m.cantidad FROM movimiento m
               JOIN catalogo c ON c.id_catalogo = m.id_catalogo LEFT JOIN inventario_almacen_individual i ON i.id_invalmind = m.id_invalmind
               WHERE m.tipo = 'TRASPASO_SALIDA' AND m.id_traspaso IN :t ORDER BY m.id_movimiento""",
            t=[x.id_traspaso for x in cabeceras],
        ):
            lineas[m.id_traspaso].append({"codigo": m.clave, "nombre": m.nombre, "serie": m.serie, "cantidad": m.cantidad})
    return jsonify([
        {"folio": t.folio, "fecha": iso(t.fecha), "origen": t.origen, "destino": t.destino, "usuario": t.usuario,
         "notas": t.notas or "", "lineas": lineas[t.id_traspaso]}
        for t in cabeceras
    ])


@almacen_bp.post("/traspasos")
@transaccion
def traspasar():
    """POST /api/almacen/traspasos  {origen, destino, lineas: [{codigo, serie?, cantidad}], notas?}"""
    d = request.get_json(silent=True) or {}
    origen, destino = d.get("origen") or "", d.get("destino") or ""
    id_origen = exigir_almacen(origen, escribir=True)
    todos = todos_los_almacenes()
    if destino not in todos:
        raise ErrorNegocio("Elige el almacén de destino.")
    if destino == origen:
        raise ErrorNegocio("El destino debe ser otro almacén.")
    id_destino = todos[destino]
    lineas = d.get("lineas") or []
    if not lineas:
        raise ErrorNegocio("Agrega al menos un artículo.")

    preparados, cantidades, vistas = [], defaultdict(int), set()
    for linea in lineas:
        c = _catalogo_por_clave(linea.get("codigo"))
        if c.tipo_seguimiento == "Individual":
            serie = limpiar_codigo(linea.get("serie"))
            p = uno(
                f"""SELECT id_invalmind, codigo, estatus FROM inventario_almacen_individual
                    WHERE id_almacen = :a AND id_catalogo = :c AND {SQL_LLAVE.format(col='codigo')} = :s FOR UPDATE""",
                a=id_origen, c=c.id_catalogo, s=llave_codigo(serie),
            )
            if not p:
                raise ErrorNegocio(f"La serie {serie} no está en {origen}.")
            if p.codigo in vistas:
                raise ErrorNegocio(f"{p.codigo} está dos veces en el traspaso.")
            vistas.add(p.codigo)
            if p.estatus == "en uso":
                raise ErrorNegocio(f"{p.codigo} está prestado: primero debe devolverse.")
            preparados.append((c, p, 1))
        else:
            cantidad = int(linea.get("cantidad") or 0)
            if cantidad < 1:
                raise ErrorNegocio(f"Cantidad inválida de {c.nombre}.")
            cantidades[c.id_catalogo] += cantidad
            hay = uno("SELECT COALESCE(SUM(cantidad), 0) AS n FROM inventario_almacen_conjunto WHERE id_almacen = :a AND id_catalogo = :c FOR UPDATE",
                      a=id_origen, c=c.id_catalogo).n
            if cantidades[c.id_catalogo] > hay:
                raise ErrorNegocio(f"Solo hay {hay} de {c.nombre} en {origen}.")
            preparados.append((c, None, cantidad))

    id_t = ejecutar(
        "INSERT INTO traspaso (folio, id_almacen_origen, id_almacen_destino, id_usuario, notas) VALUES (:f, :o, :d, :u, :n)",
        f=f"TMP-{random.getrandbits(40)}", o=id_origen, d=id_destino, u=g.usuario.id, n=str(d.get("notas") or "").strip()[:500] or None,
    )
    folio = f"T-{id_t:04d}"
    ejecutar("UPDATE traspaso SET folio = :f WHERE id_traspaso = :id", f=folio, id=id_t)
    for c, p, cantidad in preparados:
        if p:
            ejecutar("UPDATE inventario_almacen_individual SET id_almacen = :d WHERE id_invalmind = :p", d=id_destino, p=p.id_invalmind)
        else:
            _descontar_granel(id_origen, c.id_catalogo, cantidad)
            _sumar_granel(id_destino, c, cantidad)
        for tipo, alm in (("TRASPASO_SALIDA", id_origen), ("TRASPASO_ENTRADA", id_destino)):
            ejecutar(
                """INSERT INTO movimiento (tipo, id_almacen, id_catalogo, id_invalmind, id_traspaso, cantidad, id_usuario, notas)
                   VALUES (:tipo, :a, :c, :p, :t, :n, :u, :notas)""",
                tipo=tipo, a=alm, c=c.id_catalogo, p=p.id_invalmind if p else None, t=id_t, n=cantidad, u=g.usuario.id,
                notas=f"{folio}: {origen} → {destino}",
            )
    return jsonify(ok=True, folio=folio, piezas=sum(x[2] for x in preparados)), 201
