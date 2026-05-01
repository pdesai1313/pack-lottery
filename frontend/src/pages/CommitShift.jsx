import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getShiftPackStates, commitShift, exportCsv } from '../api/shifts'
import FlagBadge, { isError } from '../components/FlagBadge'
import { useAuth } from '../context/AuthContext'

export default function CommitShift() {
  const { id } = useParams()
  const shiftId = parseInt(id, 10)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [overrides, setOverrides] = useState({})
  const [commitError, setCommitError] = useState('')

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shifts', shiftId, 'packstates'],
    queryFn: () => getShiftPackStates(shiftId),
  })

  const commitMutation = useMutation({
    mutationFn: () => {
      const packCommits = shift.packStates.map((ps) => ({
        packStateId: ps.id,
        overrideReason: overrides[ps.id] || null,
      }))
      return commitShift(shiftId, packCommits)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      navigate('/shifts')
    },
    onError: (e) => setCommitError(e.response?.data?.error || 'Commit failed'),
  })

  if (isLoading) return <p className="text-gray-400">Loading…</p>
  if (!shift) return <p className="text-red-500">Shift not found</p>

  const isClosed = shift.status === 'CLOSED'
  const canCommit = ['ADMIN', 'REVIEWER'].includes(user?.role)
  const packStates = shift.packStates || []

  const totalUnits = packStates.reduce((s, ps) => s + (ps.computedUnits || 0), 0)
  const totalAmount = packStates.reduce((s, ps) => s + (ps.computedAmount || 0), 0)
  const flaggedPacks = packStates.filter((ps) => (ps.flags || []).length > 0)
  const unresolvedErrors = packStates.filter((ps) => (ps.flags || []).some(isError) && !overrides[ps.id])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">{isClosed ? 'Shift Summary' : 'Review & Commit'}</h2>
          <p className="text-gray-500 text-xs">{shift.date} · {shift.shiftTag?.replace('_', ' ')}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => navigate(`/shifts/${shiftId}/scan`)}>
            ← Back to Scan
          </button>
          <a href={exportCsv(shiftId)} className="btn-secondary btn-sm" download>↓ CSV</a>
          {!isClosed && canCommit && (
            <button
              className="btn-primary btn-sm"
              disabled={unresolvedErrors.length > 0 || commitMutation.isPending}
              onClick={() => { setCommitError(''); commitMutation.mutate() }}
            >
              {commitMutation.isPending ? 'Committing…' : 'Commit Shift'}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="card text-center py-2">
          <p className="text-gray-400 text-xs">Packs</p>
          <p className="text-xl font-bold">{packStates.length}</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-gray-400 text-xs">Units</p>
          <p className="text-xl font-bold">{totalUnits}</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-gray-400 text-xs">Instant Sale</p>
          <p className="text-xl font-bold text-green-700">${totalAmount.toFixed(2)}</p>
        </div>
        <div className={`card text-center py-2 ${unresolvedErrors.length > 0 ? 'bg-red-50' : flaggedPacks.length > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
          <p className="text-gray-400 text-xs">Flags</p>
          <p className="text-xl font-bold">{flaggedPacks.length}</p>
        </div>
      </div>

      {unresolvedErrors.length > 0 && !isClosed && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 mb-3 text-xs text-red-700">
          {unresolvedErrors.length} pack(s) have unresolved errors — add override reasons below before committing.
        </div>
      )}

      {commitError && <p className="text-red-600 text-xs mb-3">{commitError}</p>}

      {/* Compact table */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Pack</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Game</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Start</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">End</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Units</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Amount</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Flags</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {packStates.map((ps) => {
              const flags = ps.flags || []
              const hasErrors = flags.some(isError)
              const rowBg = hasErrors ? 'bg-red-50' : flags.length > 0 ? 'bg-yellow-50' : ''

              return (
                <tr key={ps.id} className={rowBg}>
                  <td className="px-3 py-1.5 font-mono font-semibold text-xs">{ps.pack.packId}</td>
                  <td className="px-3 py-1.5 text-gray-500 text-xs">{ps.pack.gameName || '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-right">{ps.startTicket ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-right">{ps.endTicket ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs font-semibold text-right">{ps.computedUnits ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs font-semibold text-right">
                    {ps.computedAmount != null ? `$${ps.computedAmount.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1 flex-wrap">
                      {flags.length === 0 ? <span className="badge-green text-xs">OK</span> : flags.map((f) => <FlagBadge key={f} flag={f} />)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    {isClosed ? (
                      <span className="text-gray-400 text-xs">{ps.overrideReason || ''}</span>
                    ) : flags.length > 0 ? (
                      <input
                        className="input py-0.5 text-xs w-48"
                        placeholder={hasErrors ? 'Required *' : 'Optional note'}
                        value={overrides[ps.id] || ''}
                        onChange={(e) => setOverrides((p) => ({ ...p, [ps.id]: e.target.value }))}
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">TOTAL</td>
              <td className="px-3 py-2 text-xs font-bold text-right">{totalUnits}</td>
              <td className="px-3 py-2 text-xs font-bold text-right">${totalAmount.toFixed(2)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
