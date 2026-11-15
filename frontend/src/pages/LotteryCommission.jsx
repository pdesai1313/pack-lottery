import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCommissions } from '../api/lottery'

const WEEK_OPTIONS = [4, 12, 26, 52]

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

function money(n) {
  if (n == null) return '—'
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? '-$' : '$') + s
}

function signClass(n) {
  if (!n) return 'text-gray-400'
  return n < 0 ? 'text-red-600' : 'text-gray-800'
}

export default function LotteryCommission() {
  const [weeks, setWeeks] = useState(12)

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['lottery-commissions', weeks],
    queryFn: () => getCommissions(weeks),
    retry: false,
  })

  const rows = data?.weeks ?? []
  const totalCommission = rows.reduce(
    (a, w) => a + (w.online?.commission ?? 0) + (w.instant?.commission ?? 0), 0)
  const totalDue = rows.reduce((a, w) => a + (w.totalDue ?? 0), 0)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight">Lottery Commission</h2>
        <p className="text-gray-400 text-xs mt-0.5">
          Weekly invoice data from the Mass Lottery retailer portal. Weeks end on Saturday.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {WEEK_OPTIONS.map((w) => (
          <button
            key={w}
            onClick={() => setWeeks(w)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              weeks === w
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {w} weeks
          </button>
        ))}
        {isFetching && <span className="text-xs text-gray-400">Loading from portal…</span>}
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
                    <tr><td colSpan={ONLINE_COLUMNS.length + INSTANT_COLUMNS.length + 2} className="px-4 py-10 text-center text-gray-400 text-xs">
                      Fetching from the lottery portal…
                    </td></tr>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <tr><td colSpan={ONLINE_COLUMNS.length + INSTANT_COLUMNS.length + 2} className="px-4 py-10 text-center text-gray-400 text-xs">
                      No commission data returned.
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
        </>
      )}
    </div>
  )
}
