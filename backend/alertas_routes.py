# =====================================================================
# alertas_routes.py  (backend Flask)
# Bot de Telegram desde la app (solo administrador):
#   GET  /api/alertas/estado   -> ¿está configurado? ¿a qué hora sale el resumen?
#   POST /api/alertas/prueba   -> manda un mensaje de prueba al grupo
#   POST /api/alertas/resumen  -> manda el resumen del día ahora
# =====================================================================
import os

from flask import Blueprint, g, jsonify, request

import telegram_alertas
from auth_routes import verificar_sesion
from comun import error

alertas_bp = Blueprint("alertas", __name__, url_prefix="/api/alertas")


@alertas_bp.before_request
def solo_admin():
    if request.method == "OPTIONS":
        return None
    return verificar_sesion(("admin",))


@alertas_bp.get("/estado")
def estado():
    return jsonify(configurado=telegram_alertas.configurado(), hora=os.environ.get("TELEGRAM_HORA_RESUMEN", "08:00"))


def _responder(ok, detalle):
    return jsonify(ok=True, mensaje=detalle) if ok else error(detalle, 502)


@alertas_bp.post("/prueba")
def prueba():
    nombre = telegram_alertas.e(g.usuario.nombre)
    return _responder(*telegram_alertas.enviar(f"🔔 <b>Prueba</b> de alertas IMHOTEP enviada por {nombre}. El bot funciona."))


@alertas_bp.post("/resumen")
def resumen():
    return _responder(*telegram_alertas.enviar(telegram_alertas.resumen_del_dia()))
