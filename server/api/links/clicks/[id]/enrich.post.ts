import { getRouterParam, readBody } from 'h3'
import { updateStore } from '../../../../utils/store'

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return null
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (typeof value === 'string') {
    return value.slice(0, 1000)
  }

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitize(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 80)
      .reduce<Record<string, unknown>>((acc, [key, item]) => {
        acc[key.slice(0, 80)] = sanitize(item, depth + 1)
        return acc
      }, {})
  }

  return null
}

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event).catch(() => null)
  const client = sanitize(body)

  await updateStore((data) => {
    for (const link of data.links) {
      const click = link.clicks.find((item) => item.id === id)
      if (click) {
        click.client = client && typeof client === 'object'
          ? {
              ...(click.client || {}),
              ...(client as Record<string, unknown>)
            }
          : click.client
        link.updatedAt = new Date().toISOString()
        break
      }
    }
  })

  return { ok: true }
})
