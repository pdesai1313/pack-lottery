const FLAGS = {
  ERROR_NEGATIVE_DELTA: 'ERROR_NEGATIVE_DELTA',
  ERROR_OVERFLOW: 'ERROR_OVERFLOW',
  ERROR_NON_NUMERIC_TICKET: 'ERROR_NON_NUMERIC_TICKET',
  WARNING_SMALL_MISMATCH: 'WARNING_SMALL_MISMATCH',
  WARNING_DUPLICATE_SCAN: 'WARNING_DUPLICATE_SCAN',
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
  // Barcode strings from the scanner are long (20+ chars)
  if (trimmed.length >= 13) {
    const extracted = trimmed.substring(10, 13)
    const num = parseInt(extracted, 10)
    return { ticketNumber: isNaN(num) ? null : num, rawBarcode: trimmed }
  }
  // Short input = manual ticket number
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
 * Compute Units = Start - End (tickets go DOWN as sold).
 * Pure function — no DB calls.
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

  // Units = Start - End  (ticket numbers decrease as sold)
  const computedUnits = startTicket - endTicket
  const computedAmount = parseFloat((computedUnits * ticketValue).toFixed(2))

  if (computedUnits < 0) flags.push(FLAGS.ERROR_NEGATIVE_DELTA)
  if (computedUnits > packSize) flags.push(FLAGS.ERROR_OVERFLOW)

  // Warning when only a few tickets remain (near-empty)
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
 * Resolve StartTicket for a new PackState based on shift type.
 *
 * MORNING  → ScannerState.lastCommittedTicket (from previous FULL_DAY)
 *            If 0 (new pack) → PackSize - 1
 * EVENING  → same-day MORNING PackSale.endTicket for this pack
 * FULL_DAY → ScannerState.lastCommittedTicket (same as MORNING, NOT EVENING's end)
 *            If 0 (new pack) → PackSize - 1
 */
async function resolveStartTicket({ shiftTag, packId, packSize, date, prisma }) {
  if (shiftTag === 'MORNING' || shiftTag === 'FULL_DAY') {
    const state = await prisma.scannerState.findUnique({ where: { packId } })
    if (!state) return initialTicket(packSize)
    return state.lastCommittedTicket === 0 ? initialTicket(packSize) : state.lastCommittedTicket
  }

  if (shiftTag === 'EVENING') {
    const morningShift = await prisma.shift.findUnique({
      where: { date_shiftTag: { date, shiftTag: 'MORNING' } },
    })
    if (!morningShift) return null
    const sale = await prisma.packSale.findUnique({
      where: { packId_shiftId: { packId, shiftId: morningShift.id } },
    })
    return sale ? sale.endTicket : null
  }

  return null
}

module.exports = { FLAGS, parseFlags, serializeFlags, isErrorFlag, computeDelta, resolveStartTicket, extractTicketNumber, initialTicket }
