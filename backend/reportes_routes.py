# =====================================================================
# reportes_routes.py  (backend Flask)
# Reportes de herramienta y equipo (solo lectura):
#   GET /api/reportes/existencias?almacen=
#   GET /api/reportes/movimientos?almacen=&desde=&hasta=&tipo=
#   GET /api/reportes/adeudos?almacen=
# Cada usuario solo ve los almacenes a los que tiene acceso.
# =====================================================================
from collections import defaultdict
from datetime import date, timedelta

from flask import Blueprint, jsonify, request

from auth_routes import verificar_sesion
from comun import ErrorNegocio, almacenes_permitidos, error, iso, leer_fecha, q, tipo_app

reportes_bp = Blueprint("reportes", __name__, url_prefix="/api/reportes")

TIPOS_MOVIMIENTO = {"ENTREGA", "DEVOLUCION", "REPOSICION", "DANO", "PERDIDA", "ENTRADA", "AJUSTE", "TRASPASO_SALIDA", "TRASPASO_ENTRADA"}


@reportes_bp.before_request
def acceso():
    if request.method == "OPTIONS":
        return None
    return verificar_sesion(("admin", "almacenista", "comprador", "rh"))


def _almacenes():
    """ids de los almacenes del reporte: el elegido (si tiene acceso) o todos los suyos."""
    permitidos = almacenes_permitidos()
    elegido = request.args.get("almacen") or ""
    if elegido:
        if elegido not in permitidos:
            raise ErrorNegocio("No tienes acceso a ese almacén.", 403)
        return [permitidos[elegido]]
    return list(permitidos.values())


@reportes_bp.errorhandler(ErrorNegocio)
def _negocio(e):
    return error(e.mensaje, e.status)


@reportes_bp.get("/existencias")
def existencias():
    """Una fila por almacén y artículo: disponibles, prestadas, no aptas y certificaciones."""
    ids = _almacenes()
    if not ids:
        return jsonify([])
    hoy = date.today()
    aviso = hoy + timedelta(days=30)
    filas = q(
        """SELECT a.nombre_almacen AS almacen, c.clave, c.nombre, c.tipo, c.tipo_retorno, c.stock_minimo,
                  SUM(i.estatus = 'disponible' AND (i.certificacion_vence IS NULL OR i.certificacion_vence >= :hoy)) AS disponibles,
                  SUM(i.estatus = 'en uso') AS prestadas,
                  SUM(i.estatus IN ('dañado', 'en reparación') OR (i.estatus = 'disponible' AND i.certificacion_vence < :hoy)) AS no_aptas,
                  SUM(i.certificacion_vence < :hoy) AS cert_vencidas,
                  SUM(i.certificacion_vence BETWEEN :hoy AND :aviso) AS cert_por_vencer
           FROM inventario_almacen_individual i
           JOIN catalogo c ON c.id_catalogo = i.id_catalogo JOIN almacen a ON a.id_almacen = i.id_almacen
           WHERE i.estatus <> 'baja' AND i.id_almacen IN :ids
           GROUP BY a.id_almacen, a.nombre_almacen, c.id_catalogo, c.clave, c.nombre, c.tipo, c.tipo_retorno, c.stock_minimo
           UNION ALL
           SELECT a.nombre_almacen, c.clave, c.nombre, c.tipo, c.tipo_retorno, c.stock_minimo,
                  SUM(g.cantidad), 0, SUM(g.danados), 0, 0
           FROM inventario_almacen_conjunto g
           JOIN catalogo c ON c.id_catalogo = g.id_catalogo JOIN almacen a ON a.id_almacen = g.id_almacen
           WHERE g.id_almacen IN :ids
           GROUP BY a.id_almacen, a.nombre_almacen, c.id_catalogo, c.clave, c.nombre, c.tipo, c.tipo_retorno, c.stock_minimo
           ORDER BY almacen, clave""",
        ids=ids, hoy=hoy, aviso=aviso,
    )
    resultado = []
    for f in filas:
        disponibles, prestadas, no_aptas = int(f.disponibles or 0), int(f.prestadas or 0), int(f.no_aptas or 0)
        resultado.append({
            "almacen": f.almacen, "clave": f.clave, "nombre": f.nombre, "tipo": tipo_app(f.tipo, f.tipo_retorno),
            "disponibles": disponibles, "prestadas": prestadas, "noAptas": no_aptas,
            "total": disponibles + prestadas + no_aptas, "stockMinimo": f.stock_minimo,
            "stockBajo": disponibles <= f.stock_minimo,
            "certVencidas": int(f.cert_vencidas or 0), "certPorVencer": int(f.cert_por_vencer or 0),
        })
    return jsonify(resultado)


@reportes_bp.get("/movimientos")
def movimientos():
    """Entradas, entregas, devoluciones, daños y traspasos en un rango de fechas (máx. 5000 filas)."""
    ids = _almacenes()
    hoy = date.today()
    desde = leer_fecha(request.args.get("desde"), "Desde") if request.args.get("desde") else hoy - timedelta(days=30)
    hasta = leer_fecha(request.args.get("hasta"), "Hasta") if request.args.get("hasta") else hoy
    if desde > hasta:
        return error("La fecha 'desde' es posterior a 'hasta'.")
    tipo = request.args.get("tipo") or ""
    if tipo and tipo not in TIPOS_MOVIMIENTO:
        return error("Tipo de movimiento inválido.")
    if not ids:
        return jsonify([])
    filas = q(
        f"""SELECT m.id_movimiento, m.fecha, m.tipo, a.nombre_almacen AS almacen, c.clave, c.nombre, c.tipo AS tipo_art,
                   c.tipo_retorno, i.codigo AS serie, m.cantidad, COALESCE(t.nombre_completo, v.nombre_trabajador) AS trabajador,
                   COALESCE(v.folio, tr.folio) AS folio, u.nombre_completo AS responsable, m.notas
            FROM movimiento m
            JOIN almacen a ON a.id_almacen = m.id_almacen JOIN catalogo c ON c.id_catalogo = m.id_catalogo
            JOIN usuario u ON u.id_usuario = m.id_usuario
            LEFT JOIN inventario_almacen_individual i ON i.id_invalmind = m.id_invalmind
            LEFT JOIN trabajadores t ON t.id_trabajador = m.id_trabajador
            LEFT JOIN vale v ON v.id_vale = m.id_vale
            LEFT JOIN traspaso tr ON tr.id_traspaso = m.id_traspaso
            WHERE m.id_almacen IN :ids AND m.fecha >= :desde AND m.fecha < :hasta_fin {'AND m.tipo = :tipo' if tipo else ''}
            ORDER BY m.fecha DESC, m.id_movimiento DESC LIMIT 5000""",
        ids=ids, desde=desde, hasta_fin=hasta + timedelta(days=1), **({"tipo": tipo} if tipo else {}),
    )
    return jsonify([
        {"id": f.id_movimiento, "fecha": iso(f.fecha), "tipo": f.tipo, "almacen": f.almacen, "clave": f.clave, "nombre": f.nombre,
         "tipoArticulo": tipo_app(f.tipo_art, f.tipo_retorno), "serie": f.serie, "cantidad": f.cantidad,
         "trabajador": f.trabajador or "", "folio": f.folio or "", "responsable": f.responsable, "notas": f.notas or ""}
        for f in filas
    ])


@reportes_bp.get("/adeudos")
def adeudos():
    """Equipo prestado que no ha regresado (los consumibles no cuentan), con días y si ya venció."""
    ids = _almacenes()
    if not ids:
        return jsonify([])
    hoy = date.today()
    filas = q(
        """SELECT v.folio, v.fecha, v.fecha_devolucion, v.nombre_trabajador, v.numero_empleado, v.id_trabajador,
                  t.activo, t.num_empleado, a.nombre_almacen AS almacen, c.clave, c.nombre, i.codigo AS serie, d.cantidad
           FROM vale v JOIN vale_detalle d ON d.id_vale = v.id_vale
           JOIN catalogo c ON c.id_catalogo = d.id_catalogo JOIN almacen a ON a.id_almacen = v.id_almacen
           LEFT JOIN inventario_almacen_individual i ON i.id_invalmind = d.id_invalmind
           LEFT JOIN trabajadores t ON t.id_trabajador = v.id_trabajador
           WHERE v.tipo = 'ENTREGA' AND v.devuelto_en IS NULL AND c.tipo_retorno = 'Devolutivo' AND v.id_almacen IN :ids
           ORDER BY v.fecha_devolucion, v.fecha""",
        ids=ids,
    )
    return jsonify([
        {"folio": f.folio, "fechaEntrega": iso(f.fecha), "fechaDevolucion": iso(f.fecha_devolucion),
         "trabajador": f.nombre_trabajador, "numeroEmpleado": f.num_empleado or f.numero_empleado or "",
         "enRh": f.id_trabajador is not None, "activo": bool(f.activo) if f.id_trabajador else True,
         "almacen": f.almacen, "clave": f.clave, "nombre": f.nombre, "serie": f.serie, "cantidad": f.cantidad,
         "diasPrestado": (hoy - f.fecha.date()).days,
         "vencido": bool(f.fecha_devolucion and f.fecha_devolucion < hoy),
         "diasVencido": max(0, (hoy - f.fecha_devolucion).days) if f.fecha_devolucion else 0}
        for f in filas
    ])
