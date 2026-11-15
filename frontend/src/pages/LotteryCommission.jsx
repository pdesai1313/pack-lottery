import { useState, useMemo, Fragment } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCommissions } from '../api/lottery'
import {
  toRow, metrics, rollup, money, moneyCompact, timeAgo,
  applyFilters, DEFAULT_FILTERS, downloadCsv,
  monthBounds, monthOptions, weeksInMonth, latestWeekEnding, addDays,
} from '../lib/commission'
import KpiStrip from '../components/commission/KpiStrip'
import CommissionToolbar from '../components/commission/CommissionToolbar'
import WeekDetail from '../components/commission/WeekDetail'
import AgentTable from '../components/commission/AgentTable'

const PAGE_SIZES = [5, 12, 26, 52]

/**
 * Table columns, rebuilt whenever visibility or category focus changes.
 * Grouped columns must stay contiguous and come before ungrouped ones, so
 * the two header rows and the pinned footer line up without bookkeeping.
 */
function buildColumns(vis, focus) {
  const cols = []
  if (focus !== 'instant') {
    cols.push({ key: 'onlSales', label: 'Sales', group: 'online', get: (r, m) => m.sales.online, foot: (t) => t.sales.online })
    if (vis.onlineCashes) cols.push({ key: 'onlCashes', label: 'Cashes', group: 'online', get: (r, m) => m.cashes.online, foot: (t) => t.cashes.online })
    cols.push({ key: 'onlDue', label: 'Due', group: 'online', get: (r, m) => m.due.online, foot: (t) => t.due.online, strong: true })
  }
  if (focus !== 'online') {
    cols.push({ key: 'instSales', label: 'Sales', group: 'instant', get: (r, m) => m.sales.instant, foot: (t) => t.sales.instant })
    if (vis.instantCashes) cols.push({ key: 'instCashes', label: 'Cashes', group: 'instant', get: (r, m) => m.cashes.instant, foot: (t) => t.cashes.instant })
    cols.push({ key: 'instDue', label: 'Due', group: 'instant', get: (r, m) => m.due.instant, foot: (t) => t.due.instant, strong: true })
  }
  if (vis.fees) {
    // Fees only, excluding adjustments — those get their own column.
    cols.push({
      key: 'fees', label: 'Svc + Bond',
      get: (r) => r.onlSvcFee + r.onlBondFee,
      foot: (t, rows) => rows.reduce((a, r) => a + r.onlSvcFee + r.onlBondFee, 0),
    })
  }
  if (vis.adjustments) {
    cols.push({
      key: 'adj', label: 'Net Adj.',
      get: (r) => r.onlAdj + r.instAdj,
      foot: (t, rows) => rows.reduce((a, r) => a + r.onlAdj + r.instAdj, 0),
    })
  }
  cols.push({ key: 'comm', label: 'Comm.', get: (r, m) => m.commission.total, foot: (t) => t.commission.total, compact: true })
  return cols
}

function groupSpans(cols) {
  const spans = []
  for (const c of cols) {
    const last = spans[spans.length - 1]
    if (c.group && last?.group === c.group) last.span++
    else spans.push({ group: c.group ?? null, span: 1, label: c.label })
  }
  return spans
}

const GROUP_TITLE = { online: 'Online Lottery', instant: 'Instant Tickets' }

function amountClass(n) {
  if (!n) return 'text-gray-300'
  return n < 0 ? 'text-rose-600' : 'text-gray-800'
}

export default function LotteryCommission() {
  const qc = useQueryClient()
  const months = monthOptions()

  const [period, setPeriod] = useState({
    mode: 'recent',
    weeks: 12,
    month: months[0].value,
    pickedWeek: '',
    customStart: addDays(latestWeekEnding(), -7 * 7),
    customEnd: latestWeekEnding(),
  })
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [columnVis, setColumnVis] = useState({
    onlineCashes: true, instantCashes: true, fees: false, adjustments: false,
  })
  const [density, setDensity] = useState('comfortable')
  const [expanded, setExpanded] = useState(() => new Set())
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [refreshing, setRefreshing] = useState(false)

  // ── Query parameters for the chosen period ────────────────────────────────
  const params = useMemo(() => {
    if (period.mode === 'recent') return { weeks: period.weeks }
    if (period.mode === 'month') {
      const { start, end } = monthBounds(period.month)
      return { startDate: start, endDate: end }
    }
    if (period.mode === 'week') {
      const weeksAvailable = weeksInMonth(period.month)
      const week = weeksAvailable.includes(period.pickedWeek) ? period.pickedWeek : weeksAvailable[0]
      return week ? { startDate: week, endDate: week } : null
    }
    if (period.customStart && period.customEnd && period.customStart <= period.customEnd) {
      return { startDate: period.customStart, endDate: period.customEnd }
    }
    return null
  }, [period])

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['lottery-commissions', params],
    queryFn: () => getCommissions(params),
    enabled: Boolean(params),
    retry: false,
    // Closed weeks never change, so there is nothing to go stale.
    staleTime: Infinity,
    gcTime: Infinity,
  })

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

  // ── Rows: normalise → filter → sort → paginate ────────────────────────────
  const allRows = useMemo(() => (data?.weeks ?? []).map(toRow), [data])
  const filtered = useMemo(() => applyFilters(allRows, filters), [allRows, filters])

  const sorted = useMemo(
    () => [...filtered].sort((a, b) =>
      sortAsc ? a.weekEnding.localeCompare(b.weekEnding) : b.weekEnding.localeCompare(a.weekEnding)),
    [filtered, sortAsc]
  )

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize
  const pageRows = sorted.slice(start, start + pageSize)

  // Totals describe every filtered week, not just the visible page.
  const totals = useMemo(() => rollup(filtered), [filtered])

  const cols = useMemo(() => buildColumns(columnVis, filters.focus), [columnVis, filters.focus])
  const groupedCols = cols.filter((c) => c.group)
  const spans = groupSpans(cols)
  const colSpan = cols.length + 2 // week ending + total due

  const rowPad = density === 'compact' ? 'py-1' : 'py-2.5'
  const anyExpanded = expanded.size > 0

  function toggleRow(weekEnding) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(weekEnding)) next.delete(weekEnding)
      else next.add(weekEnding)
      return next
    })
  }

  function toggleAll() {
    setExpanded(anyExpanded ? new Set() : new Set(pageRows.map((r) => r.weekEnding)))
  }

  const syncedLabel = timeAgo(data?.syncedAt)

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">Lottery Commission</h2>
            <span className="badge badge-blue">Mass Lottery Retailer Portal</span>
          </div>
          <p className="text-gray-400 text-xs mt-0.5">
            Weekly invoice data from the Mass Lottery retailer portal. Weeks end on Saturday.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">
            {isFetching || refreshing
              ? 'Loading…'
              : [data?.cached ? `${data.cached} cached` : null,
                 data?.fetched ? `${data.fetched} fetched` : null,
                 syncedLabel ? `Synced ${syncedLabel}` : null].filter(Boolean).join(' • ')}
          </span>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={!params || isFetching || refreshing}
            title="Re-pull this range from the portal, replacing what is stored"
          >
            ↻
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => downloadCsv(sorted, `lottery-commission-${sorted.at(-1)?.weekEnding ?? 'export'}_${sorted[0]?.weekEnding ?? ''}.csv`)}
            disabled={sorted.length === 0}
          >
            Export CSV
          </button>
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
          <KpiStrip totals={totals} weekCount={filtered.length} />

          <CommissionToolbar
            period={period}
            setPeriod={(u) => { setPeriod(u); setPage(1) }}
            filters={filters}
            setFilters={(u) => { setFilters(u); setPage(1) }}
            columns={columnVis}
            setColumns={setColumnVis}
            density={density}
            setDensity={setDensity}
            anyExpanded={anyExpanded}
            onToggleAll={toggleAll}
          />

          {/* ── Table ──────────────────────────────────────────────────────── */}
          <div className="card p-0 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="bg-gray-50">
                    <th
                      rowSpan={2}
                      className="text-left px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap sticky left-0 z-20 bg-gray-50 border-b border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]"
                    >
                      <button type="button" onClick={() => setSortAsc((v) => !v)} className="hover:text-gray-800">
                        Week Ending <span className="text-gray-400">{sortAsc ? '↑' : '↓'}</span>
                      </button>
                    </th>
                    {spans.map((s, i) => s.group ? (
                      <th
                        key={s.group}
                        colSpan={s.span}
                        className={`text-center px-3 py-2 text-[11px] font-semibold uppercase tracking-wide border-l border-b border-gray-200 ${
                          s.group === 'online' ? 'text-blue-600' : 'text-green-700'
                        }`}
                      >
                        {GROUP_TITLE[s.group]}
                      </th>
                    ) : (
                      <th
                        key={`u-${i}`}
                        rowSpan={2}
                        className="text-right px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-l border-b border-gray-200"
                      >
                        {s.label}
                      </th>
                    ))}
                    <th
                      rowSpan={2}
                      className="text-right px-3 py-2 text-[11px] font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap sticky right-0 z-20 bg-gray-50 border-l border-b border-gray-200 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]"
                    >
                      Total Due
                    </th>
                  </tr>
                  <tr className="bg-gray-50">
                    {groupedCols.map((c, i) => (
                      <th
                        key={c.key}
                        className={`text-right px-3 py-1.5 text-[10px] font-medium text-gray-400 whitespace-nowrap border-b border-gray-200 ${
                          groupedCols[i - 1]?.group !== c.group ? 'border-l border-gray-200' : ''
                        }`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {isLoading && (
                    <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-gray-400 text-xs">
                      Fetching from the lottery portal…
                    </td></tr>
                  )}
                  {!isLoading && pageRows.length === 0 && (
                    <tr><td colSpan={colSpan} className="px-4 py-10 text-center text-gray-400 text-xs">
                      {allRows.length === 0 ? 'No commission data for this period.' : 'No weeks match these filters.'}
                    </td></tr>
                  )}

                  {pageRows.map((row, idx) => {
                    const m = metrics(row)
                    const isOpen = expanded.has(row.weekEnding)
                    const stripe = idx % 2 ? 'bg-gray-50/60' : 'bg-white'
                    const stickyBg = idx % 2 ? 'bg-gray-50' : 'bg-white'
                    return (
                      <Fragment key={row.weekEnding}>
                        <tr
                          onClick={() => toggleRow(row.weekEnding)}
                          className={`${stripe} border-b border-gray-100 hover:bg-blue-50/40 transition-colors cursor-pointer`}
                        >
                          <td className={`px-3 ${rowPad} text-xs font-semibold whitespace-nowrap sticky left-0 z-10 border-b border-gray-100 ${isOpen ? 'bg-blue-50' : stickyBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]`}>
                            <span className="text-gray-400 mr-1.5 inline-block w-2">{isOpen ? '▼' : '▶'}</span>
                            {row.weekEnding}
                          </td>
                          {cols.map((c, i) => {
                            const v = c.get(row, m)
                            return (
                              <td
                                key={c.key}
                                className={`px-3 ${rowPad} text-xs text-right tabular-nums border-b border-gray-100 ${amountClass(v)} ${c.strong ? 'font-semibold' : ''} ${
                                  i === 0 || cols[i - 1]?.group !== c.group ? 'border-l border-gray-200' : ''
                                }`}
                              >
                                {c.compact ? moneyCompact(v) : money(v)}
                              </td>
                            )
                          })}
                          <td className={`px-3 ${rowPad} text-right whitespace-nowrap sticky right-0 z-10 border-l border-b border-gray-200 ${isOpen ? 'bg-blue-50' : stickyBg} shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]`}>
                            {m.due.total < 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums bg-rose-50 text-rose-700 border border-rose-200">
                                {money(m.due.total)}
                              </span>
                            ) : (
                              <span className="text-xs font-bold tabular-nums text-gray-800">{money(m.due.total)}</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && <WeekDetail row={row} colSpan={colSpan} />}
                      </Fragment>
                    )
                  })}
                </tbody>

                {filtered.length > 0 && (
                  <tfoot className="sticky bottom-0 z-20">
                    <tr className="bg-gray-100 border-t-2 border-gray-300">
                      <td className="px-3 py-2 text-[11px] font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap sticky left-0 z-20 bg-gray-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                        Total ({filtered.length} wk{filtered.length === 1 ? '' : 's'})
                      </td>
                      {cols.map((c, i) => {
                        const sum = c.foot(totals, filtered)
                        return (
                          <td
                            key={c.key}
                            className={`px-3 py-2 text-xs text-right tabular-nums font-bold ${sum < 0 ? 'text-rose-600' : 'text-gray-800'} ${
                              i === 0 || cols[i - 1]?.group !== c.group ? 'border-l border-gray-300' : ''
                            }`}
                          >
                            {c.compact ? moneyCompact(sum) : money(sum)}
                          </td>
                        )
                      })}
                      <td className={`px-3 py-2 text-xs text-right tabular-nums font-extrabold sticky right-0 z-20 bg-gray-100 border-l border-gray-300 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)] ${
                        totals.due.total < 0 ? 'text-rose-600' : 'text-gray-900'
                      }`}>
                        {money(totals.due.total)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* ── Pagination ───────────────────────────────────────────────── */}
            {filtered.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {start + 1}–{Math.min(start + pageSize, sorted.length)} of {sorted.length} weeks
                </p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    Rows per page
                    <select
                      className="input !w-auto !py-1 text-xs"
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                    >
                      {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button" className="btn-secondary btn-sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                    >
                      Prev
                    </button>
                    {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${
                          n === safePage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button" className="btn-secondary btn-sm"
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage === pageCount}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <PeriodSummary totals={totals} rows={filtered} />
        </>
      )}
    </div>
  )
}

function PeriodSummary({ totals, rows }) {
  const [open, setOpen] = useState(true)
  if (rows.length === 0) return null

  const newest = rows[0].weekEnding
  const oldest = rows[rows.length - 1].weekEnding
  const span = rows.length === 1 ? `week ending ${newest}` : `${rows.length} weeks · ${oldest} → ${newest}`

  return (
    <div className="card p-0 mt-4 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-semibold text-sm text-gray-800">Agent Information — Period Summary</span>
          <span className="text-xs text-gray-400">{span}</span>
        </span>
        <span className={`text-gray-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <AgentTable totals={totals} />
        </div>
      )}
    </div>
  )
}
