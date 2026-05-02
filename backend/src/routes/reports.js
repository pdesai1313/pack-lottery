const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

router.get('/', verifyAccessToken, async (req, res) => {
  const schema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  const result = schema.safeParse(req.query)
  if (!result.success) return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' })

  const { from, to } = result.data

  const shifts = await prisma.shift.findMany({
    where: { date: { gte: from, lte: to }, status: 'CLOSED' },
    include: { packSales: { include: { pack: true } } },
    orderBy: { date: 'asc' },
  })

  // ── Summary ──────────────────────────────────────────────────────────────
  let instantSale = 0, totalUnits = 0
  let onlineSale = 0, atm = 0, onlineCash = 0, instantCash = 0, actualCOH = 0
  let reconCount = 0

  for (const s of shifts) {
    for (const sale of s.packSales) {
      instantSale += sale.amount
      totalUnits  += sale.unitsSold
    }
    if (s.onlineSale != null)       { onlineSale  += s.onlineSale;       reconCount++ }
    if (s.atm != null)               atm          += s.atm
    if (s.onlineCash != null)        onlineCash   += s.onlineCash
    if (s.instantCash != null)       instantCash  += s.instantCash
    if (s.actualCashOnHand != null)  actualCOH    += s.actualCashOnHand
  }

  const totalSale    = parseFloat((onlineSale + instantSale).toFixed(2))
  const totalCash    = parseFloat((onlineCash + instantCash).toFixed(2))
  const expectedCOH  = parseFloat((totalSale - atm - totalCash).toFixed(2))
  const overallTotal = reconCount > 0 ? parseFloat((actualCOH - expectedCOH).toFixed(2)) : null

  // ── By day ────────────────────────────────────────────────────────────────
  const dayMap = {}
  for (const s of shifts) {
    if (!dayMap[s.date]) dayMap[s.date] = {
      date: s.date, shifts: [],
      instantSale: 0, units: 0,
      onlineSale: 0, atm: 0, onlineCash: 0, instantCash: 0, actualCOH: null, hasRecon: false,
    }
    const d = dayMap[s.date]
    const shiftInstant = s.packSales.reduce((sum, sale) => sum + sale.amount, 0)
    const shiftUnits   = s.packSales.reduce((sum, sale) => sum + sale.unitsSold, 0)
    d.shifts.push({
      id: s.id,
      shiftTag: s.shiftTag,
      instantSale: parseFloat(shiftInstant.toFixed(2)),
      units: shiftUnits,
      totalSale: parseFloat((shiftInstant + (s.onlineSale || 0)).toFixed(2)),
      overallTotal: s.actualCashOnHand != null && s.onlineSale != null
        ? parseFloat((s.actualCashOnHand - (shiftInstant + s.onlineSale - (s.atm || 0) - ((s.onlineCash || 0) + (s.instantCash || 0)))).toFixed(2))
        : null,
    })
    d.instantSale += shiftInstant
    d.units       += shiftUnits
    if (s.onlineSale != null)      { d.onlineSale  += s.onlineSale;      d.hasRecon = true }
    if (s.atm != null)               d.atm         += s.atm
    if (s.onlineCash != null)        d.onlineCash  += s.onlineCash
    if (s.instantCash != null)       d.instantCash += s.instantCash
    if (s.actualCashOnHand != null)  d.actualCOH    = (d.actualCOH || 0) + s.actualCashOnHand
  }

  const byDay = Object.values(dayMap).map((d) => {
    const ts   = parseFloat((d.onlineSale + d.instantSale).toFixed(2))
    const tc   = parseFloat((d.onlineCash + d.instantCash).toFixed(2))
    const exp  = parseFloat((ts - d.atm - tc).toFixed(2))
    const overall = d.hasRecon && d.actualCOH != null ? parseFloat((d.actualCOH - exp).toFixed(2)) : null
    return {
      date: d.date,
      shifts: d.shifts,
      instantSale: parseFloat(d.instantSale.toFixed(2)),
      units: d.units,
      totalSale: ts,
      expectedCOH: exp,
      actualCOH: d.actualCOH != null ? parseFloat(d.actualCOH.toFixed(2)) : null,
      overallTotal: overall,
    }
  })

  // ── By game ───────────────────────────────────────────────────────────────
  const gameMap = {}
  for (const s of shifts) {
    for (const sale of s.packSales) {
      const name = sale.pack.gameName || 'Other'
      if (!gameMap[name]) gameMap[name] = { gameName: name, units: 0, amount: 0 }
      gameMap[name].units  += sale.unitsSold
      gameMap[name].amount += sale.amount
    }
  }
  const byGame = Object.values(gameMap)
    .map((g) => ({ ...g, amount: parseFloat(g.amount.toFixed(2)) }))
    .sort((a, b) => b.amount - a.amount)

  res.json({
    from, to,
    summary: {
      instantSale: parseFloat(instantSale.toFixed(2)),
      totalUnits,
      onlineSale: parseFloat(onlineSale.toFixed(2)),
      totalSale,
      atm: parseFloat(atm.toFixed(2)),
      totalCash,
      expectedCOH,
      actualCOH: reconCount > 0 ? parseFloat(actualCOH.toFixed(2)) : null,
      overallTotal,
      shiftsCount: shifts.length,
    },
    byDay,
    byGame,
  })
})

module.exports = router
