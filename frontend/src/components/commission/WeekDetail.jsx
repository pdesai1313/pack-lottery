import { money, metrics } from '../../lib/commission'
import AgentTable from './AgentTable'

// The portal's own line items, named as they appear on the invoice so a row
// can be checked against gemr.masslottery.com without translation.
const ONLINE_ITEMS = [
  ['onlNetSales', 'Net Sales'],
  ['onlComm', 'Commission'],
  ['onlCashes', 'Cashes'],
  ['onlCashBonus', 'Cash Bonus'],
  ['onlClaimsBonus', 'Claims Bonus'],
  ['onlAdj', 'Adjustments'],
  ['onlSvcFee', 'Service Fee'],
  ['onlBondFee', 'Bonding Fee'],
  ['onlDue', 'Online Due'],
]

const INSTANT_ITEMS = [
  ['instGrossSales', 'Gross Sales'],
  ['instRetSales', 'Return Sales'],
  ['instComm', 'Commission'],
  ['instCashes', 'Cashes'],
  ['instCashBonus', 'Cash Bonus'],
  ['instClaimsBonus', 'Claims Bonus'],
  ['instAdj', 'Adjustments'],
  ['instDue', 'Instant Due'],
]

function LineItems({ title, accent, items, row }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <p className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b border-gray-100 ${accent}`}>
        {title}
      </p>
      <div className="divide-y divide-gray-50">
        {items.map(([key, label]) => {
          const v = row[key]
          const isTotal = key.endsWith('Due')
          return (
            <div key={key} className={`flex items-center justify-between px-3 py-1 ${isTotal ? 'bg-gray-50' : ''}`}>
              <span className={`text-[11px] ${isTotal ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>{label}</span>
              <span className={`text-[11px] tabular-nums ${isTotal ? 'font-bold' : ''} ${
                v < 0 ? 'text-rose-600' : v ? 'text-gray-800' : 'text-gray-300'
              }`}>
                {money(v)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function WeekDetail({ row, colSpan }) {
  return (
    <tr className="bg-gray-50/70">
      <td colSpan={colSpan} className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 px-4 py-3 border-y border-gray-200">

          <div className="lg:col-span-7">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Agent Information — week ending {row.weekEnding}
            </p>
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <AgentTable totals={metrics(row)} dense />
            </div>
          </div>

          <div className="lg:col-span-5 space-y-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Portal line items
            </p>
            <LineItems title="Online Lottery" accent="text-blue-600" items={ONLINE_ITEMS} row={row} />
            <LineItems title="Instant Tickets" accent="text-green-700" items={INSTANT_ITEMS} row={row} />
          </div>

        </div>
      </td>
    </tr>
  )
}
