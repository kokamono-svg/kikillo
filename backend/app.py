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

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import text
from sqlalchemy.engine import URL

from almacen_routes import almacen_bp
from auth_routes import auth_bp
from extensions import db
from reportes_routes import reportes_bp
from rh_routes import rh_bp

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


if __name__ == "__main__":
    # FLASK_DEBUG=1 solo en tu computadora: en el servidor el modo debug permite ejecutar código
    app.run(host="127.0.0.1", port=5000, debug=os.environ.get("FLASK_DEBUG") == "1")
