const FLAGS = {
  ERROR_NEGATIVE_DELTA: 'ERROR_NEGATIVE_DELTA',
  ERROR_OVERFLOW: 'ERROR_OVERFLOW',
  ERROR_NON_NUMERIC_TICKET: 'ERROR_NON_NUMERIC_TICKET',
  WARNING_SMALL_MISMATCH: 'WARNING_SMALL_MISMATCH',
  WARNING_DUPLICATE_SCAN: 'WARNING_DUPLICATE_SCAN',
  WARNING_NEW_BOOK: 'WARNING_NEW_BOOK',
  MISSING_START: 'MISSING_START',
}

function parseFlags(str) {
  try { return JSON.parse(str || '[]') } catch { return [] }
}

function serializeFlags(arr) {
  return JSON.stringify(arr || [])
}

function isErrorFlag(flag) {
  return flag.startsWith('ERROR_') || flag === FLAGS.MISSING_START
}

/**
 * Extract ticket number from a hardware-scanner barcode string.
 * Formula: MID(barcode, 11, 3) → characters at 0-indexed positions 10-12.
 * If the string is short (manual entry), return it as-is.
 */
function extractTicketNumber(raw) {
  const trimmed = raw.trim()
  if (trimmed.length >= 13) {
    const extracted = trimmed.substring(10, 13)
    const num = parseInt(extracted, 10)
    return { ticketNumber: isNaN(num) ? null : num, rawBarcode: trimmed }
  }
  const num = parseInt(trimmed, 10)
  return { ticketNumber: isNaN(num) ? null : num, rawBarcode: null }
}

/**
 * Return the first ticket number for a fresh (full) pack.
 * Tickets go DOWN from PackSize-1 to 0.
 */
function initialTicket(packSize) {
  return packSize - 1
}

/**
 * Compute units sold. Normal: start - end (tickets decrease as sold).
 * Wraparound: when a new book is opened mid-shift, the end ticket number
 * is higher than start (new book starts at packSize-1). In that case:
 * units = startTicket + packSize - endTicket.
 */
function computeDelta({ rawInput, startTicket, packSize, ticketValue, toleranceTickets, existingEndTickets = [] }) {
  const flags = []
  const { ticketNumber, rawBarcode } = extractTicketNumber(rawInput)

  if (ticketNumber === null) {
    flags.push(FLAGS.ERROR_NON_NUMERIC_TICKET)
    return { endTicket: null, computedUnits: null, computedAmount: null, flags, rawBarcode }
  }

  const endTicket = ticketNumber

  if (startTicket == null) {
    flags.push(FLAGS.MISSING_START)
    return { endTicket, computedUnits: null, computedAmount: null, flags, rawBarcode }
  }

  let computedUnits
  if (endTicket > startTicket) {
    // New book opened during shift: scanned ticket belongs to a fresh pack
    computedUnits = startTicket + packSize - endTicket
    flags.push(FLAGS.WARNING_NEW_BOOK)
  } else {
    computedUnits = startTicket - endTicket
  }

  const computedAmount = parseFloat((computedUnits * ticketValue).toFixed(2))

  if (computedUnits < 0) flags.push(FLAGS.ERROR_NEGATIVE_DELTA)
  if (computedUnits > 2 * packSize) flags.push(FLAGS.ERROR_OVERFLOW)

  if (
    flags.length === 0 &&
    endTicket >= 0 &&
    endTicket <= toleranceTickets
  ) {
    flags.push(FLAGS.WARNING_SMALL_MISMATCH)
  }

  if (existingEndTickets.includes(endTicket)) {
    flags.push(FLAGS.WARNING_DUPLICATE_SCAN)
  }

  return { endTicket, computedUnits, computedAmount, flags, rawBarcode }
}

/**
 * Resolve the start ticket for a new PackState.
 *
 * startSource options:
 *   'previous_day' (default) — use ScannerState.lastCommittedTicket (updated on every commit)
 *   'today_last'             — use the most recent closed shift today
 *   'manual'                 — use a specific shift's committed end ticket
 */
async function resolveStartTicket({ startSource, manualShiftId, packId, packSize, date, prisma }) {
  if (startSource === 'today_last') {
    const todayShift = await prisma.shift.findFirst({
      where: { date, status: 'CLOSED' },
      orderBy: { createdAt: 'desc' },
    })
    if (todayShift) {
      const sale = await prisma.packSale.findUnique({
        where: { packId_shiftId: { packId, shiftId: todayShift.id } },
      })
      if (sale) return sale.endTicket
    }
    // No closed shift today — fall through to scanner state
  }

  if (startSource === 'manual' && manualShiftId) {
    const sale = await prisma.packSale.findUnique({
      where: { packId_shiftId: { packId, shiftId: manualShiftId } },
    })
    return sale ? sale.endTicket : null
  }

  // Default: use scanner state (last committed ticket across all shifts)
  const state = await prisma.scannerState.findUnique({ where: { packId } })
  if (!state) return initialTicket(packSize)
  return state.lastCommittedTicket === 0 ? initialTicket(packSize) : state.lastCommittedTicket
}

module.exports = { FLAGS, parseFlags, serializeFlags, isErrorFlag, computeDelta, resolveStartTicket, extractTicketNumber, initialTicket }
