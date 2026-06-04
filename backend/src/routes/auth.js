const express = require('express')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const crypto  = require('crypto')
const { PrismaClient } = require('@prisma/client')
const { verifyAccessToken } = require('../middleware/auth')
const { sendEmail } = require('../lib/email')

const router = express.Router()
const prisma = new PrismaClient()

function issueTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role, name: user.name }
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY || '15m' })
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' })
  return { accessToken, refreshToken }
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex')
}

function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000)
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const { accessToken, refreshToken } = issueTokens(user)
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken, refreshToken })
})

router.post('/refresh', async (req, res) => {
  const token = req.body?.refreshToken
  if (!token) return res.status(401).json({ error: 'No refresh token' })

  try {
    const { id } = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user || !user.active) return res.status(401).json({ error: 'User not found' })

    const { accessToken, refreshToken } = issueTokens(user)
    res.json({ accessToken, refreshToken })
  } catch {
    return res.status(401).json({ error: 'Refresh token expired' })
  }
})

router.post('/logout', (req, res) => {
  res.json({ ok: true })
})

router.get('/me', verifyAccessToken, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } })
  if (!user || !user.active) return res.status(401).json({ error: 'User not found' })
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role })
})

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Email required' })

  const SAFE = { message: "If that email is registered you'll receive a reset link shortly" }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!user || !user.active) return res.json(SAFE)

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
  const token     = makeToken()
  const expiresAt = hoursFromNow(1)
  await prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } })

  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`
  sendEmail({
    to:      user.email,
    subject: 'Reset your Pack Lottery password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <p>Hi ${user.name},</p>
        <p>We received a request to reset your Pack Lottery password.</p>
        <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px">Or paste this link in your browser:<br>${resetUrl}</p>
        <p style="color:#6b7280;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  }).catch((e) => console.error('Reset email failed:', e.message))

  res.json(SAFE)
})

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {}
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  const record = await prisma.passwordResetToken.findUnique({ where: { token } })
  if (!record || record.used)       return res.status(400).json({ error: 'Invalid or already used reset link' })
  if (record.expiresAt < new Date()) return res.status(400).json({ error: 'Reset link expired. Request a new one.' })

  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { token }, data: { used: true } }),
  ])

  res.json({ message: 'Password updated successfully' })
})

module.exports = router
