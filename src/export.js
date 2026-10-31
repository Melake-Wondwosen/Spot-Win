import { exportPage } from './api'
import { getUser } from './storage'
import { dateYear, isoDay, time } from './time'

// Builds the Excel file on the phone or laptop. The server sends the rows that
// match the filters (division-limited for managers) in pages of 2,000.
// SheetJS writes the workbook; the header style and frozen row are then added
// to the file's XML, since the free SheetJS build doesn't write styles.

const ADDIS_MS = 3 * 3600 * 1000
// Excel date serial for an instant, in Addis time
const serial = (iso) => {
  const t = new Date(iso).getTime()
  return isNaN(t) ? null : (t + ADDIS_MS) / 864e5 + 25569
}
const n = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v))
const t = (v) => String(v ?? '').replace(/^'/, '')

const COLUMNS = [
  ['Visit ID', 26, (r) => s(r.id)],
  ['Status', 8, (r) => s(r.status || 'Saved')],
  ['Date', 12, (r) => d(r.date, 'yyyy-mm-dd', true)],
  ['Start time', 10, (r) => d(r.startedAt, 'hh:mm')],
  ['Finish time', 10, (r) => d(r.date, 'hh:mm')],
  ['Minutes at outlet', 10, (r) => {
    const a = new Date(r.startedAt).getTime()
    const b = new Date(r.date).getTime()
    return isNaN(a) || isNaN(b) ? null : num(Math.round(((b - a) / 60000) * 10) / 10, '0.0')
  }],
  ['Staff ID', 12, (r) => s(r.staffId)],
  ['User name', 22, (r) => s(r.userName)],
  ['Outlet ID', 12, (r) => s(r.outletId)],
  ['Outlet name', 28, (r) => s(r.outletName)],
  ['Division', 16, (r) => s(r.division)],
  ['Agent', 24, (r) => s(r.agent)],
  ['Parent territory', 22, (r) => s(r.parentTerritory)],
  ['Territory', 22, (r) => s(r.territory)],
  ['Activity', 26, (r) => s(r.activity)],
  ['Investment unit', 10, (r) => s(r.investmentUnit)],
  ['Investment (Birr)', 14, (r) => (t(r.investmentUnit) === 'Crate' ? null : num(n(r.amount), '#,##0.00'))],
  ['Investment (crates)', 12, (r) => (t(r.investmentUnit) === 'Crate' ? num(n(r.amount), '#,##0') : null)],
  ['Receipt photo', 12, (r) => link(r.receiptUrl, 'Open receipt')],
  ['Receipt source', 10, (r) => s(t(r.receiptSource) === 'gallery' ? 'Gallery' : t(r.receiptSource) ? 'Camera' : '')],
  ['Engagement photo', 14, (r) => link(r.engagementUrl, 'Open photo')],
  ['Start latitude', 11, (r) => num(n(r.startLat), '0.000000')],
  ['Start longitude', 11, (r) => num(n(r.startLng), '0.000000')],
  ['Finish latitude', 11, (r) => num(n(r.lat), '0.000000')],
  ['Finish longitude', 11, (r) => num(n(r.lng), '0.000000')],
  ['Accuracy (m)', 10, (r) => num(n(r.accuracy), '0')],
  ['Distance from outlet (m)', 12, (r) => num(n(r.distanceM), '#,##0')],
  ['Alerts', 30, (r) => s(r.alerts)],
  ['Void reason', 24, (r) => s(r.voidReason)],
  ['Voided by', 16, (r) => s(r.voidBy)],
]
function s(v) {
  const x = t(v)
  return x ? { t: 's', v: x } : null
}
function num(v, z) {
  return v == null ? null : { t: 'n', v, z }
}
function d(iso, z, dayOnly) {
  const v = serial(iso)
  return v == null ? null : { t: 'n', v: dayOnly ? Math.floor(v) : v, z }
}
function link(url, label) {
  const u = t(url)
  return u ? { t: 's', v: label, l: { Target: u, Tooltip: u } } : null
}

const addr = (XLSX, r, c) => XLSX.utils.encode_cell({ r, c })

function sheetFrom(XLSX, rows, widths) {
  const ws = {}
  let maxC = 0
  rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell == null) return
      ws[addr(XLSX, r, c)] = typeof cell === 'object' ? cell : typeof cell === 'number' ? { t: 'n', v: cell } : { t: 's', v: String(cell) }
      maxC = Math.max(maxC, c)
    }),
  )
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: maxC } })
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }))
  return ws
}

function summaryRows(rows) {
  const saved = rows.filter((r) => t(r.status).toLowerCase() !== 'void')
  const group = (key) => {
    const m = new Map()
    for (const r of saved) {
      const k = t(r[key]) || 'Not set'
      const g = m.get(k) || { visits: 0, birr: 0, crates: 0 }
      g.visits++
      if (t(r.investmentUnit) === 'Crate') g.crates += n(r.amount) || 0
      else g.birr += n(r.amount) || 0
      m.set(k, g)
    }
    return [...m.entries()].sort((a, b) => b[1].birr - a[1].birr)
  }
  const out = []
  const bold = []
  const block = (title, key) => {
    bold.push(out.length)
    out.push([title, 'Visits', 'Birr', 'Crates'])
    let tv = 0, tb = 0, tc = 0
    for (const [k, g] of group(key)) {
      out.push([k, g.visits, num(g.birr, '#,##0.00'), num(g.crates, '#,##0')])
      tv += g.visits
      tb += g.birr
      tc += g.crates
    }
    bold.push(out.length)
    out.push(['Total', tv, num(tb, '#,##0.00'), num(tc, '#,##0')])
    out.push([])
  }
  block('Division', 'division')
  block('Activity', 'activity')
  return { out, bold }
}

/* ---- XML touch-up: bold gold header, frozen first row, link style ---- */
function patch(files, plan) {
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let styles = dec.decode(files['xl/styles.xml'])
  const count = (tag) => Number((styles.match(new RegExp(`<${tag} count="(\\d+)"`)) || [])[1] || 0)
  const fonts = count('fonts')
  const fills = count('fills')
  const xfs = count('cellXfs')
  styles = styles
    .replace(/<fonts count="\d+">([\s\S]*?)<\/fonts>/, (m, inner) => `<fonts count="${fonts + 2}">${inner}<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font><font><u/><sz val="11"/><color rgb="FF8F6B1E"/><name val="Calibri"/><family val="2"/></font></fonts>`)
    .replace(/<fills count="\d+">([\s\S]*?)<\/fills>/, (m, inner) => `<fills count="${fills + 1}">${inner}<fill><patternFill patternType="solid"><fgColor rgb="FFC9A24A"/><bgColor indexed="64"/></patternFill></fill></fills>`)
    .replace(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/, (m, inner) => `<cellXfs count="${xfs + 2}">${inner}<xf numFmtId="0" fontId="${fonts}" fillId="${fills}" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="${fonts + 1}" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`)
  files['xl/styles.xml'] = enc.encode(styles)
  const HEAD = xfs
  const LINK = xfs + 1

  plan.forEach((p, i) => {
    const path = `xl/worksheets/sheet${i + 1}.xml`
    let xml = dec.decode(files[path])
    const rows = new Set(p.boldRows.map((r) => r + 1))
    xml = xml.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(\/?)>/g, (m, col, row, attrs, close) => {
      const isHead = rows.has(Number(row))
      const isLink = p.linkCols?.includes(col) && Number(row) > 1
      if (!isHead && !isLink) return m
      return `<c r="${col}${row}"${attrs.replace(/ s="\d+"/, '')} s="${isHead ? HEAD : LINK}"${close}>`
    })
    if (p.freeze) {
      xml = xml.replace(/<sheetView workbookViewId="0"\s*\/>/, '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>')
    }
    files[path] = enc.encode(xml)
  })
  return files
}

export async function exportVisits(filters, onProgress = () => {}, meta = {}) {
  onProgress('Preparing visits...')
  const rows = []
  let page = 0
  let total = 0
  for (;;) {
    const d = await exportPage(filters, page)
    total = d.total || 0
    rows.push(...(d.rows || []))
    onProgress(`Preparing ${total.toLocaleString()} visits...`)
    if (page + 1 >= (d.pages || 1)) break
    page++
  }

  // SheetJS and the zip tool load only when someone exports
  const [XLSX, { unzipSync, zipSync }] = await Promise.all([import('xlsx').then((m) => m.default || m), import('fflate')])
  onProgress(`Building the file for ${rows.length.toLocaleString()} visits...`)

  const head = COLUMNS.map((c) => ({ t: 's', v: c[0] }))
  const body = rows.map((r) => COLUMNS.map((c) => c[2](r)))
  const visits = sheetFrom(XLSX, [head, ...body], COLUMNS.map((c) => c[1]))
  visits['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, body.length), c: COLUMNS.length - 1 } }) }

  const sum = summaryRows(rows)
  const summary = sheetFrom(XLSX, sum.out, [28, 10, 16, 12])

  const me = getUser()
  const f = filters
  const filterRows = [
    ['Filter', 'Value'],
    ['Exported by', `${me?.name || ''} (${me?.role || ''})`],
    ['Exported at', `${dateYear(Date.now())} ${time(Date.now())} Addis Ababa time`],
    ['From', f.from ? isoDay(f.from) : 'Start'],
    ['To', f.to ? isoDay(new Date(f.to).getTime() - 1) : 'Today'],
    ['Division', meta.division || f.division || 'All'],
    ['User', meta.userName || 'All'],
    ['Activity', f.activity || 'All'],
    ['Investment unit', f.unit || 'All'],
    ['Status', f.status || 'All'],
    ['Visits', rows.length],
  ]
  const filterSheet = sheetFrom(XLSX, filterRows, [18, 40])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, visits, 'Visits')
  XLSX.utils.book_append_sheet(wb, summary, 'Summary')
  XLSX.utils.book_append_sheet(wb, filterSheet, 'Filters')
  const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true })

  const linkCols = ['Receipt photo', 'Engagement photo'].map((name) => XLSX.utils.encode_col(COLUMNS.findIndex((c) => c[0] === name)))
  const files = patch(unzipSync(new Uint8Array(raw)), [
    { freeze: true, boldRows: [0], linkCols },
    { freeze: false, boldRows: sum.bold },
    { freeze: true, boldRows: [0] },
  ])
  const out = zipSync(files, { level: 6 })

  const from = f.from ? isoDay(f.from) : rows.length ? isoDay(rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date)) : isoDay()
  const to = f.to ? isoDay(new Date(f.to).getTime() - 1) : isoDay()
  const div = String(meta.division || f.division || 'All').trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
  const name = `Spot_Win_${div || 'All'}_${from}_to_${to}.xlsx`

  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return { name, count: rows.length }
}
