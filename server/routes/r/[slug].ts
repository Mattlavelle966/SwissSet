import { createError, getHeader, getRouterParam, sendRedirect } from 'h3'
import { randomUUID } from 'node:crypto'
import { getClientHash } from '../../utils/auth'
import { updateStore } from '../../utils/store'

export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') || '')

  const targetUrl = await updateStore((data) => {
    const link = data.links.find((item) => item.slug === slug)
    if (!link) {
      throw createError({ statusCode: 404, statusMessage: 'Link not found' })
    }

    link.clicks.push({
      id: randomUUID(),
      clickedAt: new Date().toISOString(),
      referrer: getHeader(event, 'referer') || '',
      userAgent: getHeader(event, 'user-agent') || '',
      ipHash: getClientHash(event)
    })
    link.updatedAt = new Date().toISOString()

    if (link.clicks.length > 1000) {
      link.clicks = link.clicks
        .sort((a, b) => b.clickedAt.localeCompare(a.clickedAt))
        .slice(0, 1000)
    }

    return link.targetUrl
  })

  return sendRedirect(event, targetUrl, 302)
})
