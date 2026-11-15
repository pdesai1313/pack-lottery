/**
 * Week maths and cache behaviour for the Lottery Commission module.
 *
 * The portal only speaks in four-week windows ending on a Saturday, so every
 * period the UI offers has to be translated into that shape. These tests pin
 * the translation and the rule that a cached week is never re-fetched.
 */
jest.mock('../lib/lottery', () => {
  const actual = jest.requireActual('../lib/lottery')
  return { ...actual, getSession: jest.fn(), fetchInvoiceWeeks: jest.fn() }
})

const lottery = require('../lib/lottery')
const { weekEndingsInRange, latestWeekEnding, weekEndingOnOrBefore, parseInvoice } = jest.requireActual('../lib/lottery')
const { getWeeks } = require('../lib/lotteryCache')

// 2026-11-14 is a Saturday, which is why it anchors these cases.
const SATURDAY = new Date('2026-11-14T12:00:00Z')

describe('week boundaries', () => {
  test('a Saturday is its own week ending', () => {
    expect(weekEndingOnOrBefore('2026-11-14')).toBe('2026-11-14')
  })

  test('mid-week rolls back to the previous Saturday', () => {
    expect(weekEndingOnOrBefore('2026-11-18')).toBe('2026-11-14') // Wednesday
    expect(weekEndingOnOrBefore('2026-11-15')).toBe('2026-11-14') // Sunday
    expect(weekEndingOnOrBefore('2026-11-13')).toBe('2026-11-07') // Friday
  })

  test('latestWeekEnding does not return a week still in progress', () => {
    expect(latestWeekEnding(new Date('2026-11-18T12:00:00Z'))).toBe('2026-11-14')
    expect(latestWeekEnding(SATURDAY)).toBe('2026-11-14')
  })
})

describe('weekEndingsInRange', () => {
  test('returns newest first, inclusive of both ends', () => {
    expect(weekEndingsInRange('2026-10-24', '2026-11-14', SATURDAY))
      .toEqual(['2026-11-14', '2026-11-07', '2026-10-31', '2026-10-24'])
  })

  test('excludes weeks that have not closed yet', () => {
    // Asking to the end of November while only the 14th has closed.
    expect(weekEndingsInRange('2026-11-01', '2026-11-30', SATURDAY))
      .toEqual(['2026-11-14', '2026-11-07'])
  })

  test('a calendar month yields the weeks ending inside it', () => {
    expect(weekEndingsInRange('2026-10-01', '2026-10-31', SATURDAY))
      .toEqual(['2026-10-31', '2026-10-24', '2026-10-17', '2026-10-10', '2026-10-03'])
  })

  test('a single Saturday yields exactly that week', () => {
    expect(weekEndingsInRange('2026-10-17', '2026-10-17', SATURDAY)).toEqual(['2026-10-17'])
  })

  test('a range containing no Saturday yields nothing', () => {
    // Sunday through Friday — no week closes in that window.
    expect(weekEndingsInRange('2026-11-08', '2026-11-13', SATURDAY)).toEqual([])
  })
})

describe('parseInvoice', () => {
  const payload = {
    table: [
      { label: 'Online', isGroupHeader: true, weekEndValues: [0, 0, 0, 0] },
      { label: 'Net Sales', weekEndValues: [10, 20, 30, 40] },
      { label: 'Cash Bonus', weekEndValues: [1, 2, 3, 4] },
      { label: 'Online Due', isGroupTotal: true, weekEndValues: [5, 6, 7, 8] },
      { label: 'Instant', isGroupHeader: true, weekEndValues: [0, 0, 0, 0] },
      { label: 'Gross Sales', weekEndValues: [100, 200, 300, 400] },
      { label: 'Instant Due', isGroupTotal: true, weekEndValues: [50, 60, 70, 80] },
      { label: 'Total Due', weekEndValues: [55, 66, 77, 88] },
    ],
  }

  test('the last column is the requested week and earlier columns step back by seven days', () => {
    const weeks = parseInvoice(payload, '2026-11-14')
    expect(weeks.map((w) => w.weekEnding))
      .toEqual(['2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14'])
  })

  test('group headers route line items to online or instant', () => {
    const [, , , latest] = parseInvoice(payload, '2026-11-14')
    expect(latest.online).toEqual({ netSales: 40, cashBonus: 4, due: 8 })
    expect(latest.instant).toEqual({ grossSales: 400, due: 80 })
    expect(latest.totalDue).toBe(88)
  })
})

describe('getWeeks caching', () => {
  // Minimal stand-in for the Prisma lotteryWeek delegate.
  function fakePrisma(seed = []) {
    const store = new Map(seed.map((w) => [w.weekEnding, w]))
    return {
      store,
      lotteryWeek: {
        findMany: jest.fn(async ({ where }) =>
          where.weekEnding.in.filter((w) => store.has(w)).map((w) => store.get(w))),
        upsert: jest.fn(async ({ where, create }) => {
          store.set(where.weekEnding, { weekEnding: where.weekEnding, ...create })
        }),
      },
    }
  }

  // The portal's four-week window ending on `endDate`.
  function window(endDate) {
    const out = []
    for (let i = 3; i >= 0; i--) {
      const d = new Date(`${endDate}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 7 * i)
      const weekEnding = d.toISOString().slice(0, 10)
      out.push({ weekEnding, online: { netSales: 1 }, instant: { grossSales: 2 }, totalDue: 3 })
    }
    return out
  }

  beforeEach(() => {
    jest.clearAllMocks()
    lottery.getSession.mockResolvedValue({ cookie: 'x', locationId: '1' })
    lottery.fetchInvoiceWeeks.mockImplementation(async (_s, endDate) => window(endDate))
  })

  test('an empty cache costs one portal call per four weeks', async () => {
    const prisma = fakePrisma()
    const res = await getWeeks(prisma, { startDate: '2026-10-24', endDate: '2026-11-14' })

    expect(res.weeks.map((w) => w.weekEnding))
      .toEqual(['2026-11-14', '2026-11-07', '2026-10-31', '2026-10-24'])
    expect(res.portalCalls).toBe(1)
    expect(res.fetched).toBe(4)
    expect(res.cached).toBe(0)
  })

  test('a fully cached range never touches the portal', async () => {
    const prisma = fakePrisma(window('2026-11-14'))
    const res = await getWeeks(prisma, { startDate: '2026-10-24', endDate: '2026-11-14' })

    expect(lottery.fetchInvoiceWeeks).not.toHaveBeenCalled()
    expect(res.cached).toBe(4)
    expect(res.fetched).toBe(0)
  })

  test('one missing week pulls its three neighbours in the same call', async () => {
    // Hold the oldest three; only 2026-11-14 is absent.
    const prisma = fakePrisma(window('2026-11-07').slice(1))
    const res = await getWeeks(prisma, { startDate: '2026-10-24', endDate: '2026-11-14' })

    expect(res.portalCalls).toBe(1)
    expect(res.weeks).toHaveLength(4)
    // Every week the call returned is written through, not just the one that
    // was missing, so the next request for this range needs no portal at all.
    expect(prisma.lotteryWeek.upsert).toHaveBeenCalledTimes(4)
  })

  test('refresh re-pulls a range that is already cached', async () => {
    const prisma = fakePrisma(window('2026-11-14'))
    const res = await getWeeks(prisma, { startDate: '2026-10-24', endDate: '2026-11-14', refresh: true })

    expect(lottery.fetchInvoiceWeeks).toHaveBeenCalledTimes(1)
    expect(res.cached).toBe(0)
    expect(res.fetched).toBe(4)
  })

  test('a long gap terminates even when the portal reports nothing for a week', async () => {
    // A silent portal must not leave weeks outstanding and spin forever.
    lottery.fetchInvoiceWeeks.mockResolvedValue([])
    const prisma = fakePrisma()
    const res = await getWeeks(prisma, { startDate: '2026-08-15', endDate: '2026-11-14' })

    expect(res.weeks).toEqual([])
    expect(res.portalCalls).toBe(4) // 13 weeks → ceil(13/4)
  })

  test('a range with no closed weeks asks the portal nothing', async () => {
    const prisma = fakePrisma()
    const res = await getWeeks(prisma, { startDate: '2026-11-08', endDate: '2026-11-13' })

    expect(res.weeks).toEqual([])
    expect(lottery.getSession).not.toHaveBeenCalled()
  })
})
