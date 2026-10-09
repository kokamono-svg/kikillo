/** Lado más largo de una foto ya reducida, en píxeles. */
const LADO_MAXIMO = 1280;

/**
 * Dibuja una imagen o un cuadro de video en un lienzo de máximo LADO_MAXIMO px
 * y lo regresa como JPEG en base64: una foto de celular pasa de ~4 MB a ~150 KB.
 */
function aJpeg(fuente: CanvasImageSource, ancho: number, alto: number): string {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  lienzo.getContext('2d')!.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL('image/jpeg', 0.7);
}

/** Foto elegida de la galería (o del explorador de archivos) → JPEG reducido. */
export async function reducirFoto(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return aJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lo que se ve ahora mismo en la cámara → JPEG reducido. */
export function fotoDesdeVideo(video: HTMLVideoElement): string {
  return aJpeg(video, video.videoWidth, video.videoHeight);
}
