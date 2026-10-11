# =====================================================================
# crear_usuario.py
# Da de alta un usuario de la app (la contraseña se pide sin mostrarla y
# se guarda cifrada). Usa la BD de .env.
#
#   python crear_usuario.py <usuario> "<Nombre completo>" <rol> ["<Almacén>"]
#
# Ejemplos:
#   python crear_usuario.py supervisor "Supervisor de turno" supervisor
#   python crear_usuario.py almacen.hyl "Pedro Gómez" almacenista "Área HYL"
#
# Roles: admin, rh, almacenista (necesita almacén), comprador, supervisor
# =====================================================================
import getpass
import os
import sys

import mysql.connector
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash

ROLES = {"admin", "rh", "almacenista", "comprador", "supervisor"}


def main():
    if len(sys.argv) < 4 or sys.argv[3] not in ROLES:
        sys.exit(__doc__ if __doc__ else "Uso: python crear_usuario.py <usuario> \"<Nombre>\" <rol> [\"<Almacén>\"]")
    usuario, nombre, rol = sys.argv[1].strip(), sys.argv[2].strip(), sys.argv[3]
    almacen = sys.argv[4].strip() if len(sys.argv) > 4 else None
    if rol == "almacenista" and not almacen:
        sys.exit("El almacenista necesita su almacén, ej.: \"Central Kepler\"")

    password = getpass.getpass("Contraseña (mínimo 8): ")
    if len(password) < 8 or password != getpass.getpass("Repítela: "):
        sys.exit("Las contraseñas no coinciden o tienen menos de 8 caracteres.")

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    con = mysql.connector.connect(
        host=os.environ.get("DB_HOST", "localhost"), port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"], password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "Inventarios"), use_pure=True,
    )
    cur = con.cursor()
    id_almacen = None
    if almacen:
        cur.execute("SELECT id_almacen FROM almacen WHERE nombre_almacen = %s", (almacen,))
        fila = cur.fetchone()
        if not fila:
            sys.exit(f"No existe el almacén {almacen!r}.")
        id_almacen = fila[0]
    cur.execute("SELECT 1 FROM usuario WHERE username = %s", (usuario,))
    if cur.fetchone():
        sys.exit(f"Ya existe el usuario {usuario!r}.")
    cur.execute(
        "INSERT INTO usuario (nombre_completo, username, password_hash, rol, id_almacen) VALUES (%s, %s, %s, %s, %s)",
        (nombre, usuario, generate_password_hash(password), rol, id_almacen),
    )
    con.commit()
    con.close()
    print(f"Listo: {usuario} ({rol}) ya puede iniciar sesión.")


if __name__ == "__main__":
    main()
