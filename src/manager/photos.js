import { useEffect, useState } from 'react'
import { getPhoto } from '../api'

// Photos reach managers only through the server (getPhoto checks the role and
// division), so nobody needs access to the Drive folder. Thumbnails come in
// batches; both are cached for the session.
const thumbs = new Map() // photoId -> data URL | '' (none)
const full = new Map()
let wanted = new Set()
let timer = null
const subs = new Set()

function flush() {
  timer = null
  const ids = [...wanted].filter((id) => !thumbs.has(id))
  wanted = new Set()
  if (!ids.length) return
  ids.forEach((id) => thumbs.set(id, null))
  for (let i = 0; i < ids.length; i += 40) {
    const part = ids.slice(i, i + 40)
    getPhoto({ ids: part, thumb: true })
      .then((d) => {
        part.forEach((id) => thumbs.set(id, d.photos?.[id] ? `data:image/jpeg;base64,${d.photos[id]}` : ''))
        subs.forEach((fn) => fn())
      })
      .catch(() => {
        part.forEach((id) => thumbs.delete(id))
      })
  }
}

export function useThumb(id) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!id) return
    const fn = () => tick((n) => n + 1)
    subs.add(fn)
    if (!thumbs.has(id)) {
      wanted.add(id)
      if (!timer) timer = setTimeout(flush, 30)
    }
    return () => subs.delete(fn)
  }, [id])
  return id ? thumbs.get(id) : ''
}

export function useFullPhoto(id) {
  const [state, setState] = useState(() => (id && full.has(id) ? { url: full.get(id) } : { url: null }))
  useEffect(() => {
    if (!id) return
    if (full.has(id)) return setState({ url: full.get(id) })
    let live = true
    getPhoto({ id })
      .then((d) => {
        const url = `data:${d.mime || 'image/jpeg'};base64,${d.data}`
        full.set(id, url)
        if (live) setState({ url })
      })
      .catch((err) => live && setState({ url: null, error: err.message }))
    return () => {
      live = false
    }
  }, [id])
  return state
}
