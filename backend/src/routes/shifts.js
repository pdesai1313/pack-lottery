const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { stringify } = require('csv-stringify/sync')
const { verifyAccessToken, requireRole } = require('../middleware/auth')
const { computeDelta, resolveStartTicket, parseFlags, serializeFlags, isErrorFlag } = require('../lib/delta')

const router = express.Router()
const prisma = new PrismaClient()

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatShift(shift) {
  return {
    ...shift,
    packStates: shift.packStates?.map((ps) => ({
      ...ps,
      flags: parseFlags(ps.flags),
    })),
    packSales: shift.packSales?.map((ps) => ({
      ...ps,
      flags: parseFlags(ps.flags),
    })),
  }
}

async function getSettings() {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, toleranceTickets: 2 },
  })
}

// ── List shifts ───────────────────────────────────────────────────────────────

router.get('/', verifyAccessToken, async (req, res) => {
  const shifts = await prisma.shift.findMany({
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    include: { createdBy: { select: { name: true, email: true } }, _count: { select: { packStates: true } } },
  })
  res.json(shifts)
})

// ── Daily summary ─────────────────────────────────────────────────────────────

router.get('/daily', verifyAccessToken, async (req, res) => {
  const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  const dateResult = dateSchema.safeParse(req.query.date)
  if (!dateResult.success) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' })

  const date = dateResult.data
  const shifts = await prisma.shift.findMany({
    where: { date },
    include: {
      packSales: { include: { pack: true } },
      packStates: { include: { pack: true } },
    },
  })

  const packs = await prisma.pack.findMany({ where: { active: true }, orderBy: { packId: 'asc' } })

  const byTag = {}
  for (const s of shifts) byTag[s.shiftTag] = s

  const summary = packs.map((pack) => {
    const row = { packId: pack.packId, gameName: pack.gameName, scannerNumber: pack.scannerNumber }
    for (const tag of ['MORNING', 'EVENING', 'FULL_DAY']) {
      const shift = byTag[tag]
      if (!shift) { row[tag] = null; continue }
      const sale = shift.packSales.find((s) => s.packId === pack.id)
      const state = shift.packStates.find((s) => s.packId === pack.id)
      row[tag] = sale
        ? { unitsSold: sale.unitsSold, amount: sale.amount, startTicket: sale.startTicket, endTicket: sale.endTicket, committed: true, flags: parseFlags(sale.flags) }
        : state
        ? { unitsSold: state.computedUnits, amount: state.computedAmount, startTicket: state.startTicket, endTicket: state.endTicket, committed: false, flags: parseFlags(state.flags) }
        : null
    }

    const m = row.MORNING?.unitsSold
    const e = row.EVENING?.unitsSold
    const f = row.FULL_DAY?.unitsSold
    row.reconciliationWarning = (m != null && e != null && f != null && m + e !== f)
      ? `MORNING(${m}) + EVENING(${e}) = ${m + e} ≠ FULL_DAY(${f})`
      : null

    return row
  })

  res.json({ date, shifts: shifts.map((s) => ({ id: s.id, shiftTag: s.shiftTag, status: s.status })), summary })
})

// ── Create shift ──────────────────────────────────────────────────────────────

router.post('/', verifyAccessToken, requireRole(['ADMIN', 'REVIEWER']), async (req, res) => {
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shiftTag: z.enum(['MORNING', 'EVENING', 'FULL_DAY']),
  })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const { date, shiftTag } = result.data

  const existing = await prisma.shift.findUnique({ where: { date_shiftTag: { date, shiftTag } } })
  if (existing) return res.status(409).json({ error: `${shiftTag} shift already exists for ${date}` })

  const packs = await prisma.pack.findMany({ where: { active: true }, orderBy: { packId: 'asc' } })

  const shift = await prisma.$transaction(async (tx) => {
    const created = await tx.shift.create({
      data: { date, shiftTag, isAuthoritative: shiftTag === 'FULL_DAY', status: 'OPEN', createdById: req.user.id },
    })

    for (const pack of packs) {
      const startTicket = await resolveStartTicket({ shiftTag, packId: pack.id, packSize: pack.packSize, date, prisma: tx })
      await tx.packState.create({
        data: { packId: pack.id, shiftId: created.id, startTicket: startTicket ?? null },
      })
    }

    return tx.shift.findUnique({
      where: { id: created.id },
      include: { packStates: { include: { pack: true } } },
    })
  })

  res.status(201).json(formatShift(shift))
})

// ── Get shift packstates ───────────────────────────────────────────────────────

router.get('/:id/packstates', verifyAccessToken, async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      packStates: { include: { pack: { include: { scannerState: true } } } },
      createdBy: { select: { name: true, email: true } },
    },
  })
  if (!shift) return res.status(404).json({ error: 'Shift not found' })
  res.json(formatShift(shift))
})

// ── Scan endpoint ─────────────────────────────────────────────────────────────

router.post('/:id/packs/:packId/scan', verifyAccessToken, async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const packId = parseInt(req.params.packId, 10)

  const schema = z.object({ scannedTicket: z.string().min(1) })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const [shift, pack, packState, settings] = await Promise.all([
    prisma.shift.findUnique({ where: { id: shiftId } }),
    prisma.pack.findUnique({ where: { id: packId } }),
    prisma.packState.findUnique({ where: { packId_shiftId: { packId, shiftId } } }),
    getSettings(),
  ])

  if (!shift) return res.status(404).json({ error: 'Shift not found' })
  if (shift.status === 'CLOSED') return res.status(409).json({ error: 'Shift is already closed' })
  if (!pack) return res.status(404).json({ error: 'Pack not found' })
  if (!packState) return res.status(404).json({ error: 'PackState not found' })

  const otherStates = await prisma.packState.findMany({
    where: { shiftId, packId: { not: packId }, endTicket: { not: null } },
    select: { endTicket: true },
  })
  const existingEndTickets = otherStates.map((s) => s.endTicket)

  const { endTicket, computedUnits, computedAmount, flags, rawBarcode } = computeDelta({
    rawInput: result.data.scannedTicket,
    startTicket: packState.startTicket,
    packSize: pack.packSize,
    ticketValue: pack.ticketValue,
    toleranceTickets: settings.toleranceTickets,
    existingEndTickets,
  })

  const updated = await prisma.packState.update({
    where: { id: packState.id },
    data: { endTicket, computedUnits, computedAmount, flags: serializeFlags(flags), rawBarcode },
  })

  res.json({ packState: { ...updated, flags } })
})

// ── Set start ticket manually ─────────────────────────────────────────────────

router.put('/:id/packs/:packId/start', verifyAccessToken, requireRole(['ADMIN', 'REVIEWER']), async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const packId = parseInt(req.params.packId, 10)

  const schema = z.object({ startTicket: z.number().int().min(0) })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const [pack, packState, settings] = await Promise.all([
    prisma.pack.findUnique({ where: { id: packId } }),
    prisma.packState.findUnique({ where: { packId_shiftId: { packId, shiftId } } }),
    getSettings(),
  ])
  if (!packState) return res.status(404).json({ error: 'PackState not found' })

  let updateData = { startTicket: result.data.startTicket }

  if (packState.endTicket != null) {
    const { computedUnits, computedAmount, flags } = computeDelta({
      rawInput: String(packState.endTicket),
      startTicket: result.data.startTicket,
      packSize: pack.packSize,
      ticketValue: pack.ticketValue,
      toleranceTickets: settings.toleranceTickets,
      existingEndTickets: [],
    })
    updateData = { ...updateData, computedUnits, computedAmount, flags: serializeFlags(flags) }
  }

  const updated = await prisma.packState.update({ where: { id: packState.id }, data: updateData })
  res.json({ ...updated, flags: parseFlags(updated.flags) })
})

// ── Reconciliation (draft save) ───────────────────────────────────────────────

router.put('/:id/reconciliation', verifyAccessToken, async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)

  const schema = z.object({
    onlineSale:       z.number().nullable().optional(),
    atm:              z.number().nullable().optional(),
    onlineCash:       z.number().nullable().optional(),
    instantCash:      z.number().nullable().optional(),
    actualCashOnHand: z.number().nullable().optional(),
  })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
  if (!shift) return res.status(404).json({ error: 'Shift not found' })

  const updated = await prisma.shift.update({
    where: { id: shiftId },
    data: result.data,
  })
  res.json(updated)
})

// ── Exceptions list ───────────────────────────────────────────────────────────

router.get('/:id/exceptions', verifyAccessToken, async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const packStates = await prisma.packState.findMany({
    where: { shiftId },
    include: { pack: true },
  })
  const exceptions = packStates
    .map((ps) => ({ ...ps, flags: parseFlags(ps.flags) }))
    .filter((ps) => ps.flags.length > 0)
  res.json(exceptions)
})

// ── Commit shift ──────────────────────────────────────────────────────────────

router.post('/:id/commit', verifyAccessToken, requireRole(['ADMIN', 'REVIEWER']), async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)

  const commitSchema = z.object({
    packCommits: z.array(z.object({
      packStateId: z.number().int(),
      overrideReason: z.string().optional().nullable(),
    })),
  })
  const result = commitSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { packStates: { include: { pack: true } } },
  })
  if (!shift) return res.status(404).json({ error: 'Shift not found' })
  if (shift.status === 'CLOSED') return res.status(409).json({ error: 'Shift already committed' })

  const overrideMap = {}
  for (const c of result.data.packCommits) overrideMap[c.packStateId] = c.overrideReason || null

  for (const ps of shift.packStates) {
    const flags = parseFlags(ps.flags)
    const hasErrors = flags.some(isErrorFlag)
    const override = overrideMap[ps.id]
    if (hasErrors && !override) {
      return res.status(422).json({
        error: `Pack ${ps.pack.packId} has unresolved error flags: ${flags.filter(isErrorFlag).join(', ')}. Provide overrideReason.`,
      })
    }
  }

  const committed = await prisma.$transaction(async (tx) => {
    const sales = []
    for (const ps of shift.packStates) {
      const override = overrideMap[ps.id] || null
      const flags = parseFlags(ps.flags)

      const sale = await tx.packSale.upsert({
        where: { packId_shiftId: { packId: ps.packId, shiftId } },
        update: {},
        create: {
          packId: ps.packId,
          shiftId,
          startTicket: ps.startTicket ?? 0,
          endTicket: ps.endTicket ?? 0,
          unitsSold: ps.computedUnits ?? 0,
          amount: ps.computedAmount ?? 0,
          flags: serializeFlags(flags),
          overrideReason: override,
        },
      })
      sales.push(sale)

      await tx.packState.update({
        where: { id: ps.id },
        data: { status: 'CLOSED', overrideReason: override },
      })

      if (shift.isAuthoritative && ps.endTicket != null) {
        await tx.scannerState.update({
          where: { packId: ps.packId },
          data: { lastCommittedTicket: ps.endTicket, lastCommittedAt: new Date() },
        })
      }
    }

    await tx.shift.update({ where: { id: shiftId }, data: { status: 'CLOSED' } })
    return sales
  })

  res.json({ status: 'ok', committedAt: new Date().toISOString(), salesCount: committed.length })
})

// ── CSV export ────────────────────────────────────────────────────────────────

router.get('/:id/export', verifyAccessToken, async (req, res) => {
  const shiftId = parseInt(req.params.id, 10)
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
  if (!shift) return res.status(404).json({ error: 'Shift not found' })

  const sales = await prisma.packSale.findMany({
    where: { shiftId },
    include: { pack: true },
    orderBy: { pack: { packId: 'asc' } },
  })

  const rows = sales.map((s) => ({
    date: shift.date,
    shift_tag: shift.shiftTag,
    pack_id: s.pack.packId,
    game_name: s.pack.gameName || '',
    scanner_number: s.pack.scannerNumber,
    start_ticket: s.startTicket,
    end_ticket: s.endTicket,
    units_sold: s.unitsSold,
    ticket_value: s.pack.ticketValue,
    amount: s.amount,
    flags: parseFlags(s.flags).join(';'),
    override_reason: s.overrideReason || '',
    committed_at: s.committedAt,
  }))

  const csv = stringify(rows, { header: true })
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="shift-${shiftId}-${shift.date}-${shift.shiftTag}.csv"`)
  res.send(csv)
})

module.exports = router
