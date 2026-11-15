import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCommissions } from '../api/lottery'

const WEEK_OPTIONS = [1, 4, 12, 26, 52]

const MODES = [
  ['recent', 'Recent'],
  ['month', 'Month'],
  ['week', 'Single week'],
  ['custom', 'Custom range'],
]

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// Column order follows the portal's own invoice layout so the table can be
// checked line-by-line against gemr.masslottery.com.
const ONLINE_COLUMNS = [
  ['netSales', 'Net Sales'],
  ['commission', 'Commission'],
  ['cashes', 'Cashes'],
  ['cashBonus', 'Cash Bonus'],
  ['claimsBonus', 'Claims Bonus'],
  ['adjustments', 'Adjustments'],
  ['serviceFee', 'Service Fee'],
  ['bondingFee', 'Bonding Fee'],
  ['due', 'Online Due'],
]

const INSTANT_COLUMNS = [
  ['grossSales', 'Gross Sales'],
  ['returnSales', 'Return Sales'],
  ['commission', 'Commission'],
  ['cashes', 'Cashes'],
  ['cashBonus', 'Cash Bonus'],
  ['claimsBonus', 'Claims Bonus'],
  ['adjustments', 'Adjustments'],
  ['due', 'Instant Due'],
]

// ── Week maths (mirrors backend/src/lib/lottery.js — weeks end Saturday) ─────

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
}

function weekEndingOnOrBefore(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7))
  return isoDate(d)
}

function today() {
  const n = new Date()
  return isoDate(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())))
}

function latestWeekEnding() {
  return weekEndingOnOrBefore(today())
}

function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number)
  return { start: `${ym}-01`, end: isoDate(new Date(Date.UTC(y, m, 0))) }
}

// Dropdown of the last two years of months, newest first.
function monthOptions(count = 24) {
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

// Week-ending dates falling inside a month, newest first. Weeks that have not
// closed yet are left out — the portal has no figures for them.
function weeksInMonth(ym) {
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

// ── Formatting ───────────────────────────────────────────────────────────────

function money(n) {
  if (n == null) return '—'
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? '-$' : '$') + s
}

function signClass(n) {
  if (!n) return 'text-gray-400'
  return n < 0 ? 'text-red-600' : 'text-gray-800'
}

// ── Agent Information rollup ─────────────────────────────────────────────────

// Totals across every week on screen. Online and instant are kept apart
// because the portal settles them as two separate accounts.
function rollup(rows) {
  const sum = (fn) => rows.reduce((a, w) => a + (Number(fn(w)) || 0), 0)
  const o = (k) => (w) => w.online?.[k]
  const i = (k) => (w) => w.instant?.[k]

  const onlineSales = sum(o('netSales'))
  // Returned packs reduce what was actually sold. The portal's sign
  // convention for "Return Sales" is not guaranteed, so subtract the
  // magnitude — correct whether it reports returns as positive or negative.
  const instantSales = sum((w) => (Number(w.instant?.grossSales) || 0) - Math.abs(Number(w.instant?.returnSales) || 0))

  const onlineCashes = sum(o('cashes'))
  const instantCashes = sum(i('cashes'))

  // Commission as earned: the base rate plus both bonus programmes.
  const onlineCommission = sum((w) =>
    (Number(w.online?.commission) || 0) + (Number(w.online?.cashBonus) || 0) + (Number(w.online?.claimsBonus) || 0))
  const instantCommission = sum((w) =>
    (Number(w.instant?.commission) || 0) + (Number(w.instant?.cashBonus) || 0) + (Number(w.instant?.claimsBonus) || 0))

  const onlineDue = sum(o('due'))
  const instantDue = sum(i('due'))

  return [
    { label: 'Sales', note: 'online net · instant gross less returns', online: onlineSales, instant: instantSales },
    { label: 'Cashes', note: 'winning tickets paid out', online: onlineCashes, instant: instantCashes },
    { label: 'Total Commission', note: 'commission + cash bonus + claims bonus', online: onlineCommission, instant: instantCommission },
    { label: 'Total Due', note: 'settled with the Lottery', online: onlineDue, instant: instantDue, emphasise: true },
  ].map((r) => ({ ...r, total: r.online + r.instant }))
}

function AgentInformation({ rows }) {
  const [open, setOpen] = useState(true)
  if (rows.length === 0) return null

  const lines = rollup(rows)
  const newest = rows[0].weekEnding
  const oldest = rows[rows.length - 1].weekEnding
  const span = rows.length === 1 ? `week ending ${newest}` : `${rows.length} weeks · ${oldest} → ${newest}`

  return (
    <div className="card p-0 mt-5 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-semibold text-sm text-gray-800">Agent Information</span>
          <span className="text-xs text-gray-400">{span}</span>
        </span>
        <span className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide" />
                <th className="text-right px-4 py-2 text-[11px] font-semibold text-blue-600 uppercase tracking-wide">Online</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold text-green-700 uppercase tracking-wide">Instant</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-700 uppercase tracking-wide border-l border-gray-200">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r) => (
                <tr key={r.label} className={`border-b border-gray-100 last:border-0 ${r.emphasise ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-4 py-2.5">
                    <p className={`text-xs ${r.emphasise ? 'font-bold text-gray-800' : 'font-semibold text-gray-700'}`}>{r.label}</p>
                    <p className="text-[10px] text-gray-400">{r.note}</p>
                  </td>
                  <td className={`px-4 py-2.5 text-xs text-right font-mono tabular-nums ${signClass(r.online)}`}>{money(r.online)}</td>
                  <td className={`px-4 py-2.5 text-xs text-right font-mono tabular-nums ${signClass(r.instant)}`}>{money(r.instant)}</td>
                  <td className={`px-4 py-2.5 text-xs text-right font-mono tabular-nums border-l border-gray-200 ${r.emphasise ? 'font-bold' : 'font-semibold'} ${signClass(r.total)}`}>
                    {money(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Period picker ────────────────────────────────────────────────────────────

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
      }`}
    >
      {children}
    </button>
  )
}

export default function LotteryCommission() {
  const qc = useQueryClient()
  const months = monthOptions()

  const [mode, setMode] = useState('recent')
  const [weeks, setWeeks] = useState(12)
  const [month, setMonth] = useState(months[0].value)
  const [pickedWeek, setPickedWeek] = useState('')
  const [customStart, setCustomStart] = useState(addDays(latestWeekEnding(), -7 * 7))
  const [customEnd, setCustomEnd] = useState(latestWeekEnding())
  const [refreshing, setRefreshing] = useState(false)

  // Keep the week dropdown valid when the month changes, without an effect.
  const monthWeeks = weeksInMonth(month)
  const selectedWeek = monthWeeks.includes(pickedWeek) ? pickedWeek : monthWeeks[0]

  let params = null
  if (mode === 'recent') {
    params = { weeks }
  } else if (mode === 'month') {
    const { start, end } = monthBounds(month)
    params = { startDate: start, endDate: end }
  } else if (mode === 'week' && selectedWeek) {
    params = { startDate: selectedWeek, endDate: selectedWeek }
  } else if (mode === 'custom' && customStart && customEnd && customStart <= customEnd) {
    params = { startDate: customStart, endDate: customEnd }
  }

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['lottery-commissions', params],
    queryFn: () => getCommissions(params),
    enabled: Boolean(params),
    retry: false,
    // Closed weeks never change, so there is nothing to go stale.
    staleTime: Infinity,
    gcTime: Infinity,
  })

  // Deliberate re-pull: asks the server to bypass its cache for this range.
  async function handleRefresh() {
    if (!params) return
    setRefreshing(true)
    try {
      const fresh = await getCommissions({ ...params, refresh: true })
      qc.setQueryData(['lottery-commissions', params], fresh)
    } finally {
      setRefreshing(false)
    }
  }

  const rows = data?.weeks ?? []
  // Same definition the Agent Information panel uses, so the two agree.
  const totalCommission = rows.reduce((a, w) =>
    a + (w.online?.commission || 0) + (w.online?.cashBonus || 0) + (w.online?.claimsBonus || 0)
      + (w.instant?.commission || 0) + (w.instant?.cashBonus || 0) + (w.instant?.claimsBonus || 0), 0)
  const totalDue = rows.reduce((a, w) => a + (w.totalDue ?? 0), 0)
  const colSpan = ONLINE_COLUMNS.length + INSTANT_COLUMNS.length + 2
  const busy = isFetching || refreshing

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-tight">Lottery Commission</h2>
        <p className="text-gray-400 text-xs mt-0.5">
          Weekly invoice data from the Mass Lottery retailer portal. Weeks end on Saturday.
        </p>
      </div>

      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map(([key, label]) => (
            <Chip key={key} active={mode === key} onClick={() => setMode(key)}>{label}</Chip>
          ))}

          <div className="ml-auto flex items-center gap-3">
            {busy && <span className="text-xs text-gray-400">Loading…</span>}
            {!busy && data && (
              <span className="text-xs text-gray-400">
                {data.cached > 0 && `${data.cached} cached`}
                {data.cached > 0 && data.fetched > 0 && ' · '}
                {data.fetched > 0 && `${data.fetched} fetched`}
              </span>
            )}
            <button
              className="btn-secondary btn-sm"
              onClick={handleRefresh}
              disabled={!params || busy}
              title="Re-pull this range from the portal, replacing what is stored"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-end gap-3">
          {mode === 'recent' && WEEK_OPTIONS.map((w) => (
            <Chip key={w} active={weeks === w} onClick={() => setWeeks(w)}>
              {w === 1 ? '1 week' : `${w} weeks`}
            </Chip>
          ))}

          {mode === 'month' && (
            <div>
              <label className="label">Month</label>
              <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}

          {mode === 'week' && (
            <>
              <div>
                <label className="label">Month</label>
                <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
                  {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Week ending</label>
                <select
                  className="input"
                  value={selectedWeek || ''}
                  onChange={(e) => setPickedWeek(e.target.value)}
                  disabled={monthWeeks.length === 0}
                >
                  {monthWeeks.length === 0
                    ? <option>No closed weeks yet</option>
                    : monthWeeks.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </>
          )}

          {mode === 'custom' && (
            <>
              <div>
                <label className="label">From</label>
                <input className="input" type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div>
                <label className="label">To</label>
                <input className="input" type="date" value={customEnd} min={customStart} max={latestWeekEnding()} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
              <p className="text-[11px] text-gray-400 pb-2">Shows every week ending inside this range.</p>
            </>
          )}
        </div>
      </div>

      {isError && (
        <div className="card p-4 mb-4 border-red-200 bg-red-50">
          <p className="text-red-600 text-sm font-semibold">
            {error?.response?.data?.error || 'Could not load commission data.'}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Check the Mass Lottery credentials in Settings, then try again.
          </p>
        </div>
      )}

      {!isError && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <div className="card px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Weeks shown</p>
              <p className="text-lg font-bold text-gray-800">{rows.length}</p>
            </div>
            <div className="card px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Commission</p>
              <p className="text-lg font-bold text-gray-800">{money(totalCommission)}</p>
            </div>
            <div className="card px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Due</p>
              <p className={`text-lg font-bold ${signClass(totalDue)}`}>{money(totalDue)}</p>
            </div>
          </div>

          <div className="card p-0 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap sticky left-0 bg-gray-50">
                      Week Ending
                    </th>
                    <th colSpan={ONLINE_COLUMNS.length} className="text-center px-3 py-2 text-[11px] font-semibold text-blue-600 uppercase tracking-wide border-l border-gray-200">
                      Online
                    </th>
                    <th colSpan={INSTANT_COLUMNS.length} className="text-center px-3 py-2 text-[11px] font-semibold text-green-700 uppercase tracking-wide border-l border-gray-200">
                      Instant
                    </th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold text-gray-700 uppercase tracking-wide border-l border-gray-200 whitespace-nowrap">
                      Total Due
                    </th>
                  </tr>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="sticky left-0 bg-gray-50" />
                    {ONLINE_COLUMNS.map(([k, label], i) => (
                      <th key={`o-${k}`} className={`text-right px-3 py-1.5 text-[10px] font-medium text-gray-400 whitespace-nowrap ${i === 0 ? 'border-l border-gray-200' : ''}`}>
                        {label}
                      </th>
                    ))}
                    {INSTANT_COLUMNS.map(([k, label], i) => (
                      <th key={`i-${k}`} className={`text-right px-3 py-1.5 text-[10px] font-medium text-gray-400 whitespace-nowrap ${i === 0 ? 'border-l border-gray-200' : ''}`}>
                        {label}
                      </th>
                    ))}
                    <th className="border-l border-gray-200" />
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-gray-400 text-xs">
                      Fetching from the lottery portal…
                    </td></tr>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-gray-400 text-xs">
                      No commission data for this period.
                    </td></tr>
                  )}
                  {rows.map((w, idx) => (
                    <tr key={w.weekEnding} className={`${idx % 2 ? 'bg-gray-50/60' : ''} border-b border-gray-100 hover:bg-blue-50/40 transition-colors`}>
                      <td className={`px-3 py-2 text-xs font-semibold whitespace-nowrap sticky left-0 ${idx % 2 ? 'bg-gray-50' : 'bg-white'}`}>
                        {w.weekEnding}
                      </td>
                      {ONLINE_COLUMNS.map(([k], i) => (
                        <td key={`o-${k}`} className={`px-3 py-2 text-xs text-right font-mono tabular-nums ${signClass(w.online?.[k])} ${i === 0 ? 'border-l border-gray-200' : ''} ${k === 'due' ? 'font-semibold' : ''}`}>
                          {money(w.online?.[k])}
                        </td>
                      ))}
                      {INSTANT_COLUMNS.map(([k], i) => (
                        <td key={`i-${k}`} className={`px-3 py-2 text-xs text-right font-mono tabular-nums ${signClass(w.instant?.[k])} ${i === 0 ? 'border-l border-gray-200' : ''} ${k === 'due' ? 'font-semibold' : ''}`}>
                          {money(w.instant?.[k])}
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-xs text-right font-mono tabular-nums font-bold border-l border-gray-200 ${signClass(w.totalDue)}`}>
                        {money(w.totalDue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <AgentInformation rows={rows} />
        </>
      )}
    </div>
  )
}
