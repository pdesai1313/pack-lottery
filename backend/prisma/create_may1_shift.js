require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// PACK-001..077 = column A sequence numbers 1..77
// PACK-078..081 = blank rows (no col A number) — included with null start/end
const SHIFT_PACK_DATA = [
  { packId:'PACK-001', start:21,   end:20   },
  { packId:'PACK-002', start:30,   end:30   },
  { packId:'PACK-003', start:5,    end:5    },
  { packId:'PACK-004', start:12,   end:12   },
  { packId:'PACK-005', start:30,   end:29   },
  { packId:'PACK-006', start:8,    end:8    },
  { packId:'PACK-007', start:35,   end:31   },
  { packId:'PACK-008', start:28,   end:28   },
  { packId:'PACK-009', start:11,   end:11   },
  { packId:'PACK-010', start:47,   end:46   },
  { packId:'PACK-011', start:15,   end:15   },
  { packId:'PACK-012', start:8,    end:8    },
  { packId:'PACK-013', start:2,    end:2    },
  { packId:'PACK-014', start:35,   end:31   },
  { packId:'PACK-015', start:72,   end:70   },
  { packId:'PACK-016', start:14,   end:14   },
  { packId:'PACK-017', start:38,   end:35   },
  { packId:'PACK-018', start:2,    end:2    },
  { packId:'PACK-019', start:78,   end:75   },
  { packId:'PACK-020', start:16,   end:14   },
  { packId:'PACK-021', start:25,   end:6    },
  { packId:'PACK-022', start:10,   end:6    },
  { packId:'PACK-023', start:89,   end:86   },
  { packId:'PACK-024', start:19,   end:17   },
  { packId:'PACK-025', start:10,   end:10   },
  { packId:'PACK-026', start:72,   end:61   },
  { packId:'PACK-027', start:57,   end:53   },
  { packId:'PACK-028', start:62,   end:61   },
  { packId:'PACK-029', start:89,   end:84   },
  { packId:'PACK-030', start:22,   end:6    },
  { packId:'PACK-031', start:99,   end:99   },
  { packId:'PACK-032', start:74,   end:74   },
  { packId:'PACK-033', start:37,   end:33   },
  { packId:'PACK-034', start:96,   end:96   },
  { packId:'PACK-035', start:38,   end:35   },
  { packId:'PACK-036', start:37,   end:37   },
  { packId:'PACK-037', start:18,   end:18   },
  { packId:'PACK-038', start:85,   end:77   },
  { packId:'PACK-039', start:64,   end:64   },
  { packId:'PACK-040', start:12,   end:10   },
  { packId:'PACK-041', start:66,   end:65   },
  { packId:'PACK-042', start:15,   end:15   },
  { packId:'PACK-043', start:82,   end:82   },
  { packId:'PACK-044', start:68,   end:57   },
  { packId:'PACK-045', start:71,   end:63   },
  { packId:'PACK-046', start:64,   end:62   },
  { packId:'PACK-047', start:8,    end:8    },
  { packId:'PACK-048', start:90,   end:90   },
  { packId:'PACK-049', start:68,   end:67   },
  { packId:'PACK-050', start:1,    end:99   },
  { packId:'PACK-051', start:86,   end:84   },
  { packId:'PACK-052', start:142,  end:134  },
  { packId:'PACK-053', start:48,   end:48   },
  { packId:'PACK-054', start:106,  end:104  },
  { packId:'PACK-055', start:61,   end:61   },
  { packId:'PACK-056', start:94,   end:64   },
  { packId:'PACK-057', start:94,   end:79   },
  { packId:'PACK-058', start:147,  end:145  },
  { packId:'PACK-059', start:27,   end:20   },
  { packId:'PACK-060', start:108,  end:106  },
  { packId:'PACK-061', start:8,    end:5    },
  { packId:'PACK-062', start:14,   end:13   },
  { packId:'PACK-063', start:12,   end:10   },
  { packId:'PACK-064', start:30,   end:28   },
  { packId:'PACK-065', start:64,   end:62   },
  { packId:'PACK-066', start:34,   end:25   },
  { packId:'PACK-067', start:1,    end:149  },
  { packId:'PACK-068', start:137,  end:130  },
  { packId:'PACK-069', start:64,   end:64   },
  { packId:'PACK-070', start:118,  end:118  },
  { packId:'PACK-071', start:22,   end:21   },
  { packId:'PACK-072', start:37,   end:37   },
  { packId:'PACK-073', start:70,   end:70   },
  { packId:'PACK-074', start:143,  end:142  },
  { packId:'PACK-075', start:149,  end:149  },
  { packId:'PACK-076', start:43,   end:36   },
  { packId:'PACK-077', start:110,  end:107  },
  { packId:'PACK-078', start:null, end:null },
  { packId:'PACK-079', start:null, end:null },
  { packId:'PACK-080', start:null, end:null },
  { packId:'PACK-081', start:null, end:null },
]

const TOLERANCE = 2

function computePackState(start, end, packSize, ticketValue) {
  if (end === null || start === null) {
    return { endTicket: null, computedUnits: null, computedAmount: null, flags: '[]' }
  }
  const flags = []
  let computedUnits
  if (end > start) {
    computedUnits = start + packSize - end
    flags.push('WARNING_NEW_BOOK')
  } else {
    computedUnits = start - end
  }
  const computedAmount = parseFloat((computedUnits * ticketValue).toFixed(2))
  if (computedUnits < 0) flags.push('ERROR_NEGATIVE_DELTA')
  if (computedUnits > 2 * packSize) flags.push('ERROR_OVERFLOW')
  if (flags.length === 0 && end >= 0 && end <= TOLERANCE) flags.push('WARNING_SMALL_MISMATCH')
  return { endTicket: end, computedUnits, computedAmount, flags: JSON.stringify(flags) }
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@example.com' } })
  if (!admin) throw new Error('Admin user not found — run seed.js first')

  const existing = await prisma.shift.findFirst({ where: { date: '2026-05-01', shiftTag: 'Noon' } })
  if (existing) {
    console.log('Removing existing Noon May_01 shift...')
    await prisma.$transaction([
      prisma.packState.deleteMany({ where: { shiftId: existing.id } }),
      prisma.packSale.deleteMany({ where: { shiftId: existing.id } }),
      prisma.shift.delete({ where: { id: existing.id } }),
    ])
  }

  const shift = await prisma.shift.create({
    data: {
      date: '2026-05-01',
      shiftTag: 'Noon',
      status: 'OPEN',
      isAuthoritative: true,
      createdById: admin.id,
      onlineSale: 1632,
      atm: 0,
      onlineCash: 1103,
      instantCash: 1493,
      actualCashOnHand: 1166,
    },
  })
  console.log(`✓ Shift created: id=${shift.id} — Noon May_01`)

  const packs = await prisma.pack.findMany()
  const packMap = Object.fromEntries(packs.map((p) => [p.packId, p]))

  let created = 0, skipped = 0
  for (const row of SHIFT_PACK_DATA) {
    const pack = packMap[row.packId]
    if (!pack) { console.warn(`  ⚠ ${row.packId} not found — skipped`); skipped++; continue }

    const { endTicket, computedUnits, computedAmount, flags } = computePackState(
      row.start, row.end, pack.packSize, pack.ticketValue
    )
    await prisma.packState.create({
      data: { packId: pack.id, shiftId: shift.id, startTicket: row.start, endTicket, computedUnits, computedAmount, flags, status: 'OPEN' },
    })
    created++
  }

  console.log(`✓ ${created} pack states created${skipped ? `, ${skipped} skipped` : ''}`)
  console.log('')
  console.log('  Reconciliation: Online $1,632 | ATM $0 | Online Cash $1,103 | Instant Cash $1,493 | Actual COH $1,166')
  console.log('  Open the app → Shifts → "Noon" → Commit to review and finalize.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
