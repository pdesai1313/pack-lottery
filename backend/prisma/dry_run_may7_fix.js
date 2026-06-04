/**
 * DRY RUN — May 7 PackSale correction
 *
 * Root cause: May 7's Full Day Report (id=24) was committed BEFORE Foram's Shift (id=23)
 * even though Full Day Report was created later. This caused getEffectiveStartTicket to
 * read scanner states that were already updated by Full Day Report's commit, producing
 * wrong startTickets and unit counts in both shifts' PackSales.
 *
 * Fix: restore PackSale values from PackState (which was set correctly at scan time).
 * endTickets are untouched — only startTicket, unitsSold, and amount are updated.
 *
 * Makes NO database writes. Run apply_may7_fix.js after reviewing.
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function analyzeShift(shiftId, label) {
  const packStates = await prisma.packState.findMany({
    where: { shiftId },
    include: { pack: true },
    orderBy: { pack: { packId: 'asc' } },
  })
  const packSales = await prisma.packSale.findMany({
    where: { shiftId },
    include: { pack: true },
  })
  const saleMap = new Map(packSales.map((s) => [s.packId, s]))

  const changes = []
  let sumCurrent = 0, sumCorrect = 0

  for (const ps of packStates) {
    const sale = saleMap.get(ps.packId)
    if (!sale) continue

    sumCurrent += sale.amount
    const correctUnits  = ps.computedUnits  ?? 0
    const correctAmount = ps.computedAmount ?? 0
    sumCorrect += correctAmount

    const startChanged  = ps.startTicket   !== sale.startTicket
    const unitsChanged  = correctUnits     !== sale.unitsSold
    const amountChanged = Math.abs(correctAmount - sale.amount) > 0.001

    if (startChanged || unitsChanged || amountChanged) {
      changes.push({
        packLabel:    ps.pack.packId,
        ticketValue:  ps.pack.ticketValue,
        packSize:     ps.pack.packSize,
        saleId:       sale.id,
        endTicket:    sale.endTicket,
        current:  { startTicket: sale.startTicket,  unitsSold: sale.unitsSold,  amount: sale.amount },
        correct:  { startTicket: ps.startTicket,    unitsSold: correctUnits,    amount: correctAmount },
      })
    }
  }

  const HR = '─'.repeat(80)
  console.log(`\n${'═'.repeat(80)}`)
  console.log(`  ${label} (shiftId=${shiftId}) — ${changes.length} PackSale(s) to correct`)
  console.log(`${'═'.repeat(80)}`)
  for (const c of changes) {
    const unitDiff   = c.correct.unitsSold - c.current.unitsSold
    const amountDiff = c.correct.amount    - c.current.amount
    console.log(`  Pack ${c.packLabel} [$${c.ticketValue}×${c.packSize}]  endTicket=${c.endTicket}`)
    console.log(`    startTicket : ${c.current.startTicket}  →  ${c.correct.startTicket}`)
    console.log(`    unitsSold   : ${c.current.unitsSold}  →  ${c.correct.unitsSold}   (${unitDiff >= 0 ? '+' : ''}${unitDiff})`)
    console.log(`    amount      : $${c.current.amount.toFixed(2)}  →  $${c.correct.amount.toFixed(2)}   (${amountDiff >= 0 ? '+' : ''}$${amountDiff.toFixed(2)})`)
    console.log(HR)
  }
  const diff = sumCorrect - sumCurrent
  console.log(`  Total current : $${sumCurrent.toFixed(2)}`)
  console.log(`  Total correct : $${sumCorrect.toFixed(2)}`)
  console.log(`  Net change    : ${diff >= 0 ? '+' : ''}$${diff.toFixed(2)}`)

  return { changes, sumCurrent, sumCorrect }
}

async function main() {
  console.log('\n📋  DRY RUN — May 7 PackSale correction (no writes)\n')

  const r1 = await analyzeShift(23, "Foram's Shift  (2026-05-07)")
  const r2 = await analyzeShift(24, 'Full Day Report (2026-05-07)')

  const totalCurrent = r1.sumCurrent + r2.sumCurrent
  const totalCorrect = r1.sumCorrect + r2.sumCorrect
  const totalDiff    = totalCorrect - totalCurrent
  console.log('\n📊  COMBINED MAY 7 SUMMARY')
  console.log(`  Total records to update : ${r1.changes.length + r2.changes.length}`)
  console.log(`  Combined current amount : $${totalCurrent.toFixed(2)}`)
  console.log(`  Combined correct amount : $${totalCorrect.toFixed(2)}`)
  console.log(`  Net change              : ${totalDiff >= 0 ? '+' : ''}$${totalDiff.toFixed(2)}`)
  console.log('\n  ⚠️  No changes made. Run apply_may7_fix.js to apply.\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
