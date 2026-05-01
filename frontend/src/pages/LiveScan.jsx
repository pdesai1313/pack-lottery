import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getShiftPackStates, scanTicket, setStartTicket, updateReconciliation } from '../api/shifts'
import FlagBadge, { isError } from '../components/FlagBadge'

function extractFromBarcode(raw) {
  const trimmed = raw.trim()
  if (trimmed.length >= 13) return trimmed.substring(10, 13).replace(/^0+/, '') || '0'
  return trimmed
}
function isBarcode(raw) { return raw.trim().length >= 13 }
function fmt(n) { return n != null ? `$${Number(n).toFixed(2)}` : '—' }
function toNum(v) { return v === '' || v == null ? null : parseFloat(v) }

// ── Reconciliation panel ──────────────────────────────────────────────────────

function ReconField({ label, hint, value, onChange, onBlur, isClosed, displayValue }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-0.5">
        {label}{hint && <span className="text-gray-400 ml-1">({hint})</span>}
      </label>
      {isClosed ? (
        <p className="font-mono font-semibold text-sm">{displayValue}</p>
      ) : (
        <input
          className="input py-1 text-sm"
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

function ReconciliationPanel({ shift, shiftId, isClosed, instantSale, onCommit, canCommit }) {
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

  function handleBlur() {
    saveMutation.mutate({
      onlineSale:       toNum(fields.onlineSale),
      atm:              toNum(fields.atm),
      onlineCash:       toNum(fields.onlineCash),
      instantCash:      toNum(fields.instantCash),
      actualCashOnHand: toNum(fields.actualCashOnHand),
    })
  }
  function setField(name) { return (e) => setFields((p) => ({ ...p, [name]: e.target.value })) }

  const onlineSaleNum  = toNum(fields.onlineSale)  ?? 0
  const atmNum         = toNum(fields.atm)          ?? 0
  const onlineCashNum  = toNum(fields.onlineCash)   ?? 0
  const instantCashNum = toNum(fields.instantCash)  ?? 0
  const actualCOHNum   = toNum(fields.actualCashOnHand)

  const totalSale    = onlineSaleNum + instantSale
  const totalCash    = onlineCashNum + instantCashNum
  const expectedCOH  = totalSale - atmNum - totalCash
  const overallTotal = actualCOHNum != null ? actualCOHNum - expectedCOH : null

  return (
    <div className="w-72 flex-shrink-0">
      <div className="card sticky top-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reconciliation</p>

        {/* Instant sale from packs — read only */}
        <div className="rounded bg-green-50 border border-green-200 px-3 py-2">
          <p className="text-xs text-green-700">Instant Sale (from packs)</p>
          <p className="font-bold text-green-800 text-lg">{fmt(instantSale)}</p>
        </div>

        <div className="space-y-2">
          <ReconField label="Online Sale" hint="terminal" value={fields.onlineSale} onChange={setField('onlineSale')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.onlineSale))} />
          <ReconField label="ATM" hint="fed into machine" value={fields.atm} onChange={setField('atm')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.atm))} />
          <ReconField label="Online Cash" value={fields.onlineCash} onChange={setField('onlineCash')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.onlineCash))} />
          <ReconField label="Instant Cash" value={fields.instantCash} onChange={setField('instantCash')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.instantCash))} />
          <ReconField label="Actual Cash on Hand" hint="physical count" value={fields.actualCashOnHand} onChange={setField('actualCashOnHand')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.actualCashOnHand))} />
        </div>

        {/* Computed summary */}
        <div className="border-t border-gray-100 pt-2 space-y-1 text-xs">
          <div className="flex justify-between text-gray-500"><span>Total Sale</span><span className="font-mono">{fmt(totalSale)}</span></div>
          <div className="flex justify-between text-gray-500"><span>Total Cash</span><span className="font-mono">{fmt(totalCash)}</span></div>
          <div className="flex justify-between text-gray-500"><span>Expected COH</span><span className="font-mono">{fmt(expectedCOH)}</span></div>
          <div className={`flex justify-between font-bold text-sm pt-1 border-t border-gray-200 ${overallTotal == null ? 'text-gray-400' : overallTotal >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            <span>Overall Total</span>
            <span className="font-mono">{overallTotal != null ? fmt(overallTotal) : '—'}</span>
          </div>
        </div>

        {!isClosed && canCommit && (
          <button className="btn-primary w-full mt-1" onClick={onCommit}>
            Commit Shift →
          </button>
        )}
        {saveMutation.isError && (
          <p className="text-red-500 text-xs">Save failed</p>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveScan() {
  const { id } = useParams()
  const shiftId = parseInt(id, 10)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [rowInputs, setRowInputs] = useState({})
  const [rowErrors, setRowErrors] = useState({})
  const inputRefs = useRef({})
  const justSubmitted = useRef({})

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shifts', shiftId, 'packstates'],
    queryFn: () => getShiftPackStates(shiftId),
    refetchInterval: 300000,
  })

  const packStates = shift?.packStates || []

  useEffect(() => {
    if (!packStates.length) return
    const first = packStates.find((ps) => ps.endTicket == null && ps.status !== 'CLOSED')
    if (first) setTimeout(() => inputRefs.current[first.id]?.focus(), 100)
  }, [shift?.id])

  const scanMutation = useMutation({
    mutationFn: ({ packId, ticket }) => scanTicket(shiftId, packId, ticket),
    onSuccess: (_, { psId, nextPsId }) => {
      qc.invalidateQueries({ queryKey: ['shifts', shiftId, 'packstates'] })
      setRowInputs((p) => ({ ...p, [psId]: { ...p[psId], value: '' } }))
      setRowErrors((p) => ({ ...p, [psId]: null }))
      if (nextPsId) setTimeout(() => inputRefs.current[nextPsId]?.focus(), 80)
    },
    onError: (e, { psId }) => {
      setRowErrors((p) => ({ ...p, [psId]: e.response?.data?.error || 'Failed' }))
    },
  })

  const startMutation = useMutation({
    mutationFn: ({ packId, startTicket }) => setStartTicket(shiftId, packId, startTicket),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts', shiftId, 'packstates'] }),
  })

  function getMode(psId) { return rowInputs[psId]?.mode || 'scanner' }
  function setMode(psId, mode) {
    setRowInputs((p) => ({ ...p, [psId]: { ...p[psId], mode } }))
    setTimeout(() => inputRefs.current[psId]?.focus(), 50)
  }
  function getValue(psId) { return rowInputs[psId]?.value || '' }
  function setValue(psId, value) { setRowInputs((p) => ({ ...p, [psId]: { ...p[psId], value } })) }

  function submit(ps, idx, rawValue) {
    const val = rawValue.trim()
    if (!val) return
    if (justSubmitted.current[ps.id]) return
    justSubmitted.current[ps.id] = true
    setTimeout(() => { justSubmitted.current[ps.id] = false }, 400)
    const mode = getMode(ps.id)
    const ticket = (mode === 'scanner' && isBarcode(val)) ? extractFromBarcode(val) : val
    const nextPs = packStates[idx + 1]
    scanMutation.mutate({ packId: ps.packId, ticket, psId: ps.id, nextPsId: nextPs?.id })
  }

  function handleKeyDown(e, ps, idx) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    submit(ps, idx, getValue(ps.id))
  }

  function handleBlur(e, ps, idx) { submit(ps, idx, e.target.value) }

  if (isLoading) return <p className="text-gray-400 p-4">Loading…</p>
  if (!shift) return <p className="text-red-500 p-4">Shift not found</p>

  const isClosed = shift.status === 'CLOSED'
  const scannedCount = packStates.filter((ps) => ps.endTicket != null).length
  const totalUnits = packStates.reduce((s, ps) => s + (ps.computedUnits || 0), 0)
  const totalAmount = packStates.reduce((s, ps) => s + (ps.computedAmount || 0), 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Live Scan</h2>
          <p className="text-gray-500 text-xs">
            {shift.date} · {shift.shiftTag.replace('_', ' ')} ·{' '}
            <span className="font-medium">{scannedCount}/{packStates.length} scanned</span>
            {' · '}<span className="font-medium text-green-700">${totalAmount.toFixed(2)}</span>
          </p>
        </div>
        {!isClosed && (
          <button className="btn-secondary btn-sm" onClick={() => navigate(`/shifts/${shiftId}/commit`)}>
            Review & Commit →
          </button>
        )}
      </div>

      {isClosed && (
        <div className="rounded-lg bg-gray-100 text-gray-600 text-xs px-3 py-2 mb-3">
          Shift closed — showing committed data.
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-4 items-start">

        {/* Left: scan table */}
        <div className="flex-1 min-w-0 card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500 w-6">#</th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">Pack</th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">Sz</th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">Val</th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">Start</th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500 bg-blue-50">
                  Barcode <span className="text-blue-400 font-normal">(scan)</span>
                </th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">End</th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">Units</th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">Amt</th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">Mode</th>
                <th className="text-left px-2 py-1.5 text-xs font-medium text-gray-500">Flags</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {packStates.map((ps, idx) => {
                const flags = ps.flags || []
                const hasError = flags.some(isError)
                const isScanned = ps.endTicket != null
                const mode = getMode(ps.id)
                const liveVal = getValue(ps.id)

                const liveExtracted = liveVal && isBarcode(liveVal) ? extractFromBarcode(liveVal) : liveVal || null
                const displayExtracted = ps.rawBarcode
                  ? extractFromBarcode(ps.rawBarcode)
                  : ps.endTicket != null ? String(ps.endTicket) : null

                const rowBg = hasError ? 'bg-red-50'
                  : flags.length > 0 ? 'bg-yellow-50'
                  : isScanned ? 'bg-green-50/60'
                  : ''

                return (
                  <tr key={ps.id} className={`${rowBg} hover:bg-blue-50/30 transition-colors`}>
                    <td className="px-2 py-1 text-gray-400 text-xs">{idx + 1}</td>

                    <td className="px-2 py-1">
                      <p className="font-mono font-semibold text-xs">{ps.pack.packId}</p>
                    </td>

                    <td className="px-2 py-1 text-gray-500 text-xs">{ps.pack.packSize}</td>
                    <td className="px-2 py-1 text-gray-500 text-xs">${ps.pack.ticketValue.toFixed(0)}</td>

                    {/* Start */}
                    <td className="px-2 py-1">
                      {ps.startTicket != null ? (
                        <span className="font-mono text-xs font-medium">{ps.startTicket}</span>
                      ) : !isClosed ? (
                        <input
                          className="input w-14 text-xs py-0.5"
                          type="number"
                          placeholder="Set"
                          onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value) startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) }) }}
                          onBlur={(e) => { if (e.target.value) startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) }) }}
                        />
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Barcode */}
                    <td className="px-2 py-1 bg-blue-50/40">
                      {isClosed ? (
                        <span className="font-mono text-xs text-gray-500 truncate block max-w-[120px]" title={ps.rawBarcode || ''}>
                          {ps.rawBarcode || '—'}
                        </span>
                      ) : mode === 'scanner' ? (
                        <div>
                          <input
                            ref={(el) => (inputRefs.current[ps.id] = el)}
                            className={`input w-40 text-xs py-0.5 font-mono ${hasError ? 'border-red-400' : isScanned ? 'border-green-400' : 'border-blue-300'}`}
                            type="text"
                            placeholder="Scan here…"
                            value={liveVal}
                            onChange={(e) => setValue(ps.id, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, ps, idx)}
                            onBlur={(e) => handleBlur(e, ps, idx)}
                          />
                          {ps.rawBarcode && !liveVal && (
                            <p className="font-mono text-xs text-gray-400 truncate max-w-[160px] mt-0.5" title={ps.rawBarcode}>{ps.rawBarcode}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                      {rowErrors[ps.id] && <p className="text-red-500 text-xs mt-0.5">{rowErrors[ps.id]}</p>}
                    </td>

                    {/* End */}
                    <td className="px-2 py-1">
                      {isClosed || mode === 'scanner' ? (
                        <span className="font-mono text-xs font-semibold">
                          {ps.endTicket ?? (liveVal && mode === 'scanner' ? liveExtracted : '—')}
                        </span>
                      ) : (
                        <input
                          ref={(el) => (inputRefs.current[ps.id] = el)}
                          className={`input w-16 text-xs py-0.5 font-mono ${hasError ? 'border-red-400' : isScanned ? 'border-green-400' : ''}`}
                          type="text"
                          placeholder="#"
                          value={liveVal}
                          onChange={(e) => setValue(ps.id, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, ps, idx)}
                          onBlur={(e) => handleBlur(e, ps, idx)}
                        />
                      )}
                    </td>

                    <td className="px-2 py-1 text-xs font-semibold">{ps.computedUnits ?? '—'}</td>
                    <td className="px-2 py-1 text-xs font-semibold">{ps.computedAmount != null ? `$${ps.computedAmount.toFixed(2)}` : '—'}</td>

                    {/* Mode toggle */}
                    <td className="px-2 py-1">
                      {!isClosed && (
                        <div className="flex rounded overflow-hidden border border-gray-200 w-fit text-xs">
                          <button className={`px-1.5 py-0.5 font-medium transition-colors ${mode === 'scanner' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`} onClick={() => setMode(ps.id, 'scanner')}>S</button>
                          <button className={`px-1.5 py-0.5 font-medium transition-colors ${mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`} onClick={() => setMode(ps.id, 'manual')}>M</button>
                        </div>
                      )}
                    </td>

                    {/* Flags */}
                    <td className="px-2 py-1">
                      <div className="flex gap-1 flex-wrap">
                        {flags.length === 0 && isScanned && <span className="badge-green text-xs">OK</span>}
                        {flags.map((f) => <FlagBadge key={f} flag={f} />)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {scannedCount > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={7} className="px-2 py-1.5 text-xs font-semibold text-gray-600 text-right">
                    TOTAL ({scannedCount}/{packStates.length})
                  </td>
                  <td className="px-2 py-1.5 text-xs font-bold text-gray-900">{totalUnits}</td>
                  <td className="px-2 py-1.5 text-xs font-bold text-gray-900">${totalAmount.toFixed(2)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Right: reconciliation panel */}
        <ReconciliationPanel
          shift={shift}
          shiftId={shiftId}
          isClosed={isClosed}
          instantSale={totalAmount}
          canCommit={true}
          onCommit={() => navigate(`/shifts/${shiftId}/commit`)}
        />
      </div>

      <p className="text-gray-400 text-xs mt-2">
        S = Scanner mode (scan barcode) · M = Manual mode (type ticket # directly)
      </p>
    </div>
  )
}
