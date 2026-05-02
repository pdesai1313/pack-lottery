import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import {
  getGroceryEntries,
  createGroceryEntry,
  updateGroceryEntry,
  deleteGroceryEntry,
} from '../api/grocery'

function fmt(n) { return n != null ? `$${Number(n).toFixed(2)}` : '—' }
function today() { return new Date().toISOString().split('T')[0] }

function getPeriodDates(period) {
  const t = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (period === 'today') return { from: today(), to: today() }

  if (period === 'week') {
    const d = new Date(t)
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    return { from: iso(d), to: today() }
  }

  if (period === 'month') {
    return { from: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-01`, to: today() }
  }

  if (period === 'year') {
    return { from: `${t.getFullYear()}-01-01`, to: today() }
  }

  return null
}

function SummaryCard({ label, value, highlight }) {
  const color = highlight == null ? 'text-gray-900'
    : highlight >= 0 ? 'text-green-700' : 'text-red-600'
  const bg = highlight == null ? 'bg-white'
    : highlight >= 0 ? 'bg-green-50' : 'bg-red-50'
  const border = highlight == null ? 'border-gray-200'
    : highlight >= 0 ? 'border-green-200' : 'border-red-200'

  return (
    <div className={`rounded-xl border ${border} ${bg} px-4 py-3`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

const EMPTY_FORM = {
  date: today(),
  storeName: '',
  creditDebit: '',
  ebt: '',
  cashSales: '',
  openingCash: '',
  actualCashOnHand: '',
  notes: '',
}

function parseNum(v) {
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

function EntryModal({ entry, onClose, onSuccess }) {
  const isEdit = !!entry
  const [form, setForm] = useState(
    isEdit
      ? {
          date: entry.date,
          storeName: entry.storeName ?? '',
          creditDebit: String(entry.creditDebit),
          ebt: String(entry.ebt),
          cashSales: String(entry.cashSales),
          openingCash: String(entry.openingCash),
          actualCashOnHand: String(entry.actualCashOnHand),
          notes: entry.notes ?? '',
        }
      : { ...EMPTY_FORM }
  )
  const [error, setError] = useState(null)

  const creditDebit = parseNum(form.creditDebit)
  const ebt = parseNum(form.ebt)
  const cashSales = parseNum(form.cashSales)
  const openingCash = parseNum(form.openingCash)
  const actualCOH = parseNum(form.actualCashOnHand)
  const totalSales = creditDebit + ebt + cashSales
  const expectedCash = openingCash + cashSales
  const shortOver = actualCOH - expectedCash

  const createMut = useMutation({
    mutationFn: createGroceryEntry,
    onSuccess: (data) => { onSuccess(data) },
    onError: (err) => setError(err?.response?.data?.error || 'Failed to create entry'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateGroceryEntry(id, data),
    onSuccess: (data) => { onSuccess(data) },
    onError: (err) => setError(err?.response?.data?.error || 'Failed to update entry'),
  })

  const isPending = createMut.isPending || updateMut.isPending

  function handleChange(e) {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const data = {
      date: form.date,
      storeName: form.storeName,
      creditDebit: parseNum(form.creditDebit),
      ebt: parseNum(form.ebt),
      cashSales: parseNum(form.cashSales),
      openingCash: parseNum(form.openingCash),
      actualCashOnHand: parseNum(form.actualCashOnHand),
      notes: form.notes || null,
    }
    if (isEdit) {
      updateMut.mutate({ id: entry.id, data })
    } else {
      createMut.mutate(data)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold">{isEdit ? 'Edit Entry' : 'New Grocery Entry'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                name="date"
                className="input w-full"
                value={form.date}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Store Name</label>
              <input
                type="text"
                name="storeName"
                className="input w-full"
                placeholder="Store name"
                value={form.storeName}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Credit / Debit ($)</label>
              <input
                type="number"
                name="creditDebit"
                className="input w-full"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={form.creditDebit}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">EBT ($)</label>
              <input
                type="number"
                name="ebt"
                className="input w-full"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={form.ebt}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cash Sales ($)</label>
              <input
                type="number"
                name="cashSales"
                className="input w-full"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={form.cashSales}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opening Cash — Till Start ($)</label>
              <input
                type="number"
                name="openingCash"
                className="input w-full"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={form.openingCash}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Actual Cash on Hand ($)</label>
            <input
              type="number"
              name="actualCashOnHand"
              className="input w-full"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={form.actualCashOnHand}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              name="notes"
              className="input w-full resize-none"
              rows={2}
              placeholder="Optional notes..."
              value={form.notes}
              onChange={handleChange}
            />
          </div>

          {/* Live preview */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Live Preview</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Total Sales</p>
                <p className="text-sm font-bold text-gray-800">{fmt(totalSales)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Expected Cash</p>
                <p className="text-sm font-bold text-gray-800">{fmt(expectedCash)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Short / Over</p>
                <p className={`text-sm font-bold ${shortOver >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {shortOver >= 0 ? `+${fmt(shortOver)}` : fmt(shortOver)}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {typeof error === 'string' ? error : JSON.stringify(error)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const TH = ({ children, right }) => (
  <th className={`px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
)

export default function Grocery() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editEntry, setEditEntry] = useState(null)

  const dates = period === 'custom'
    ? (customFrom && customTo ? { from: customFrom, to: customTo } : null)
    : getPeriodDates(period)

  const from = dates?.from
  const to = dates?.to

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['grocery', from, to],
    queryFn: () => getGroceryEntries(from, to),
    enabled: !!dates,
  })

  const deleteMut = useMutation({
    mutationFn: deleteGroceryEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grocery'] }),
  })

  const periods = [
    { key: 'today',  label: 'Today' },
    { key: 'week',   label: 'This Week' },
    { key: 'month',  label: 'This Month' },
    { key: 'year',   label: 'This Year' },
    { key: 'custom', label: 'Custom' },
  ]

  const canEdit = user?.role === 'ADMIN' || user?.role === 'REVIEWER'
  const isAdmin = user?.role === 'ADMIN'

  function handleModalSuccess() {
    queryClient.invalidateQueries({ queryKey: ['grocery'] })
    setShowModal(false)
    setEditEntry(null)
  }

  function handleEdit(entry) {
    setEditEntry(entry)
    setShowModal(true)
  }

  function handleDelete(entry) {
    if (!window.confirm(`Delete entry for ${entry.date}${entry.storeName ? ` — ${entry.storeName}` : ''}?`)) return
    deleteMut.mutate(entry.id)
  }

  // Totals
  const totals = entries.reduce(
    (acc, e) => {
      const totalSales = e.creditDebit + e.ebt + e.cashSales
      const expectedCash = e.openingCash + e.cashSales
      const shortOver = e.actualCashOnHand - expectedCash
      acc.creditDebit += e.creditDebit
      acc.ebt += e.ebt
      acc.cashSales += e.cashSales
      acc.totalSales += totalSales
      acc.openingCash += e.openingCash
      acc.expectedCash += expectedCash
      acc.actualCOH += e.actualCashOnHand
      acc.shortOver += shortOver
      return acc
    },
    { creditDebit: 0, ebt: 0, cashSales: 0, totalSales: 0, openingCash: 0, expectedCash: 0, actualCOH: 0, shortOver: 0 }
  )

  const hasData = entries.length > 0

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Grocery Sales &amp; Cash Reconciliation</h2>
          <p className="text-gray-400 text-xs">Track daily grocery sales and cash reconciliation</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditEntry(null); setShowModal(true) }}
            className="btn-primary"
          >
            + New Entry
          </button>
        )}
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              period === p.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input type="date" className="input py-1 text-sm" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input type="date" className="input py-1 text-sm" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      {!dates && (
        <p className="text-gray-400 text-sm">Select a date range to view entries.</p>
      )}

      {dates && isLoading && (
        <p className="text-gray-400 text-sm">Loading…</p>
      )}

      {dates && !isLoading && (
        <>
          {/* Summary cards — Sales */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sales</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <SummaryCard label="Credit / Debit" value={hasData ? fmt(totals.creditDebit) : '—'} />
            <SummaryCard label="EBT" value={hasData ? fmt(totals.ebt) : '—'} />
            <SummaryCard label="Cash Sales" value={hasData ? fmt(totals.cashSales) : '—'} />
            <SummaryCard label="Total Sales" value={hasData ? fmt(totals.totalSales) : '—'} />
          </div>

          {/* Summary cards — Cash Reconciliation */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cash Reconciliation</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Opening Cash" value={hasData ? fmt(totals.openingCash) : '—'} />
            <SummaryCard label="Expected Cash" value={hasData ? fmt(totals.expectedCash) : '—'} />
            <SummaryCard label="Actual COH" value={hasData ? fmt(totals.actualCOH) : '—'} />
            <SummaryCard
              label={hasData ? (totals.shortOver >= 0 ? 'Short / Over (Over)' : 'Short / Over (Short)') : 'Short / Over'}
              value={hasData ? (totals.shortOver >= 0 ? `+${fmt(totals.shortOver)}` : fmt(totals.shortOver)) : '—'}
              highlight={hasData ? totals.shortOver : null}
            />
          </div>

          {/* Entries table */}
          <div className="card p-0">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold">Entries</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <TH>Date</TH>
                    <TH>Store</TH>
                    <TH>Prepared By</TH>
                    <TH right>Credit/Debit</TH>
                    <TH right>EBT</TH>
                    <TH right>Cash Sales</TH>
                    <TH right>Total Sales</TH>
                    <TH right>Exp. Cash</TH>
                    <TH right>Actual COH</TH>
                    <TH right>Short/Over</TH>
                    <TH>Edit</TH>
                    {isAdmin && <TH>Delete</TH>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 12 : 11} className="px-3 py-6 text-center text-gray-400 text-xs">
                        No entries for this period.
                      </td>
                    </tr>
                  )}
                  {entries.map((e) => {
                    const totalSales = e.creditDebit + e.ebt + e.cashSales
                    const expectedCash = e.openingCash + e.cashSales
                    const shortOver = e.actualCashOnHand - expectedCash
                    return (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs font-medium whitespace-nowrap">{e.date}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{e.storeName || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{e.preparedBy?.name || '—'}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono">{fmt(e.creditDebit)}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono">{fmt(e.ebt)}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono">{fmt(e.cashSales)}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono font-semibold">{fmt(totalSales)}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono">{fmt(expectedCash)}</td>
                        <td className="px-3 py-2 text-xs text-right font-mono">{fmt(e.actualCashOnHand)}</td>
                        <td className={`px-3 py-2 text-xs text-right font-mono font-semibold ${shortOver >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {shortOver >= 0 ? `+${fmt(shortOver)}` : fmt(shortOver)}
                        </td>
                        <td className="px-3 py-2">
                          {canEdit && (
                            <button
                              onClick={() => handleEdit(e)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-3 py-2">
                            <button
                              onClick={() => handleDelete(e)}
                              className="text-xs text-red-500 hover:underline"
                              disabled={deleteMut.isPending}
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                {entries.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-gray-600">TOTAL</td>
                      <td className="px-3 py-2 text-xs text-right font-bold font-mono">{fmt(totals.creditDebit)}</td>
                      <td className="px-3 py-2 text-xs text-right font-bold font-mono">{fmt(totals.ebt)}</td>
                      <td className="px-3 py-2 text-xs text-right font-bold font-mono">{fmt(totals.cashSales)}</td>
                      <td className="px-3 py-2 text-xs text-right font-bold font-mono">{fmt(totals.totalSales)}</td>
                      <td className="px-3 py-2 text-xs text-right font-bold font-mono">{fmt(totals.expectedCash)}</td>
                      <td className="px-3 py-2 text-xs text-right font-bold font-mono">{fmt(totals.actualCOH)}</td>
                      <td className={`px-3 py-2 text-xs text-right font-bold font-mono ${totals.shortOver >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {totals.shortOver >= 0 ? `+${fmt(totals.shortOver)}` : fmt(totals.shortOver)}
                      </td>
                      <td colSpan={isAdmin ? 2 : 1} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {(showModal || editEntry) && (
        <EntryModal
          entry={editEntry}
          onClose={() => { setShowModal(false); setEditEntry(null) }}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}
