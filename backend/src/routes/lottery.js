const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole } = require('../middleware/auth')
const { encrypt } = require('../lib/crypto')
const { getSession, fetchCommissions, latestWeekEnding, LotteryError } = require('../lib/lottery')
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

function publicSettings(s) {
  return {
    username: s.lotteryUsername || '',
    hasPassword: Boolean(s.lotteryPasswordEnc),
    tokenExpiresAt: s.lotteryTokenExpiresAt,
    connected: Boolean(s.lotteryToken),
  }
}

function handleLotteryError(res, e) {
  if (e instanceof LotteryError) {
    return res.status(e.status === 401 ? 400 : e.status).json({ error: e.message, detail: e.detail })
  }
  throw e
}

// Never returns the stored password — only whether one is present.
router.get('/settings', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  res.json(publicSettings(await settingsRow()))
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
    // Credentials changed — any cached session belongs to the old account.
    data.lotteryToken = null
    data.lotteryTokenExpiresAt = null
  }

  const updated = await prisma.appSettings.update({ where: { id: 1 }, data })
  await audit(prisma, req.user.id, 'UPDATE', 'SETTINGS', 1, `Updated Mass Lottery credentials (${username})`)
  res.json(publicSettings(updated))
})

// Forces a fresh login so the result reflects the stored credentials, not a
// cookie cached from an earlier session.
router.post('/test', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const s = await settingsRow()
  if (!s.lotteryUsername || !s.lotteryPasswordEnc) {
    return res.status(400).json({ error: 'Save a Mass Lottery username and password first.' })
  }

  try {
    const session = await getSession(prisma, { forceRefresh: true })
    await audit(prisma, req.user.id, 'UPDATE', 'SETTINGS', 1, 'Tested Mass Lottery connection (success)')
    res.json({ ok: true, locationId: session.locationId, expiresAt: session.expiresAt })
  } catch (e) {
    handleLotteryError(res, e)
  }
})

router.get('/commissions', verifyAccessToken, requireRole(['ADMIN', 'REVIEWER']), async (req, res) => {
  const schema = z.object({
    weeks: z.coerce.number().int().min(1).max(104).default(12),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  const parsed = schema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { weeks, endDate } = parsed.data
  try {
    const data = await fetchCommissions(prisma, { weeks, endDate: endDate || latestWeekEnding() })
    res.json({ weeks: data })
  } catch (e) {
    handleLotteryError(res, e)
  }
})

module.exports = router
