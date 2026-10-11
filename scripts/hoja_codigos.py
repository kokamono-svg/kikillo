# =====================================================================
# hoja_codigos.py  (script suelto: NO forma parte de la app)
# Genera un PDF para imprimir con TODA la herramienta del almacén: cada
# pieza en una tarjeta con su QR y su código de barras (la serie), más
# los consumibles con el código del artículo. Sirve como "catálogo físico":
# el almacenista escanea directo de la hoja al armar el vale.
#
# Los códigos son los mismos que lee la app (QR y CODE128 con la serie).
# Solo LEE la base de datos (usa backend/.env); no modifica nada.
#
# Instalar una vez:
#     pip install reportlab mysql-connector-python python-dotenv
#
# Uso (desde la carpeta scripts):
#     python hoja_codigos.py                               todos los almacenes
#     python hoja_codigos.py --almacen "Central Kepler"    solo uno
#     python hoja_codigos.py --solo-disponibles            sin prestadas ni no aptas
#     python hoja_codigos.py --salida mi_hoja.pdf
# =====================================================================
import argparse
import os
import sys
from datetime import date, datetime
from itertools import groupby
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import code128, qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

RAIZ = Path(__file__).resolve().parent.parent
LOGO = RAIZ / "public" / "images" / "logo.jpg"

# Colores de la empresa
AZUL = HexColor("#0052A5")
MARINO = HexColor("#13246B")
VERDE = HexColor("#04964C")
NEGRO = HexColor("#111111")
GRIS = HexColor("#6B7280")
GRIS_CLARO = HexColor("#D1D5DB")

ESTADOS = {  # estatus en la BD -> (texto, color)
    "disponible": ("Disponible", VERDE),
    "en uso": ("Prestada", AZUL),
    "en mantenimiento": ("En mantenimiento", GRIS),
    "en reparación": ("En reparación", HexColor("#EA580C")),
    "dañado": ("Dañada · no se entrega", HexColor("#DC2626")),
}

# Medidas (carta, 2 columnas x 5 renglones de tarjetas)
ANCHO, ALTO = letter
MARGEN = 10 * mm
ENCABEZADO = 24 * mm
PIE = 8 * mm
COLUMNAS, RENGLONES = 2, 5
SEPARACION = 4 * mm
TARJETA_W = (ANCHO - 2 * MARGEN - SEPARACION) / COLUMNAS
TARJETA_H = (ALTO - 2 * MARGEN - ENCABEZADO - PIE - (RENGLONES - 1) * SEPARACION) / RENGLONES


# ---------------------------------------------------------------------
# Datos
# ---------------------------------------------------------------------
def leer_datos(almacen, solo_disponibles):
    load_dotenv(RAIZ / "backend" / ".env")
    try:
        con = mysql.connector.connect(
            host=os.environ.get("DB_HOST", "localhost"), port=int(os.environ.get("DB_PORT", "3306")),
            user=os.environ["DB_USER"], password=os.environ.get("DB_PASSWORD", ""),
            database=os.environ.get("DB_NAME", "Inventarios"), use_pure=True, connection_timeout=15,
        )
    except KeyError:
        sys.exit("No encontré DB_USER en backend/.env")
    except mysql.connector.Error as e:
        sys.exit(f"No se pudo conectar a MySQL: {e}")
    cur = con.cursor(dictionary=True)
    filtro_alm = "AND a.nombre_almacen = %s" if almacen else ""
    params = (almacen,) if almacen else ()

    cur.execute(
        f"""SELECT a.nombre_almacen AS almacen, c.clave, c.nombre, c.tipo, c.tipo_retorno, i.codigo AS serie,
                   i.estatus, i.certificacion_vence, i.ultima_inspeccion
            FROM inventario_almacen_individual i
            JOIN catalogo c ON c.id_catalogo = i.id_catalogo JOIN almacen a ON a.id_almacen = i.id_almacen
            WHERE i.estatus <> 'baja' {filtro_alm}
            ORDER BY a.id_almacen, c.nombre, i.codigo""",
        params,
    )
    piezas = cur.fetchall()
    cur.execute(
        f"""SELECT a.nombre_almacen AS almacen, c.clave, c.nombre, c.tipo, c.tipo_retorno, SUM(g.cantidad) AS cantidad
            FROM inventario_almacen_conjunto g
            JOIN catalogo c ON c.id_catalogo = g.id_catalogo JOIN almacen a ON a.id_almacen = g.id_almacen
            WHERE 1 = 1 {filtro_alm}
            GROUP BY a.id_almacen, a.nombre_almacen, c.id_catalogo, c.clave, c.nombre, c.tipo, c.tipo_retorno
            ORDER BY a.id_almacen, c.nombre""",
        params,
    )
    granel = cur.fetchall()
    con.close()

    hoy = date.today()
    if solo_disponibles:
        piezas = [p for p in piezas if p["estatus"] == "disponible" and not (p["certificacion_vence"] and p["certificacion_vence"] < hoy)]
        granel = [g for g in granel if g["cantidad"] > 0]

    # Una lista de tarjetas por almacén (piezas primero, luego consumibles)
    tarjetas = []
    for p in piezas:
        tarjetas.append({**p, "codigo": p["serie"], "por_pieza": True})
    for g in granel:
        tarjetas.append({**g, "codigo": g["clave"], "por_pieza": False})
    orden = {nombre: i for i, nombre in enumerate(dict.fromkeys(t["almacen"] for t in piezas + granel))}
    tarjetas.sort(key=lambda t: (orden[t["almacen"]], not t["por_pieza"], t["nombre"], t["codigo"]))
    return tarjetas


def tipo_texto(t):
    if t["tipo_retorno"] == "Consumible":
        return "Consumible"
    return "EPP" if t["tipo"] == "EPP" else "Herramienta"


# ---------------------------------------------------------------------
# Dibujo
# ---------------------------------------------------------------------
def dibujar_qr(c, valor, x, y, lado):
    w = qr.QrCodeWidget(valor, barLevel="M")
    x0, y0, x1, y1 = w.getBounds()
    d = Drawing(lado, lado, transform=[lado / (x1 - x0), 0, 0, lado / (y1 - y0), 0, 0])
    d.add(w)
    renderPDF.draw(d, c, x, y)


def dibujar_barras(c, valor, x, y, ancho_max, alto):
    # Grosor de barra que quepa en el espacio (máx. 0.42 mm para que lea bien la pistola)
    prueba = code128.Code128(valor, barWidth=1, barHeight=alto, quiet=True)
    grosor = min(0.42 * mm, ancho_max / prueba.width)
    barras = code128.Code128(valor, barWidth=grosor, barHeight=alto, quiet=True)
    c.setFillColor(NEGRO)  # siempre negro: las pistolas láser (rojas) no leen barras de color
    barras.drawOn(c, x + (ancho_max - barras.width) / 2, y)


def recortar(texto, fuente, tamano, ancho):
    """Corta el texto con "…" para que quepa en el ancho."""
    if stringWidth(texto, fuente, tamano) <= ancho:
        return texto
    while texto and stringWidth(texto + "…", fuente, tamano) > ancho:
        texto = texto[:-1]
    return texto.rstrip() + "…"


def renglones(texto, fuente, tamano, ancho, maximo=2):
    """Parte el texto en renglones que quepan (el último se recorta si no cabe)."""
    palabras, lineas, actual = texto.split(), [], ""
    for p in palabras:
        prueba = f"{actual} {p}".strip()
        if stringWidth(prueba, fuente, tamano) <= ancho:
            actual = prueba
        else:
            lineas.append(actual)
            actual = p
    lineas.append(actual)
    if len(lineas) > maximo:
        lineas = lineas[: maximo - 1] + [recortar(" ".join(lineas[maximo - 1:]), fuente, tamano, ancho)]
    return lineas


def tarjeta(c, t, x, y):
    w, h = TARJETA_W, TARJETA_H
    # Contorno punteado: guía para recortar
    c.setStrokeColor(GRIS_CLARO)
    c.setLineWidth(0.6)
    c.setDash(3, 2)
    c.roundRect(x, y, w, h, 3 * mm)
    c.setDash()

    # Franja de color a la izquierda: azul = pieza, verde = consumible
    c.setFillColor(AZUL if t["por_pieza"] else VERDE)
    c.roundRect(x, y, 2.2 * mm, h, 1 * mm, stroke=0, fill=1)

    lado_qr = h - 8 * mm
    dibujar_qr(c, t["codigo"], x + 4 * mm, y + (h - lado_qr) / 2, lado_qr)

    tx = x + 4 * mm + lado_qr + 3 * mm
    ancho_texto = x + w - 4 * mm - tx
    cursor = y + h - 7 * mm

    c.setFillColor(NEGRO)
    for linea in renglones(t["nombre"], "Helvetica-Bold", 9.5, ancho_texto):
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(tx, cursor, linea)
        cursor -= 4.2 * mm

    c.setFont("Courier-Bold", 14)
    c.drawString(tx, cursor - 1.5 * mm, recortar(t["codigo"], "Courier-Bold", 14, ancho_texto))
    cursor -= 7 * mm

    c.setFont("Helvetica", 7)
    c.setFillColor(GRIS)
    if t["por_pieza"]:
        detalle = f"{t['clave']} · {tipo_texto(t)}"
    else:
        detalle = f"{tipo_texto(t)} · stock {int(t['cantidad'])}"
    c.drawString(tx, cursor, recortar(f"{detalle} · {t['almacen']}", "Helvetica", 7, ancho_texto))
    cursor -= 3.6 * mm

    if t["por_pieza"]:
        texto, color = ESTADOS.get(t["estatus"], (t["estatus"], GRIS))
        vence = t.get("certificacion_vence")
        if vence and vence < date.today():
            texto, color = "Certificación VENCIDA · no se entrega", HexColor("#DC2626")
        c.setFillColor(color)
        c.circle(tx + 1.1 * mm, cursor + 0.9 * mm, 1.1 * mm, stroke=0, fill=1)
        c.setFont("Helvetica-Bold", 7)
        linea = texto + (f" · cert. vence {vence:%d/%m/%Y}" if vence and vence >= date.today() else "")
        c.drawString(tx + 3.2 * mm, cursor, recortar(linea, "Helvetica-Bold", 7, ancho_texto - 3.2 * mm))
    else:
        c.setFillColor(VERDE)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(tx, cursor, "Por cantidad: escanea 1 vez por unidad")

    dibujar_barras(c, t["codigo"], tx, y + 3.5 * mm, ancho_texto, 9 * mm)


def encabezado(c, almacen, pagina, total_almacen, generado):
    c.setFillColor(MARINO)
    c.rect(0, ALTO - ENCABEZADO - 4 * mm, ANCHO, ENCABEZADO + 4 * mm, stroke=0, fill=1)
    # Franja con los colores de la marca
    for i, color in enumerate((AZUL, MARINO, VERDE, white)):
        c.setFillColor(color)
        c.rect(i * ANCHO / 4, ALTO - 1.6 * mm, ANCHO / 4, 1.6 * mm, stroke=0, fill=1)
    x = MARGEN
    if LOGO.exists():
        try:
            # Logo en círculo blanco (la imagen trae margen: se acerca y se recorta al círculo)
            cx, cy, r = MARGEN + 8 * mm, ALTO - 15 * mm, 8 * mm
            c.saveState()
            c.setFillColor(white)
            c.circle(cx, cy, r, stroke=0, fill=1)
            circulo = c.beginPath()
            circulo.circle(cx, cy, r)
            c.clipPath(circulo, stroke=0, fill=0)
            lado = 2 * r * 1.24
            c.drawImage(str(LOGO), cx - lado / 2, cy - lado / 2, lado, lado, preserveAspectRatio=True, mask="auto")
            c.restoreState()
            x += 19 * mm
        except Exception:  # noqa: BLE001 - sin logo también sirve
            pass
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(x, ALTO - 12.5 * mm, almacen)
    c.setFont("Helvetica", 8.5)
    c.drawString(x, ALTO - 18 * mm, f"IMHOTEP · Catálogo de códigos para préstamo y entrega · {total_almacen} códigos")
    c.setFont("Helvetica", 7.5)
    c.drawRightString(ANCHO - MARGEN, ALTO - 12.5 * mm, generado)
    c.drawRightString(ANCHO - MARGEN, ALTO - 18 * mm, f"Hoja {pagina}")


def pie(c):
    c.setFillColor(GRIS)
    c.setFont("Helvetica", 7)
    c.drawString(MARGEN, MARGEN - 2 * mm,
                 "Azul = pieza con serie (se presta y se devuelve).  Verde = consumible por cantidad.  Recorta por la línea punteada.")
    c.drawRightString(ANCHO - MARGEN, MARGEN - 2 * mm, "Escanéalo en: Nuevo préstamo · Traspasos · Inventario")


def generar(tarjetas, salida):
    c = canvas.Canvas(str(salida), pagesize=letter)
    c.setTitle("Catálogo de códigos IMHOTEP")
    c.setAuthor("IMHOTEP · Control de almacenes")
    generado = f"Generado {datetime.now():%d/%m/%Y %H:%M}"
    por_pagina = COLUMNAS * RENGLONES
    hojas = 0
    for almacen, grupo in groupby(tarjetas, key=lambda t: t["almacen"]):
        grupo = list(grupo)
        for inicio in range(0, len(grupo), por_pagina):
            hojas += 1
            encabezado(c, almacen, inicio // por_pagina + 1, len(grupo), generado)
            for i, t in enumerate(grupo[inicio:inicio + por_pagina]):
                col, ren = i % COLUMNAS, i // COLUMNAS
                x = MARGEN + col * (TARJETA_W + SEPARACION)
                y = ALTO - MARGEN - ENCABEZADO - (ren + 1) * TARJETA_H - ren * SEPARACION
                tarjeta(c, t, x, y)
            pie(c)
            c.showPage()
    c.save()
    return hojas


def main():
    parser = argparse.ArgumentParser(description="PDF con QR y código de barras de la herramienta (para imprimir).")
    parser.add_argument("--almacen", help='Solo un almacén, ej. "Central Kepler"')
    parser.add_argument("--solo-disponibles", action="store_true", help="Sin piezas prestadas, no aptas o con certificación vencida")
    parser.add_argument("--salida", default=f"codigos_herramienta_{date.today():%Y-%m-%d}.pdf", help="Nombre del PDF")
    args = parser.parse_args()

    tarjetas = leer_datos(args.almacen, args.solo_disponibles)
    if not tarjetas:
        sys.exit("No hay herramienta con esos filtros." + (f' ¿Existe el almacén "{args.almacen}"?' if args.almacen else ""))
    salida = Path(args.salida).resolve()
    hojas = generar(tarjetas, salida)
    print(f"Listo: {len(tarjetas)} códigos en {hojas} hoja(s) -> {salida}")


if __name__ == "__main__":
    main()
