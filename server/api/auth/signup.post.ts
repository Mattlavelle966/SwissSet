import { createError, readBody } from 'h3'
import { randomUUID } from 'node:crypto'
import {
  createSession,
  hashPassword,
  normalizeEmail,
  toSafeUser
} from '../../utils/auth'
import { updateStore, type UserRecord } from '../../utils/store'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    name?: string
    email?: string
    password?: string
  }>(event)

  const name = String(body.name || '').trim()
  const email = normalizeEmail(String(body.email || ''))
  const password = String(body.password || '')

  if (!name || name.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required' })
  }

  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters'
    })
  }

  const now = new Date().toISOString()
  const credentials = hashPassword(password)
  const user: UserRecord = {
    id: randomUUID(),
    name,
    email,
    passwordHash: credentials.passwordHash,
    passwordSalt: credentials.passwordSalt,
    createdAt: now
  }

  await updateStore((data) => {
    if (data.users.some((item) => item.email === email)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'An account with that email already exists'
      })
    }
    data.users.push(user)
  })

  await createSession(event, user.id)
  return { user: toSafeUser(user) }
})
