/**
 * Shrinks a picked or shared photo down to something a Firestore document can
 * comfortably hold.
 *
 * Firestore caps a single document at 1 MiB, and that ceiling covers the whole
 * document, not just the blob — so the budget here is deliberately well under
 * it. Everything is re-encoded as JPEG regardless of what came in: a phone
 * camera PNG of a receipt is many times larger than the equivalent JPEG for no
 * visible gain, and JPEG is the one format every target browser can both decode
 * and encode.
 */

/** Comfortably inside Firestore's 1 MiB document ceiling. */
export const RECEIPT_MAX_BYTES = 500_000

/** Long edge, in CSS pixels. Plenty to read the printed total on a receipt. */
const MAX_EDGE = 1600

/** Tried in order; the first result inside the budget wins. */
const QUALITIES = [0.82, 0.72, 0.62, 0.5, 0.4]

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
}

type Source = ImageBitmap | HTMLImageElement

/**
 * createImageBitmap handles EXIF orientation and is far cheaper on memory, but
 * it rejects formats the browser cannot decode (an iPhone HEIC shared to an
 * Android build, say), so an <img> decode stands behind it.
 */
async function decodeImage(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Fall through to the <img> path below.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('That file could not be read as an image.'))
      img.src = url
    })
  } finally {
    // Safe once the image has loaded — the decoded bitmap no longer needs the URL.
    URL.revokeObjectURL(url)
  }
}

const sizeOf = (source: Source) =>
  source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))

/** Draws the source onto a fresh canvas scaled so its long edge is at most `edge`. */
function drawScaled(source: Source, edge: number) {
  const { width, height } = sizeOf(source)
  const scale = Math.min(1, edge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser could not process the image.')
  // White ground, so a transparent PNG does not turn black once flattened to JPEG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Re-encodes `file` as a JPEG no larger than `maxBytes`, trading quality first
 * and dimensions only once quality alone is not enough.
 *
 * Throws if even the smallest attempt overshoots, so the caller reports a clear
 * error rather than handing Firestore a write it will reject.
 */
export async function compressImage(
  file: Blob,
  maxBytes = RECEIPT_MAX_BYTES,
): Promise<CompressedImage> {
  const source = await decodeImage(file)

  try {
    let edge = MAX_EDGE
    let smallest: Blob | null = null

    // Each round drops the long edge by 30%; four rounds reach ~550px, which is
    // past the point where a receipt is still worth keeping.
    for (let round = 0; round < 4; round++) {
      const canvas = drawScaled(source, edge)

      for (const quality of QUALITIES) {
        const blob = await toBlob(canvas, quality)
        if (!blob) continue
        if (blob.size <= maxBytes) {
          return { blob, width: canvas.width, height: canvas.height }
        }
        if (!smallest || blob.size < smallest.size) smallest = blob
      }

      edge = Math.round(edge * 0.7)
    }

    throw new Error(
      smallest
        ? `That image is too detailed to store (${Math.round(smallest.size / 1024)} KB at the ` +
          `lowest quality, limit ${Math.round(maxBytes / 1024)} KB). Try a tighter crop.`
        : 'That image could not be compressed.',
    )
  } finally {
    if ('close' in source) source.close()
  }
}
