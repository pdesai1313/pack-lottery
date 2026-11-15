import { money, agentLines } from '../../lib/commission'

function cellClass(n) {
  if (!n) return 'text-gray-400'
  return n < 0 ? 'text-rose-600' : 'text-gray-800'
}

/**
 * Category | Online | Instant | Total.
 *
 * Used twice: once inside a week's drawer for that week alone, and once
 * below the table for the whole period. Both read from the same `metrics`
 * shape, so a week and the period summary can never disagree on a formula.
 */
export default function AgentTable({ totals, dense = false }) {
  const lines = agentLines(totals)
  const pad = dense ? 'py-1.5' : 'py-2.5'

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-100">
          <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Category</th>
          <th className="text-right px-3 py-2 text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Online</th>
          <th className="text-right px-3 py-2 text-[10px] font-semibold text-green-700 uppercase tracking-wide">Instant</th>
          <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-700 uppercase tracking-wide border-l border-gray-200">Total</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((r) => (
          <tr key={r.label} className={`border-b border-gray-100 last:border-0 ${r.emphasise ? 'bg-blue-50/40' : ''}`}>
            <td className={`px-3 ${pad}`}>
              <p className={`text-xs ${r.emphasise ? 'font-bold text-gray-800' : 'font-semibold text-gray-700'}`}>{r.label}</p>
              {!dense && <p className="text-[10px] text-gray-400">{r.note}</p>}
            </td>
            <td className={`px-3 ${pad} text-xs text-right tabular-nums ${cellClass(r.online)}`}>{money(r.online)}</td>
            <td className={`px-3 ${pad} text-xs text-right tabular-nums ${cellClass(r.instant)}`}>{money(r.instant)}</td>
            <td className={`px-3 ${pad} text-xs text-right tabular-nums border-l border-gray-200 ${r.emphasise ? 'font-bold' : 'font-semibold'} ${cellClass(r.total)}`}>
              {money(r.total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
