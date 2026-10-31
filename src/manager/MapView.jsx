import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { text } from './calc'
import { DEMO } from '../config'
import { amountText, initials } from '../components/ui'
import { dateTime, time } from '../time'

const ADDIS = [9.0108, 38.7613]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function userIcon(u, selected) {
  const bg = u.online ? '#c9a24a' : '#000'
  return L.divIcon({
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="width:36px;height:36px;border-radius:50%;background:${bg};color:${u.online ? '#000' : '#c9a24a'};font:700 12px/30px Calibri,system-ui,sans-serif;text-align:center;border:3px solid ${selected ? '#c9a24a' : '#fff'};box-shadow:0 2px 8px rgba(0,0,0,.35);transform:scale(${selected ? 1.15 : 1});transition:transform .3s">${esc(initials(u.name))}</div>`,
  })
}

export function addTiles(map) {
  if (DEMO) return
  // OpenStreetMap's own tiles: no API key needed
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)
}

export const demoGrid = DEMO
  ? { background: '#fafafa linear-gradient(rgba(0,0,0,.05) 1px, transparent 1px) 0 0 / 40px 40px, linear-gradient(90deg, rgba(0,0,0,.05) 1px, transparent 1px) 0 0 / 40px 40px' }
  : undefined

export default function MapView({ team, visits, selectedId, onSelect, onVisit, now }) {
  const box = useRef(null)
  const map = useRef(null)
  const layers = useRef(null)
  const fitted = useRef(false)

  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: true, attributionControl: true, preferCanvas: true }).setView(ADDIS, 12)
    addTiles(map.current)
    layers.current = L.layerGroup().addTo(map.current)
    return () => map.current.remove()
  }, [])

  useEffect(() => {
    const g = layers.current
    g.clearLayers()
    const bounds = []

    visits.forEach((v) => {
      const lat = Number(v.lat)
      const lng = Number(v.lng)
      if (!v.lat || !v.lng || isNaN(lat) || isNaN(lng)) return
      bounds.push([lat, lng])
      L.circleMarker([lat, lng], { radius: 6, color: '#8f6b1e', weight: 1.5, fillColor: '#c9a24a', fillOpacity: 0.9 })
        .bindTooltip(`<b>${esc(text(v.outletName))}</b> ${esc(text(v.outletId))}<br>${esc(text(v.userName))} · ${esc(dateTime(v.date))}<br>${esc(amountText(text(v.investmentUnit), v.amount))}`)
        .on('click', () => onVisit?.(text(v.id)))
        .addTo(g)
    })

    const sel = team.find((u) => u.id === selectedId)
    if (sel && sel.track.length > 1) {
      L.polyline(sel.track.map((p) => [p.lat, p.lng]), { color: '#000', weight: 3, opacity: 0.75, dashArray: '6 7' }).addTo(g)
      sel.track.forEach((p) =>
        L.circleMarker([p.lat, p.lng], { radius: 3, color: '#000', weight: 1, fillOpacity: 0.6 })
          .bindTooltip(`${time(p.date)} · ${esc(p.activity)}`)
          .addTo(g),
      )
    }

    team.forEach((u) => {
      if (u.lat == null || u.lng == null) return
      bounds.push([u.lat, u.lng])
      L.marker([u.lat, u.lng], { icon: userIcon(u, u.id === selectedId), zIndexOffset: u.online ? 1000 : 500 })
        .bindTooltip(`<b>${esc(u.name)}</b><br>${esc(u.activity || '')}`, { direction: 'top', offset: [0, -18] })
        .on('click', () => onSelect(u.id === selectedId ? null : u.id))
        .addTo(g)
    })

    if (!fitted.current && bounds.length) {
      map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
      fitted.current = true
    }
  }, [team, visits, selectedId, now])

  // Fly to a user picked from the list
  useEffect(() => {
    const sel = team.find((u) => u.id === selectedId)
    if (!sel) return
    const pts = sel.track.map((p) => [p.lat, p.lng])
    if (sel.lat != null) pts.push([sel.lat, sel.lng])
    if (pts.length > 1) map.current.flyToBounds(pts, { padding: [40, 40], maxZoom: 16, duration: 0.8 })
    else if (pts.length) map.current.flyTo(pts[0], 15, { duration: 0.8 })
  }, [selectedId])

  return <div ref={box} className="w-full h-full min-h-[320px] rounded-2xl overflow-hidden z-0" style={demoGrid} />
}

// Start and finish positions of one visit, and the outlet if it has coordinates
export function VisitMap({ start, finish, outlet }) {
  const box = useRef(null)
  useEffect(() => {
    const m = L.map(box.current, { zoomControl: false, attributionControl: !DEMO, preferCanvas: true }).setView(ADDIS, 15)
    addTiles(m)
    const pts = []
    const dot = (p, color, label, r = 7) => {
      if (!p || p.lat == null || p.lng == null) return
      pts.push([p.lat, p.lng])
      L.circleMarker([p.lat, p.lng], { radius: r, color: '#000', weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -8] }).addTo(m)
    }
    dot(outlet, '#ffffff', 'Outlet', 6)
    dot(start, '#000000', 'Start')
    dot(finish, '#c9a24a', 'Finish')
    if (pts.length > 1) m.fitBounds(pts, { padding: [36, 36], maxZoom: 18 })
    else if (pts.length) m.setView(pts[0], 17)
    return () => m.remove()
  }, [])
  return <div ref={box} className="w-full h-56 rounded-2xl overflow-hidden z-0 border border-ink/10" style={demoGrid} />
}
