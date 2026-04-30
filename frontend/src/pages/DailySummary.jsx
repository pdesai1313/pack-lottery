import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { getDailySummary } from '../api/shifts'
import FlagBadge from '../components/FlagBadge'

export default function DailySummary() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data, isLoading, error } = useQuery({
    queryKey: ['shifts', 'daily', date],
    queryFn: () => getDailySummary(date),
    enabled: !!date,
  })

  const tagBadge = { MORNING: 'badge-blue', EVENING: 'badge-yellow', FULL_DAY: 'badge-green' }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Daily Summary</h2>
        <input
          type="date"
          className="input w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {data?.shifts?.length > 0 && (
        <div className="flex gap-2 mb-4">
          {data.shifts.map((s) => (
            <span key={s.id} className={tagBadge[s.shiftTag]}>
              {s.shiftTag.replace('_', ' ')} — {s.status}
            </span>
          ))}
        </div>
      )}

      {isLoading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-500">Failed to load summary</p>}

      {data?.summary?.length === 0 && (
        <p className="text-gray-400 text-center py-8">No shifts found for {date}.</p>
      )}

      {data?.summary?.length > 0 && (
        <div className="space-y-3">
          {data.summary.map((row) => (
            <div key={row.packId} className={`card border ${row.reconciliationWarning ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-mono font-semibold">{row.packId}</span>
                  {row.gameName && <span className="text-gray-400 ml-2 text-xs">{row.gameName}</span>}
                  <span className="text-gray-400 ml-2 text-xs">SCN: {row.scannerNumber}</span>
                </div>
                {row.reconciliationWarning && (
                  <span className="badge-yellow text-xs">{row.reconciliationWarning}</span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                {['MORNING', 'EVENING', 'FULL_DAY'].map((tag) => {
                  const d = row[tag]
                  return (
                    <div key={tag} className="bg-white rounded-lg p-2 border border-gray-100">
                      <div className="flex items-center gap-1 mb-1">
                        <span className={tagBadge[tag]}>{tag.replace('_', ' ')}</span>
                        {d?.committed && <span className="badge-green">Committed</span>}
                      </div>
                      {d ? (
                        <>
                          <p className="text-gray-400">Start → End</p>
                          <p className="font-mono">{d.startTicket ?? '—'} → {d.endTicket ?? '—'}</p>
                          <p className="text-gray-400 mt-1">Units / Amount</p>
                          <p className="font-semibold">{d.unitsSold ?? '—'} / {d.amount != null ? `$${d.amount.toFixed(2)}` : '—'}</p>
                          {d.flags?.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {d.flags.map((f) => <FlagBadge key={f} flag={f} />)}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-300 mt-1">No data</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
