# =====================================================================
# auth_routes.py  (backend Flask)
# Login y control de acceso por rol. Lo consume auth.service.ts.
#
# En tu app.py:
#     import os
#     from auth_routes import auth_bp
#     app.config["SECRET_KEY"] = os.environ["IMHOTEP_SECRET_KEY"]  # larga y aleatoria, NUNCA en el código
#     app.register_blueprint(auth_bp)
#
# Para generar una SECRET_KEY:
#     python -c "import secrets; print(secrets.token_hex(32))"
#
# En los endpoints protegidos:
#     from auth_routes import requiere_rol
#     @requiere_rol("rh", "admin")
#     def mi_endpoint(): ...   # el usuario queda en g.usuario
# =====================================================================
import time
from functools import wraps

from flask import Blueprint, current_app, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import text
from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

DURACION_SESION = 8 * 60 * 60  # segundos: una jornada
ROLES = {"admin", "rh", "almacenista", "comprador", "solicitante"}

# Se compara contra este hash cuando el usuario no existe, para que la
# respuesta tarde lo mismo y no se pueda adivinar qué usuarios existen.
_HASH_FALSO = generate_password_hash("no-existe")

# Límite de intentos fallidos por IP + usuario (en memoria; con varios
# procesos de gunicorn conviene moverlo a Redis o a la BD).
MAX_INTENTOS = 5
VENTANA_BLOQUEO = 10 * 60
_intentos: dict[str, list[float]] = {}


def _serializador():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="imhotep-auth")


def _error(mensaje, status):
    return jsonify(ok=False, mensaje=mensaje), status


def _bloqueado(llave):
    ahora = time.time()
    recientes = [t for t in _intentos.get(llave, []) if ahora - t < VENTANA_BLOQUEO]
    _intentos[llave] = recientes
    return len(recientes) >= MAX_INTENTOS


@auth_bp.post("/login")
def login():
    """POST /api/auth/login  {usuario, password} -> {token, usuario, expiraEnSegundos}"""
    d = request.get_json(silent=True) or {}
    usuario = str(d.get("usuario") or "").strip()[:40]
    password = str(d.get("password") or "")
    if not usuario or not password:
        return _error("Faltan usuario o contraseña.", 400)

    llave = f"{request.remote_addr}|{usuario.lower()}"
    if _bloqueado(llave):
        return _error("Demasiados intentos. Espera unos minutos.", 429)

    u = db.session.execute(text("""
        SELECT u.id, u.usuario, u.password_hash, u.nombre, u.rol, a.nombre AS almacen
        FROM usuarios u LEFT JOIN almacenes a ON a.id = u.almacen_id
        WHERE u.usuario = :u AND u.activo = TRUE
    """), {"u": usuario}).fetchone()

    if not check_password_hash(u.password_hash if u else _HASH_FALSO, password) or not u:
        _intentos.setdefault(llave, []).append(time.time())
        return _error("Usuario o contraseña incorrectos.", 401)

    _intentos.pop(llave, None)
    token = _serializador().dumps({"id": u.id, "rol": u.rol})
    return jsonify(
        token=token,
        usuario={"usuario": u.usuario, "nombre": u.nombre, "rol": u.rol, "almacen": u.almacen},
        expiraEnSegundos=DURACION_SESION,
    )


def requiere_rol(*roles):
    """
    Decorador: exige "Authorization: Bearer <token>" válido y que el
    usuario tenga alguno de los roles. Sin token o vencido -> 401;
    con token pero sin permiso -> 403.
    """
    desconocidos = set(roles) - ROLES
    assert not desconocidos, f"Roles desconocidos: {desconocidos}"

    def decorador(vista):
        @wraps(vista)
        def envoltura(*args, **kwargs):
            error = verificar_sesion(roles)
            return error if error else vista(*args, **kwargs)
        return envoltura
    return decorador


def verificar_sesion(roles):
    """Valida el token y el rol. Regresa una respuesta de error o None si todo está bien."""
    encabezado = request.headers.get("Authorization", "")
    if not encabezado.startswith("Bearer "):
        return _error("Inicia sesión para continuar.", 401)
    try:
        datos = _serializador().loads(encabezado[7:], max_age=DURACION_SESION)
    except SignatureExpired:
        return _error("Tu sesión expiró. Inicia sesión de nuevo.", 401)
    except BadSignature:
        return _error("Sesión inválida.", 401)

    # Se vuelve a leer de la BD: si desactivan al usuario o le cambian el
    # rol, deja de tener acceso de inmediato aunque su token siga vigente.
    u = db.session.execute(text("""
        SELECT id, usuario, nombre, rol, trabajador_id, almacen_id FROM usuarios WHERE id = :id AND activo = TRUE
    """), {"id": datos.get("id")}).fetchone()
    if not u:
        return _error("Sesión inválida.", 401)
    if u.rol not in roles:
        return _error("No tienes permiso para esta sección.", 403)

    g.usuario = u
    return None
