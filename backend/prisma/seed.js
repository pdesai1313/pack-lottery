const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// Packs extracted from APRIL 2026.xlsx sheet 1
// scannerNumber = full barcode (column L), lastCommittedTicket = start position (column D)
const PACKS = [
  { packId:'PACK-001', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'43303561310055005000000000063', lastTicket:6   },
  { packId:'PACK-002', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'49001777210075005000000000074', lastTicket:8   },
  { packId:'PACK-003', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'49001839160425005000000000076', lastTicket:43  },
  { packId:'PACK-004', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'43303534140245005000000000065', lastTicket:24  },
  { packId:'PACK-005', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'49001712860045005000000000071', lastTicket:4   },
  { packId:'PACK-006', packSize:50,  ticketValue:50, gameName:'$50 Pack',  scannerNumber:'38705804710125005000000000075', lastTicket:12  },
  { packId:'PACK-007', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'49101000500183005080000000064', lastTicket:18  },
  { packId:'PACK-008', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'49101028320433005080000000072', lastTicket:43  },
  { packId:'PACK-009', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'53000307180433005050000000066', lastTicket:43  },
  { packId:'PACK-010', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'45801411530143005080000000072', lastTicket:14  },
  { packId:'PACK-011', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'45801451950443005080000000085', lastTicket:44  },
  { packId:'PACK-012', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'37302733500183005080000000077', lastTicket:18  },
  { packId:'PACK-013', packSize:50,  ticketValue:30, gameName:'$30 Pack',  scannerNumber:'54200041980433005080000000075', lastTicket:8   },
  { packId:'PACK-014', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'51900341110612010080000000062', lastTicket:65  },
  { packId:'PACK-015', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'38501233910852010080000000078', lastTicket:85  },
  { packId:'PACK-016', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'51900316390232010080000000072', lastTicket:23  },
  { packId:'PACK-017', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'50900360750622010080000000073', lastTicket:62  },
  { packId:'PACK-018', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'40900917670152010080000000079', lastTicket:15  },
  { packId:'PACK-019', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'53600159930302010080000000074', lastTicket:31  },
  { packId:'PACK-020', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'52300015890612010000000000062', lastTicket:61  },
  { packId:'PACK-021', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'53600192600732010080000000072', lastTicket:19  },
  { packId:'PACK-022', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'39300840730212010080000000070', lastTicket:75  },
  { packId:'PACK-023', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'45200930710712010080000000069', lastTicket:21  },
  { packId:'PACK-024', packSize:100, ticketValue:20, gameName:'$20 Pack',  scannerNumber:'53500268880551010070000000083', lastTicket:71  },
  { packId:'PACK-025', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'47701137390071010070000000077', lastTicket:56  },
  { packId:'PACK-026', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52100773510991010080000000078', lastTicket:8   },
  { packId:'PACK-027', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52100836840321010080000000071', lastTicket:1   },
  { packId:'PACK-028', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52100836850501010080000000072', lastTicket:37  },
  { packId:'PACK-029', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'52100836860981010080000000085', lastTicket:71  },
  { packId:'PACK-030', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'47001042710901010080000000064', lastTicket:99  },
  { packId:'PACK-031', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48801023630371010070000000073', lastTicket:92  },
  { packId:'PACK-032', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48300883950031010070000000079', lastTicket:40  },
  { packId:'PACK-033', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'44100932780291010070000000077', lastTicket:3   },
  { packId:'PACK-034', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'42701096180021010070000000068', lastTicket:32  },
  { packId:'PACK-035', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'34101076960471010070000000076', lastTicket:63  },
  { packId:'PACK-036', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'54100037550921010070000000069', lastTicket:47  },
  { packId:'PACK-037', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'40801538150571010070000000075', lastTicket:2   },
  { packId:'PACK-038', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'36801421220771010070000000071', lastTicket:57  },
  { packId:'PACK-039', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48801095010801010070000000072', lastTicket:77  },
  { packId:'PACK-040', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'50800591940091010070000000078', lastTicket:80  },
  { packId:'PACK-041', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'41301371160231010070000000060', lastTicket:9   },
  { packId:'PACK-042', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48801047040831010070000000075', lastTicket:75  },
  { packId:'PACK-043', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'34001480520251010070000000062', lastTicket:83  },
  { packId:'PACK-044', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'43101329670441010070000000072', lastTicket:99  },
  { packId:'PACK-045', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'46901507900341010070000000076', lastTicket:25  },
  { packId:'PACK-046', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'45700855740331010070000000079', lastTicket:44  },
  { packId:'PACK-047', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'53500205120561010070000000062', lastTicket:34  },
  { packId:'PACK-048', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'48700569220450515060000000088', lastTicket:33  },
  { packId:'PACK-049', packSize:100, ticketValue:10, gameName:'$10 Pack',  scannerNumber:'49800181980580515060000000097', lastTicket:56  },
  { packId:'PACK-050', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'48000830691490515060000000088', lastTicket:45  },
  { packId:'PACK-051', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'53300025221200515070000000062', lastTicket:58  },
  { packId:'PACK-052', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'47200748011180515070000000080', lastTicket:104 },
  { packId:'PACK-053', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'50400454220600515060000000068', lastTicket:149 },
  { packId:'PACK-054', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'49700433170290515060000000085', lastTicket:120 },
  { packId:'PACK-055', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'53400135050990515060000000080', lastTicket:60  },
  { packId:'PACK-056', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'52700105620690220040000000070', lastTicket:29  },
  { packId:'PACK-057', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'48600383530750220040000000079', lastTicket:149 },
  { packId:'PACK-058', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'50700119800770220040000000072', lastTicket:99  },
  { packId:'PACK-059', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'53200019380630220040000000067', lastTicket:69  },
  { packId:'PACK-060', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'51100124700880220040000000064', lastTicket:75  },
  { packId:'PACK-061', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'47100750240880215060000000079', lastTicket:77  },
  { packId:'PACK-062', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'52400084590560215060000000081', lastTicket:63  },
  { packId:'PACK-063', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'47100590470090215060000000079', lastTicket:88  },
  { packId:'PACK-064', packSize:150, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'51100244501300220040000000053', lastTicket:88  },
  { packId:'PACK-065', packSize:150, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'49500328391580220040000000084', lastTicket:56  },
  { packId:'PACK-066', packSize:150, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'49300109370480115030000000077', lastTicket:9   },
  { packId:'PACK-067', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'49300206060850115030000000072', lastTicket:130 },
  { packId:'PACK-068', packSize:200, ticketValue:2,  gameName:'$2 Pack',   scannerNumber:'47800584041440115030000000078', lastTicket:158 },
  { packId:'PACK-069', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'53100021980770115030000000072', lastTicket:48  },
  { packId:'PACK-070', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'47800530330280115030000000072', lastTicket:85  },
  { packId:'PACK-071', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'52800239701310515060000000077', lastTicket:144 },
  { packId:'PACK-072', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'38100218720340515070000000076', lastTicket:77  },
  { packId:'PACK-073', packSize:150, ticketValue:1,  gameName:'$1 Pack',   scannerNumber:'48000816820340515060000000080', lastTicket:28  },
  { packId:'PACK-074', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'47400581271330515060000000081', lastTicket:131 },
  { packId:'PACK-075', packSize:150, ticketValue:5,  gameName:'$5 Pack',   scannerNumber:'51200198480000515060000000074', lastTicket:34  },
]

async function main() {
  console.log('Seeding database...')

  // Users
  const adminHash    = await bcrypt.hash('admin123',    10)
  const reviewerHash = await bcrypt.hash('reviewer123', 10)
  const operatorHash = await bcrypt.hash('operator123', 10)

  await prisma.user.upsert({ where: { email: 'admin@example.com' },    update: {}, create: { name: 'Admin',    email: 'admin@example.com',    passwordHash: adminHash,    role: 'ADMIN'    } })
  await prisma.user.upsert({ where: { email: 'reviewer@example.com' }, update: {}, create: { name: 'Reviewer', email: 'reviewer@example.com', passwordHash: reviewerHash, role: 'REVIEWER' } })
  await prisma.user.upsert({ where: { email: 'operator@example.com' }, update: {}, create: { name: 'Operator', email: 'operator@example.com', passwordHash: operatorHash, role: 'OPERATOR' } })

  // App settings
  await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, toleranceTickets: 2 } })

  // Packs + ScannerState
  for (const p of PACKS) {
    const pack = await prisma.pack.upsert({
      where: { packId: p.packId },
      update: { packSize: p.packSize, ticketValue: p.ticketValue, gameName: p.gameName, scannerNumber: p.scannerNumber },
      create: { packId: p.packId, packSize: p.packSize, ticketValue: p.ticketValue, gameName: p.gameName, scannerNumber: p.scannerNumber },
    })
    await prisma.scannerState.upsert({
      where: { packId: pack.id },
      update: { lastCommittedTicket: p.lastTicket },
      create: { packId: pack.id, lastCommittedTicket: p.lastTicket },
    })
  }

  console.log(`✓ ${PACKS.length} packs seeded`)
  console.log('  admin@example.com    / admin123')
  console.log('  reviewer@example.com / reviewer123')
  console.log('  operator@example.com / operator123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
