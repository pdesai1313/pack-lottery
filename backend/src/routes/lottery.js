const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole } = require('../middleware/auth')
const { encrypt } = require('../lib/crypto')
const { authenticate, loadCredentials, LotteryError } = require('../lib/lottery')
const { audit } = require('../lib/audit')

const router = express.Router()
const prisma = new PrismaClient()

function settingsRow() {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, toleranceTickets: 2 },
  })
}

// Never returns the stored password — only whether one is present.
router.get('/settings', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const s = await settingsRow()
  res.json({
    username: s.lotteryUsername || '',
    hasPassword: Boolean(s.lotteryPasswordEnc),
    tokenExpiresAt: s.lotteryTokenExpiresAt,
    connected: Boolean(s.lotteryToken),
  })
})

router.put('/settings', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const schema = z.object({
    username: z.string().trim().min(1).max(200),
    // Omit to keep the existing password; send a value to replace it.
    password: z.string().min(1).max(200).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { username, password } = parsed.data
  await settingsRow()

  const data = { lotteryUsername: username }
  if (password !== undefined) {
    data.lotteryPasswordEnc = encrypt(password)
    // Credentials changed — any cached token is for the old account.
    data.lotteryToken = null
    data.lotteryTokenExpiresAt = null
  }

  const updated = await prisma.appSettings.update({ where: { id: 1 }, data })
  await audit(prisma, req.user.id, 'UPDATE', 'SETTINGS', 1, `Updated Mass Lottery credentials (${username})`)

  res.json({
    username: updated.lotteryUsername,
    hasPassword: Boolean(updated.lotteryPasswordEnc),
    tokenExpiresAt: updated.lotteryTokenExpiresAt,
    connected: Boolean(updated.lotteryToken),
  })
})

// Authenticates with the stored credentials and caches the resulting token.
router.post('/test', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const { username, password } = await loadCredentials(prisma)
  if (!username || !password) {
    return res.status(400).json({ error: 'Save a Mass Lottery username and password first.' })
  }

  try {
    const result = await authenticate(username, password)
    await prisma.appSettings.update({
      where: { id: 1 },
      data: {
        lotteryToken: result.token,
        lotteryTokenExpiresAt: result.tokenExpiration ? new Date(result.tokenExpiration) : null,
      },
    })
    await audit(prisma, req.user.id, 'UPDATE', 'SETTINGS', 1, 'Tested Mass Lottery connection (success)')

    res.json({
      ok: true,
      tokenFound: Boolean(result.token),
      cookieCount: result.cookies.length,
      tokenExpiration: result.tokenExpiration,
      // Field names only, no values — reveals where the token lives so the
      // extraction can be pinned down after the first real login.
      shape: result.shape,
    })
  } catch (e) {
    if (e instanceof LotteryError) {
      return res.status(e.status === 401 ? 400 : e.status).json({ error: e.message, detail: e.detail })
    }
    throw e
  }
})

module.exports = router
