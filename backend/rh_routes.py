# =====================================================================
# rh_routes.py  (backend Flask, MySQL)
# Endpoints de RH que consume rh.service.ts:
#   GET  /api/rh/resumen
#   GET  /api/rh/trabajadores?q=            (también almacén: lector de credenciales)
#   GET  /api/rh/trabajadores/<id>          (también almacén)
#   POST /api/rh/trabajadores               alta rápida
#   PUT  /api/rh/trabajadores/<id>/credencial
#   GET  /api/rh/trabajadores/<id>/adeudos  (también almacén)
#   GET  /api/rh/trabajadores/<id>/kardex
#   GET  /api/rh/trabajadores/<id>/vales
#   POST /api/rh/trabajadores/<id>/vales/adeudos
#   POST /api/rh/bajas                      solo si no debe nada (409 con la lista si debe)
#
# Los adeudos salen de los MISMOS movimientos que registra el almacén:
# lo que se presta en el almacén aparece aquí, y bloquea la baja.
# =====================================================================
import random
import re
from collections import defaultdict
from datetime import date, timedelta

from flask import Blueprint, g, jsonify, request

from auth_routes import verificar_sesion
from codigos import SQL_LLAVE, limpiar_codigo, llave_codigo
from comun import ErrorNegocio, ejecutar, iso, leer_fecha, q, tipo_rh, transaccion, uno

rh_bp = Blueprint("rh", __name__, url_prefix="/api/rh")

PUESTOS = {"Soldador", "Auxiliar", "Argonero", "Mecánico", "Electricista", "Estructurista", "Maniobrista"}
OBLIGATORIOS = ["nombres", "apellidoPaterno", "nss", "puesto", "area", "contrato", "supervisor", "fechaIngreso", "tallaRopa", "tallaCalzado"]
COMPANIA = "MANTENIMIENTO INDUSTRIAL IMHOTEP S. DE R.L. DE C.V."
MAX_FOTO = 2_000_000
# Lo único que el almacén puede consultar de RH: identificar al trabajador por su
# credencial al prestar y ver si debe equipo (solo lectura). Todo lo demás es solo de RH.
RUTAS_ALMACEN = {"rh.buscar_trabajadores", "rh.obtener_trabajador", "rh.adeudos"}


@rh_bp.before_request
def solo_rh():
    if request.method == "OPTIONS":
        return None
    if request.endpoint in RUTAS_ALMACEN and request.method == "GET":
        return verificar_sesion(("rh", "admin", "almacenista"))
    return verificar_sesion(("rh",))


# ---------------------------------------------------------------------
# Trabajador → JSON de Angular
# ---------------------------------------------------------------------
SQL_TRABAJADOR = "SELECT * FROM trabajadores"


def _cursos(ids):
    cursos = defaultdict(list)
    if ids:
        for c in q(
            """SELECT tc.id_trabajador, cu.clave, tc.folio, tc.vigencia FROM trabajador_curso tc
               JOIN curso cu ON cu.id_curso = tc.id_curso WHERE tc.id_trabajador IN :ids ORDER BY tc.vigencia DESC""",
            ids=ids,
        ):
            cursos[c.id_trabajador].append({"clave": c.clave, "folio": c.folio or "", "vigencia": iso(c.vigencia)})
    return cursos


def _json(t, cursos):
    hoy = date.today().isoformat()
    mis_cursos = cursos.get(t.id_trabajador, [])
    return {
        "id": t.id_trabajador,
        "numeroEmpleado": t.num_empleado or "",
        "nombres": t.nombres,
        "apellidoPaterno": t.apellido_paterno,
        "apellidoMaterno": t.apellido_materno or "",
        "curp": t.curp or "",
        "rfc": t.rfc or "",
        "nss": t.nss or "",
        "telefono": t.telefono or "",
        "puesto": t.puesto or "",
        "area": t.area or "",
        "contrato": t.contrato or "",
        "supervisor": t.supervisor or "",
        "fechaIngreso": iso(t.fecha_ingreso) or "",
        "tallaRopa": t.talla_ropa or "",
        "tallaCalzado": t.talla_calzado or "",
        "documentos": {
            "identificacion": bool(t.doc_identificacion),
            "comprobanteDomicilio": bool(t.doc_comprobante_dom),
            "datosBancarios": bool(t.doc_datos_bancarios),
            "contratoFirmado": bool(t.doc_contrato_firmado),
            "altaImss": bool(t.doc_alta_imss),
        },
        # La inducción es un curso: cuenta solo si está vigente
        "induccionSeguridad": any(c["clave"] == "INDUCCION" and c["vigencia"] >= hoy for c in mis_cursos),
        "numeroTarjeta": t.numero_tarjeta or "",
        "compania": t.compania_contratista or COMPANIA,
        "administrador": t.administrador or "",
        "fechaEmision": iso(t.fecha_emision),
        "foto": t.foto,
        "cursos": mis_cursos,
        "reglasOro": bool(t.reglas_oro),
        "fpsNivel0": bool(t.fps_nivel0),
        "activo": bool(t.activo),
        "fechaBaja": iso(t.fecha_baja),
        "motivoBaja": t.motivo_baja,
    }


def _trabajadores(where="", **params):
    filas = q(f"{SQL_TRABAJADOR} {where}", **params)
    cursos = _cursos([t.id_trabajador for t in filas])
    return [_json(t, cursos) for t in filas]


def _trabajador(id_t):
    lista = _trabajadores("WHERE id_trabajador = :id", id=id_t)
    if not lista:
        raise ErrorNegocio("Trabajador no encontrado.", 404)
    return lista[0]


# ---------------------------------------------------------------------
# Adeudos y movimientos (los mismos que registra el almacén)
# ---------------------------------------------------------------------
def _adeudos(id_t):
    filas = q(
        """SELECT c.clave, c.nombre, c.tipo, c.tipo_retorno, i.codigo AS serie, a.pendiente, a.fecha_entrega,
                  al.nombre_almacen, v.folio
           FROM v_adeudos a JOIN catalogo c ON c.id_catalogo = a.id_catalogo JOIN almacen al ON al.id_almacen = a.id_almacen
           LEFT JOIN inventario_almacen_individual i ON i.id_invalmind = a.id_invalmind
           LEFT JOIN vale v ON v.id_vale = a.id_vale
           WHERE a.id_trabajador = :t ORDER BY a.fecha_entrega""",
        t=id_t,
    )
    return [
        {"articuloClave": f.clave, "descripcion": f.nombre, "tipoArticulo": tipo_rh(f.tipo, f.tipo_retorno), "idSerie": f.serie,
         "cantidadPendiente": int(f.pendiente), "fechaEntrega": iso(f.fecha_entrega), "almacen": f.nombre_almacen, "folioVale": f.folio}
        for f in filas
    ]


SQL_MOVIMIENTOS = """
    SELECT m.id_movimiento, m.id_trabajador, m.fecha, m.tipo, c.clave, c.nombre, c.tipo AS tipo_art, c.tipo_retorno,
           i.codigo AS serie, m.cantidad, al.nombre_almacen, v.folio, u.nombre_completo AS responsable, t.nombre_completo AS trabajador
    FROM movimiento m JOIN catalogo c ON c.id_catalogo = m.id_catalogo JOIN almacen al ON al.id_almacen = m.id_almacen
    JOIN usuario u ON u.id_usuario = m.id_usuario
    LEFT JOIN inventario_almacen_individual i ON i.id_invalmind = m.id_invalmind
    LEFT JOIN vale v ON v.id_vale = m.id_vale
    LEFT JOIN trabajadores t ON t.id_trabajador = m.id_trabajador
    WHERE m.tipo IN ('ENTREGA', 'DEVOLUCION', 'REPOSICION', 'DANO', 'PERDIDA') AND m.id_trabajador IS NOT NULL
"""


def _movimiento_json(m):
    return {"id": m.id_movimiento, "fecha": iso(m.fecha), "tipo": m.tipo, "articuloClave": m.clave, "descripcion": m.nombre,
            "tipoArticulo": tipo_rh(m.tipo_art, m.tipo_retorno), "idSerie": m.serie, "cantidad": m.cantidad,
            "almacen": m.nombre_almacen, "folioVale": m.folio, "responsable": m.responsable}


# =====================================================================
# TABLERO
# =====================================================================
@rh_bp.get("/resumen")
def resumen():
    hoy = date.today()
    hace30 = hoy - timedelta(days=30)
    todos = _trabajadores("ORDER BY id_trabajador")
    activos = [t for t in todos if t["activo"]]
    por_id = {t["id"]: t for t in todos}

    con_adeudos = []
    for f in q("SELECT id_trabajador, SUM(pendiente) AS piezas, MIN(fecha_entrega) AS desde FROM v_adeudos GROUP BY id_trabajador"):
        if f.id_trabajador in por_id:
            con_adeudos.append({"trabajador": por_id[f.id_trabajador], "articulos": int(f.piezas),
                                "diasMayor": (hoy - f.desde.date()).days})
    con_adeudos.sort(key=lambda x: -x["diasMayor"])

    # Ya no se capturan papeles en el alta: lo pendiente es la inducción
    pendientes = [{"trabajador": t, "faltan": ["Inducción de seguridad"]} for t in activos if not t["induccionSeguridad"]]

    areas = defaultdict(int)
    for t in activos:
        areas[t["area"] or "Sin área"] += 1

    movimientos = [
        {**_movimiento_json(m), "trabajadorId": m.id_trabajador, "trabajador": m.trabajador}
        for m in q(SQL_MOVIMIENTOS + " ORDER BY m.fecha DESC, m.id_movimiento DESC LIMIT 8")
    ]
    recientes = sorted(
        [{"trabajador": t, "tipo": "alta", "fecha": t["fechaIngreso"], "detalle": t["puesto"]} for t in todos if t["fechaIngreso"]]
        + [{"trabajador": t, "tipo": "baja", "fecha": t["fechaBaja"], "detalle": t["motivoBaja"] or ""} for t in todos if t["fechaBaja"]],
        key=lambda x: x["fecha"], reverse=True,
    )[:6]
    return jsonify(
        activos=len(activos), inactivos=len(todos) - len(activos),
        altasMes=sum(1 for t in todos if t["fechaIngreso"] and t["fechaIngreso"] >= hace30.isoformat()),
        bajasMes=sum(1 for t in todos if t["fechaBaja"] and t["fechaBaja"] >= hace30.isoformat()),
        conAdeudos=con_adeudos, pendientes=pendientes,
        porArea=[{"area": a, "total": n} for a, n in sorted(areas.items(), key=lambda x: -x[1])],
        movimientos=movimientos, recientes=recientes,
    )


# =====================================================================
# TRABAJADORES
# =====================================================================
@rh_bp.get("/trabajadores")
def buscar_trabajadores():
    """Por nombre, número de empleado, N° de tarjeta, NSS o CURP (activos y dados de baja)."""
    termino = (request.args.get("q") or "").strip()
    if len(termino) < 1:
        return jsonify([])
    llave = llave_codigo(termino)
    condiciones = ["nombre_completo LIKE :texto", "nss LIKE :texto"]
    if llave:
        condiciones += [f"{SQL_LLAVE.format(col=c)} LIKE :llave" for c in ("num_empleado", "numero_tarjeta", "curp", "nss")]
    return jsonify(_trabajadores(
        f"WHERE {' OR '.join(condiciones)} ORDER BY activo DESC, nombre_completo LIMIT 20",
        texto=f"%{termino}%", llave=f"%{llave}%",
    ))


@rh_bp.get("/trabajadores/<int:id_t>")
@transaccion
def obtener_trabajador(id_t):
    return jsonify(_trabajador(id_t))


def _tarjeta_libre(tarjeta, excepto=None):
    otro = uno(
        f"SELECT id_trabajador FROM trabajadores WHERE {SQL_LLAVE.format(col='numero_tarjeta')} = :t AND id_trabajador <> :id",
        t=llave_codigo(tarjeta), id=excepto or 0,
    )
    if otro:
        raise ErrorNegocio("Ese número de tarjeta ya pertenece a otro trabajador.", 409)


def _guardar_cursos(id_t, cursos):
    claves = {c.clave: c.id_curso for c in q("SELECT id_curso, clave FROM curso")}
    ejecutar("DELETE FROM trabajador_curso WHERE id_trabajador = :t", t=id_t)
    vistos = set()
    for c in cursos or []:
        if c.get("clave") not in claves or c["clave"] in vistos:
            continue
        vistos.add(c["clave"])
        ejecutar(
            "INSERT INTO trabajador_curso (id_trabajador, id_curso, folio, vigencia) VALUES (:t, :c, :f, :v)",
            t=id_t, c=claves[c["clave"]], f=str(c.get("folio") or "")[:30] or None, v=leer_fecha(c.get("vigencia"), "Vigencia del curso"),
        )


def _foto(valor):
    if not valor:
        return None
    if not str(valor).startswith("data:image") or len(valor) > MAX_FOTO:
        raise ErrorNegocio("La foto no es válida o es demasiado grande.")
    return valor


@rh_bp.post("/trabajadores")
@transaccion
def crear_trabajador():
    """Alta rápida. El número de empleado lo genera el servidor (IMH-00001)."""
    d = request.get_json(silent=True) or {}
    faltan = [c for c in OBLIGATORIOS if not str(d.get(c, "")).strip()]
    if faltan:
        raise ErrorNegocio(f"Faltan campos: {', '.join(faltan)}.")
    if d["puesto"] not in PUESTOS:
        raise ErrorNegocio("Puesto no válido.")
    nss = str(d["nss"]).strip()
    if not re.fullmatch(r"\d{11}", nss):
        raise ErrorNegocio("El NSS debe tener 11 dígitos.")
    if uno("SELECT 1 AS x FROM trabajadores WHERE nss = :n", n=nss):
        raise ErrorNegocio("Ya existe un trabajador registrado con ese NSS.", 409)
    tarjeta = limpiar_codigo(d.get("numeroTarjeta"))
    if tarjeta:
        _tarjeta_libre(tarjeta)
    else:
        while True:  # 8 dígitos que no use nadie
            tarjeta = str(random.randint(10_000_000, 99_999_999))
            if not uno("SELECT 1 AS x FROM trabajadores WHERE numero_tarjeta = :t", t=tarjeta):
                break
    id_t = ejecutar(
        """INSERT INTO trabajadores (nombres, apellido_paterno, apellido_materno, nss, telefono, puesto, area, contrato, supervisor,
               fecha_ingreso, talla_ropa, talla_calzado, numero_tarjeta, compania_contratista, administrador, fecha_emision, foto,
               reglas_oro, fps_nivel0)
           VALUES (:nom, :ap, :am, :nss, :tel, :puesto, :area, :contrato, :sup, :ingreso, :ropa, :calzado, :tarjeta, :comp,
                   :admin, :emision, :foto, :reglas, :fps)""",
        nom=d["nombres"].strip()[:60], ap=d["apellidoPaterno"].strip()[:40], am=(d.get("apellidoMaterno") or "").strip()[:40] or None,
        nss=nss, tel=(d.get("telefono") or "").strip()[:20] or None, puesto=d["puesto"], area=d["area"][:60],
        contrato=d["contrato"][:30], sup=d["supervisor"][:100], ingreso=leer_fecha(d["fechaIngreso"], "Fecha de ingreso"),
        ropa=d["tallaRopa"][:5], calzado=d["tallaCalzado"][:5], tarjeta=tarjeta, comp=COMPANIA,
        admin=(d.get("administrador") or "").strip()[:100] or None,
        emision=leer_fecha(d["fechaEmision"], "Fecha de emisión") if d.get("fechaEmision") else date.today(),
        foto=_foto(d.get("foto")), reglas=bool(d.get("reglasOro")), fps=bool(d.get("fpsNivel0")),
    )
    ejecutar("UPDATE trabajadores SET num_empleado = :n WHERE id_trabajador = :id", n=f"IMH-{id_t:05d}", id=id_t)
    _guardar_cursos(id_t, d.get("cursos"))
    return jsonify(_trabajador(id_t)), 201


@rh_bp.put("/trabajadores/<int:id_t>/credencial")
@transaccion
def actualizar_credencial(id_t):
    d = request.get_json(silent=True) or {}
    _trabajador(id_t)  # 404 si no existe
    tarjeta = limpiar_codigo(d.get("numeroTarjeta"))
    if not tarjeta:
        raise ErrorNegocio("El número de tarjeta es obligatorio.")
    _tarjeta_libre(tarjeta, excepto=id_t)
    ejecutar(
        """UPDATE trabajadores SET numero_tarjeta = :t, administrador = :a, fecha_emision = :e, foto = :f, reglas_oro = :r, fps_nivel0 = :p
           WHERE id_trabajador = :id""",
        t=tarjeta, a=(d.get("administrador") or "").strip()[:100] or None,
        e=leer_fecha(d["fechaEmision"], "Fecha de emisión") if d.get("fechaEmision") else None,
        f=_foto(d.get("foto")), r=bool(d.get("reglasOro")), p=bool(d.get("fpsNivel0")), id=id_t,
    )
    _guardar_cursos(id_t, d.get("cursos"))
    return jsonify(_trabajador(id_t))


# =====================================================================
# ADEUDOS, KARDEX Y VALES
# =====================================================================
@rh_bp.get("/trabajadores/<int:id_t>/adeudos")
def adeudos(id_t):
    return jsonify(_adeudos(id_t))


@rh_bp.get("/trabajadores/<int:id_t>/kardex")
def kardex(id_t):
    return jsonify([_movimiento_json(m) for m in q(SQL_MOVIMIENTOS + " AND m.id_trabajador = :t ORDER BY m.fecha DESC, m.id_movimiento DESC", t=id_t)])


@rh_bp.get("/trabajadores/<int:id_t>/vales")
@transaccion
def vales(id_t):
    trabajador = _trabajador(id_t)
    cabeceras = q(
        """SELECT v.id_vale, v.folio, v.tipo, v.fecha, v.observaciones, v.devuelto_en, u.nombre_completo AS responsable
           FROM vale v JOIN usuario u ON u.id_usuario = v.id_usuario WHERE v.id_trabajador = :t ORDER BY v.fecha DESC""",
        t=id_t,
    )
    renglones = defaultdict(list)
    if cabeceras:
        for d in q(
            """SELECT d.id_vale, d.cantidad, d.estado, d.condicion_devolucion, c.nombre, c.tipo, c.tipo_retorno, i.codigo AS serie
               FROM vale_detalle d JOIN catalogo c ON c.id_catalogo = d.id_catalogo
               LEFT JOIN inventario_almacen_individual i ON i.id_invalmind = d.id_invalmind
               WHERE d.id_vale IN :ids ORDER BY d.id_vale_detalle""",
            ids=[v.id_vale for v in cabeceras],
        ):
            if d.estado:
                estado = d.estado
            elif d.tipo_retorno == "Consumible":
                estado = "Entregado (consumible)"
            elif d.condicion_devolucion == "dañado":
                estado = "Devuelto con daño"
            elif d.condicion_devolucion == "bueno":
                estado = "Devuelto en buen estado"
            else:
                estado = "Pendiente de devolución"
            renglones[d.id_vale].append({"descripcion": d.nombre, "tipoArticulo": tipo_rh(d.tipo, d.tipo_retorno),
                                         "idSerie": d.serie, "cantidad": d.cantidad, "estado": estado})
    return jsonify([
        {"folio": v.folio, "tipo": v.tipo, "fecha": iso(v.fecha), "trabajador": trabajador, "responsable": v.responsable,
         "observaciones": v.observaciones or "", "renglones": renglones[v.id_vale]}
        for v in cabeceras
    ])


@rh_bp.post("/trabajadores/<int:id_t>/vales/adeudos")
@transaccion
def vale_adeudos(id_t):
    """Guarda un vale con lo que el trabajador debe HOY (para firmarlo o anexarlo a la baja)."""
    trabajador = _trabajador(id_t)
    pendientes = q("SELECT id_catalogo, id_invalmind, pendiente FROM v_adeudos WHERE id_trabajador = :t", t=id_t)
    if not pendientes:
        raise ErrorNegocio("El trabajador no tiene adeudos.", 409)
    nombre = " ".join(x for x in (trabajador["nombres"], trabajador["apellidoPaterno"], trabajador["apellidoMaterno"]) if x)
    id_vale = ejecutar(
        """INSERT INTO vale (folio, tipo, id_trabajador, nombre_trabajador, numero_empleado, id_usuario, observaciones)
           VALUES (:f, 'ADEUDOS', :t, :n, :num, :u, 'Artículos pendientes de devolución al almacén.')""",
        f=f"TMP-{random.getrandbits(40)}", t=id_t, n=nombre, num=trabajador["numeroEmpleado"], u=g.usuario.id,
    )
    ejecutar("UPDATE vale SET folio = :f WHERE id_vale = :id", f=f"ADE-{id_vale:04d}", id=id_vale)
    for p in pendientes:
        ejecutar(
            "INSERT INTO vale_detalle (id_vale, id_catalogo, id_invalmind, cantidad, estado) VALUES (:v, :c, :p, :n, 'Pendiente de devolución')",
            v=id_vale, c=p.id_catalogo, p=p.id_invalmind, n=int(p.pendiente),
        )
    return jsonify(next(v for v in vales(id_t).get_json() if v["folio"] == f"ADE-{id_vale:04d}")), 201


# =====================================================================
# BAJA
# =====================================================================
@rh_bp.post("/bajas")
@transaccion
def dar_de_baja():
    d = request.get_json(silent=True) or {}
    id_t = int(d.get("trabajadorId") or 0)
    trabajador = _trabajador(id_t)
    if not trabajador["activo"]:
        raise ErrorNegocio("El trabajador ya está dado de baja.", 409)
    motivo = str(d.get("motivo") or "").strip()[:60]
    if not motivo:
        raise ErrorNegocio("Indica el motivo de la baja.")
    pendientes = _adeudos(id_t)
    if pendientes:
        # El almacén le prestó equipo que no ha regresado: no se puede dar de baja
        raise ErrorNegocio("El trabajador tiene adeudos pendientes.", 409, adeudos=pendientes)
    ejecutar(
        "UPDATE trabajadores SET activo = FALSE, fecha_baja = :f, motivo_baja = :m, comentarios_baja = :c WHERE id_trabajador = :id",
        f=leer_fecha(d.get("fechaBaja"), "Fecha de baja"), m=motivo, c=str(d.get("comentarios") or "").strip()[:500] or None, id=id_t,
    )
    return jsonify(ok=True, mensaje="Baja registrada correctamente.")
