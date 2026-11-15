/**
 * Local Mass Lottery connectivity check.
 *
 * Runs the same login + invoice chain the backend uses and prints only
 * non-sensitive diagnostics (cookie NAMES, HTTP statuses, row counts).
 * Credentials come from the environment, are held in memory for the run, and
 * are never written to disk or echoed.
 *
 * Purpose: compare this machine's result against the deployed backend's
 * "Test Connection". The same credentials succeeding here but failing on
 * Render points at IP-based blocking rather than anything about the account.
 *
 * Run it so the password is never typed on screen or kept in shell history:
 *
 *   read -r  -p "Username: " LU && \
 *   read -rs -p "Password: " LP && echo && \
 *   LOTTERY_USER="$LU" LOTTERY_PASS="$LP" node prisma/diagnose_lottery.js; \
 *   unset LU LP
 */
require('dotenv').config()
const { login, fetchInvoiceWeeks, latestWeekEnding } = require('../src/lib/lottery')

const USAGE = `
Set credentials via the environment, for example:

  read -r  -p "Username: " LU && \\
  read -rs -p "Password: " LP && echo && \\
  LOTTERY_USER="$LU" LOTTERY_PASS="$LP" node prisma/diagnose_lottery.js; \\
  unset LU LP
`

async function main() {
  const username = process.env.LOTTERY_USER || ''
  const password = process.env.LOTTERY_PASS || ''
  if (!username || !password) {
    console.log('LOTTERY_USER and LOTTERY_PASS must both be set.')
    console.log(USAGE)
    process.exitCode = 1
    return
  }

  console.log('\nMass Lottery connectivity check (nothing is saved)\n')

  console.log('── Step 1: login ──')
  let session
  try {
    session = await login(username, password)
    console.log('   OK')
    console.log('   locationId        :', session.locationId)
    console.log('   expiresAt         :', session.expiresAt?.toISOString() ?? '(none)')
    console.log('   cookies           :', session.cookie.split('; ').map((c) => c.split('=')[0]).join(', '))
    console.log('   CSRF-Token present:', /(?:^|;\s*)CSRF-Token=/.test(session.cookie))
  } catch (e) {
    console.log('   FAILED:', e.message)
    if (e.detail) console.log('   detail :', e.detail)
    return
  }

  const endDate = latestWeekEnding()
  console.log(`\n── Step 2: invoice (endDate=${endDate}) ──`)
  try {
    const weeks = await fetchInvoiceWeeks(session, endDate)
    console.log('   OK —', weeks.length, 'weeks returned')
    for (const w of weeks) console.log(`   ${w.weekEnding}  totalDue=${w.totalDue}`)
  } catch (e) {
    console.log('   FAILED:', e.message)
    if (e.detail) console.log('   detail :', e.detail)
    return
  }

  console.log('\nAll steps passed from this machine.')
  console.log('If the deployed backend still fails, the difference is the server IP, not the account.\n')
}

main().catch((e) => { console.error('Unexpected error:', e.message); process.exitCode = 1 })
