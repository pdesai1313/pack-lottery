/**
 * Pure helpers for the Lottery Commission page.
 *
 * Everything that turns portal data into figures lives here rather than in a
 * component, so the arithmetic can be read — and corrected — in one place.
 */

// Online line items carry the service and bonding fees; instant has neither.
// A bonding fee that is not this amount is worth an operator's attention,
// which is what the "Bonding Fee Changed" audit filter looks for.
export const BASELINE_BONDING_FEE = 10.5

const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
})

export function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return CURRENCY.format(Number(n))
}

// For dense cells where a full figure would wrap: -$1.0K rather than -$1,026.00
export function moneyCompact(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return COMPACT.format(Number(n))
}

export function timeAgo(iso) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const num = (v) => Number(v) || 0

/**
 * Flattens the API's `{ online: {…}, instant: {…} }` week into the flat row
 * the table works with. Field names mirror the portal's own invoice labels.
 */
export function toRow(week) {
  const o = week.online ?? {}
  const i = week.instant ?? {}
  return {
    weekEnding: week.weekEnding,
    fetchedAt: week.fetchedAt ?? null,

    onlNetSales: num(o.netSales),
    onlComm: num(o.commission),
    onlCashes: num(o.cashes),
    onlCashBonus: num(o.cashBonus),
    onlClaimsBonus: num(o.claimsBonus),
    onlAdj: num(o.adjustments),
    onlSvcFee: num(o.serviceFee),
    onlBondFee: num(o.bondingFee),
    onlDue: num(o.due),

    instGrossSales: num(i.grossSales),
    instRetSales: num(i.returnSales),
    instComm: num(i.commission),
    instCashes: num(i.cashes),
    instCashBonus: num(i.cashBonus),
    instClaimsBonus: num(i.claimsBonus),
    instAdj: num(i.adjustments),
    instDue: num(i.due),

    totalDue: num(week.totalDue),
  }
}

/**
 * The five derived categories the KPI strip, the per-week drawer and the
 * period summary all share, so none of them can drift from the others.
 */
export function metrics(r) {
  // Returned packs reduce what was actually sold. The portal's sign
  // convention for Return Sales is not guaranteed, so subtract the
  // magnitude — correct whether it reports returns positive or negative.
  const instSales = r.instGrossSales - Math.abs(r.instRetSales)

  const onlComm = r.onlComm + r.onlCashBonus + r.onlClaimsBonus
  const instComm = r.instComm + r.instCashBonus + r.instClaimsBonus

  const onlFees = r.onlAdj + r.onlSvcFee + r.onlBondFee
  const instFees = r.instAdj

  return {
    sales:      { online: r.onlNetSales, instant: instSales },
    cashes:     { online: r.onlCashes,   instant: r.instCashes },
    commission: { online: onlComm,       instant: instComm },
    fees:       { online: onlFees,       instant: instFees },
    // The portal publishes its own Total Due; it is the settlement figure of
    // record, so prefer it and only fall back to the two sides added up.
    due:        { online: r.onlDue, instant: r.instDue, total: r.totalDue || r.onlDue + r.instDue },
  }
}

const CATEGORY_KEYS = ['sales', 'cashes', 'commission', 'fees', 'due']

/** Sums `metrics` across many rows, for the KPI strip and the pinned footer. */
export function rollup(rows) {
  const out = {}
  for (const key of CATEGORY_KEYS) out[key] = { online: 0, instant: 0, total: 0 }

  for (const row of rows) {
    const m = metrics(row)
    for (const key of CATEGORY_KEYS) {
      out[key].online += m[key].online
      out[key].instant += m[key].instant
      out[key].total += m[key].total ?? m[key].online + m[key].instant
    }
  }
  return out
}

/** The five rows of an Agent Information table, in display order. */
export function agentLines(source) {
  const m = source
  const line = (label, note, key) => ({
    label,
    note,
    online: m[key].online,
    instant: m[key].instant,
    total: m[key].total ?? m[key].online + m[key].instant,
  })
  return [
    line('Sales', 'online net · instant gross less returns', 'sales'),
    line('Cashes', 'winning tickets paid out', 'cashes'),
    line('Total Commission', 'commission + cash bonus + claims bonus', 'commission'),
    line('Fees & Adjustments', 'adjustments, service and bonding fees', 'fees'),
    { ...line('Total Due', 'settled with the Lottery', 'due'), emphasise: true },
  ]
}

// ── Filtering ────────────────────────────────────────────────────────────────

export const QUICK_FILTERS = [
  { key: 'all', label: 'All Weeks' },
  { key: 'credit', label: 'Net Credit Weeks (Due < $0)' },
  { key: 'adjustments', label: 'Has Adjustments' },
  { key: 'returns', label: 'Has Return Sales' },
]

export const DEFAULT_FILTERS = {
  quick: 'all',
  search: '',
  focus: 'all',          // all | online | instant
  dueMin: '', dueMax: '',
  salesMin: '', salesMax: '',
  claimsBonus: false,    // Claims Bonus ≠ $0
  bondingChanged: false, // Bonding Fee ≠ the baseline
  adjustments: false,    // Adjustments ≠ $0
}

// Free-text search spans the date and every figure on the row, so typing
// either "10-24" or "2250" finds the week.
function matchesSearch(row, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (row.weekEnding.includes(q)) return true

  const digits = q.replace(/[$,\s]/g, '')
  if (!digits) return true
  return Object.entries(row).some(([k, v]) =>
    typeof v === 'number' && k !== 'fetchedAt' && String(Math.abs(v)).includes(digits))
}

function inRange(value, min, max) {
  if (min !== '' && value < Number(min)) return false
  if (max !== '' && value > Number(max)) return false
  return true
}

export function applyFilters(rows, f) {
  return rows.filter((row) => {
    const m = metrics(row)
    const totalDue = m.due.total
    const totalSales = m.sales.online + m.sales.instant

    if (f.quick === 'credit' && totalDue >= 0) return false
    if (f.quick === 'adjustments' && row.onlAdj === 0 && row.instAdj === 0) return false
    if (f.quick === 'returns' && row.instRetSales === 0) return false

    if (!matchesSearch(row, f.search)) return false
    if (!inRange(totalDue, f.dueMin, f.dueMax)) return false
    if (!inRange(totalSales, f.salesMin, f.salesMax)) return false

    if (f.claimsBonus && row.onlClaimsBonus === 0 && row.instClaimsBonus === 0) return false
    if (f.bondingChanged && Math.abs(Math.abs(row.onlBondFee) - BASELINE_BONDING_FEE) < 0.005) return false
    if (f.adjustments && row.onlAdj === 0 && row.instAdj === 0) return false

    return true
  })
}

/** Removable chips describing what is currently narrowing the table. */
export function activeFilterPills(f) {
  const pills = []
  if (f.quick !== 'all') {
    pills.push({ key: 'quick', label: QUICK_FILTERS.find((q) => q.key === f.quick)?.label ?? f.quick })
  }
  if (f.search.trim()) pills.push({ key: 'search', label: `Search “${f.search.trim()}”` })
  if (f.focus !== 'all') pills.push({ key: 'focus', label: f.focus === 'online' ? 'Online only' : 'Instant only' })
  if (f.dueMin !== '' || f.dueMax !== '') {
    pills.push({ key: 'due', label: `Due ${f.dueMin || '−∞'} … ${f.dueMax || '∞'}` })
  }
  if (f.salesMin !== '' || f.salesMax !== '') {
    pills.push({ key: 'sales', label: `Sales ${f.salesMin || '−∞'} … ${f.salesMax || '∞'}` })
  }
  if (f.claimsBonus) pills.push({ key: 'claimsBonus', label: 'Claims Bonus ≠ $0' })
  if (f.bondingChanged) pills.push({ key: 'bondingChanged', label: `Bonding Fee ≠ $${BASELINE_BONDING_FEE.toFixed(2)}` })
  if (f.adjustments) pills.push({ key: 'adjustments', label: 'Adjustments ≠ $0' })
  return pills
}

/** Clears whichever filter a pill represents, leaving the rest in place. */
export function clearFilter(f, key) {
  switch (key) {
    case 'quick':  return { ...f, quick: 'all' }
    case 'search': return { ...f, search: '' }
    case 'focus':  return { ...f, focus: 'all' }
    case 'due':    return { ...f, dueMin: '', dueMax: '' }
    case 'sales':  return { ...f, salesMin: '', salesMax: '' }
    default:       return { ...f, [key]: false }
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  ['weekEnding', 'Week Ending'],
  ['onlNetSales', 'Online Net Sales'],
  ['onlComm', 'Online Commission'],
  ['onlCashes', 'Online Cashes'],
  ['onlCashBonus', 'Online Cash Bonus'],
  ['onlClaimsBonus', 'Online Claims Bonus'],
  ['onlAdj', 'Online Adjustments'],
  ['onlSvcFee', 'Online Service Fee'],
  ['onlBondFee', 'Online Bonding Fee'],
  ['onlDue', 'Online Due'],
  ['instGrossSales', 'Instant Gross Sales'],
  ['instRetSales', 'Instant Return Sales'],
  ['instComm', 'Instant Commission'],
  ['instCashes', 'Instant Cashes'],
  ['instCashBonus', 'Instant Cash Bonus'],
  ['instClaimsBonus', 'Instant Claims Bonus'],
  ['instAdj', 'Instant Adjustments'],
  ['instDue', 'Instant Due'],
  ['totalDue', 'Total Due'],
]

function csvCell(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows) {
  const lines = [CSV_COLUMNS.map(([, label]) => csvCell(label)).join(',')]
  for (const row of rows) lines.push(CSV_COLUMNS.map(([key]) => csvCell(row[key])).join(','))
  return lines.join('\n')
}

export function downloadCsv(rows, filename) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Week maths (mirrors backend/src/lib/lottery.js — weeks end Saturday) ─────

export function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
}

export function weekEndingOnOrBefore(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7))
  return isoDate(d)
}

export function latestWeekEnding() {
  const n = new Date()
  return weekEndingOnOrBefore(isoDate(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))))
}

export function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number)
  return { start: `${ym}-01`, end: isoDate(new Date(Date.UTC(y, m, 0))) }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function monthOptions(count = 24) {
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth()
  const out = []
  for (let i = 0; i < count; i++) {
    out.push({ value: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTH_NAMES[m]} ${y}` })
    if (--m < 0) { m = 11; y-- }
  }
  return out
}

/** Week-endings inside a month, newest first, excluding weeks still open. */
export function weeksInMonth(ym) {
  const { start, end } = monthBounds(ym)
  const cap = latestWeekEnding()
  let cursor = weekEndingOnOrBefore(end)
  if (cursor > cap) cursor = cap
  const out = []
  while (cursor >= start) {
    out.push(cursor)
    cursor = addDays(cursor, -7)
  }
  return out
}
