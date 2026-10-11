# =====================================================================
# telegram_alertas.py  (backend Flask)
# Bot de alertas en el grupo de Telegram de IMHOTEP.
#
# Al momento (cuando pasa):
#   - Una entrega deja un artículo en stock bajo (al cruzar el mínimo)
#   - Una entrega pasó el límite por vale con autorización de supervisor
#   - Equipo devuelto DAÑADO
#   - Traspaso entre almacenes
#   - Cambio de estado de una pieza (mantenimiento, reparación, dañada, disponible)
#   - Ajuste de stock (conteo físico)
# Cada mañana (TELEGRAM_HORA_RESUMEN): resumen con préstamos vencidos,
#   certificaciones vencidas o por vencer y artículos por reponer.
#
# Configuración en backend/.env (el token NUNCA va en el código):
#   TELEGRAM_BOT_TOKEN=...      lo da @BotFather
#   TELEGRAM_CHAT_ID=-100...    el grupo (ver "--grupos" abajo)
#   TELEGRAM_HORA_RESUMEN=08:00
#
# Desde la carpeta backend:
#   python telegram_alertas.py --grupos    grupos donde está el bot (y guarda el elegido en .env)
#   python telegram_alertas.py --prueba    manda un mensaje de prueba
#   python telegram_alertas.py --resumen   manda el resumen del día ahora
#
# Si Telegram no responde, la app sigue funcionando: la alerta solo se
# anota en la consola. Las alertas se mandan DESPUÉS de guardar en la BD
# (si la operación falla y se deshace, no se avisa nada).
# =====================================================================
import html
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

from flask import g, has_request_context

AQUI = Path(__file__).resolve().parent
ESTADO = AQUI / ".alertas_estado.json"  # cuándo se mandó el último resumen (no se sube a git)
DIAS_AVISO_CERTIFICACION = 30
MAX_RENGLONES = 15  # Telegram corta los mensajes muy largos


def _token():
    # El valor está en backend/.env (TELEGRAM_BOT_TOKEN=...). Aquí va el NOMBRE de la variable, nunca el token.
    return os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()


def _grupo():
    return os.environ.get("TELEGRAM_CHAT_ID", "").strip()


def configurado():
    return bool(_token() and _grupo())


def e(texto):
    """Escapa texto del usuario para el formato HTML de Telegram."""
    return html.escape(str(texto if texto is not None else ""), quote=False)


# ---------------------------------------------------------------------
# Envío
# ---------------------------------------------------------------------
def _api(metodo, datos=None, timeout=10):
    url = f"https://api.telegram.org/bot{_token()}/{metodo}"
    cuerpo = urllib.parse.urlencode(datos).encode() if datos else None
    with urllib.request.urlopen(urllib.request.Request(url, data=cuerpo), timeout=timeout) as r:
        return json.load(r)


def enviar(texto):
    """Manda el mensaje al grupo y espera la respuesta. Regresa (ok, detalle)."""
    if not configurado():
        return False, "Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en backend/.env"
    try:
        _api("sendMessage", {"chat_id": _grupo(), "text": texto[:4000], "parse_mode": "HTML", "disable_web_page_preview": "true"})
        return True, "Enviado"
    except urllib.error.HTTPError as err:
        try:
            detalle = json.load(err).get("description", str(err))
        except Exception:  # noqa: BLE001
            detalle = str(err)
        return False, f"Telegram respondió: {detalle}"
    except Exception as err:  # noqa: BLE001 - sin internet, DNS, timeout...
        return False, f"No se pudo conectar con Telegram: {err}"


def _enviar_en_segundo_plano(textos):
    def trabajo():
        for t in textos:
            ok, detalle = enviar(t)
            if not ok:
                print(f"[telegram] {detalle}")

    threading.Thread(target=trabajo, daemon=True).start()


def avisar(texto):
    """Anota una alerta. Dentro de una petición se manda hasta que la BD guardó (ver comun.transaccion)."""
    if not configurado():
        return
    if has_request_context():
        g.setdefault("alertas_telegram", []).append(texto)
    else:
        _enviar_en_segundo_plano([texto])


def despachar():
    """Manda las alertas anotadas en esta petición (se llama después del commit)."""
    if has_request_context():
        pendientes = g.pop("alertas_telegram", [])
        if pendientes:
            _enviar_en_segundo_plano(pendientes)


def descartar():
    """La operación se deshizo: no se manda nada."""
    if has_request_context():
        g.pop("alertas_telegram", None)


# ---------------------------------------------------------------------
# Alertas al momento
# ---------------------------------------------------------------------
def _disponibles(id_almacen, id_catalogo):
    from comun import uno

    return int(uno(
        """SELECT (SELECT COUNT(*) FROM inventario_almacen_individual
                   WHERE id_almacen = :a AND id_catalogo = :c AND estatus = 'disponible'
                     AND (certificacion_vence IS NULL OR certificacion_vence >= CURDATE()))
                + (SELECT COALESCE(SUM(cantidad), 0) FROM inventario_almacen_conjunto WHERE id_almacen = :a AND id_catalogo = :c) AS n""",
        a=id_almacen, c=id_catalogo,
    ).n)


def revisar_stock_bajo(id_almacen, nombre_almacen, salieron):
    """salieron: [(fila de catálogo, cantidad que acaba de salir)]. Avisa solo al CRUZAR el mínimo (no en cada préstamo)."""
    juntos = {}
    for c, cantidad in salieron:
        juntos[c.id_catalogo] = (c, juntos.get(c.id_catalogo, (c, 0))[1] + cantidad)
    for c, cantidad in juntos.values():
        ahora = _disponibles(id_almacen, c.id_catalogo)
        antes = ahora + cantidad
        if antes > c.stock_minimo >= ahora:
            avisar(
                f"📉 <b>Stock bajo</b> · {e(nombre_almacen)}\n"
                f"{e(c.nombre)} (<code>{e(c.clave)}</code>): quedan <b>{ahora}</b> disponibles (mínimo {c.stock_minimo}).\n"
                f"Conviene reponer o traspasar de otro almacén."
            )


def alerta_autorizacion(folio, nombre_almacen, trabajador, supervisor, excedidos):
    lista = ", ".join(f"{e(c.nombre)} ×{n} (máx. {c.limite_por_vale})" for c, n in excedidos)
    avisar(
        f"🔐 <b>Entrega fuera de límite</b> · {e(nombre_almacen)}\n"
        f"Vale <code>{e(folio)}</code> a {e(trabajador)}: {lista}.\n"
        f"Autorizó: <b>{e(supervisor)}</b>"
    )


def alerta_danos(folio, nombre_almacen, trabajador, renglones):
    lista = "\n".join(f"• {e(nombre)}{(' <code>' + e(serie) + '</code>') if serie else ''}"
                      f"{(' ×' + str(n)) if n > 1 else ''}{(': ' + e(notas)) if notas else ''}"
                      for nombre, serie, n, notas in renglones)
    avisar(f"🔧 <b>Equipo devuelto dañado</b> · {e(nombre_almacen)}\nVale <code>{e(folio)}</code> de {e(trabajador)}:\n{lista}")


ICONO_ESTADO = {"disponible": "✅", "en mantenimiento": "🛠️", "en reparación": "🔧", "dañado": "⚠️"}


def alerta_estado_pieza(serie, nombre, nombre_almacen, antes, despues, usuario, notas):
    titulo = "Vuelve a estar disponible" if despues == "disponible" else f"Pieza {despues.upper()}"
    motivo = f"Motivo: {e(notas)}\n" if notas else ""
    avisar(
        f"{ICONO_ESTADO.get(despues, '🔄')} <b>{titulo}</b> · {e(nombre_almacen)}\n"
        f"{e(nombre)} <code>{e(serie)}</code>: {e(antes)} → <b>{e(despues)}</b>\n"
        f"{motivo}Registró: {e(usuario)}"
    )


def alerta_ajuste_stock(c, nombre_almacen, antes, despues, usuario, notas):
    avisar(
        f"📦 <b>Ajuste de stock</b> · {e(nombre_almacen)}\n"
        f"{e(c.nombre)} (<code>{e(c.clave)}</code>): {antes} → <b>{despues}</b> ({despues - antes:+d})\n"
        f"Motivo: {e(notas)}\nRegistró: {e(usuario)}"
    )


def alerta_traspaso(folio, origen, destino, piezas, usuario, notas):
    avisar(
        f"🚚 <b>Traspaso</b> <code>{e(folio)}</code>\n{e(origen)} → <b>{e(destino)}</b>: {piezas} unidad(es).\n"
        f"Envió: {e(usuario)}{(chr(10) + 'Notas: ' + e(notas)) if notas else ''}"
    )


# ---------------------------------------------------------------------
# Resumen diario
# ---------------------------------------------------------------------
def _lista(titulo, renglones):
    if not renglones:
        return ""
    extra = f"\n… y {len(renglones) - MAX_RENGLONES} más" if len(renglones) > MAX_RENGLONES else ""
    return f"\n\n<b>{titulo}</b>\n" + "\n".join(renglones[:MAX_RENGLONES]) + extra


def resumen_del_dia():
    """Texto del resumen (necesita contexto de la app para consultar la BD)."""
    from comun import q

    hoy = date.today()
    vencidos = q(
        """SELECT v.folio, v.nombre_trabajador, v.fecha_devolucion, a.nombre_almacen, COUNT(*) AS piezas
           FROM vale v JOIN vale_detalle d ON d.id_vale = v.id_vale JOIN catalogo c ON c.id_catalogo = d.id_catalogo
           JOIN almacen a ON a.id_almacen = v.id_almacen
           WHERE v.tipo = 'ENTREGA' AND v.devuelto_en IS NULL AND c.tipo_retorno = 'Devolutivo' AND v.fecha_devolucion < :hoy
           GROUP BY v.id_vale, v.folio, v.nombre_trabajador, v.fecha_devolucion, a.nombre_almacen
           ORDER BY v.fecha_devolucion""",
        hoy=hoy,
    )
    certificaciones = q(
        """SELECT serie, nombre, nombre_almacen, certificacion_vence, dias, estado FROM v_certificaciones
           WHERE estado <> 'vigente' ORDER BY certificacion_vence"""
    )
    por_reponer = q(
        """SELECT a.nombre_almacen, c.clave, c.nombre, c.stock_minimo,
                  COALESCE(ind.n, 0) + COALESCE(gr.n, 0) AS disponibles
           FROM catalogo c CROSS JOIN almacen a
           LEFT JOIN (SELECT id_almacen, id_catalogo, COUNT(*) AS n FROM inventario_almacen_individual
                      WHERE estatus = 'disponible' AND (certificacion_vence IS NULL OR certificacion_vence >= CURDATE())
                      GROUP BY id_almacen, id_catalogo) ind ON ind.id_almacen = a.id_almacen AND ind.id_catalogo = c.id_catalogo
           LEFT JOIN (SELECT id_almacen, id_catalogo, SUM(cantidad) AS n FROM inventario_almacen_conjunto
                      GROUP BY id_almacen, id_catalogo) gr ON gr.id_almacen = a.id_almacen AND gr.id_catalogo = c.id_catalogo
           WHERE a.activo AND (EXISTS (SELECT 1 FROM inventario_almacen_individual x WHERE x.id_almacen = a.id_almacen AND x.id_catalogo = c.id_catalogo AND x.estatus <> 'baja')
                  OR EXISTS (SELECT 1 FROM inventario_almacen_conjunto y WHERE y.id_almacen = a.id_almacen AND y.id_catalogo = c.id_catalogo))
           HAVING disponibles <= c.stock_minimo
           ORDER BY a.nombre_almacen, c.nombre"""
    )

    partes = [f"☀️ <b>Resumen de almacenes · {hoy:%d/%m/%Y}</b>"]
    if not (vencidos or certificaciones or por_reponer):
        partes.append("\n\n✅ Todo en orden: sin préstamos vencidos, certificaciones al día y sin faltantes.")
    partes.append(_lista(
        f"⏰ Préstamos vencidos ({len(vencidos)})",
        [f"• <code>{e(v.folio)}</code> {e(v.nombre_trabajador)} · {e(v.nombre_almacen)} · "
         f"{(hoy - v.fecha_devolucion).days} día(s) de retraso" for v in vencidos],
    ))
    partes.append(_lista(
        f"🛡️ Certificaciones ({len(certificaciones)})",
        [f"• <code>{e(c.serie)}</code> {e(c.nombre)} · {e(c.nombre_almacen)} · "
         + (f"<b>vencida</b> hace {-c.dias} día(s): no se presta" if c.estado == "vencida" else f"vence en {c.dias} día(s)")
         for c in certificaciones],
    ))
    partes.append(_lista(
        f"📉 Por reponer ({len(por_reponer)})",
        [f"• {e(p.nombre)} · {e(p.nombre_almacen)}: {int(p.disponibles)} disponibles (mín. {p.stock_minimo})" for p in por_reponer],
    ))
    return "".join(partes)


def _ultimo_resumen():
    try:
        return json.loads(ESTADO.read_text(encoding="utf-8")).get("ultimo_resumen")
    except (OSError, ValueError):
        return None


def _marcar_resumen(dia):
    try:
        ESTADO.write_text(json.dumps({"ultimo_resumen": dia}), encoding="utf-8")
    except OSError as err:
        print(f"[telegram] No se pudo guardar {ESTADO.name}: {err}")


def iniciar_resumen_diario(app):
    """Hilo que manda el resumen una vez al día, a la hora de TELEGRAM_HORA_RESUMEN."""
    if not configurado():
        print("[telegram] Alertas desactivadas: falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en .env")
        return
    # Con FLASK_DEBUG=1 Flask arranca dos procesos: el hilo solo va en el que atiende peticiones
    if app.debug and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return
    try:
        hora = datetime.strptime(os.environ.get("TELEGRAM_HORA_RESUMEN", "08:00"), "%H:%M").time()
    except ValueError:
        hora = datetime.strptime("08:00", "%H:%M").time()

    def ciclo():
        while True:
            ahora = datetime.now()
            hoy = ahora.date().isoformat()
            if ahora.time() >= hora and _ultimo_resumen() != hoy:
                try:
                    with app.app_context():
                        texto = resumen_del_dia()
                    ok, detalle = enviar(texto)
                    print(f"[telegram] Resumen del día: {detalle}")
                    if ok:
                        _marcar_resumen(hoy)
                except Exception as err:  # noqa: BLE001 - que el hilo no muera
                    print(f"[telegram] Error al armar el resumen: {err}")
            time.sleep(60)

    threading.Thread(target=ciclo, daemon=True, name="resumen-telegram").start()
    print(f"[telegram] Resumen diario activo a las {hora:%H:%M}")


# ---------------------------------------------------------------------
# Línea de comandos
# ---------------------------------------------------------------------
def _grupos_del_bot():
    grupos = {}
    for u in _api("getUpdates", timeout=15).get("result", []):
        for k in ("message", "my_chat_member", "edited_message", "channel_post"):
            chat = (u.get(k) or {}).get("chat")
            if chat and chat.get("type") in ("group", "supergroup"):
                grupos[str(chat["id"])] = chat.get("title") or "(sin nombre)"
    return grupos


def _guardar_grupo(chat_id):
    env = AQUI / ".env"
    lineas = env.read_text(encoding="utf-8").splitlines()
    nuevas = [f"TELEGRAM_CHAT_ID={chat_id}" if l.startswith("TELEGRAM_CHAT_ID=") else l for l in lineas]
    if not any(l.startswith("TELEGRAM_CHAT_ID=") for l in lineas):
        nuevas.append(f"TELEGRAM_CHAT_ID={chat_id}")
    env.write_text("\n".join(nuevas) + "\n", encoding="utf-8")
    os.environ["TELEGRAM_CHAT_ID"] = chat_id


if __name__ == "__main__":
    import sys

    from dotenv import load_dotenv

    load_dotenv(AQUI / ".env")
    if not _token():
        sys.exit("Falta TELEGRAM_BOT_TOKEN en backend/.env")
    opcion = sys.argv[1] if len(sys.argv) > 1 else "--grupos"

    if opcion == "--grupos":
        bot = _api("getMe")["result"]
        print(f"Bot: {bot['first_name']} (@{bot['username']})")
        grupos = _grupos_del_bot()
        if not grupos:
            print("\nTodavía no veo ningún grupo. En Telegram:\n"
                  f"  1. Agrega a @{bot['username']} al grupo.\n"
                  "  2. Escribe en el grupo:  /start\n"
                  "  3. Vuelve a correr:  python telegram_alertas.py --grupos")
            sys.exit(1)
        lista = list(grupos.items())
        for i, (chat_id, titulo) in enumerate(lista, 1):
            print(f"  {i}. {titulo}  ({chat_id})")
        elegido = lista[0][0] if len(lista) == 1 else lista[int(input("¿Cuál grupo? (número): ")) - 1][0]
        _guardar_grupo(elegido)
        print(f"\nGuardado TELEGRAM_CHAT_ID={elegido} en .env")
        ok, detalle = enviar("✅ <b>Alertas IMHOTEP conectadas</b>\nAquí llegarán los avisos de los almacenes.")
        print(detalle)
    elif opcion == "--prueba":
        print(enviar("🔔 <b>Prueba</b> de alertas IMHOTEP: si ves esto, el bot ya funciona.")[1])
    elif opcion == "--resumen":
        from app import app

        with app.app_context():
            texto = resumen_del_dia()
        print(enviar(texto)[1])
    else:
        print(__doc__ or "Opciones: --grupos | --prueba | --resumen")
