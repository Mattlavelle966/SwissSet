import { createError, readBody } from 'h3'
import { randomBytes, randomUUID } from 'node:crypto'
import { requireUser } from '../../utils/auth'
import { serializeLink } from '../../utils/links'
import { updateStore, type RedirectLinkRecord } from '../../utils/store'
import { normalizeHttpUrl, normalizeSlug } from '../../utils/urls'

function makeSlug() {
  return randomBytes(4).toString('hex')
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    label?: string
    targetUrl?: string
    slug?: string
  }>(event)

  const targetUrl = normalizeHttpUrl(String(body.targetUrl || ''))
  const label =
    String(body.label || '').trim().slice(0, 80) || new URL(targetUrl).hostname
  const requestedSlug = normalizeSlug(String(body.slug || ''))
  const slug = requestedSlug || makeSlug()

  if (requestedSlug && requestedSlug.length < 3) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Custom slugs must be at least 3 characters'
    })
  }

  const now = new Date().toISOString()
  const link: RedirectLinkRecord = {
    id: randomUUID(),
    userId: user.id,
    slug,
    label,
    targetUrl,
    createdAt: now,
    updatedAt: now,
    clicks: []
  }

  await updateStore((data) => {
    if (data.links.some((item) => item.slug === slug)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'That slug is already in use'
      })
    }
    data.links.push(link)
  })

  return { link: serializeLink(link, event) }
})
