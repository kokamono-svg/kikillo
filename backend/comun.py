# =====================================================================
# comun.py
# Utilidades que comparten almacen_routes, rh_routes y reportes_routes:
# consultas cortas, permisos por almacén y formato de fechas para Angular.
# =====================================================================
from datetime import date, datetime
from functools import wraps

from flask import g, jsonify
from sqlalchemy import bindparam, text

from extensions import db

# Quién puede ver todos los almacenes (el almacenista solo ve el suyo)
ROLES_VEN_TODO = {"admin", "comprador", "rh"}
# Quién puede mover inventario (prestar, recibir, agregar, traspasar)
ROLES_ESCRIBEN = {"admin", "almacenista"}


class ErrorNegocio(Exception):
    """Regla que no se cumple (stock, curso, certificación...). Se responde con su mensaje."""

    def __init__(self, mensaje, status=400, **extra):
        super().__init__(mensaje)
        self.mensaje, self.status, self.extra = mensaje, status, extra


def error(mensaje, status=400, **extra):
    return jsonify(ok=False, mensaje=mensaje, **extra), status


def transaccion(vista):
    """Todo o nada: si algo falla a la mitad, no queda nada a medias en la BD."""

    @wraps(vista)
    def envoltura(*args, **kwargs):
        try:
            respuesta = vista(*args, **kwargs)
            db.session.commit()
            return respuesta
        except ErrorNegocio as e:
            db.session.rollback()
            return error(e.mensaje, e.status, **e.extra)
        except Exception:
            db.session.rollback()
            raise

    return envoltura


def q(sql, **params):
    """Consulta → lista de filas (se leen como fila.columna). Las listas en params se expanden (IN :x)."""
    consulta = text(sql)
    expandir = [k for k, v in params.items() if isinstance(v, (list, tuple, set))]
    if expandir:
        consulta = consulta.bindparams(*[bindparam(k, expanding=True) for k in expandir])
        params = {k: (list(v) if k in expandir else v) for k, v in params.items()}
    return db.session.execute(consulta, params).fetchall()


def uno(sql, **params):
    filas = q(sql, **params)
    return filas[0] if filas else None


def ejecutar(sql, **params):
    """INSERT/UPDATE. Regresa el id insertado (si aplica)."""
    return db.session.execute(text(sql), params).lastrowid


# ---------------------------------------------------------------------
# Almacenes y permisos
# ---------------------------------------------------------------------
def todos_los_almacenes():
    return {f.nombre_almacen: f.id_almacen for f in q("SELECT id_almacen, nombre_almacen FROM almacen WHERE activo ORDER BY id_almacen")}


def almacenes_permitidos():
    """{nombre: id} de los almacenes que el usuario puede consultar."""
    todos = todos_los_almacenes()
    if g.usuario.rol in ROLES_VEN_TODO:
        return todos
    propio = g.usuario.almacen
    return {propio: todos[propio]} if propio in todos else {}


def exigir_almacen(nombre, escribir=False):
    """id del almacén si el usuario puede usarlo; si no, ErrorNegocio 403."""
    permitidos = almacenes_permitidos()
    if nombre not in permitidos:
        raise ErrorNegocio("No tienes acceso a ese almacén.", 403)
    if escribir and g.usuario.rol not in ROLES_ESCRIBEN:
        raise ErrorNegocio("Tu usuario solo puede consultar.", 403)
    return permitidos[nombre]


# ---------------------------------------------------------------------
# Formato para Angular
# ---------------------------------------------------------------------
def iso(valor):
    """date / datetime → texto ISO (o None)."""
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.replace(microsecond=0).isoformat()
    if isinstance(valor, date):
        return valor.isoformat()
    return str(valor)


def tipo_app(tipo, tipo_retorno):
    """Tipo de la BD → tipo del almacén en Angular: EPP, Herramienta o Consumible."""
    if tipo_retorno == "Consumible":
        return "Consumible"
    return "EPP" if tipo == "EPP" else "Herramienta"


def tipo_rh(tipo, tipo_retorno):
    """Tipo de la BD → tipo en RH: EPP, Herramienta, Equipo o Consumible."""
    return "Consumible" if tipo_retorno == "Consumible" else tipo


def leer_fecha(texto, campo):
    try:
        return date.fromisoformat(str(texto)[:10])
    except (TypeError, ValueError):
        raise ErrorNegocio(f"{campo}: fecha inválida (AAAA-MM-DD).")
