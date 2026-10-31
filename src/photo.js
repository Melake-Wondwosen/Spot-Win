import { PHOTO_MAX_SIDE, PHOTO_QUALITY, PHOTO_TARGET_KB, THUMB_SIDE } from './config'

// Photos are shrunk on the phone before they are stored or sent: long side at
// most 1600 px, JPEG at about 0.7, under 400 KB. A SHA-256 of the original
// file is taken first, so the server can spot the same receipt sent twice.

export async function sha256(file) {
  const buf = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall back to an <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function canvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function toBlob(c, quality) {
  if (c.convertToBlob) return c.convertToBlob({ type: 'image/jpeg', quality })
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', quality))
}

// Date and time, Outlet ID and user name, burned into the bottom corner
function drawStamp(ctx, w, h, lines) {
  const size = Math.max(14, Math.round(Math.min(w, h) * 0.032))
  const pad = Math.round(size * 0.7)
  const lh = Math.round(size * 1.3)
  ctx.font = `600 ${size}px Calibri, "Segoe UI", Roboto, sans-serif`
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width))
  const boxW = Math.ceil(textW + pad * 2 + size * 0.4)
  const boxH = lh * lines.length + pad * 1.4
  const x = w - boxW - pad
  const y = h - boxH - pad
  ctx.fillStyle = 'rgba(0,0,0,0.62)'
  const r = size * 0.5
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r)
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r)
  ctx.arcTo(x, y + boxH, x, y, r)
  ctx.arcTo(x, y, x + boxW, y, r)
  ctx.fill()
  ctx.fillStyle = '#c9a24a'
  ctx.fillRect(x, y + r, Math.max(3, size * 0.18), boxH - r * 2)
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? '#e7cf8a' : '#ffffff'
    ctx.fillText(l, x + pad + size * 0.3, y + pad * 0.7 + i * lh)
  })
}

function draw(img, side, stamp) {
  const scale = Math.min(1, side / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  if (stamp?.length) drawStamp(ctx, w, h, stamp)
  return c
}

export async function processPhoto(file, stamp) {
  const [hash, img] = await Promise.all([sha256(file), decode(file)])
  let side = PHOTO_MAX_SIDE
  let blob = null
  // Step quality down, then size, until it fits the target
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = draw(img, side, stamp)
    for (const q of [PHOTO_QUALITY, 0.6, 0.5]) {
      blob = await toBlob(c, q)
      if (blob.size <= PHOTO_TARGET_KB * 1024) break
    }
    if (blob.size <= PHOTO_TARGET_KB * 1024) break
    side = Math.round(side * 0.82)
  }
  const thumb = await toBlob(draw(img, THUMB_SIDE, null), 0.6)
  img.close?.()
  return { blob, thumb, hash, sizeKb: Math.round(blob.size / 1024) }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
