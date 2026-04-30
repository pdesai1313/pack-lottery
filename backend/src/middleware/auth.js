const jwt = require('jsonwebtoken')

function verifyAccessToken(req, res, next) {
  const token = req.cookies?.accessToken
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid' })
  }
}

function requireRole(...roles) {
  const allowed = roles.flat()
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${allowed.join(' or ')}` })
    }
    next()
  }
}

module.exports = { verifyAccessToken, requireRole }
