import { requireUser } from '../../utils/auth'
import { readStore } from '../../utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const data = await readStore()

  return {
    checks: data.statusChecks
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
      .slice(0, 25)
  }
})
