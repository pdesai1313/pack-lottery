const { decrypt } = require('./crypto')

const AUTH_URL = 'https://gemr.masslottery.com/rs/user/authenticate'

// Origin/Referer/User-Agent are sent because masslottery.com sits behind
// Imperva, which rejects requests that do not look browser-originated.
// X-XSRF-TOKEN and GEM-OBJECT-KEY appear in the browser's request but were
// verified to be unnecessary for this endpoint.
const BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/json',
  'Origin': 'https://gemr.masslottery.com',
  'Referer': 'https://gemr.masslottery.com/app/login',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:158.0) Gecko/20100101 Firefox/158.0',
}

class LotteryError extends Error {
  constructor(message, status, detail) {
    super(message)
    this.name = 'LotteryError'
    this.status = status
    this.detail = detail
  }
}

// The exact field carrying the session token is not documented, so check the
// known-plausible locations rather than guessing one. `shape` is returned by
// authenticate() so the first successful login tells us where it actually lives.
function extractToken(body, res) {
  const fromBody = [
    body?.token,
    body?.authToken,
    body?.accessToken,
    body?.userData?.token,
    body?.userData?.authToken,
    body?.userData?.accessToken,
    body?.userData?.sessionId,
  ].find((v) => typeof v === 'string' && v.length > 0)
  if (fromBody) return fromBody

  const fromHeader = [
    res.headers.get('authorization'),
    res.headers.get('x-auth-token'),
    res.headers.get('gem-token'),
  ].find((v) => typeof v === 'string' && v.length > 0)
  return fromHeader || null
}

// Session cookies are a fallback transport if no token field exists: strip the
// Imperva/Incapsula CDN cookies, keep anything application-issued.
function extractSessionCookies(res) {
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean)
  return raw
    .map((c) => String(c).split(';')[0])
    .filter((c) => c && !/^(visid_incap_|incap_ses_|nlbi_)/i.test(c))
}

async function authenticate(username, password) {
  if (!username || !password) throw new LotteryError('Lottery username and password are not configured', 400)

  let res
  try {
    res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: BROWSER_HEADERS,
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (e) {
    throw new LotteryError(`Could not reach the lottery portal: ${e.message}`, 502)
  }

  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    // Imperva serves an HTML challenge page when it blocks a request.
    const blocked = /incapsula|imperva|request unsuccessful/i.test(text)
    throw new LotteryError(
      blocked
        ? 'The lottery portal blocked this request (bot protection). It may not allow logins from the server.'
        : `Lottery portal returned a non-JSON response (HTTP ${res.status})`,
      502,
      text.slice(0, 300)
    )
  }

  // The portal signals bad credentials with HTTP 404 and a description string.
  if (!body?.userData) {
    throw new LotteryError(body?.httpResponse?.description || `Lottery login failed (HTTP ${res.status})`, 401)
  }

  const token = extractToken(body, res)
  const cookies = extractSessionCookies(res)
  if (!token && cookies.length === 0) {
    throw new LotteryError(
      'Logged in, but no session token was found in the response. Share the diagnostic shape so the token field can be mapped.',
      502,
      JSON.stringify(describeShape(body)).slice(0, 500)
    )
  }

  return {
    token,
    cookies,
    tokenExpiration: body.tokenExpiration ?? null,
    userData: body.userData,
    shape: describeShape(body),
  }
}

// Key names only — never values, so diagnostics can be surfaced without
// leaking account details into logs or the UI.
function describeShape(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 2) return typeof value
  if (Array.isArray(value)) return [value.length ? describeShape(value[0], depth + 1) : 'empty']
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, describeShape(v, depth + 1)]))
}

async function loadCredentials(prisma) {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
  return {
    username: settings?.lotteryUsername || '',
    password: settings?.lotteryPasswordEnc ? decrypt(settings.lotteryPasswordEnc) : '',
  }
}

module.exports = { authenticate, loadCredentials, LotteryError, AUTH_URL }
