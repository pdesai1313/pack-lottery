const express = require('express')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken } = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

const entrySchema = z.object({
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  storeName:        z.string().default(''),
  creditDebit:      z.number().min(0),
  ebt:              z.number().min(0),
  cashSales:        z.number().min(0),
  openingCash:      z.number().min(0),
  actualCashOnHand: z.number().min(0),
  notes:            z.string().optional().nullable(),
})

router.get('/', verifyAccessToken, async (req, res) => {
  const { from, to } = req.query
  const where = {}
  if (from && to) where.date = { gte: from, lte: to }
  const entries = await prisma.groceryEntry.findMany({
    where,
    include: { preparedBy: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  })
  res.json(entries)
})

router.post('/', verifyAccessToken, async (req, res) => {
  const result = entrySchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.issues })
  const entry = await prisma.groceryEntry.create({
    data: { ...result.data, preparedById: req.user.id },
    include: { preparedBy: { select: { id: true, name: true } } },
  })
  res.status(201).json(entry)
})

router.put('/:id', verifyAccessToken, async (req, res) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' })
  const result = entrySchema.partial().safeParse(req.body)
  if (!result.success) return res.status(400).json({ error: result.error.issues })
  const entry = await prisma.groceryEntry.update({
    where: { id },
    data: result.data,
    include: { preparedBy: { select: { id: true, name: true } } },
  })
  res.json(entry)
})

router.delete('/:id', verifyAccessToken, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' })
  const id = parseInt(req.params.id)
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' })
  await prisma.groceryEntry.delete({ where: { id } })
  res.json({ ok: true })
})

module.exports = router
