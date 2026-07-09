import {
  createError,
  deleteCookie,
  getCookie,
  getRequestIP,
  getRequestURL,
  setCookie,
  type H3Event
} from 'h3'
import {
  createHash,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual
} from 'node:crypto'
import { readStore, updateStore, type SessionRecord, type UserRecord } from './store'

const SESSION_COOKIE = 'swissset_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

export type SafeUser = {
  id: string
  name: string
  email: string
  createdAt: string
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  }
}

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const passwordHash = pbkdf2Sync(password, salt, 120_000, 64, 'sha512').toString(
    'hex'
  )
  return { passwordHash, passwordSalt: salt }
}

export function verifyPassword(password: string, user: UserRecord) {
  const candidate = hashPassword(password, user.passwordSalt).passwordHash
  const expected = Buffer.from(user.passwordHash, 'hex')
  const actual = Buffer.from(candidate, 'hex')

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function getAuthSession(event: H3Event) {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) {
    return null
  }

  const data = await readStore()
  const session = data.sessions.find((item) => item.token === token)
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    return null
  }

  const user = data.users.find((item) => item.id === session.userId)
  if (!user) {
    return null
  }

  return { session, user }
}

export async function requireUser(event: H3Event) {
  const session = await getAuthSession(event)
  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  }

  return session.user
}

export async function createSession(event: H3Event, userId: string) {
  const now = new Date()
  const session: SessionRecord = {
    token: randomBytes(32).toString('hex'),
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString()
  }

  await updateStore((data) => {
    data.sessions = data.sessions.filter(
      (item) => new Date(item.expiresAt).getTime() > Date.now()
    )
    data.sessions.push(session)
  })

  const requestUrl = getRequestURL(event)
  setCookie(event, SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: requestUrl.protocol === 'https:',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000
  })

  return session
}

export async function clearAuthSession(event: H3Event) {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    await updateStore((data) => {
      data.sessions = data.sessions.filter((item) => item.token !== token)
    })
  }

  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export function getClientHash(event: H3Event) {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  return createHash('sha256')
    .update(`swissset-click-salt:${ip}`)
    .digest('hex')
    .slice(0, 24)
}

export function assertOwned(userId: string, ownerId: string) {
  if (userId !== ownerId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not found'
    })
  }
}
