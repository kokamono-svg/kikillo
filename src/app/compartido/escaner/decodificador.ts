// =====================================================================
// decodificador.ts
// Lee códigos QR y de barras de una imagen (cuadro del video o foto).
//   - Si el navegador trae lector propio (BarcodeDetector: Android, Mac,
//     ChromeOS) se usa ese: es rápido y no descarga nada.
//   - Si no (Windows, Firefox, iPhone), se usa ZXing. Se carga solo la
//     primera vez que se abre la cámara y funciona sin internet.
// =====================================================================

/** Devuelve el texto del código o null si no encontró ninguno. */
export type Decodificar = (fuente: HTMLVideoElement | ImageBitmap) => Promise<string | null>;

/** QR (credenciales) y CODE128 (etiquetas) más los formatos comunes de fábrica. */
const FORMATOS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'itf', 'data_matrix', 'pdf417'];

/** Lado mayor con el que se analiza la imagen: más grande = más lento. */
const LADO_VIDEO = 1280;
const LADO_FOTO = 1800;

interface DetectorNativo {
  detect(fuente: HTMLVideoElement | ImageBitmap): Promise<{ rawValue: string }[]>;
}
interface ClaseDetector {
  new (opciones: { formats: string[] }): DetectorNativo;
  getSupportedFormats(): Promise<string[]>;
}

let enCurso: Promise<Decodificar> | null = null;

/** Prepara el lector una sola vez por sesión. */
export function crearDecodificador(): Promise<Decodificar> {
  enCurso ??= nativo()
    .then((d) => d ?? zxing())
    .catch((e) => {
      enCurso = null; // si falló la carga, se puede reintentar
      throw e;
    });
  return enCurso;
}

async function nativo(): Promise<Decodificar | null> {
  const Detector = (globalThis as unknown as { BarcodeDetector?: ClaseDetector }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const soportados = await Detector.getSupportedFormats();
    // Sin QR o sin CODE128 no sirve para la app: mejor ZXing
    if (!soportados.includes('qr_code') || !soportados.includes('code_128')) return null;
    const detector = new Detector({ formats: FORMATOS.filter((f) => soportados.includes(f)) });
    return async (fuente) => (await detector.detect(fuente))[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

async function zxing(): Promise<Decodificar> {
  const z = await import('@zxing/library');
  const F = z.BarcodeFormat;
  const pistas = new Map<import('@zxing/library').DecodeHintType, unknown>([
    [z.DecodeHintType.POSSIBLE_FORMATS, [F.QR_CODE, F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8, F.UPC_A, F.ITF, F.DATA_MATRIX, F.PDF_417]],
    [z.DecodeHintType.TRY_HARDER, true],
  ]);
  const lector = new z.MultiFormatReader();
  lector.setHints(pistas);
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Sin canvas');

  return async (fuente) => {
    const esVideo = fuente instanceof HTMLVideoElement;
    const ancho = esVideo ? fuente.videoWidth : fuente.width;
    const alto = esVideo ? fuente.videoHeight : fuente.height;
    if (!ancho || !alto) return null;
    const escala = Math.min(1, (esVideo ? LADO_VIDEO : LADO_FOTO) / Math.max(ancho, alto));
    lienzo.width = Math.round(ancho * escala);
    lienzo.height = Math.round(alto * escala);
    ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
    try {
      const imagen = new z.BinaryBitmap(new z.HybridBinarizer(new z.HTMLCanvasElementLuminanceSource(lienzo)));
      return lector.decodeWithState(imagen).getText();
    } catch {
      return null; // no hay código en este cuadro (o salió borroso)
    } finally {
      lector.reset();
    }
  };
}

/** Lee el código de una foto (plan B cuando no se puede usar la cámara en vivo). */
export async function leerDeFoto(archivo: File): Promise<string | null> {
  const decodificar = await crearDecodificador();
  const imagen = await createImageBitmap(archivo);
  try {
    return await decodificar(imagen);
  } finally {
    imagen.close();
  }
}

/** Pitido corto + vibración al leer un código (como las pistolas). */
let audio: AudioContext | null = null;
export function avisoLectura(): void {
  try {
    navigator.vibrate?.(60);
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    osc.frequency.value = 1200;
    vol.gain.value = 0.08;
    osc.connect(vol).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.09);
  } catch {
    // sin audio no pasa nada
  }
}
