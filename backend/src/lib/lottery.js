const { decrypt } = require('./crypto')

const BASE = 'https://gemr.masslottery.com'
const AUTH_URL = `${BASE}/rs/user/authenticate`
const INVOICE_URL = `${BASE}/rs/invoice`

// Origin/Referer/User-Agent are sent because masslottery.com sits behind
// Imperva, which rejects requests that do not look browser-originated.
const BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:158.0) Gecko/20100101 Firefox/158.0',
}

// Imperva's own cookies are per-request noise; only application cookies
// (jwt, JSESSIONID, CSRF-Token) carry the session.
const CDN_COOKIE = /^(visid_incap_|incap_ses_|nlbi_)/i

class LotteryError extends Error {
  constructor(message, status, detail) {
    super(message)
    this.name = 'LotteryError'
    this.status = status
    this.detail = detail
  }
}

function readSetCookies(res) {
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean)
  return raw.map((c) => String(c).split(';')[0]).filter((c) => c && !CDN_COOKIE.test(c))
}

function cookieValue(cookieString, name) {
  const match = String(cookieString).match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? match[1] : null
}

// The portal's JWT carries the retailer's location id in `sub` and the session
// deadline in `exp`, so neither has to be configured separately.
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

async function readJson(res, context) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    const blocked = /incapsula|imperva|request unsuccessful/i.test(text)
    throw new LotteryError(
      blocked
        ? 'The lottery portal blocked this request (bot protection). It may not allow access from the server.'
        : `${context}: portal returned a non-JSON response (HTTP ${res.status})`,
      502,
      text.slice(0, 300)
    )
  }
}

async function login(username, password) {
  if (!username || !password) throw new LotteryError('Lottery username and password are not configured', 400)

  let res
  try {
    res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/json', 'Origin': BASE, 'Referer': `${BASE}/app/login` },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (e) {
    throw new LotteryError(`Could not reach the lottery portal: ${e.message}`, 502)
  }

  const body = await readJson(res, 'Login')

  // The portal signals bad credentials with HTTP 404 and a description string.
  if (!body?.userData) {
    throw new LotteryError(body?.httpResponse?.description || `Lottery login failed (HTTP ${res.status})`, 401)
  }

  const cookie = readSetCookies(res).join('; ')
  const jwt = cookieValue(cookie, 'jwt')
  if (!jwt) {
    throw new LotteryError('Logged in, but the portal did not return a session cookie.', 502, `cookies: ${cookie || '(none)'}`)
  }

  const claims = decodeJwt(jwt)
  if (!claims?.sub) throw new LotteryError('Session cookie did not contain a location id.', 502)

  return {
    cookie,
    locationId: String(claims.sub),
    // `exp` is in seconds.
    expiresAt: claims.exp ? new Date(claims.exp * 1000) : null,
  }
}

// Returns a usable session, reusing the cached cookie until it is close to
// expiring. The portal's JWT is short-lived (~45 min), so a margin avoids
// handing back a cookie that dies mid-request.
const EXPIRY_MARGIN_MS = 2 * 60 * 1000

async function getSession(prisma, { forceRefresh = false } = {}) {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })

  if (!forceRefresh && settings?.lotteryToken && settings.lotteryTokenExpiresAt) {
    if (new Date(settings.lotteryTokenExpiresAt).getTime() - Date.now() > EXPIRY_MARGIN_MS) {
      const jwt = cookieValue(settings.lotteryToken, 'jwt')
      const claims = jwt ? decodeJwt(jwt) : null
      if (claims?.sub) {
        return { cookie: settings.lotteryToken, locationId: String(claims.sub), expiresAt: settings.lotteryTokenExpiresAt }
      }
    }
  }

  const username = settings?.lotteryUsername || ''
  const password = settings?.lotteryPasswordEnc ? decrypt(settings.lotteryPasswordEnc) : ''
  const session = await login(username, password)

  await prisma.appSettings.update({
    where: { id: 1 },
    data: { lotteryToken: session.cookie, lotteryTokenExpiresAt: session.expiresAt },
  })
  return session
}

async function portalGet(session, url, objectKey, referer) {
  const csrf = cookieValue(session.cookie, 'CSRF-Token')
  const res = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      'Cookie': session.cookie,
      'GEM-OBJECT-KEY': objectKey,
      'Referer': referer,
      // Double-submit CSRF: the header must echo the CSRF-Token cookie.
      ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
    },
    signal: AbortSignal.timeout(30000),
  })
  return res
}

// ── Invoice / commission ─────────────────────────────────────────────────────

// The invoice endpoint always returns exactly four weekly columns. Verified
// against the live portal: index 3 is the week ending on `endDate`, and
// indices 2..0 are the three preceding weeks. Weeks end on Saturday.
const WEEK_COLUMNS = 4

function camel(label) {
  return label
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
}

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return isoDate(d)
}

// Most recent Saturday on or before today (portal weeks end Saturday).
function latestWeekEnding(today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7))
  return isoDate(d)
}

// Transposes the portal's "row per line item, four week columns" payload into
// one record per week, grouped under the Online/Instant headers.
function parseInvoice(payload, endDate) {
  const rows = Array.isArray(payload?.table) ? payload.table : []
  const weeks = []

  for (let i = 0; i < WEEK_COLUMNS; i++) {
    const weekEnding = addDays(endDate, -7 * (WEEK_COLUMNS - 1 - i))
    const week = { weekEnding, online: {}, instant: {}, totalDue: 0 }
    let group = null

    for (const row of rows) {
      const value = Number(row?.weekEndValues?.[i] ?? 0)
      const label = String(row?.label ?? '')

      if (row?.isGroupHeader) {
        group = camel(label)
        continue
      }
      if (label === 'Total Due') {
        week.totalDue = value
        continue
      }
      // "Online Due" / "Instant Due" are the group subtotals.
      const key = row?.isGroupTotal ? 'due' : camel(label)
      if (group && week[group]) week[group][key] = value
    }
    weeks.push(week)
  }
  return weeks
}

function looksBlocked(text) {
  return /incapsula|imperva|request unsuccessful|<html/i.test(text)
}

async function fetchInvoiceWeeks(session, endDate) {
  const url = `${INVOICE_URL}?endDate=${encodeURIComponent(endDate)}&locationId=${encodeURIComponent(session.locationId)}`
  const res = await portalGet(session, url, 'accounting.invoice', `${BASE}/app/accounting/invoice`)
  const text = await res.text()

  // Check the payload before the status code: Imperva answers with an HTML
  // challenge page, often under a 403, which must not be mistaken for an
  // expired session (a refresh would never fix it).
  if (looksBlocked(text)) {
    throw new LotteryError(
      `The lottery portal blocked this request (HTTP ${res.status}, bot protection). It may not allow access from the server's IP.`,
      502,
      text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    )
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new LotteryError(`Invoice: portal returned a non-JSON response (HTTP ${res.status})`, 502, text.slice(0, 200))
  }

  // Only a JSON 401/403 is a genuine session problem worth retrying.
  if (res.status === 401 || res.status === 403) {
    throw new LotteryError(body?.httpResponse?.description || `Lottery session rejected (HTTP ${res.status})`, 401)
  }
  if (!res.ok) {
    throw new LotteryError(body?.httpResponse?.description || `Invoice request failed (HTTP ${res.status})`, 502)
  }
  return parseInvoice(body, endDate)
}

// Runs the whole chain once and reports what happened at each step, so a
// failure in production can be attributed without guesswork.
async function diagnose(prisma) {
  const steps = []
  let session
  try {
    session = await getSession(prisma, { forceRefresh: true })
    steps.push({
      step: 'login',
      ok: true,
      locationId: session.locationId,
      expiresAt: session.expiresAt,
      // Names only — cookie values are session credentials.
      cookies: session.cookie.split('; ').map((c) => c.split('=')[0]),
    })
  } catch (e) {
    steps.push({ step: 'login', ok: false, error: e.message, detail: e.detail })
    return { ok: false, steps }
  }

  const endDate = latestWeekEnding()
  try {
    const weeks = await fetchInvoiceWeeks(session, endDate)
    steps.push({ step: 'invoice', ok: true, endDate, weeksReturned: weeks.length })
    return { ok: true, steps }
  } catch (e) {
    steps.push({ step: 'invoice', ok: false, endDate, error: e.message, detail: e.detail })
    return { ok: false, steps }
  }
}

// Walks backwards from the latest completed week, four weeks per request.
async function fetchCommissions(prisma, { weeks = 12, endDate = latestWeekEnding() } = {}) {
  let session = await getSession(prisma)
  const calls = Math.ceil(weeks / WEEK_COLUMNS)
  const collected = []

  for (let c = 0; c < calls; c++) {
    const callEnd = addDays(endDate, -7 * WEEK_COLUMNS * c)
    let batch
    try {
      batch = await fetchInvoiceWeeks(session, callEnd)
    } catch (e) {
      // A cached cookie can lapse between requests; retry once with a fresh one.
      if (e instanceof LotteryError && e.status === 401) {
        session = await getSession(prisma, { forceRefresh: true })
        batch = await fetchInvoiceWeeks(session, callEnd)
      } else {
        throw e
      }
    }
    collected.push(...batch)
  }

  return collected
    .sort((a, b) => b.weekEnding.localeCompare(a.weekEnding))
    .slice(0, weeks)
}

module.exports = {
  login,
  getSession,
  diagnose,
  fetchCommissions,
  fetchInvoiceWeeks,
  parseInvoice,
  latestWeekEnding,
  LotteryError,
}
