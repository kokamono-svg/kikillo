# =====================================================================
# app.py  (backend Flask)
# Arranca la API que consume Angular en http://localhost:5000/api
#
# Primera vez, desde la carpeta backend:
#     pip install -r requirements.txt
#     copy .env.example .env      (y llena tus datos de MySQL)
#     python app.py
#
# Prueba de conexión: abre http://localhost:5000/api/salud
# =====================================================================
import os
import re

from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, send_from_directory
from flask_cors import CORS
from sqlalchemy import text
from sqlalchemy.engine import URL

from alertas_routes import alertas_bp
from almacen_routes import almacen_bp
from auth_routes import auth_bp
from extensions import db
from reportes_routes import reportes_bp
from rh_routes import rh_bp
from telegram_alertas import iniciar_resumen_diario

load_dotenv()  # lee backend/.env (usuario y contraseña NUNCA van en el código)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ["IMHOTEP_SECRET_KEY"]
app.config["SQLALCHEMY_DATABASE_URI"] = URL.create(
    "mysql+mysqlconnector",
    username=os.environ["DB_USER"],
    password=os.environ.get("DB_PASSWORD", ""),
    host=os.environ.get("DB_HOST", "localhost"),
    port=int(os.environ.get("DB_PORT", "3306")),
    database=os.environ.get("DB_NAME", "Inventarios"),
    query={"charset": "utf8mb4"},
)
# pool_pre_ping: si MySQL cerró la conexión por inactividad, se reabre sola
# use_pure: la extensión en C de mysql-connector truena (segfault) con Python 3.14
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True, "connect_args": {"use_pure": True}}

# Las devoluciones pueden traer fotos (ya reducidas en el celular): hasta 16 MB por petición
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

db.init_app(app)
CORS(app, origins=["http://localhost:4200"])

app.register_blueprint(auth_bp)
app.register_blueprint(almacen_bp)
app.register_blueprint(rh_bp)
app.register_blueprint(reportes_bp)
app.register_blueprint(alertas_bp)


@app.get("/api/salud")
def salud():
    """GET /api/salud -> comprueba la conexión y lista las tablas de la BD."""
    try:
        base = db.session.execute(text("SELECT DATABASE()")).scalar()
        tablas = db.session.execute(text("""
            SELECT TABLE_NAME AS tabla, TABLE_ROWS AS filas
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
            ORDER BY TABLE_NAME
        """)).mappings().all()
    except Exception as e:  # noqa: BLE001 - solo es la prueba de conexión
        return jsonify(ok=False, mensaje=f"No se pudo conectar a MySQL: {e}"), 500
    # filas es aproximado en InnoDB (sirve para ver que hay datos, no para contar)
    return jsonify(ok=True, base=base, tablas=[dict(t) for t in tablas])


# ---------------------------------------------------------------------
# App de Angular ya compilada (npx ng build) en el mismo servidor que la API.
# Así basta un solo túnel/dominio para usarla en el celular e instalarla
# como app (PWA). Si no existe la carpeta, Flask solo sirve la API.
# ---------------------------------------------------------------------
APP_ANGULAR = Path(__file__).resolve().parent.parent / "dist" / "hackathon" / "browser"


@app.get("/")
@app.get("/<path:ruta>")
def app_angular(ruta=""):
    if ruta.startswith("api/") or not (APP_ANGULAR / "index.html").exists():
        abort(404)
    archivo = APP_ANGULAR / ruta
    if ruta and archivo.is_file() and APP_ANGULAR in archivo.resolve().parents:
        # chunk-AB12cd34.js / styles-XYZ.css llevan huella: nunca cambian, se guardan un año
        con_huella = re.search(r"-[A-Za-z0-9_]{8,}\.(js|css)$", ruta)
        respuesta = send_from_directory(APP_ANGULAR, ruta, max_age=31_536_000 if con_huella else None)
    elif Path(ruta).suffix:
        # Archivo que ya no existe (p. ej. el styles-XXXX.css de una versión anterior): 404.
        # Si se respondiera index.html, el celular guardaría HTML como si fuera CSS y la app
        # se vería sin estilos.
        abort(404)
    else:
        respuesta = send_from_directory(APP_ANGULAR, "index.html")  # rutas de Angular (/almacen/...)
    # index.html y el service worker siempre frescos: así el celular recibe las versiones nuevas
    if ruta in ("", "index.html", "ngsw-worker.js", "ngsw.json", "manifest.webmanifest") or not archivo.is_file():
        respuesta.headers["Cache-Control"] = "no-cache"
    return respuesta


if __name__ == "__main__":
    # FLASK_DEBUG=1 solo en tu computadora: en el servidor el modo debug permite ejecutar código
    app.debug = os.environ.get("FLASK_DEBUG") == "1"
    iniciar_resumen_diario(app)  # resumen diario en Telegram (si está configurado)
    app.run(host="0.0.0.0", port=5000, debug=os.environ.get("FLASK_DEBUG") == "1")
