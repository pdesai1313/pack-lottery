import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getShiftPackStates, commitShift, updateReconciliation, exportCsv } from '../api/shifts'
import FlagBadge, { isError } from '../components/FlagBadge'
import { useAuth } from '../context/AuthContext'

function fmt(n) { return n != null ? `$${Number(n).toFixed(2)}` : '—' }

function ReconField({ label, hint, value, onChange, onBlur, isClosed, displayValue }) {
  return (
    <div>
      <label className="label">
        {label}
        {hint && <span className="text-gray-400 font-normal ml-1 text-xs">({hint})</span>}
      </label>
      {isClosed ? (
        <p className="font-mono font-semibold text-sm">{displayValue}</p>
      ) : (
        <input
          className="input"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
        />
      )}
    </div>
  )
}

function ComputedRow({ label, value, highlight }) {
  return (
    <div className={`flex justify-between items-center py-2 border-b border-gray-100 last:border-0 ${highlight ? 'font-bold' : ''}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`font-mono text-sm ${highlight ? (value >= 0 ? 'text-green-700' : 'text-red-600') : 'text-gray-800'}`}>
        {value != null ? fmt(value) : '—'}
      </span>
    </div>
  )
}

function ReconciliationTab({ shift, shiftId, isClosed }) {
  const qc = useQueryClient()

  const [fields, setFields] = useState({
    onlineSale:       shift.onlineSale       ?? '',
    atm:              shift.atm              ?? '',
    onlineCash:       shift.onlineCash       ?? '',
    instantCash:      shift.instantCash      ?? '',
    actualCashOnHand: shift.actualCashOnHand ?? '',
  })

  const saveMutation = useMutation({
    mutationFn: (data) => updateReconciliation(shiftId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', shiftId, 'packstates'] }),
  })

  const toNum = (v) => v === '' ? null : parseFloat(v)

  function handleBlur() {
    saveMutation.mutate({
      onlineSale:       toNum(fields.onlineSale),
      atm:              toNum(fields.atm),
      onlineCash:       toNum(fields.onlineCash),
      instantCash:      toNum(fields.instantCash),
      actualCashOnHand: toNum(fields.actualCashOnHand),
    })
  }

  function setField(name) {
    return (e) => setFields((p) => ({ ...p, [name]: e.target.value }))
  }

  // Compute from pack states
  const packStates = shift.packStates || []
  const instantSale = packStates.reduce((s, ps) => s + (ps.computedAmount || 0), 0)

  const onlineSaleNum   = toNum(fields.onlineSale)   ?? 0
  const atmNum          = toNum(fields.atm)           ?? 0
  const onlineCashNum   = toNum(fields.onlineCash)    ?? 0
  const instantCashNum  = toNum(fields.instantCash)   ?? 0
  const actualCOHNum    = toNum(fields.actualCashOnHand)

  const totalSale    = onlineSaleNum + instantSale
  const totalCash    = onlineCashNum + instantCashNum
  const expectedCOH  = totalSale - atmNum - totalCash
  const overallTotal = actualCOHNum != null ? actualCOHNum - expectedCOH : null

  return (
    <div className="space-y-4">
      {saveMutation.isError && (
        <p className="text-red-600 text-xs">Save failed — {saveMutation.error?.response?.data?.error || 'unknown error'}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Manual Entry</p>
          <ReconField label="Online Sale" hint="from online terminal" value={fields.onlineSale} onChange={setField('onlineSale')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.onlineSale))} />
          <ReconField label="ATM" hint="money fed into ATM" value={fields.atm} onChange={setField('atm')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.atm))} />
          <ReconField label="Online Cash" hint="cash from online" value={fields.onlineCash} onChange={setField('onlineCash')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.onlineCash))} />
          <ReconField label="Instant Cash" hint="cash from instant tickets" value={fields.instantCash} onChange={setField('instantCash')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.instantCash))} />
          <ReconField label="Actual Cash on Hand" hint="physical count" value={fields.actualCashOnHand} onChange={setField('actualCashOnHand')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.actualCashOnHand))} />
        </div>

        <div className="card space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Computed Summary</p>
          <ComputedRow label="Instant Sale (from packs)" value={instantSale} />
          <ComputedRow label="Online Sale" value={onlineSaleNum || null} />
          <ComputedRow label="Total Sale (Online + Instant)" value={totalSale} />
          <ComputedRow label="ATM" value={atmNum || null} />
          <ComputedRow label="Online Cash" value={onlineCashNum || null} />
          <ComputedRow label="Instant Cash" value={instantCashNum || null} />
          <ComputedRow label="Total Cash (Online + Instant Cash)" value={totalCash} />
          <div className="border-t border-gray-200 mt-2 pt-2 space-y-0">
            <ComputedRow label="Expected Cash on Hand" value={expectedCOH} />
            <ComputedRow
              label="Overall Total (Actual − Expected)"
              value={overallTotal}
              highlight
            />
          </div>
        </div>
      </div>

      {!isClosed && (
        <p className="text-gray-400 text-xs">Fields auto-save on blur. Instant Sale is computed from pack scans above.</p>
      )}
    </div>
  )
}

export default function CommitShift() {
  const { id } = useParams()
  const shiftId = parseInt(id, 10)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()

  const [tab, setTab] = useState('packs')
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
      qc.invalidateQueries({ queryKey: ['shifts', shiftId, 'packstates'] })
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

  const unresolvedErrors = packStates.filter((ps) => {
    const flags = ps.flags || []
    return flags.some(isError) && !overrides[ps.id]
  })

  const tabs = [
    { key: 'packs', label: 'Pack Review' },
    { key: 'reconciliation', label: 'Reconciliation' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">{isClosed ? 'Shift Summary' : 'End-of-Shift Commit'}</h2>
          <p className="text-gray-500 text-xs">{shift.date} · {shift.shiftTag?.replace('_', ' ')}</p>
        </div>
        <a href={exportCsv(shiftId)} className="btn-secondary btn-sm" download>↓ CSV</a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card text-center">
          <p className="text-gray-400 text-xs">Total Packs</p>
          <p className="text-2xl font-bold">{packStates.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-gray-400 text-xs">Total Units</p>
          <p className="text-2xl font-bold">{totalUnits}</p>
        </div>
        <div className="card text-center">
          <p className="text-gray-400 text-xs">Instant Sale</p>
          <p className="text-2xl font-bold">${totalAmount.toFixed(2)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Pack Review tab */}
      {tab === 'packs' && (
        <div>
          {unresolvedErrors.length > 0 && !isClosed && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4 text-xs text-red-700">
              {unresolvedErrors.length} pack(s) have unresolved errors. Add override reasons to commit.
            </div>
          )}

          <div className="space-y-3">
            {packStates.map((ps) => {
              const flags = ps.flags || []
              const hasErrors = flags.some(isError)
              const borderColor = hasErrors ? 'border-red-200' : flags.length ? 'border-yellow-200' : 'border-gray-200'

              return (
                <div key={ps.id} className={`card border ${borderColor}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="font-mono font-semibold">{ps.pack.packId}</span>
                      {ps.pack.gameName && <span className="text-gray-400 ml-2 text-xs">{ps.pack.gameName}</span>}
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {flags.map((f) => <FlagBadge key={f} flag={f} />)}
                      {flags.length === 0 && <span className="badge-green">OK</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div><p className="text-gray-400">Start</p><p className="font-mono font-semibold">{ps.startTicket ?? '—'}</p></div>
                    <div><p className="text-gray-400">End</p><p className="font-mono font-semibold">{ps.endTicket ?? '—'}</p></div>
                    <div><p className="text-gray-400">Units</p><p className="font-semibold">{ps.computedUnits ?? '—'}</p></div>
                    <div><p className="text-gray-400">Amount</p><p className="font-semibold">{ps.computedAmount != null ? `$${ps.computedAmount.toFixed(2)}` : '—'}</p></div>
                  </div>

                  {(flags.length > 0 || ps.overrideReason) && (
                    <div className="mt-2">
                      {isClosed ? (
                        ps.overrideReason && <p className="text-xs text-gray-500">Override: {ps.overrideReason}</p>
                      ) : (
                        <>
                          <label className="label">Override reason {hasErrors && <span className="text-red-500">*</span>}</label>
                          <input
                            className="input"
                            placeholder={hasErrors ? 'Required — explain error' : 'Optional note'}
                            value={overrides[ps.id] || ''}
                            onChange={(e) => setOverrides((p) => ({ ...p, [ps.id]: e.target.value }))}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {commitError && <p className="text-red-600 text-xs mt-3">{commitError}</p>}

          {!isClosed && canCommit && (
            <div className="mt-4 flex gap-2">
              <button
                className="btn-primary"
                disabled={unresolvedErrors.length > 0 || commitMutation.isPending}
                onClick={() => { setCommitError(''); commitMutation.mutate() }}
              >
                {commitMutation.isPending ? 'Committing…' : 'Commit Shift'}
              </button>
              <button className="btn-secondary" onClick={() => navigate(`/shifts/${shiftId}/scan`)}>
                ← Back to Scan
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reconciliation tab */}
      {tab === 'reconciliation' && (
        <ReconciliationTab shift={shift} shiftId={shiftId} isClosed={isClosed} />
      )}
    </div>
  )
}
