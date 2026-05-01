import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getShiftPackStates, scanTicket, setStartTicket, updateReconciliation } from '../api/shifts'
import FlagBadge, { isError } from '../components/FlagBadge'
import { useAuth } from '../context/AuthContext'

function extractFromBarcode(raw) {
  const trimmed = raw.trim()
  if (trimmed.length >= 13) return trimmed.substring(10, 13).replace(/^0+/, '') || '0'
  return trimmed
}
function isBarcode(raw) { return raw.trim().length >= 13 }
function fmt(n) { return n != null ? `$${Number(n).toFixed(2)}` : '—' }
function toNum(v) { return v === '' || v == null ? null : parseFloat(v) }

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ filter, onFilter, search, onSearch, counts }) {
  const filters = [
    { key: 'all',      label: 'All',      count: counts.all },
    { key: 'errors',   label: 'Errors',   count: counts.errors },
    { key: 'warnings', label: 'Warnings', count: counts.warnings },
    { key: 'ok',       label: 'OK',       count: counts.ok },
    { key: 'unscanned',label: 'Unscanned',count: counts.unscanned },
  ]
  return (
    <div className="flex items-center gap-3 flex-wrap mb-3">
      <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilter(f.key)}
            className={`px-3 py-1.5 font-medium transition-colors ${
              filter === f.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label} <span className={`ml-1 ${filter === f.key ? 'text-blue-200' : 'text-gray-400'}`}>({f.count})</span>
          </button>
        ))}
      </div>
      <input
        className="input py-1 text-xs w-40"
        placeholder="Search pack #…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  )
}

// ── Reconciliation panel ──────────────────────────────────────────────────────

function ReconField({ label, value, onChange, onBlur, isClosed, displayValue }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-gray-500 whitespace-nowrap">{label}</label>
      {isClosed ? (
        <span className="font-mono text-xs font-semibold">{displayValue}</span>
      ) : (
        <input
          className="input py-0.5 text-xs w-28 text-right font-mono"
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

  const overallColor = overallTotal == null ? 'text-gray-400'
    : overallTotal >= 0 ? 'text-green-700' : 'text-red-600'

  return (
    <div className="w-72 flex-shrink-0">
      <div className="card sticky top-4 space-y-4 p-4">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Reconciliation</p>

        {/* Sales section */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sales</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Instant Sale</span>
            <span className="font-mono text-xs font-bold text-green-700">{fmt(instantSale)}</span>
          </div>
          <ReconField label="Online Sale" value={fields.onlineSale} onChange={setField('onlineSale')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.onlineSale))} />
        </div>

        <div className="border-t border-gray-100" />

        {/* Cash section */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cash</p>
          <ReconField label="ATM" value={fields.atm} onChange={setField('atm')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.atm))} />
          <ReconField label="Online Cash" value={fields.onlineCash} onChange={setField('onlineCash')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.onlineCash))} />
          <ReconField label="Instant Cash" value={fields.instantCash} onChange={setField('instantCash')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.instantCash))} />
          <ReconField label="Actual COH" value={fields.actualCashOnHand} onChange={setField('actualCashOnHand')} onBlur={handleBlur} isClosed={isClosed} displayValue={fmt(toNum(fields.actualCashOnHand))} />
        </div>

        <div className="border-t border-gray-100" />

        {/* Totals section */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Totals</p>
          <div className="flex justify-between text-xs text-gray-500"><span>Total Sale</span><span className="font-mono">{fmt(totalSale)}</span></div>
          <div className="flex justify-between text-xs text-gray-500"><span>Total Cash</span><span className="font-mono">{fmt(totalCash)}</span></div>
          <div className="flex justify-between text-xs text-gray-500"><span>Expected COH</span><span className="font-mono">{fmt(expectedCOH)}</span></div>
          <div className={`flex justify-between text-sm font-bold pt-1 border-t border-gray-200 ${overallColor}`}>
            <span>Overall Total</span>
            <span className="font-mono">
              {overallTotal != null ? (overallTotal >= 0 ? `+${fmt(overallTotal)}` : fmt(overallTotal)) : '—'}
            </span>
          </div>
        </div>

        {!isClosed && canCommit && (
          <button className="btn-primary w-full" onClick={onCommit}>
            Review & Commit →
          </button>
        )}

        {saveMutation.isError && <p className="text-red-500 text-xs">Save failed</p>}
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
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [rowInputs, setRowInputs] = useState({})
  const [rowErrors, setRowErrors] = useState({})
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [panelOpen, setPanelOpen] = useState(true)
  const [editingStart, setEditingStart] = useState({})
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

  // Filter counts
  const counts = {
    all:      packStates.length,
    errors:   packStates.filter((ps) => (ps.flags || []).some(isError)).length,
    warnings: packStates.filter((ps) => { const f = ps.flags || []; return f.length > 0 && !f.some(isError) }).length,
    ok:       packStates.filter((ps) => ps.endTicket != null && (ps.flags || []).length === 0).length,
    unscanned:packStates.filter((ps) => ps.endTicket == null).length,
  }

  // Apply filter + search
  const visiblePackStates = packStates.filter((ps) => {
    const flags = ps.flags || []
    if (search && !ps.pack.packId.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'errors')    return flags.some(isError)
    if (filter === 'warnings')  return flags.length > 0 && !flags.some(isError)
    if (filter === 'ok')        return ps.endTicket != null && flags.length === 0
    if (filter === 'unscanned') return ps.endTicket == null
    return true
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Live Scan</h2>
          <p className="text-gray-500 text-xs">
            {shift.date} · {shift.shiftTag.replace('_', ' ')} ·{' '}
            <span className="font-medium">{scannedCount}/{packStates.length} scanned</span>
            {' · '}
            <span className="font-semibold text-green-700">{fmt(totalAmount)}</span>
            {' · '}
            <span className="text-gray-400">{totalUnits} units</span>
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

      {/* Filter bar */}
      <FilterBar
        filter={filter} onFilter={setFilter}
        search={search} onSearch={setSearch}
        counts={counts}
      />

      {/* Two-column layout */}
      <div className="flex gap-3 items-start">

        {/* Left: scan table */}
        <div className="flex-1 min-w-0 card p-0">
          <table className="w-full text-sm" style={{ tableLayout: 'auto' }}>
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="text-left px-2 py-2 text-xs font-medium text-gray-500 sticky left-0 bg-gray-50 z-20 w-6">#</th>
                <th className="text-left px-2 py-2 text-xs font-medium text-gray-500 sticky left-6 bg-gray-50 z-20">Pack</th>
                <th className="text-left px-2 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">Sz</th>
                <th className="text-left px-2 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">Val</th>
                <th className="text-left px-2 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">Start</th>
                <th className="text-left px-2 py-2 text-xs font-medium text-gray-500 bg-blue-50 w-full">Scan Input</th>
                <th className="text-left px-2 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">End</th>
                <th className="text-right px-2 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">Units</th>
                <th className="text-right px-2 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">Amount</th>
                <th className="text-left px-2 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">Mode</th>
                <th className="text-left px-2 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">Flags</th>
              </tr>
            </thead>

            <tbody>
              {visiblePackStates.length === 0 && (
                <tr><td colSpan={11} className="text-center text-gray-400 text-xs py-8">No packs match this filter.</td></tr>
              )}
              {visiblePackStates.map((ps, idx) => {
                const flags = ps.flags || []
                const hasError = flags.some(isError)
                const hasWarning = flags.length > 0 && !hasError
                const isScanned = ps.endTicket != null
                const mode = getMode(ps.id)
                const liveVal = getValue(ps.id)

                const liveExtracted = liveVal && isBarcode(liveVal) ? extractFromBarcode(liveVal) : liveVal || null
                const displayEnd = ps.endTicket ?? (liveVal && mode === 'scanner' ? liveExtracted : null)

                // Row background — striped + status color
                const rowBg = hasError ? 'bg-red-50'
                  : hasWarning ? 'bg-yellow-50'
                  : isScanned ? (idx % 2 === 0 ? 'bg-green-50/40' : 'bg-green-50/60')
                  : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60')

                // Color-code units and amount
                const unitsColor = ps.computedUnits == null ? 'text-gray-300'
                  : ps.computedUnits < 0 ? 'text-red-600 font-bold'
                  : ps.computedUnits === 0 ? 'text-gray-400'
                  : 'text-gray-900 font-semibold'
                const amountColor = ps.computedAmount == null ? 'text-gray-300'
                  : ps.computedAmount < 0 ? 'text-red-600 font-bold'
                  : 'text-green-700 font-semibold'

                return (
                  <tr key={ps.id} className={`${rowBg} hover:bg-blue-50/30 transition-colors border-b border-gray-100`}>
                    <td className={`px-2 py-2 text-gray-400 text-xs sticky left-0 z-10 ${rowBg || 'bg-white'}`}>{idx + 1}</td>
                    <td className={`px-2 py-2 sticky left-6 z-10 ${rowBg || 'bg-white'}`}>
                      <p className="font-mono font-semibold text-xs whitespace-nowrap">{ps.pack.packId}</p>
                    </td>
                    <td className="px-2 py-2 text-gray-500 text-xs whitespace-nowrap">{ps.pack.packSize}</td>
                    <td className="px-2 py-2 text-gray-500 text-xs whitespace-nowrap">${ps.pack.ticketValue.toFixed(0)}</td>

                    {/* Start */}
                    <td className="px-3 py-2">
                      {isClosed ? (
                        <span className="font-mono text-xs font-medium">{ps.startTicket ?? '—'}</span>
                      ) : isAdmin && editingStart[ps.id] ? (
                        <input
                          className="input w-20 text-xs py-1 font-mono"
                          type="number"
                          autoFocus
                          defaultValue={ps.startTicket ?? ''}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target.value) {
                              startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) })
                              setEditingStart((p) => ({ ...p, [ps.id]: false }))
                            }
                            if (e.key === 'Escape') setEditingStart((p) => ({ ...p, [ps.id]: false }))
                          }}
                          onBlur={(e) => {
                            if (e.target.value) startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) })
                            setEditingStart((p) => ({ ...p, [ps.id]: false }))
                          }}
                        />
                      ) : ps.startTicket != null ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs font-medium">{ps.startTicket}</span>
                          {isAdmin && (
                            <button
                              className="text-gray-300 hover:text-blue-500 text-sm leading-none"
                              title="Edit start ticket"
                              onClick={() => setEditingStart((p) => ({ ...p, [ps.id]: true }))}
                            >✎</button>
                          )}
                        </div>
                      ) : (
                        <input
                          className="input w-14 text-xs py-1"
                          type="number"
                          placeholder="Set"
                          onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value) startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) }) }}
                          onBlur={(e) => { if (e.target.value) startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) }) }}
                        />
                      )}
                    </td>

                    {/* Scan input */}
                    <td className="px-3 py-2 bg-blue-50/30">
                      {isClosed ? (
                        <span className="font-mono text-xs text-gray-500 truncate block max-w-[120px]" title={ps.rawBarcode || ''}>
                          {ps.rawBarcode || '—'}
                        </span>
                      ) : mode === 'scanner' ? (
                        <div>
                          <input
                            ref={(el) => (inputRefs.current[ps.id] = el)}
                            className={`input w-36 text-xs py-1 font-mono focus:ring-2 focus:ring-blue-400 ${
                              hasError ? 'border-red-400' : isScanned ? 'border-green-400' : 'border-blue-300'
                            }`}
                            type="text"
                            placeholder="Scan barcode…"
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
                        <span className="text-gray-300 text-xs">— manual</span>
                      )}
                      {rowErrors[ps.id] && <p className="text-red-500 text-xs mt-0.5">{rowErrors[ps.id]}</p>}
                    </td>

                    {/* End */}
                    <td className="px-3 py-2">
                      {isClosed || mode === 'scanner' ? (
                        <span className="font-mono text-xs font-semibold">{displayEnd ?? '—'}</span>
                      ) : (
                        <input
                          ref={(el) => (inputRefs.current[ps.id] = el)}
                          className={`input w-16 text-xs py-1 font-mono ${hasError ? 'border-red-400' : isScanned ? 'border-green-400' : ''}`}
                          type="text"
                          placeholder="#"
                          value={liveVal}
                          onChange={(e) => setValue(ps.id, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, ps, idx)}
                          onBlur={(e) => handleBlur(e, ps, idx)}
                        />
                      )}
                    </td>

                    <td className={`px-3 py-2 text-xs text-right ${unitsColor}`}>{ps.computedUnits ?? '—'}</td>
                    <td className={`px-3 py-2 text-xs text-right ${amountColor}`}>{ps.computedAmount != null ? fmt(ps.computedAmount) : '—'}</td>

                    {/* Mode toggle */}
                    <td className="px-3 py-2">
                      {!isClosed && (
                        <div className="flex rounded overflow-hidden border border-gray-200 w-fit text-xs">
                          <button className={`px-2 py-1 font-medium transition-colors ${mode === 'scanner' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`} onClick={() => setMode(ps.id, 'scanner')}>Scan</button>
                          <button className={`px-2 py-1 font-medium transition-colors ${mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`} onClick={() => setMode(ps.id, 'manual')}>Manual</button>
                        </div>
                      )}
                    </td>

                    {/* Flags */}
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {flags.length === 0 && isScanned && <span className="badge-green text-xs">OK</span>}
                        {flags.map((f) => <FlagBadge key={f} flag={f} />)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {scannedCount > 0 && filter === 'all' && !search && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={7} className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">
                    TOTAL ({scannedCount}/{packStates.length} scanned)
                  </td>
                  <td className="px-3 py-2 text-xs font-bold text-right">{totalUnits}</td>
                  <td className="px-3 py-2 text-xs font-bold text-right text-green-700">{fmt(totalAmount)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Right: reconciliation panel (collapsible) */}
        <div className="flex-shrink-0 flex items-start gap-1">
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="mt-1 p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 text-xs"
            title={panelOpen ? 'Hide reconciliation' : 'Show reconciliation'}
          >
            {panelOpen ? '→' : '←'}
          </button>
          {panelOpen && (
            <ReconciliationPanel
              shift={shift}
              shiftId={shiftId}
              isClosed={isClosed}
              instantSale={totalAmount}
              canCommit={true}
              onCommit={() => navigate(`/shifts/${shiftId}/commit`)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
