import { requireUser } from '../../utils/auth'
import { serializeLink } from '../../utils/links'
import { readStore } from '../../utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const data = await readStore()

  return {
    links: data.links
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((link) => serializeLink(link, event))
  }
})
