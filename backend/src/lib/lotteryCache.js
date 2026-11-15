/**
 * Persistent cache for Mass Lottery weekly invoice data.
 *
 * A week that has closed never changes, so it is pulled from the portal once
 * and served from the database forever after. Only a deliberate refresh goes
 * back to the portal for a week we already hold.
 *
 * The portal returns four weeks per request, which shapes the strategy: to
 * cover a gap we anchor a call on the newest missing week and get its three
 * predecessors for free, so a 52-week history costs 13 calls the first time
 * and none thereafter.
 */
const {
  getSession,
  fetchInvoiceWeeks,
  weekEndingsInRange,
  addDays,
  WEEK_COLUMNS,
  LotteryError,
} = require('./lottery')

// A single request should never be able to hammer the portal indefinitely.
// 52 calls covers 208 weeks — four years — which is past any range the UI
// offers, so hitting this means something is wrong rather than merely large.
const MAX_PORTAL_CALLS = 52

function toRecord(row) {
  return {
    weekEnding: row.weekEnding,
    online: row.online ?? {},
    instant: row.instant ?? {},
    totalDue: row.totalDue ?? 0,
  }
}

// Re-logs in once if a cached cookie lapsed mid-run, then gives up.
async function fetchWithRetry(prisma, sessionRef, endDate) {
  try {
    return await fetchInvoiceWeeks(sessionRef.session, endDate)
  } catch (e) {
    if (e instanceof LotteryError && e.status === 401) {
      sessionRef.session = await getSession(prisma, { forceRefresh: true })
      return await fetchInvoiceWeeks(sessionRef.session, endDate)
    }
    throw e
  }
}

async function storeWeek(prisma, week) {
  const data = {
    online: week.online ?? {},
    instant: week.instant ?? {},
    totalDue: week.totalDue ?? 0,
    fetchedAt: new Date(),
  }
  await prisma.lotteryWeek.upsert({
    where: { weekEnding: week.weekEnding },
    create: { weekEnding: week.weekEnding, ...data },
    update: data,
  })
}

/**
 * Returns every closed week ending inside [startDate, endDate], newest first.
 *
 * @param {boolean} refresh  Re-pull the whole range from the portal, replacing
 *                           what is cached. Used by the UI's Refresh button
 *                           when the portal is suspected of amending a week.
 */
async function getWeeks(prisma, { startDate, endDate, refresh = false }) {
  const wanted = weekEndingsInRange(startDate, endDate)
  if (wanted.length === 0) {
    return { weeks: [], cached: 0, fetched: 0, portalCalls: 0 }
  }

  const stored = refresh
    ? []
    : await prisma.lotteryWeek.findMany({ where: { weekEnding: { in: wanted } } })

  const have = new Map(stored.map((r) => [r.weekEnding, toRecord(r)]))
  const cachedCount = have.size

  // Newest first, so each call's three free predecessors land on weeks we
  // still need rather than ones already covered.
  const missing = wanted.filter((w) => !have.has(w))
  let portalCalls = 0

  if (missing.length > 0) {
    const sessionRef = { session: await getSession(prisma) }
    const outstanding = new Set(missing)

    while (outstanding.size > 0) {
      if (portalCalls >= MAX_PORTAL_CALLS) {
        throw new LotteryError(
          `That range needs more than ${MAX_PORTAL_CALLS} portal requests. Narrow it and try again.`,
          400
        )
      }

      const anchor = [...outstanding].sort().pop()
      const batch = await fetchWithRetry(prisma, sessionRef, anchor)
      portalCalls++

      for (const week of batch) {
        await storeWeek(prisma, week)
        if (outstanding.has(week.weekEnding)) have.set(week.weekEnding, week)
      }

      // Clear the whole window the call covered, not just the weeks it
      // returned values for. A week the portal reports as empty is still
      // answered, and leaving it outstanding would loop forever.
      for (let i = 0; i < WEEK_COLUMNS; i++) outstanding.delete(addDays(anchor, -7 * i))
    }
  }

  const weeks = wanted.filter((w) => have.has(w)).map((w) => have.get(w))
  return {
    weeks,
    cached: refresh ? 0 : cachedCount,
    fetched: weeks.length - (refresh ? 0 : cachedCount),
    portalCalls,
  }
}

module.exports = { getWeeks }
