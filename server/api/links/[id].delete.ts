import { getRouterParam } from 'h3'
import { assertOwned, requireUser } from '../../utils/auth'
import { updateStore } from '../../utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getRouterParam(event, 'id') || '')

  await updateStore((data) => {
    const link = data.links.find((item) => item.id === id)
    if (link) {
      assertOwned(user.id, link.userId)
    }
    data.links = data.links.filter((item) => item.id !== id)
  })

  return { ok: true }
})
