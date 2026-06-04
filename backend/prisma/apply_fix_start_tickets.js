/**
 * APPLY — same-day multi-shift startTicket correction
 *
 * Runs the same logic as dry_run_fix_start_tickets.js but actually
 * writes the corrected startTicket, unitsSold, and amount to PackSale.
 * All updates run inside a single transaction — either all succeed or none.
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function computeUnits(startTicket, endTicket, packSize) {
  if (endTicket > startTicket) {
    return startTicket + packSize - endTicket
  }
  return startTicket - endTicket
}

async function main() {
  const allShifts = await prisma.shift.findMany({
    where: { status: 'CLOSED' },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: { packSales: { include: { pack: true } } },
  })

  const byDate = {}
  for (const shift of allShifts) {
    if (!byDate[shift.date]) byDate[shift.date] = []
    byDate[shift.date].push(shift)
  }

  const updates  = []
  const warnings = []

  for (const [date, shifts] of Object.entries(byDate).sort()) {
    if (shifts.length <= 1) continue

    const packIds = new Set()
    for (const s of shifts) {
      for (const sale of s.packSales) packIds.add(sale.packId)
    }

    for (const packId of packIds) {
      let prevEndTicket = null

      for (let i = 0; i < shifts.length; i++) {
        const shift = shifts[i]
        const sale  = shift.packSales.find((s) => s.packId === packId)

        if (!sale) continue

        if (prevEndTicket === null) {
          prevEndTicket = sale.endTicket
          continue
        }

        const correctStart  = prevEndTicket
        const correctUnits  = computeUnits(correctStart, sale.endTicket, sale.pack.packSize)
        const correctAmount = parseFloat((correctUnits * sale.pack.ticketValue).toFixed(2))

        if (correctUnits < 0) {
          warnings.push({ date, shiftTag: shift.shiftTag, packId: sale.pack.packId, correctUnits })
          prevEndTicket = sale.endTicket
          continue
        }

        const needsUpdate =
          correctStart  !== sale.startTicket ||
          correctUnits  !== sale.unitsSold   ||
          Math.abs(correctAmount - sale.amount) > 0.001

        if (needsUpdate) {
          updates.push({
            saleId:      sale.id,
            date,
            shiftTag:    shift.shiftTag,
            packLabel:   sale.pack.packId,
            correctStart,
            correctUnits,
            correctAmount,
            current: { startTicket: sale.startTicket, unitsSold: sale.unitsSold, amount: sale.amount },
          })
        }

        prevEndTicket = sale.endTicket
      }
    }
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  SKIPPED (negative units — review manually):')
    for (const w of warnings) {
      console.log(`  ${w.date}  ${w.shiftTag}  pack=${w.packId}  correctUnits=${w.correctUnits}`)
    }
  }

  if (updates.length === 0) {
    console.log('\n✅  Nothing to fix — all PackSale records are already correct.\n')
    return
  }

  console.log(`\nApplying ${updates.length} correction(s)…\n`)

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.packSale.update({
        where: { id: u.saleId },
        data: {
          startTicket: u.correctStart,
          unitsSold:   u.correctUnits,
          amount:      u.correctAmount,
        },
      })
      console.log(`  ✓  ${u.date}  "${u.shiftTag}"  ${u.packLabel}  units ${u.current.unitsSold}→${u.correctUnits}  $${u.current.amount.toFixed(2)}→$${u.correctAmount.toFixed(2)}`)
    }
  }, { timeout: 30000 })

  const sumBefore = updates.reduce((s, u) => s + u.current.amount, 0)
  const sumAfter  = updates.reduce((s, u) => s + u.correctAmount, 0)
  console.log(`\n✅  Done.  ${updates.length} records updated.`)
  console.log(`   Affected amount before: $${sumBefore.toFixed(2)}`)
  console.log(`   Affected amount after : $${sumAfter.toFixed(2)}`)
  console.log(`   Net change            : ${(sumAfter - sumBefore) >= 0 ? '+' : ''}$${(sumAfter - sumBefore).toFixed(2)}\n`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
