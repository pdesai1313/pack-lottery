/**
 * APPLY — May 7 PackSale correction
 *
 * Restores correct startTicket / unitsSold / amount from PackState for
 * Foram's Shift (id=23) and Full Day Report (id=24) on 2026-05-07.
 *
 * Root cause: Full Day Report was committed before Foram's Shift, causing
 * getEffectiveStartTicket to read stale scanner states for Foram's Shift.
 *
 * Run dry_run_may7_fix.js first to review changes.
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function buildUpdates(shiftId) {
  const packStates = await prisma.packState.findMany({ where: { shiftId }, include: { pack: true } })
  const packSales  = await prisma.packSale.findMany({ where: { shiftId } })
  const saleMap    = new Map(packSales.map((s) => [s.packId, s]))

  const updates = []
  for (const ps of packStates) {
    const sale = saleMap.get(ps.packId)
    if (!sale) continue
    const correctUnits  = ps.computedUnits  ?? 0
    const correctAmount = ps.computedAmount ?? 0
    const startChanged  = ps.startTicket  !== sale.startTicket
    const unitsChanged  = correctUnits    !== sale.unitsSold
    const amountChanged = Math.abs(correctAmount - sale.amount) > 0.001
    if (startChanged || unitsChanged || amountChanged) {
      updates.push({ id: sale.id, startTicket: ps.startTicket, unitsSold: correctUnits, amount: correctAmount })
    }
  }
  return updates
}

async function main() {
  const u23 = await buildUpdates(23)
  const u24 = await buildUpdates(24)
  const all  = [...u23, ...u24]

  console.log(`\n🔧  Applying ${all.length} updates (${u23.length} Foram's Shift + ${u24.length} Full Day Report)…`)

  await prisma.$transaction(
    all.map((u) =>
      prisma.packSale.update({
        where: { id: u.id },
        data: { startTicket: u.startTicket, unitsSold: u.unitsSold, amount: u.amount },
      })
    ),
    { timeout: 30000 }
  )

  console.log('✅  Done.\n')

  // Verify
  const [s23, s24] = await Promise.all([
    prisma.packSale.aggregate({ where: { shiftId: 23 }, _sum: { amount: true, unitsSold: true } }),
    prisma.packSale.aggregate({ where: { shiftId: 24 }, _sum: { amount: true, unitsSold: true } }),
  ])
  console.log(`Foram's Shift   → units=${s23._sum.unitsSold}  amount=$${s23._sum.amount?.toFixed(2)}`)
  console.log(`Full Day Report → units=${s24._sum.unitsSold}  amount=$${s24._sum.amount?.toFixed(2)}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
