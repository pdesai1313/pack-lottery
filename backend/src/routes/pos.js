const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken, requireRole } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

// Proxy fetch from NRS POS API
router.get('/fetch', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  const parsed = dateSchema.safeParse(req.query.date)
  if (!parsed.success) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' })

  const date = parsed.data
  const settings = await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, toleranceTickets: 2, posApiToken: '', posStoreId: '' },
  })

  if (!settings.posApiToken || !settings.posStoreId) {
    return res.status(400).json({ error: 'POS API token and store ID must be configured in Settings.' })
  }

  const url = `https://pos-papi.nrsplus.com/${settings.posApiToken}/pcrhist/${settings.posStoreId}/stats/custom/${date}/${date}?elmer_id=0`

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://mystore.nrsplus.com',
      'Referer': 'https://mystore.nrsplus.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    },
  })

  if (!response.ok) {
    return res.status(response.status).json({ error: `POS API returned ${response.status}` })
  }

  const body = await response.json()

  if (body.res?.rc !== 0) {
    return res.status(400).json({ error: body.res?.msg || 'POS API error' })
  }

  const pa = body.data?.paybaskets?.payamts
  if (!pa) return res.status(400).json({ error: 'Unexpected POS API response structure' })

  res.json({
    date,
    total: pa.total,
    cash: pa.cash,
    creditDebit: pa.credit_debit,
    ebtSnap: pa.ebt_snap,
    ebtCash: pa.ebt_cash,
    check: pa.check,
  })
})

// List POS imports (optionally filtered by date range)
router.get('/', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const { from, to } = req.query
  const where = from && to ? { date: { gte: from, lte: to } } : {}
  const imports = await prisma.posImport.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { createdBy: { select: { name: true } } },
  })
  res.json(imports)
})

// Save (upsert by date)
router.post('/', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const schema = z.object({
    date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    total:       z.number().int(),
    cash:        z.number().int(),
    creditDebit: z.number().int(),
    ebtSnap:     z.number().int(),
    ebtCash:     z.number().int(),
    check:       z.number().int(),
    cashOnHand:  z.number().int(),
  })
  const result = schema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.flatten() })

  const { date, total, cash, creditDebit, ebtSnap, ebtCash, check, cashOnHand } = result.data
  const overShort = cashOnHand - cash

  const entry = await prisma.posImport.upsert({
    where: { date },
    update: { total, cash, creditDebit, ebtSnap, ebtCash, check, cashOnHand, overShort, createdById: req.user.id },
    create: { date, total, cash, creditDebit, ebtSnap, ebtCash, check, cashOnHand, overShort, createdById: req.user.id },
  })
  res.status(201).json(entry)
})

// Delete
router.delete('/:id', verifyAccessToken, requireRole('ADMIN'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const entry = await prisma.posImport.findUnique({ where: { id } })
  if (!entry) return res.status(404).json({ error: 'Entry not found' })
  await prisma.posImport.delete({ where: { id } })
  res.json({ status: 'ok' })
})

module.exports = router
