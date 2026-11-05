import { PHOTO_MAX_SIDE, PHOTO_QUALITY, PHOTO_TARGET_KB, THUMB_SIDE } from './config'

// Photos are shrunk on the phone before they are stored or sent: long side at
// most 1600 px, JPEG at about 0.7, under 400 KB. A SHA-256 of the original
// file is taken first, so the server can spot the same receipt sent twice.

export async function sha256(data) {
  const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', heic: 'image/heic' }

// What the bytes really are, whatever the file name says
function sniff(u) {
  if (u[0] === 0xff && u[1] === 0xd8) return 'jpeg'
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return 'png'
  if (u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) return 'gif'
  const str = (a, b) => String.fromCharCode(...u.subarray(a, b))
  if (str(0, 4) === 'RIFF' && str(8, 12) === 'WEBP') return 'webp'
  if (str(4, 8) === 'ftyp') {
    const end = Math.min(u.length, 64, ((u[0] << 24) | (u[1] << 16) | (u[2] << 8) | u[3]) >>> 0)
    const brands = [str(8, 12)]
    for (let i = 16; i + 4 <= end; i += 4) brands.push(str(i, i + 4))
    if (brands.some((b) => b === 'avif' || b === 'avis')) return 'avif'
    if (brands.some((b) => /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(b))) return 'heic'
  }
  return ''
}

// A JPEG is whole once its end marker comes after the image data
function jpegWhole(u) {
  let i = 2
  while (i + 4 <= u.length && u[i] === 0xff) {
    const m = u[i + 1]
    if (m === 0xda) break
    if (m === 0xff) i += 1
    else if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) i += 2
    else i += 2 + ((u[i + 2] << 8) | u[i + 3])
  }
  if (i + 4 > u.length || u[i] !== 0xff) return false
  for (let j = u.length - 2; j > i; j--) if (u[j] === 0xff && u[j + 1] === 0xd9) return true
  return false
}

async function asBitmap(blob) {
  if (typeof createImageBitmap !== 'function') return null
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch (e) {
    // Older browsers don't know the option; anything else means it couldn't decode
    if (e?.name !== 'TypeError') return null
  }
  try {
    return await createImageBitmap(blob)
  } catch {
    return null
  }
}

function asImage(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    const done = (ok) => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(ok && img.naturalWidth ? img : null)
    }
    const timer = setTimeout(() => done(false), 20000)
    img.onload = () => done(true)
    img.onerror = () => done(false)
    img.src = url
  })
}

function photoError(message) {
  const e = new Error(message)
  e.photo = true
  return e
}

const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

// Some phone cameras hand the photo over before they have finished saving it,
// so an empty or half-written file is read again for about 4 seconds before
// giving up. The bytes are copied into memory once, so the hash and the
// picture always come from the same complete file.
async function readPhoto(file) {
  const waits = [0, 300, 600, 1000, 2000]
  let size = 0
  let kind = ''
  for (let i = 0; i < waits.length; i++) {
    if (waits[i]) await sleep(waits[i])
    const last = i === waits.length - 1
    let buf
    try {
      buf = await file.arrayBuffer()
    } catch {
      continue
    }
    const u = new Uint8Array(buf)
    size = u.length
    kind = sniff(u)
    if (!size) continue
    const blob = new Blob([buf], { type: MIME[kind] || file.type || 'image/jpeg' })
    const bitmap = await asBitmap(blob)
    if (bitmap) return { img: bitmap, buf }
    // A half-written JPEG would open with its bottom missing, so wait for the rest
    if (kind === 'jpeg' && !last && !jpegWhole(u)) continue
    const img = await asImage(blob)
    if (img) return { img, buf }
    if (kind === 'heic') break
  }
  if (!size) throw photoError('The camera did not send the photo back. Take it again in the normal Photo mode.')
  if (kind === 'heic') throw photoError('This camera saves photos as HEIC, which Spot Win cannot open. Turn off HEIF (high efficiency pictures) in the camera settings, then take it again.')
  throw photoError(`Could not open that photo (${kind ? kind.toUpperCase() : 'unknown format'}, ${sizeText(size)}). Take it again.`)
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
  const { img, buf } = await readPhoto(file)
  const hash = await sha256(buf)
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
