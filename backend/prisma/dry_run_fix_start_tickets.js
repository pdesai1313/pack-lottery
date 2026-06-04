/**
 * DRY RUN — same-day multi-shift startTicket correction
 *
 * Identifies PackSale rows where the stored startTicket (and therefore
 * unitsSold / amount) is wrong because multiple shifts were pre-created
 * on the same day before any commit, freezing the wrong start ticket.
 *
 * Prints exactly what would change.  Makes NO database writes.
 * Run the apply script after reviewing this output.
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function computeUnits(startTicket, endTicket, packSize) {
  if (endTicket > startTicket) {
    // New-book wraparound: ticket numbers reset to packSize-1
    return startTicket + packSize - endTicket
  }
  return startTicket - endTicket
}

async function main() {
  // Load all closed shifts with their sales, sorted oldest-first within each day
  const allShifts = await prisma.shift.findMany({
    where: { status: 'CLOSED' },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: { packSales: { include: { pack: true } } },
  })

  // Group by date
  const byDate = {}
  for (const shift of allShifts) {
    if (!byDate[shift.date]) byDate[shift.date] = []
    byDate[shift.date].push(shift)
  }

  const changes   = []
  const warnings  = []

  for (const [date, shifts] of Object.entries(byDate).sort()) {
    if (shifts.length <= 1) continue // single-shift day — nothing to fix

    // Collect every pack that appears in any shift this day
    const packIds = new Set()
    for (const s of shifts) {
      for (const sale of s.packSales) packIds.add(sale.packId)
    }

    for (const packId of packIds) {
      let prevEndTicket = null   // end ticket of the previous shift's sale

      for (let i = 0; i < shifts.length; i++) {
        const shift = shifts[i]
        const sale  = shift.packSales.find((s) => s.packId === packId)

        if (!sale) {
          // This pack had no activity in this shift — chain stays null so
          // the next shift that does have a sale will use scanner state,
          // which is correct (no commits for this pack happened here).
          continue
        }

        if (prevEndTicket === null) {
          // First sale for this pack across today's shifts — correct by definition
          prevEndTicket = sale.endTicket
          continue
        }

        // Compute what this sale's values should be
        const correctStart  = prevEndTicket
        const correctUnits  = computeUnits(correctStart, sale.endTicket, sale.pack.packSize)
        const correctAmount = parseFloat((correctUnits * sale.pack.ticketValue).toFixed(2))

        if (correctUnits < 0) {
          warnings.push({
            date, shiftTag: shift.shiftTag, packId: sale.pack.packId,
            msg: `correctUnits=${correctUnits} (negative — possible data anomaly, skipping)`,
          })
          prevEndTicket = sale.endTicket
          continue
        }

        const startChanged  = correctStart  !== sale.startTicket
        const unitsChanged  = correctUnits  !== sale.unitsSold
        const amountChanged = Math.abs(correctAmount - sale.amount) > 0.001

        if (startChanged || unitsChanged || amountChanged) {
          changes.push({
            date,
            shiftTag:    shift.shiftTag,
            shiftId:     shift.id,
            packLabel:   sale.pack.packId,
            packSize:    sale.pack.packSize,
            ticketValue: sale.pack.ticketValue,
            saleId:      sale.id,
            current: {
              startTicket: sale.startTicket,
              endTicket:   sale.endTicket,
              unitsSold:   sale.unitsSold,
              amount:      sale.amount,
            },
            correct: {
              startTicket: correctStart,
              endTicket:   sale.endTicket,
              unitsSold:   correctUnits,
              amount:      correctAmount,
            },
          })
        }

        prevEndTicket = sale.endTicket
      }
    }
  }

  // ── Output ───────────────────────────────────────────────────────────────────

  const HR = '─'.repeat(96)

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS (skipped — review manually):')
    for (const w of warnings) {
      console.log(`  ${w.date}  ${w.shiftTag}  pack=${w.packId}  ${w.msg}`)
    }
  }

  if (changes.length === 0) {
    console.log('\n✅  No corrections needed — all PackSale records look correct.\n')
    return
  }

  console.log(`\n📋  DRY RUN — ${changes.length} PackSale record(s) would be updated:\n`)

  let sumCurrentAmount = 0
  let sumCorrectAmount = 0

  for (const c of changes) {
    const unitDiff   = c.correct.unitsSold - c.current.unitsSold
    const amountDiff = c.correct.amount    - c.current.amount
    console.log(HR)
    console.log(`  Date: ${c.date}   Shift: "${c.shiftTag}" (shiftId=${c.shiftId})   Pack: ${c.packLabel}  [$${c.ticketValue} × ${c.packSize}]`)
    console.log(`  Start ticket : ${c.current.startTicket}  →  ${c.correct.startTicket}`)
    console.log(`  Units sold   : ${c.current.unitsSold}  →  ${c.correct.unitsSold}   (${unitDiff >= 0 ? '+' : ''}${unitDiff})`)
    console.log(`  Amount       : $${c.current.amount.toFixed(2)}  →  $${c.correct.amount.toFixed(2)}   (${amountDiff >= 0 ? '+' : ''}$${amountDiff.toFixed(2)})`)
    sumCurrentAmount += c.current.amount
    sumCorrectAmount += c.correct.amount
  }

  const totalDiff = sumCorrectAmount - sumCurrentAmount
  console.log(HR)
  console.log('\n📊  SUMMARY')
  console.log(`  Records to update    : ${changes.length}`)
  console.log(`  Sum of affected rows (current)  : $${sumCurrentAmount.toFixed(2)}`)
  console.log(`  Sum of affected rows (corrected): $${sumCorrectAmount.toFixed(2)}`)
  console.log(`  Net difference in those rows    : ${totalDiff >= 0 ? '+' : ''}$${totalDiff.toFixed(2)}`)
  console.log('\n  ⚠️  No changes made.  Run apply_fix_start_tickets.js to apply these corrections.\n')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
