// BarcodeDetector is Chromium (macOS/Android) and Safari only and not in the TS DOM lib yet
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => {
  detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]>
}
const BarcodeDetectorApi = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector

let canvas: HTMLCanvasElement | undefined

/** Decode every QR code found in an image or video frame. Falls back to jsQR (one code) where BarcodeDetector is missing. */
export async function readQrCodes(src: Blob | HTMLVideoElement): Promise<string[]> {
  if (BarcodeDetectorApi) {
    try {
      const image = src instanceof Blob ? await createImageBitmap(src) : src
      const found = await new BarcodeDetectorApi({ formats: ['qr_code'] }).detect(image)
      return found.map(b => b.rawValue)
    } catch {
      /* some platforms expose the API but have no QR backend — use jsQR */
    }
  }

  const image = src instanceof Blob ? await createImageBitmap(src) : src
  const width = image instanceof HTMLVideoElement ? image.videoWidth : image.width
  const height = image instanceof HTMLVideoElement ? image.videoHeight : image.height
  if (!width || !height) return []

  canvas ??= document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0)
  const { default: jsQR } = await import('jsqr')
  const result = jsQR(ctx.getImageData(0, 0, width, height).data, width, height)
  return result ? [result.data] : []
}
