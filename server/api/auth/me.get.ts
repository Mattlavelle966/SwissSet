import { getAuthSession, toSafeUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const session = await getAuthSession(event)
  return { user: session ? toSafeUser(session.user) : null }
})
