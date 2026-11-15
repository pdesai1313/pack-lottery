import { useState } from 'react'
import {
  QUICK_FILTERS, DEFAULT_FILTERS, activeFilterPills, clearFilter,
  monthOptions, weeksInMonth, latestWeekEnding,
} from '../../lib/commission'

const WEEK_PRESETS = [1, 4, 12, 26, 52]

// The blueprint lists rolling presets and a custom range. Month and single
// week are kept alongside them because the page shipped with those pickers
// and operators reconcile against a calendar month.
const RANGE_MODES = [
  ['month', 'Month'],
  ['week', 'Single Week'],
  ['custom', 'Custom Range'],
]

const COLUMN_TOGGLES = [
  ['onlineCashes', 'Online Cashes'],
  ['instantCashes', 'Instant Cashes'],
  ['fees', 'Svc + Bond Fees'],
  ['adjustments', 'Net Adjustments'],
]

function Chip({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
        active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
      }`}
    >
      {children}
    </button>
  )
}

function Dropdown({ label, children }) {
  return (
    <details className="relative">
      <summary className="btn-secondary btn-sm cursor-pointer list-none select-none">{label}</summary>
      <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
        {children}
      </div>
    </details>
  )
}

export default function CommissionToolbar({
  period, setPeriod, filters, setFilters, columns, setColumns,
  density, setDensity, anyExpanded, onToggleAll,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const months = monthOptions()

  const monthWeeks = weeksInMonth(period.month)
  const selectedWeek = monthWeeks.includes(period.pickedWeek) ? period.pickedWeek : monthWeeks[0]

  const setF = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const pills = activeFilterPills(filters)

  return (
    <div className="card mb-4 p-3 space-y-3">

      {/* Tier 1 — period, search, advanced toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {WEEK_PRESETS.map((w) => (
          <Chip
            key={w}
            active={period.mode === 'recent' && period.weeks === w}
            onClick={() => setPeriod((p) => ({ ...p, mode: 'recent', weeks: w }))}
          >
            {w}W
          </Chip>
        ))}
        <span className="w-px h-5 bg-gray-200 mx-1" />
        {RANGE_MODES.map(([key, label]) => (
          <Chip key={key} active={period.mode === key} onClick={() => setPeriod((p) => ({ ...p, mode: key }))}>
            {label}
          </Chip>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <input
            className="input !w-52 !py-1.5 text-xs"
            placeholder="Search week or $…"
            value={filters.search}
            onChange={(e) => setF({ search: e.target.value })}
          />
          <button
            type="button"
            className={`btn-sm rounded-lg border font-medium transition-colors ${
              showAdvanced ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            ⚙ Advanced Filters
          </button>
        </div>
      </div>

      {/* Period inputs for the non-rolling modes */}
      {period.mode !== 'recent' && (
        <div className="flex flex-wrap items-end gap-3 pt-1">
          {(period.mode === 'month' || period.mode === 'week') && (
            <div>
              <label className="label">Month</label>
              <select className="input" value={period.month} onChange={(e) => setPeriod((p) => ({ ...p, month: e.target.value }))}>
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}
          {period.mode === 'week' && (
            <div>
              <label className="label">Week ending</label>
              <select
                className="input"
                value={selectedWeek || ''}
                onChange={(e) => setPeriod((p) => ({ ...p, pickedWeek: e.target.value }))}
                disabled={monthWeeks.length === 0}
              >
                {monthWeeks.length === 0
                  ? <option>No closed weeks yet</option>
                  : monthWeeks.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          )}
          {period.mode === 'custom' && (
            <>
              <div>
                <label className="label">From</label>
                <input
                  className="input" type="date" value={period.customStart} max={period.customEnd}
                  onChange={(e) => setPeriod((p) => ({ ...p, customStart: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  className="input" type="date" value={period.customEnd}
                  min={period.customStart} max={latestWeekEnding()}
                  onChange={(e) => setPeriod((p) => ({ ...p, customEnd: e.target.value }))}
                />
              </div>
              <p className="text-[11px] text-gray-400 pb-2">Every week ending inside this range.</p>
            </>
          )}
        </div>
      )}

      {/* Advanced filters drawer */}
      {showAdvanced && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Category Focus</label>
            <select className="input" value={filters.focus} onChange={(e) => setF({ focus: e.target.value })}>
              <option value="all">All</option>
              <option value="online">Online Only</option>
              <option value="instant">Instant Only</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Hides the other column group.</p>
          </div>

          <div>
            <label className="label">Total Due Range</label>
            <div className="flex items-center gap-1.5">
              <input className="input !py-1.5" type="number" placeholder="Min" value={filters.dueMin} onChange={(e) => setF({ dueMin: e.target.value })} />
              <span className="text-gray-300">–</span>
              <input className="input !py-1.5" type="number" placeholder="Max" value={filters.dueMax} onChange={(e) => setF({ dueMax: e.target.value })} />
            </div>
            <label className="label mt-2">Total Sales Range</label>
            <div className="flex items-center gap-1.5">
              <input className="input !py-1.5" type="number" placeholder="Min" value={filters.salesMin} onChange={(e) => setF({ salesMin: e.target.value })} />
              <span className="text-gray-300">–</span>
              <input className="input !py-1.5" type="number" placeholder="Max" value={filters.salesMax} onChange={(e) => setF({ salesMax: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Audit &amp; Fee Triggers</label>
            <div className="space-y-1.5">
              {[
                ['claimsBonus', 'Claims Bonus ≠ $0'],
                ['bondingChanged', 'Bonding Fee changed ($10.50)'],
                ['adjustments', 'Adjustments ≠ $0'],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={filters[key]} onChange={(e) => setF({ [key]: e.target.checked })} />
                  <span className="text-xs text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tier 2 — quick chips and table controls */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-2">Quick</span>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {QUICK_FILTERS.map((q) => (
            <Chip key={q.key} active={filters.quick === q.key} onClick={() => setF({ quick: q.key })}>
              {q.label}
            </Chip>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 pt-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onToggleAll}>
            {anyExpanded ? 'Collapse All' : 'Expand All'}
          </button>

          <Dropdown label="Columns ▾">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Show columns</p>
            {COLUMN_TOGGLES.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 py-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={columns[key]}
                  onChange={(e) => setColumns((c) => ({ ...c, [key]: e.target.checked }))}
                />
                <span className="text-xs text-gray-700">{label}</span>
              </label>
            ))}
          </Dropdown>

          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            {['comfortable', 'compact'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                className={`px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                  density === d ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active filter pills */}
      {pills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {pills.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setFilters((f) => clearFilter(f, p.key))}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
            >
              {p.label}<span className="text-blue-400">✕</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-[11px] font-medium text-gray-500 hover:text-gray-700 underline ml-1"
          >
            Reset All Filters
          </button>
        </div>
      )}
    </div>
  )
}
