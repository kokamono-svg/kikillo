# =====================================================================
# codigos.py
# La misma regla que src/app/compartido/codigos.ts: la pistola puede
# mandar ALT'024, alt 024 o ALT024 y todos son el mismo código.
#   limpiar_codigo("alt'024 ") -> "ALT-024"   (lo que se guarda)
#   llave_codigo("ALT'024")    -> "ALT024"    (lo que se compara)
# =====================================================================
import re
import unicodedata


def limpiar_codigo(texto) -> str:
    t = str(texto or "").upper().replace("Ñ", "\0")
    t = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn").replace("\0", "Ñ")
    return "-".join(p for p in re.split(r"[^A-Z0-9Ñ]", t) if p)


def llave_codigo(texto) -> str:
    return limpiar_codigo(texto).replace("-", "")


# En SQL: la misma llave para comparar columnas (sin guiones ni espacios)
SQL_LLAVE = "REPLACE(REPLACE(UPPER({col}), '-', ''), ' ', '')"
