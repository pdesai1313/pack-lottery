const crypto = require('crypto')

// Credentials for third-party portals are stored encrypted at rest, not hashed,
// because we must replay the plaintext password to re-authenticate.
// Key comes from ENCRYPTION_KEY when set; otherwise it is derived from
// JWT_SECRET so deployments work without provisioning a second secret.
// Rotating either secret makes previously stored credentials undecryptable —
// re-enter them in Settings if that happens.
const KDF_SALT = 'pack-lottery.credential-encryption.v1'

let cachedKey = null

function key() {
  if (cachedKey) return cachedKey
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!secret) throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set to store portal credentials')
  cachedKey = crypto.scryptSync(secret, KDF_SALT, 32)
  return cachedKey
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return ''
  const iv = cryptoRandomIv()
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}

function decrypt(blob) {
  if (!blob) return ''
  const parts = String(blob).split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Stored credential is malformed')
  const [, iv, tag, data] = parts
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

function cryptoRandomIv() {
  return crypto.randomBytes(12)
}

module.exports = { encrypt, decrypt }
