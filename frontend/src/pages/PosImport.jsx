import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPosData, getPosImports, savePosImport, deletePosImport } from '../api/pos'

function fmt(cents) {
  if (cents == null) return '—'
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function today() { return new Date().toISOString().split('T')[0] }

function getPeriodDates(period) {
  const t = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (period === 'today') return { from: today(), to: today() }
  if (period === 'week') {
    const sunday = new Date(t)
    sunday.setDate(t.getDate() - t.getDay())
    const saturday = new Date(sunday)
    saturday.setDate(sunday.getDate() + 6)
    return { from: iso(sunday), to: iso(saturday) }
  }
  if (period === 'month') return { from: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-01`, to: today() }
  return null
}

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
]

export default function PosImport() {
  const qc = useQueryClient()

  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [importDate, setImportDate] = useState(today())
  const [fetchedData, setFetchedData] = useState(null)
  const [cashOnHand, setCashOnHand] = useState('')
  const [fetchError, setFetchError] = useState('')
  const [isFetching, setIsFetching] = useState(false)

  const dates = period === 'custom'
    ? (customFrom && customTo ? { from: customFrom, to: customTo } : null)
    : getPeriodDates(period)

  const { data: imports = [] } = useQuery({
    queryKey: ['pos-imports', dates?.from, dates?.to],
    queryFn: () => getPosImports(dates.from, dates.to),
    enabled: !!dates,
  })

  const saveMutation = useMutation({
    mutationFn: (data) => savePosImport(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-imports'] })
      setFetchedData(null)
      setCashOnHand('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deletePosImport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-imports'] }),
  })

  async function handleFetch() {
    setFetchError('')
    setFetchedData(null)
    setIsFetching(true)
    try {
      const data = await fetchPosData(importDate)
      setFetchedData(data)
      setCashOnHand('')
    } catch (e) {
      setFetchError(e.response?.data?.error || 'Failed to fetch POS data')
    } finally {
      setIsFetching(false)
    }
  }

  function handleSave() {
    if (!fetchedData) return
    const coh = Math.round(parseFloat(cashOnHand) * 100)
    if (isNaN(coh)) return
    saveMutation.mutate({
      date:        fetchedData.date,
      total:       fetchedData.total,
      cash:        fetchedData.cash,
      creditDebit: fetchedData.creditDebit,
      ebtSnap:     fetchedData.ebtSnap,
      ebtCash:     fetchedData.ebtCash,
      check:       fetchedData.check,
      cashOnHand:  coh,
    })
  }

  const cohCents = cashOnHand !== '' ? Math.round(parseFloat(cashOnHand) * 100) : null
  const overShort = cohCents != null && fetchedData ? cohCents - fetchedData.cash : null

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight">POS Import</h2>
        <p className="text-gray-400 text-xs mt-0.5">Import daily sales data from NRS POS system</p>
      </div>

      {/* Import section */}
      <div className="card p-4 mb-6">
        <p className="text-sm font-semibold mb-3">Import from POS</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input py-1.5 text-sm"
              value={importDate}
              onChange={(e) => setImportDate(e.target.value)}
            />
          </div>
          <button className="btn-primary btn-sm" onClick={handleFetch} disabled={isFetching}>
            {isFetching ? 'Fetching…' : 'Fetch POS Data'}
          </button>
        </div>
        {fetchError && <p className="text-red-600 text-xs mt-2">{fetchError}</p>}

        {fetchedData && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-semibold mb-3 text-gray-700">POS Data — {fetchedData.date}</p>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
              {[
                { label: 'Total',        value: fetchedData.total },
                { label: 'Cash',         value: fetchedData.cash },
                { label: 'Credit/Debit', value: fetchedData.creditDebit },
                { label: 'EBT SNAP',     value: fetchedData.ebtSnap },
                { label: 'EBT Cash',     value: fetchedData.ebtCash },
                { label: 'Check',        value: fetchedData.check },
              ].map(({ label, value }) => (
                <div key={label} className="text-center bg-white rounded-lg border border-gray-200 px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-base font-bold text-gray-800">{fmt(value)}</p>
                </div>
              ))}
            </div>

            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <label className="label">Cash on Hand ($)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input py-1.5 text-sm w-36"
                  placeholder="0.00"
                  value={cashOnHand}
                  onChange={(e) => setCashOnHand(e.target.value)}
                  autoFocus
                />
              </div>

              {overShort != null && !isNaN(overShort) && (
                <div className={`text-center px-4 py-2.5 rounded-lg border ${overShort >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Over / Short</p>
                  <p className={`text-lg font-bold ${overShort >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {overShort >= 0 ? '+' : ''}{fmt(overShort)}
                  </p>
                </div>
              )}

              <button
                className="btn-primary btn-sm"
                onClick={handleSave}
                disabled={cashOnHand === '' || isNaN(parseFloat(cashOnHand)) || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save Entry'}
              </button>
              <button
                className="btn-secondary btn-sm"
                onClick={() => { setFetchedData(null); setCashOnHand('') }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PERIODS.map((p) => (
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

      {period === 'custom' && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" className="input py-1 text-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" className="input py-1 text-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      {!dates && <p className="text-gray-400 text-sm mb-4">Select a date range to view history.</p>}

      {/* History table */}
      <div className="card p-0 shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <p className="text-sm font-semibold">History</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Total</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Cash</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Credit/Debit</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">EBT SNAP</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">EBT Cash</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Check</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Cash on Hand</th>
                <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Over / Short</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {imports.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400 text-xs">
                    No data for this period.
                  </td>
                </tr>
              )}
              {imports.map((entry, idx) => {
                const os = entry.overShort
                const zebra = idx % 2 === 0 ? '' : 'bg-gray-50/60'
                return (
                  <tr key={entry.id} className={`${zebra} border-b border-gray-100 hover:bg-blue-50/40 transition-colors`}>
                    <td className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap">{entry.date}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(entry.total)}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(entry.cash)}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(entry.creditDebit)}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(entry.ebtSnap)}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(entry.ebtCash)}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(entry.check)}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono tabular-nums">{fmt(entry.cashOnHand)}</td>
                    <td className={`px-3 py-2.5 text-xs text-right font-mono tabular-nums font-semibold ${os >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {os >= 0 ? '+' : ''}{fmt(os)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <button
                        className="text-red-400 hover:text-red-600 text-xs transition-colors"
                        onClick={() => { if (window.confirm(`Delete entry for ${entry.date}?`)) deleteMutation.mutate(entry.id) }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {imports.length > 0 && (() => {
              const sum = (key) => imports.reduce((acc, e) => acc + e[key], 0)
              const totalOs = sum('overShort')
              return (
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td className="px-3 py-2.5 text-xs font-bold text-gray-700">TOTAL</td>
                    <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(sum('total'))}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(sum('cash'))}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(sum('creditDebit'))}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(sum('ebtSnap'))}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(sum('ebtCash'))}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(sum('check'))}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums">{fmt(sum('cashOnHand'))}</td>
                    <td className={`px-3 py-2.5 text-xs text-right font-bold font-mono tabular-nums ${totalOs >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {totalOs >= 0 ? '+' : ''}{fmt(totalOs)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>
      </div>
    </div>
  )
}
