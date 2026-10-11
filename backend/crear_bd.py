# =====================================================================
# crear_bd.py
# Crea la BD Inventarios con inventarios.sql y (opcional) le carga los
# datos de prueba de datos_prueba.py. Usa los datos de .env.
#
#   python crear_bd.py                 -> crea lo que falte (no borra nada)
#   python crear_bd.py --datos         -> además carga los datos de ejemplo
#   python crear_bd.py --reiniciar     -> BORRA la BD completa y la crea de nuevo con los datos de ejemplo
# =====================================================================
import os
import re
import sys
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

import datos_prueba

AQUI = Path(__file__).parent


def sentencias(archivo):
    """Lee un .sql y lo parte en sentencias (quita comentarios -- y separa por ;)."""
    sql = (AQUI / archivo).read_text(encoding="utf-8")
    sql = re.sub(r"--[^\n]*", "", sql)
    return [s.strip() for s in sql.split(";") if s.strip()]


def ejecutar(cur, archivo):
    for s in sentencias(archivo):
        cur.execute(s)
    print(f"  ok  {archivo}")


def main():
    load_dotenv(AQUI / ".env")
    nombre = os.environ.get("DB_NAME", "Inventarios")
    con = mysql.connector.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ.get("DB_PASSWORD", ""),
        use_pure=True,  # la extensión en C truena con Python 3.14
    )
    cur = con.cursor()

    if "--reiniciar" in sys.argv:
        cur.execute(f"DROP DATABASE IF EXISTS `{nombre}`")
        print(f"  BD {nombre} borrada")

    ejecutar(cur, "inventarios.sql")
    if "--datos" in sys.argv or "--reiniciar" in sys.argv:
        cur.execute(f"USE `{nombre}`")
        datos_prueba.cargar(cur)
        print("  ok  datos de prueba")
    con.commit()
    con.close()


if __name__ == "__main__":
    main()
