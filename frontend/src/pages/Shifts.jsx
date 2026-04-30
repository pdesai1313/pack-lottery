import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { getShifts, createShift } from '../api/shifts'
import { useAuth } from '../context/AuthContext'

const TAG_COLORS = { MORNING: 'badge-blue', EVENING: 'badge-yellow', FULL_DAY: 'badge-green' }
const STATUS_COLORS = { OPEN: 'badge-blue', CLOSED: 'badge-gray' }

export default function Shifts() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [shiftTag, setShiftTag] = useState('MORNING')
  const [createError, setCreateError] = useState('')

  const { data: shifts = [], isLoading } = useQuery({ queryKey: ['shifts'], queryFn: getShifts })

  const createMutation = useMutation({
    mutationFn: () => createShift({ date, shiftTag }),
    onSuccess: (shift) => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      setShowCreate(false)
      navigate(`/shifts/${shift.id}/scan`)
    },
    onError: (err) => setCreateError(err.response?.data?.error || 'Failed to create shift'),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Shifts</h2>
        {['ADMIN', 'REVIEWER'].includes(user?.role) && (
          <button className="btn-primary btn-sm" onClick={() => { setShowCreate(true); setCreateError('') }}>
            + New Shift
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card mb-4">
          <h3 className="font-medium mb-3">Create Shift</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Shift Type</label>
              <select className="input" value={shiftTag} onChange={(e) => setShiftTag(e.target.value)}>
                <option value="MORNING">Morning</option>
                <option value="EVENING">Evening</option>
                <option value="FULL_DAY">Full Day</option>
              </select>
            </div>
          </div>
          {createError && <p className="text-red-600 text-xs mb-2">{createError}</p>}
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create & Start Scanning'}
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {shifts.length === 0 && <p className="text-gray-400 text-center py-8">No shifts yet. Create one to get started.</p>}
          {shifts.map((s) => (
            <div key={s.id} className="card flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <span className={TAG_COLORS[s.shiftTag]}>{s.shiftTag.replace('_', ' ')}</span>
                <span className="font-medium">{s.date}</span>
                <span className={STATUS_COLORS[s.status]}>{s.status}</span>
              </div>
              <div className="flex gap-2">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
