# =====================================================================
# rh_routes.py  (backend Flask, MySQL/MariaDB)
# Endpoints del módulo de RH que consume rh.service.ts.
#
# Requiere: pip install flask flask-sqlalchemy flask-cors pymysql
# En tu app.py:
#     from flask_cors import CORS
#     from rh_routes import rh_bp
#     CORS(app, origins=["http://localhost:4200"])
#     app.register_blueprint(rh_bp)
#
# PENDIENTE: estos endpoints aún no revisan login ni rol de RH.
# =====================================================================
import re
from flask import Blueprint, jsonify, request
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from extensions import db  # tu instancia: db = SQLAlchemy()

rh_bp = Blueprint("rh", __name__, url_prefix="/api/rh")

# Mismas reglas que el formulario de Angular (el backend nunca confía en el frontend)
PATRONES = {
    "curp": re.compile(r"^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$"),
    "rfc": re.compile(r"^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$"),
    "nss": re.compile(r"^\d{11}$"),
}
OBLIGATORIOS = ["nombres", "apellidoPaterno", "curp", "rfc", "nss", "puesto", "area",
                "contrato", "supervisor", "fechaIngreso", "tallaRopa", "tallaCalzado"]

# ---------------------------------------------------------------------
# Consultas reutilizables
# ---------------------------------------------------------------------
SQL_TRABAJADOR = """
    SELECT id, numero_empleado, nombres, apellido_paterno, apellido_materno, curp, rfc, nss,
           telefono, puesto, area, contrato, supervisor, fecha_ingreso, talla_ropa, talla_calzado,
           doc_identificacion, doc_comprobante_dom, doc_datos_bancarios, doc_contrato_firmado,
           doc_alta_imss, induccion_seguridad, activo, fecha_baja, motivo_baja
    FROM trabajadores
"""

# Adeudos: por artículo y por pieza, (entregas + reposiciones) - devoluciones.
# Los consumibles quedan fuera con a.tipo <> 'Consumible'.
SQL_ADEUDOS = text("""
    SELECT a.clave, a.descripcion, a.tipo, m.id_serie,
           SUM(CASE WHEN m.tipo IN ('ENTREGA','REPOSICION') THEN m.cantidad ELSE 0 END)
         - SUM(CASE WHEN m.tipo = 'DEVOLUCION' THEN m.cantidad ELSE 0 END) AS pendiente,
           MIN(m.fecha)   AS fecha_entrega,
           MAX(al.nombre) AS almacen,
           MAX(v.folio)   AS folio
    FROM movimientos m
    JOIN articulos a  ON a.id = m.articulo_id
    JOIN almacenes al ON al.id = m.almacen_id
    LEFT JOIN vales v ON v.id = m.vale_id
    WHERE m.trabajador_id = :tid AND a.tipo <> 'Consumible'
    GROUP BY a.id, a.clave, a.descripcion, a.tipo, m.id_serie
    HAVING pendiente > 0
    ORDER BY fecha_entrega
""")


def _iso(valor):
    """Fecha de MySQL -> texto ISO para Angular (o None)."""
    return valor.isoformat() if valor else None


def _trabajador_json(f):
    """Fila de la BD -> objeto Trabajador de Angular (camelCase)."""
    return {
        "id": f.id, "numeroEmpleado": f.numero_empleado, "nombres": f.nombres,
        "apellidoPaterno": f.apellido_paterno, "apellidoMaterno": f.apellido_materno or "",
        "curp": f.curp, "rfc": f.rfc, "nss": f.nss, "telefono": f.telefono or "",
        "puesto": f.puesto, "area": f.area, "contrato": f.contrato, "supervisor": f.supervisor,
        "fechaIngreso": _iso(f.fecha_ingreso), "tallaRopa": f.talla_ropa, "tallaCalzado": f.talla_calzado,
        "documentos": {
            "identificacion": bool(f.doc_identificacion),
            "comprobanteDomicilio": bool(f.doc_comprobante_dom),
            "datosBancarios": bool(f.doc_datos_bancarios),
            "contratoFirmado": bool(f.doc_contrato_firmado),
            "altaImss": bool(f.doc_alta_imss),
        },
        "induccionSeguridad": bool(f.induccion_seguridad),
        "activo": bool(f.activo), "fechaBaja": _iso(f.fecha_baja), "motivoBaja": f.motivo_baja,
    }


def _adeudo_json(f):
    return {
        "articuloClave": f.clave, "descripcion": f.descripcion, "tipoArticulo": f.tipo,
        "idSerie": f.id_serie, "cantidadPendiente": int(f.pendiente),
        "fechaEntrega": _iso(f.fecha_entrega), "almacen": f.almacen, "folioVale": f.folio,
    }


def _buscar_trabajador(tid):
    return db.session.execute(text(SQL_TRABAJADOR + " WHERE id = :id"), {"id": tid}).fetchone()


def _error(mensaje, status, **extra):
    return jsonify(ok=False, mensaje=mensaje, **extra), status


# ---------------------------------------------------------------------
# TRABAJADORES
# ---------------------------------------------------------------------
@rh_bp.get("/trabajadores")
def buscar_trabajadores():
    """GET /api/rh/trabajadores?q=texto -> por número, nombre o CURP."""
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])
    filas = db.session.execute(text(SQL_TRABAJADOR + """
        WHERE numero_empleado LIKE :q OR curp LIKE :q
           OR CONCAT_WS(' ', nombres, apellido_paterno, apellido_materno) LIKE :q
        ORDER BY apellido_paterno, nombres LIMIT 20
    """), {"q": f"%{q}%"}).fetchall()
    return jsonify([_trabajador_json(f) for f in filas])


@rh_bp.get("/trabajadores/<int:tid>")
def obtener_trabajador(tid):
    f = _buscar_trabajador(tid)
    return jsonify(_trabajador_json(f)) if f else _error("Trabajador no encontrado.", 404)


@rh_bp.post("/trabajadores")
def crear_trabajador():
    """
    POST /api/rh/trabajadores  (alta)
    El número de empleado NO viene en el body: se genera aquí a partir
    del id autoincremental, así es único y consecutivo: IMH-00001.
    """
    d = request.get_json(silent=True) or {}
    faltan = [c for c in OBLIGATORIOS if not str(d.get(c, "")).strip()]
    if faltan:
        return _error(f"Faltan campos: {', '.join(faltan)}.", 400)

    for campo, patron in PATRONES.items():
        d[campo] = str(d[campo]).strip().upper()
        if not patron.match(d[campo]):
            return _error(f"{campo.upper()} con formato inválido.", 400)

    docs = d.get("documentos") or {}
    try:
        r = db.session.execute(text("""
            INSERT INTO trabajadores (nombres, apellido_paterno, apellido_materno, curp, rfc, nss, telefono,
                puesto, area, contrato, supervisor, fecha_ingreso, talla_ropa, talla_calzado,
                doc_identificacion, doc_comprobante_dom, doc_datos_bancarios, doc_contrato_firmado,
                doc_alta_imss, induccion_seguridad)
            VALUES (:nombres, :ap, :am, :curp, :rfc, :nss, :tel, :puesto, :area, :contrato, :supervisor,
                :ingreso, :ropa, :calzado, :d1, :d2, :d3, :d4, :d5, :induccion)
        """), {
            "nombres": d["nombres"].strip(), "ap": d["apellidoPaterno"].strip(),
            "am": (d.get("apellidoMaterno") or "").strip(), "curp": d["curp"], "rfc": d["rfc"],
            "nss": d["nss"], "tel": d.get("telefono") or None, "puesto": d["puesto"], "area": d["area"],
            "contrato": d["contrato"], "supervisor": d["supervisor"], "ingreso": d["fechaIngreso"],
            "ropa": d["tallaRopa"], "calzado": d["tallaCalzado"],
            "d1": bool(docs.get("identificacion")), "d2": bool(docs.get("comprobanteDomicilio")),
            "d3": bool(docs.get("datosBancarios")), "d4": bool(docs.get("contratoFirmado")),
            "d5": bool(docs.get("altaImss")), "induccion": bool(d.get("induccionSeguridad")),
        })
        nuevo_id = r.lastrowid
        # El id es único, por eso el número también lo es
        db.session.execute(text("UPDATE trabajadores SET numero_empleado = :num WHERE id = :id"),
                           {"num": f"IMH-{nuevo_id:05d}", "id": nuevo_id})
        db.session.commit()
    except IntegrityError:
        db.session.rollback()  # la columna curp es UNIQUE
        return _error("Ya existe un trabajador registrado con esa CURP.", 409)

    return jsonify(_trabajador_json(_buscar_trabajador(nuevo_id))), 201


# ---------------------------------------------------------------------
# ADEUDOS Y KARDEX
# ---------------------------------------------------------------------
@rh_bp.get("/trabajadores/<int:tid>/adeudos")
def adeudos(tid):
    filas = db.session.execute(SQL_ADEUDOS, {"tid": tid}).fetchall()
    return jsonify([_adeudo_json(f) for f in filas])


@rh_bp.get("/trabajadores/<int:tid>/kardex")
def kardex(tid):
    """Todos los movimientos del trabajador, del más reciente al más antiguo."""
    filas = db.session.execute(text("""
        SELECT m.id, m.fecha, m.tipo, a.clave, a.descripcion, a.tipo AS tipo_articulo,
               m.id_serie, m.cantidad, al.nombre AS almacen, v.folio, m.responsable
        FROM movimientos m
        JOIN articulos a  ON a.id = m.articulo_id
        JOIN almacenes al ON al.id = m.almacen_id
        LEFT JOIN vales v ON v.id = m.vale_id
        WHERE m.trabajador_id = :tid
        ORDER BY m.fecha DESC, m.id DESC
    """), {"tid": tid}).fetchall()
    return jsonify([{
        "id": f.id, "fecha": _iso(f.fecha), "tipo": f.tipo, "articuloClave": f.clave,
        "descripcion": f.descripcion, "tipoArticulo": f.tipo_articulo, "idSerie": f.id_serie,
        "cantidad": f.cantidad, "almacen": f.almacen, "folioVale": f.folio, "responsable": f.responsable,
    } for f in filas])


# ---------------------------------------------------------------------
# VALES
# ---------------------------------------------------------------------
@rh_bp.get("/trabajadores/<int:tid>/vales")
def vales(tid):
    t = _buscar_trabajador(tid)
    if not t:
        return _error("Trabajador no encontrado.", 404)
    trabajador = _trabajador_json(t)

    encabezados = db.session.execute(text("""
        SELECT id, folio, tipo, fecha, responsable, observaciones
        FROM vales WHERE trabajador_id = :tid ORDER BY fecha DESC
    """), {"tid": tid}).fetchall()

    resultado = []
    for v in encabezados:
        if v.tipo == "ENTREGA":
            # Renglones = movimientos de entrega ligados al vale
            filas = db.session.execute(text("""
                SELECT a.descripcion, a.tipo, m.id_serie, m.cantidad, 'Bueno' AS estado
                FROM movimientos m JOIN articulos a ON a.id = m.articulo_id
                WHERE m.vale_id = :vid AND m.tipo = 'ENTREGA'
            """), {"vid": v.id}).fetchall()
        else:
            # Renglones = foto guardada al generar el vale de adeudos
            filas = db.session.execute(text("""
                SELECT a.descripcion, a.tipo, r.id_serie, r.cantidad, r.estado
                FROM vale_renglones r JOIN articulos a ON a.id = r.articulo_id
                WHERE r.vale_id = :vid
            """), {"vid": v.id}).fetchall()
        resultado.append({
            "folio": v.folio, "tipo": v.tipo, "fecha": _iso(v.fecha), "trabajador": trabajador,
            "responsable": v.responsable, "observaciones": v.observaciones or "",
            "renglones": [{"descripcion": r.descripcion, "tipoArticulo": r.tipo, "idSerie": r.id_serie,
                           "cantidad": r.cantidad, "estado": r.estado} for r in filas],
        })
    return jsonify(resultado)


@rh_bp.post("/trabajadores/<int:tid>/vales/adeudos")
def generar_vale_adeudos(tid):
    """Crea un vale ADE-#### con lo que el trabajador debe en este momento."""
    emitido_por = ((request.get_json(silent=True) or {}).get("emitidoPor") or "Recursos Humanos")[:80]
    if not _buscar_trabajador(tid):
        return _error("Trabajador no encontrado.", 404)

    pendientes = db.session.execute(SQL_ADEUDOS, {"tid": tid}).fetchall()
    if not pendientes:
        return _error("El trabajador no tiene adeudos.", 409)

    r = db.session.execute(text("""
        INSERT INTO vales (folio, tipo, trabajador_id, responsable, observaciones)
        VALUES ('TEMP', 'ADEUDOS', :tid, :resp, 'Artículos pendientes de devolución al almacén.')
    """), {"tid": tid, "resp": emitido_por})
    vale_id = r.lastrowid
    folio = f"ADE-{vale_id:04d}"
    db.session.execute(text("UPDATE vales SET folio = :f WHERE id = :id"), {"f": folio, "id": vale_id})

    for p in pendientes:
        db.session.execute(text("""
            INSERT INTO vale_renglones (vale_id, articulo_id, id_serie, cantidad, estado)
            SELECT :vid, id, :serie, :cant, 'Pendiente' FROM articulos WHERE clave = :clave
        """), {"vid": vale_id, "serie": p.id_serie, "cant": int(p.pendiente), "clave": p.clave})
    db.session.commit()

    # Se regresa con el mismo formato que GET /vales
    return jsonify(next(v for v in vales(tid).get_json() if v["folio"] == folio)), 201


# ---------------------------------------------------------------------
# BAJA
# ---------------------------------------------------------------------
@rh_bp.post("/bajas")
def registrar_baja():
    """Vuelve a validar adeudos aquí: el frontend se puede saltar, la BD no."""
    d = request.get_json(silent=True) or {}
    tid, motivo, fecha = d.get("trabajadorId"), (d.get("motivo") or "").strip(), d.get("fechaBaja")
    if not tid or not motivo or not fecha:
        return _error("Faltan datos obligatorios.", 400)

    try:
        # FOR UPDATE bloquea al trabajador para que nadie le preste algo en este instante
        t = db.session.execute(text("SELECT id, activo FROM trabajadores WHERE id = :tid FOR UPDATE"),
                               {"tid": tid}).fetchone()
        if t is None:
            db.session.rollback()
            return _error("El trabajador no existe.", 404)
        if not t.activo:
            db.session.rollback()
            return _error("El trabajador ya estaba dado de baja.", 409)

        pendientes = db.session.execute(SQL_ADEUDOS, {"tid": tid}).fetchall()
        if pendientes:
            db.session.rollback()
            return _error("El trabajador tiene adeudos pendientes.", 409,
                          adeudos=[_adeudo_json(f) for f in pendientes])

        db.session.execute(text("""
            UPDATE trabajadores SET activo = FALSE, fecha_baja = :f, motivo_baja = :m, comentarios_baja = :c
            WHERE id = :tid
        """), {"f": fecha, "m": motivo, "c": (d.get("comentarios") or "")[:500], "tid": tid})
        db.session.commit()
        return jsonify(ok=True, mensaje="Baja registrada correctamente.")
    except Exception:
        db.session.rollback()
        return _error("Error interno al registrar la baja.", 500)
