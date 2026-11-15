import { money } from '../../lib/commission'

// Four headline figures, each split into the two accounts the Lottery
// settles separately. Recalculates from whatever the filters left behind,
// so it always describes the table beneath it rather than the whole fetch.
const CARDS = [
  { key: 'sales', label: 'Total Sales' },
  { key: 'cashes', label: 'Total Cashes' },
  { key: 'commission', label: 'Total Commission' },
  { key: 'due', label: 'Total Due (Net)', accent: true },
]

function valueClass(n, accent) {
  if (n < 0) return 'text-rose-600'
  return accent ? 'text-blue-600' : 'text-gray-900'
}

export default function KpiStrip({ totals, weekCount }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {CARDS.map(({ key, label, accent }) => {
        const t = totals[key]
        return (
          <div
            key={key}
            className={`rounded-2xl border bg-white px-4 py-3 shadow-sm ${accent ? 'border-blue-100' : 'border-gray-100'}`}
          >
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`text-xl font-bold tracking-tight tabular-nums mt-1 ${valueClass(t.total, accent)}`}>
              {money(t.total)}
            </p>
            <div className="mt-2 pt-2 border-t border-gray-50 space-y-0.5">
              <p className="flex justify-between text-[11px]">
                <span className="text-blue-600 font-medium">Onl</span>
                <span className="tabular-nums text-gray-500">{money(t.online)}</span>
              </p>
              <p className="flex justify-between text-[11px]">
                <span className="text-green-700 font-medium">Ins</span>
                <span className="tabular-nums text-gray-500">{money(t.instant)}</span>
              </p>
            </div>
          </div>
        )
      })}
      <p className="sr-only">{weekCount} weeks included</p>
    </div>
  )
}
