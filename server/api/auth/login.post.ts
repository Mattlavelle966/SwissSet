import { createError, readBody } from 'h3'
import {
  createSession,
  normalizeEmail,
  toSafeUser,
  verifyPassword
} from '../../utils/auth'
import { readStore } from '../../utils/store'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event)
  const email = normalizeEmail(String(body.email || ''))
  const password = String(body.password || '')

  const data = await readStore()
  const user = data.users.find((item) => item.email === email)

  if (!user || !verifyPassword(password, user)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await createSession(event, user.id)
  return { user: toSafeUser(user) }
})
