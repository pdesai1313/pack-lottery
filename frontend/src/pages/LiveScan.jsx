import { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getShiftPackStates, scanTicket, setStartTicket } from '../api/shifts'
import FlagBadge, { isError } from '../components/FlagBadge'

// Extract ticket number from barcode (MID pos 11-13, 1-indexed = substring(10,13) 0-indexed)
function extractFromBarcode(raw) {
  const trimmed = raw.trim()
  if (trimmed.length >= 13) {
    return trimmed.substring(10, 13).replace(/^0+/, '') || '0'
  }
  return trimmed // short input = direct ticket number (manual)
}

function isBarcode(raw) {
  return raw.trim().length >= 13
}

export default function LiveScan() {
  const { id } = useParams()
  const shiftId = parseInt(id, 10)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [rowInputs, setRowInputs] = useState({})   // { [psId]: { value, mode } }
  const [rowErrors, setRowErrors] = useState({})
  const inputRefs = useRef({})
  const justSubmitted = useRef({})                  // guard against double-submit on blur after Enter

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shifts', shiftId, 'packstates'],
    queryFn: () => getShiftPackStates(shiftId),
    refetchInterval: 20000,
  })

  const packStates = shift?.packStates || []

  // Auto-focus first unscanned row on load
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
  function setValue(psId, value) {
    setRowInputs((p) => ({ ...p, [psId]: { ...p[psId], value } }))
  }

  function submit(ps, idx, rawValue) {
    const val = rawValue.trim()
    if (!val) return
    if (justSubmitted.current[ps.id]) return   // prevent double-fire (Enter then blur)
    justSubmitted.current[ps.id] = true
    setTimeout(() => { justSubmitted.current[ps.id] = false }, 400)

    const mode = getMode(ps.id)
    // Scanner mode: extract from barcode if long; Manual mode: use as-is
    const ticket = (mode === 'scanner' && isBarcode(val)) ? extractFromBarcode(val) : val
    const nextPs = packStates[idx + 1]
    scanMutation.mutate({ packId: ps.packId, ticket, psId: ps.id, nextPsId: nextPs?.id })
  }

  function handleKeyDown(e, ps, idx) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    submit(ps, idx, getValue(ps.id))
  }

  function handleBlur(e, ps, idx) {
    submit(ps, idx, getValue(ps.id))
  }

  if (isLoading) return <p className="text-gray-400 p-4">Loading…</p>
  if (!shift) return <p className="text-red-500 p-4">Shift not found</p>

  const isClosed = shift.status === 'CLOSED'
  const scannedCount = packStates.filter((ps) => ps.endTicket != null).length
  const totalUnits = packStates.reduce((s, ps) => s + (ps.computedUnits || 0), 0)
  const totalAmount = packStates.reduce((s, ps) => s + (ps.computedAmount || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Live Scan</h2>
          <p className="text-gray-500 text-xs">
            {shift.date} · {shift.shiftTag.replace('_', ' ')} ·{' '}
            <span className="font-medium">{scannedCount}/{packStates.length} scanned</span>
          </p>
        </div>
        {!isClosed && (
          <button className="btn-secondary btn-sm" onClick={() => navigate(`/shifts/${shiftId}/commit`)}>
            End of Shift →
          </button>
        )}
      </div>

      {isClosed && (
        <div className="rounded-lg bg-gray-100 text-gray-600 text-xs px-3 py-2 mb-4">
          Shift closed — showing committed data.
        </div>
      )}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">#</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Pack</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Size</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Value</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Start</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 bg-blue-50">
                Barcode <span className="text-blue-400 font-normal">(scan here)</span>
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Extracted #</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">End</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Units</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Amount</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Mode</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Flags</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-50">
            {packStates.map((ps, idx) => {
              const flags = ps.flags || []
              const hasError = flags.some(isError)
              const isScanned = ps.endTicket != null
              const mode = getMode(ps.id)
              const liveVal = getValue(ps.id)

              // Live preview of extracted number as scanner types
              const liveExtracted = liveVal && isBarcode(liveVal)
                ? extractFromBarcode(liveVal)
                : liveVal || null

              // Committed values
              const displayExtracted = ps.rawBarcode
                ? extractFromBarcode(ps.rawBarcode)
                : ps.endTicket != null ? String(ps.endTicket) : null

              const rowBg = hasError
                ? 'bg-red-50'
                : flags.length > 0 ? 'bg-yellow-50'
                : isScanned ? 'bg-green-50/60'
                : ''

              return (
                <tr key={ps.id} className={`${rowBg} hover:bg-blue-50/30 transition-colors`}>
                  <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>

                  <td className="px-3 py-2">
                    <p className="font-mono font-semibold text-xs">{ps.pack.packId}</p>
                    {ps.pack.gameName && <p className="text-gray-400 text-xs">{ps.pack.gameName}</p>}
                  </td>

                  <td className="px-3 py-2 text-gray-600 text-xs">{ps.pack.packSize}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">${ps.pack.ticketValue.toFixed(2)}</td>

                  {/* Start ticket */}
                  <td className="px-3 py-2">
                    {ps.startTicket != null ? (
                      <span className="font-mono text-sm font-medium">{ps.startTicket}</span>
                    ) : !isClosed ? (
                      <input
                        className="input w-16 text-xs py-1"
                        type="number"
                        placeholder="Set"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target.value) {
                            startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) })
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value) startMutation.mutate({ packId: ps.packId, startTicket: Number(e.target.value) })
                        }}
                      />
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  {/* Barcode column — PRIMARY INPUT in scanner mode */}
                  <td className="px-3 py-2 bg-blue-50/40">
                    {isClosed ? (
                      <span className="font-mono text-xs text-gray-500 truncate block max-w-[150px]" title={ps.rawBarcode || ''}>
                        {ps.rawBarcode || '—'}
                      </span>
                    ) : mode === 'scanner' ? (
                      <div>
                        <input
                          ref={(el) => (inputRefs.current[ps.id] = el)}
                          className={`input w-44 text-xs py-1 font-mono ${hasError ? 'border-red-400' : isScanned ? 'border-green-400' : 'border-blue-300'}`}
                          type="text"
                          placeholder="Scan barcode here…"
                          value={liveVal}
                          onChange={(e) => setValue(ps.id, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, ps, idx)}
                          onBlur={(e) => handleBlur(e, ps, idx)}
                        />
                        {/* Show committed barcode below input if already scanned */}
                        {ps.rawBarcode && !liveVal && (
                          <p className="font-mono text-xs text-gray-400 truncate max-w-[176px] mt-0.5" title={ps.rawBarcode}>
                            {ps.rawBarcode}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">— (manual mode)</span>
                    )}
                    {rowErrors[ps.id] && <p className="text-red-500 text-xs mt-0.5">{rowErrors[ps.id]}</p>}
                  </td>

                  {/* Extracted # — live preview while typing, committed value after scan */}
                  <td className="px-3 py-2 text-center">
                    {liveVal && mode === 'scanner' ? (
                      <span className="font-mono font-bold text-blue-600">{liveExtracted}</span>
                    ) : displayExtracted != null ? (
                      <span className="font-mono font-bold text-gray-800">{displayExtracted}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* End ticket — auto-populated from extracted #, or direct input in manual mode */}
                  <td className="px-3 py-2">
                    {isClosed || mode === 'scanner' ? (
                      <span className="font-mono font-semibold">
                        {ps.endTicket ?? (liveVal && mode === 'scanner' ? liveExtracted : '—')}
                      </span>
                    ) : (
                      <input
                        ref={(el) => (inputRefs.current[ps.id] = el)}
                        className={`input w-20 text-xs py-1 font-mono ${hasError ? 'border-red-400' : isScanned ? 'border-green-400' : ''}`}
                        type="text"
                        placeholder="Ticket #"
                        value={liveVal}
                        onChange={(e) => setValue(ps.id, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, ps, idx)}
                        onBlur={(e) => handleBlur(e, ps, idx)}
                      />
                    )}
                  </td>

                  {/* Units */}
                  <td className="px-3 py-2 font-semibold">
                    {ps.computedUnits ?? '—'}
                  </td>

                  {/* Amount */}
                  <td className="px-3 py-2 font-semibold">
                    {ps.computedAmount != null ? `$${ps.computedAmount.toFixed(2)}` : '—'}
                  </td>

                  {/* Mode toggle */}
                  <td className="px-3 py-2">
                    {!isClosed && (
                      <div className="flex rounded overflow-hidden border border-gray-200 w-fit text-xs">
                        <button
                          className={`px-2 py-1 font-medium transition-colors ${mode === 'scanner' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                          onClick={() => setMode(ps.id, 'scanner')}
                        >
                          Scan
                        </button>
                        <button
                          className={`px-2 py-1 font-medium transition-colors ${mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                          onClick={() => setMode(ps.id, 'manual')}
                        >
                          Manual
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Flags */}
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {flags.length === 0 && isScanned && <span className="badge-green">OK</span>}
                      {flags.map((f) => <FlagBadge key={f} flag={f} />)}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* Totals footer */}
          {scannedCount > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td colSpan={8} className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">
                  TOTAL ({scannedCount}/{packStates.length} packs)
                </td>
                <td className="px-3 py-2 font-bold text-gray-900">{totalUnits}</td>
                <td className="px-3 py-2 font-bold text-gray-900">${totalAmount.toFixed(2)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="mt-4 rounded-lg bg-white border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-gray-500 font-medium">Instant Sale Summary</span>
        <span>
          <span className="text-gray-400 text-xs">Packs scanned: </span>
          <span className="font-semibold">{scannedCount}/{packStates.length}</span>
        </span>
        <span>
          <span className="text-gray-400 text-xs">Units sold: </span>
          <span className="font-semibold">{totalUnits}</span>
        </span>
        <span>
          <span className="text-gray-400 text-xs">Instant Sale: </span>
          <span className="font-bold text-green-700">${totalAmount.toFixed(2)}</span>
        </span>
        {!isClosed && (
          <button
            className="ml-auto btn-secondary btn-sm"
            onClick={() => navigate(`/shifts/${shiftId}/commit`)}
          >
            Reconcile & Commit →
          </button>
        )}
      </div>

      <p className="text-gray-400 text-xs mt-2">
        Scanner mode: click the blue Barcode cell and scan — extracted # and End auto-fill, focus jumps to next row. Manual mode: type ticket number in End column directly.
      </p>
    </div>
  )
}
