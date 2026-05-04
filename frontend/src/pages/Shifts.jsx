import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { getShifts, createShift, deleteShift, reopenShift } from '../api/shifts'
import { useAuth } from '../context/AuthContext'
import StatusPill from '../components/StatusPill'

function CreateShiftModal({ onClose, closedShifts }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [shiftName, setShiftName] = useState('')
  const [startSource, setStartSource] = useState('previous_day')
  const [manualShiftId, setManualShiftId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const createMutation = useMutation({
    mutationFn: () => createShift({
      date,
      shiftName: shiftName.trim(),
      startSource,
      manualShiftId: startSource === 'manual' && manualShiftId ? Number(manualShiftId) : null,
    }),
    onSuccess: (shift) => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      onClose()
      navigate(`/shifts/${shift.id}/scan`)
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to create shift'),
  })

  const canSubmit = shiftName.trim().length > 0 && (startSource !== 'manual' || !!manualShiftId)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
        <h3 className="text-lg font-bold mb-4">New Shift</h3>

        <div className="space-y-4">
          {/* Date */}
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Shift name */}
          <div>
            <label className="label">Shift Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Morning, Evening, Recount…"
              value={shiftName}
              autoFocus
              onChange={(e) => setShiftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) createMutation.mutate() }}
            />
          </div>

          {/* Start ticket source */}
          <div>
            <label className="label mb-2">Start Ticket Source</label>
            <div className="space-y-2">
              {[
                { value: 'previous_day', label: "Previous day's last committed shift" },
                { value: 'today_last',   label: "Today's most recent committed shift" },
                { value: 'manual',       label: 'Select a specific shift manually' },
              ].map((opt) => (
                <label key={opt.value} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="startSource"
                    value={opt.value}
                    checked={startSource === opt.value}
                    onChange={() => setStartSource(opt.value)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Manual shift selector */}
          {startSource === 'manual' && (
            <div>
              <label className="label">Copy Start Tickets From</label>
              {closedShifts.length === 0 ? (
                <p className="text-xs text-gray-400">No committed shifts available yet.</p>
              ) : (
                <select
                  className="input"
                  value={manualShiftId}
                  onChange={(e) => setManualShiftId(e.target.value)}
                >
                  <option value="">— Select a shift —</option>
                  {closedShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.date} · {s.shiftTag} (#{s.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-red-600 text-xs mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !canSubmit}
          >
            {createMutation.isPending ? 'Creating…' : 'Create & Start Scanning'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Shifts() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmReopenId, setConfirmReopenId] = useState(null)

  const { data: shifts = [], isLoading } = useQuery({ queryKey: ['shifts'], queryFn: getShifts })

  const closedShifts = shifts.filter((s) => s.status === 'CLOSED')
  const isAdmin = user?.role === 'ADMIN'

  const deleteMutation = useMutation({
    mutationFn: deleteShift,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      setConfirmDeleteId(null)
    },
  })

  const reopenMutation = useMutation({
    mutationFn: reopenShift,
    onSuccess: (data, shiftId) => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      setConfirmReopenId(null)
      if (data.warning) alert(data.warning)
      else navigate(`/shifts/${shiftId}/scan`)
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Shifts</h2>
        {['ADMIN', 'REVIEWER'].includes(user?.role) && (
          <button className="btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            + New Shift
          </button>
        )}
      </div>

      {showCreate && (
        <CreateShiftModal
          onClose={() => setShowCreate(false)}
          closedShifts={closedShifts}
        />
      )}

      {/* Reopen confirmation modal */}
      {confirmReopenId && (() => {
        const shift = shifts.find((s) => s.id === confirmReopenId)
        const sameDayOthers = shifts.filter(
          (s) => s.status === 'CLOSED' && s.date === shift?.date && s.id !== confirmReopenId
        )
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
              <h3 className="font-bold text-lg mb-1">Reopen this shift?</h3>
              <p className="text-gray-500 text-sm mb-3">
                <span className="font-semibold">{shift?.shiftTag}</span> on{' '}
                <span className="font-semibold">{shift?.date}</span> will be unlocked for editing. Existing scan data
                is kept — re-scan any packs that need correction, update reconciliation fields, then re-commit.
              </p>
              {sameDayOthers.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-3">
                  <p className="text-amber-800 text-xs font-medium">
                    ⚠️ {sameDayOthers.length} other committed shift{sameDayOthers.length > 1 ? 's' : ''} exist on this date
                    ({sameDayOthers.map((s) => s.shiftTag).join(', ')}). Their start ticket chain may be affected —
                    consider reopening and re-committing those too.
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  className="btn-secondary flex-1"
                  onClick={() => setConfirmReopenId(null)}
                  disabled={reopenMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary flex-1"
                  onClick={() => reopenMutation.mutate(confirmReopenId)}
                  disabled={reopenMutation.isPending}
                >
                  {reopenMutation.isPending ? 'Reopening…' : 'Reopen Shift'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-lg mb-1">Delete this shift?</h3>
            <p className="text-gray-500 text-sm mb-5">
              All scan data and pack states for this shift will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="btn-danger flex-1"
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {shifts.length === 0 && (
            <p className="text-gray-400 text-center py-8">No shifts yet. Create one to get started.</p>
          )}
          {shifts.map((s) => (
            <div key={s.id} className="card flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <StatusPill status={s.status} />
                <span className="font-medium text-sm">{s.date}</span>
                <span className="font-semibold text-sm truncate">{s.shiftTag}</span>
                <span className="text-gray-400 text-xs hidden sm:inline">
                  {s._count?.packStates ?? 0} packs
                </span>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {s.status === 'OPEN' && (
                  <button className="btn-primary btn-sm" onClick={() => navigate(`/shifts/${s.id}/scan`)}>
                    Scan
                  </button>
                )}
                {s.status === 'OPEN' && ['ADMIN', 'REVIEWER'].includes(user?.role) && (
                  <button className="btn-secondary btn-sm" onClick={() => navigate(`/shifts/${s.id}/commit`)}>
                    Commit
                  </button>
                )}
                {s.status === 'CLOSED' && (
                  <button className="btn-secondary btn-sm" onClick={() => navigate(`/shifts/${s.id}/commit`)}>
                    View
                  </button>
                )}
                {s.status === 'CLOSED' && isAdmin && (
                  <button className="btn-secondary btn-sm" onClick={() => setConfirmReopenId(s.id)}>
                    Reopen
                  </button>
                )}
                {isAdmin && (
                  <button
                    className="btn-sm btn-danger"
                    onClick={() => setConfirmDeleteId(s.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
