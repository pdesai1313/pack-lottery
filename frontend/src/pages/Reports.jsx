import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getReport } from '../api/reports'

function fmt(n) { return n != null ? `$${Number(n).toFixed(2)}` : '—' }

function today() { return new Date().toISOString().split('T')[0] }

function getPeriodDates(period) {
  const t = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (period === 'today') return { from: today(), to: today() }

  if (period === 'week') {
    const d = new Date(t)
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day // Monday
    d.setDate(d.getDate() + diff)
    return { from: iso(d), to: today() }
  }

  if (period === 'month') {
    return { from: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-01`, to: today() }
  }

  if (period === 'year') {
    return { from: `${t.getFullYear()}-01-01`, to: today() }
  }

  return null
}

function SummaryCard({ label, value, sub, highlight }) {
  const color = highlight == null ? 'text-gray-900'
    : highlight >= 0 ? 'text-green-700' : 'text-red-600'
  const bg = highlight == null ? 'bg-white'
    : highlight >= 0 ? 'bg-green-50' : 'bg-red-50'
  const border = highlight == null ? 'border-gray-200'
    : highlight >= 0 ? 'border-green-200' : 'border-red-200'

  return (
    <div className={`rounded-xl border ${border} ${bg} px-5 py-4`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function Reports() {
  const [period, setPeriod] = useState('month')
  const [expanded, setExpanded] = useState({})
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const dates = period === 'custom'
    ? (customFrom && customTo ? { from: customFrom, to: customTo } : null)
    : getPeriodDates(period)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['reports', dates?.from, dates?.to],
    queryFn: () => getReport(dates.from, dates.to),
    enabled: !!dates,
  })

  const s = data?.summary
  const periods = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year',  label: 'This Year' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Reports</h2>
        <p className="text-gray-400 text-xs">Sales and reconciliation summary</p>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              period === p.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" className="input py-1 text-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" className="input py-1 text-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      {!dates && (
        <p className="text-gray-400 text-sm">Select a date range to view the report.</p>
      )}

      {dates && isLoading && (
        <p className="text-gray-400 text-sm">Loading…</p>
      )}

      {s && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SummaryCard
              label="Instant Sale"
              value={fmt(s.instantSale)}
              sub={`${s.totalUnits} units · ${s.shiftsCount} shifts`}
            />
            <SummaryCard
              label="Total Sale"
              value={fmt(s.totalSale)}
              sub={s.onlineSale > 0 ? `Online: ${fmt(s.onlineSale)}` : 'No online sale recorded'}
            />
            <SummaryCard
              label="Expected COH"
              value={fmt(s.expectedCOH)}
              sub={s.atm > 0 ? `ATM: ${fmt(s.atm)}` : undefined}
            />
            <SummaryCard
              label="Overall Total"
              value={s.overallTotal != null ? (s.overallTotal >= 0 ? `+${fmt(s.overallTotal)}` : fmt(s.overallTotal)) : '—'}
              sub={s.overallTotal == null ? 'No reconciliation data' : s.overallTotal >= 0 ? 'Surplus' : 'Short'}
              highlight={s.overallTotal}
            />
          </div>

          {/* Tables row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Daily breakdown */}
            <div className="card p-0">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold">Daily Breakdown</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Date</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Shifts</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Instant Sale</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Total Sale</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Overall</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.byDay.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400 text-xs">No data</td></tr>
                    )}
                    {data.byDay.map((d) => {
                      const isOpen = !!expanded[d.date]
                      const multiShift = d.shifts.length > 1
                      return (
                        <>
                          <tr
                            key={d.date}
                            className={`${multiShift ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                            onClick={() => multiShift && setExpanded((p) => ({ ...p, [d.date]: !p[d.date] }))}
                          >
                            <td className="px-3 py-2 text-xs font-medium">
                              <span className="flex items-center gap-1">
                                {multiShift && <span className="text-gray-400">{isOpen ? '▾' : '▸'}</span>}
                                {d.date}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {d.shifts.map((s) => s.shiftTag).join(', ')}
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono">{fmt(d.instantSale)}</td>
                            <td className="px-3 py-2 text-xs text-right font-mono">{fmt(d.totalSale)}</td>
                            <td className={`px-3 py-2 text-xs text-right font-mono font-semibold ${
                              d.overallTotal == null ? 'text-gray-300'
                              : d.overallTotal >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {d.overallTotal != null
                                ? (d.overallTotal >= 0 ? `+${fmt(d.overallTotal)}` : fmt(d.overallTotal))
                                : '—'}
                            </td>
                          </tr>
                          {isOpen && d.shifts.map((shift) => (
                            <tr key={shift.id} className="bg-blue-50">
                              <td className="pl-7 pr-3 py-1.5 text-xs text-gray-500">└─ {shift.shiftTag}</td>
                              <td className="px-3 py-1.5 text-xs text-gray-400">{shift.units} units</td>
                              <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-700">{fmt(shift.instantSale)}</td>
                              <td className="px-3 py-1.5 text-xs text-right font-mono text-gray-700">{fmt(shift.totalSale)}</td>
                              <td className={`px-3 py-1.5 text-xs text-right font-mono font-semibold ${
                                shift.overallTotal == null ? 'text-gray-300'
                                : shift.overallTotal >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {shift.overallTotal != null
                                  ? (shift.overallTotal >= 0 ? `+${fmt(shift.overallTotal)}` : fmt(shift.overallTotal))
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </>
                      )
                    })}
                  </tbody>
                  {data.byDay.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-600">TOTAL</td>
                        <td className="px-3 py-2 text-xs text-right font-bold font-mono">{fmt(s.instantSale)}</td>
                        <td className="px-3 py-2 text-xs text-right font-bold font-mono">{fmt(s.totalSale)}</td>
                        <td className={`px-3 py-2 text-xs text-right font-bold font-mono ${
                          s.overallTotal == null ? 'text-gray-300'
                          : s.overallTotal >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {s.overallTotal != null
                            ? (s.overallTotal >= 0 ? `+${fmt(s.overallTotal)}` : fmt(s.overallTotal))
                            : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* By game type */}
            <div className="card p-0">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold">By Game Type</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Game</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Units Sold</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Amount</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.byGame.length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400 text-xs">No data</td></tr>
                    )}
                    {data.byGame.map((g) => (
                      <tr key={g.gameName} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs font-medium">{g.gameName}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono">{g.units}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono font-semibold">{fmt(g.amount)}</td>
                        <td className="px-3 py-2 text-xs text-right text-gray-500">
                          {s.instantSale > 0 ? `${((g.amount / s.instantSale) * 100).toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {data.byGame.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td className="px-3 py-2 text-xs font-semibold text-gray-600">TOTAL</td>
                        <td className="px-3 py-2 text-xs text-right font-bold font-mono">{s.totalUnits}</td>
                        <td className="px-3 py-2 text-xs text-right font-bold font-mono">{fmt(s.instantSale)}</td>
                        <td className="px-3 py-2 text-xs text-right font-bold">100%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

          </div>

          {isFetching && <p className="text-gray-400 text-xs mt-3">Refreshing…</p>}
        </>
      )}
    </div>
  )
}
