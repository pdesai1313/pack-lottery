const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole } = require('../middleware/auth')
const { encrypt } = require('../lib/crypto')
const { diagnose, latestWeekEnding, weekEndingOnOrBefore, addDays, LotteryError } = require('../lib/lottery')
const { getWeeks } = require('../lib/lotteryCache')
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

  // Always 200: the body reports which step failed, which is more useful than
  // collapsing a login problem and a blocked request into one status code.
  const result = await diagnose(prisma)
  await audit(prisma, req.user.id, 'UPDATE', 'SETTINGS', 1, `Tested Mass Lottery connection (${result.ok ? 'success' : 'failed'})`)
  res.json(result)
})

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Two ways to ask for data, because the UI offers both:
//   - a rolling count   (?weeks=4)            — the last N closed weeks
//   - an explicit range (?startDate&?endDate) — every week ending inside it,
//                                               which is how month and
//                                               single-week picks arrive.
// A range wins if both are supplied.
router.get('/commissions', verifyAccessToken, requireRole(['ADMIN', 'REVIEWER']), async (req, res) => {
  const schema = z.object({
    weeks: z.coerce.number().int().min(1).max(208).default(12),
    startDate: z.string().regex(ISO_DATE).optional(),
    endDate: z.string().regex(ISO_DATE).optional(),
    // Not z.coerce.boolean(): that makes the string "false" truthy.
    refresh: z.string().optional().transform((v) => v === 'true' || v === '1'),
  })
  const parsed = schema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { weeks, refresh } = parsed.data
  let { startDate, endDate } = parsed.data

  if (startDate && endDate) {
    if (startDate > endDate) return res.status(400).json({ error: 'startDate must be on or before endDate' })
  } else {
    // Roll back from the newest closed week, inclusive of it.
    endDate = endDate ? weekEndingOnOrBefore(endDate) : latestWeekEnding()
    startDate = addDays(endDate, -7 * (weeks - 1))
  }

  try {
    const result = await getWeeks(prisma, { startDate, endDate, refresh })
    res.json({ ...result, range: { startDate, endDate } })
  } catch (e) {
    handleLotteryError(res, e)
  }
})

module.exports = router
