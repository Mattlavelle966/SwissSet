import { getRequestURL, type H3Event } from 'h3'
import type { RedirectLinkRecord } from './store'

export function getRedirectBase(event: H3Event) {
  const config = useRuntimeConfig()
  const configured =
    String(config.redirectBaseUrl || '') ||
    String(config.public.redirectBaseUrl || '')

  if (configured) {
    return configured.replace(/\/+$/, '')
  }

  return getRequestURL(event).origin
}

export function serializeLink(link: RedirectLinkRecord, event: H3Event) {
  const clickCount = link.clicks.length
  const uniqueVisitors = new Set(link.clicks.map((item) => item.ipHash)).size
  const lastClick = link.clicks
    .slice()
    .sort((a, b) => b.clickedAt.localeCompare(a.clickedAt))[0]

  const byDay = link.clicks.reduce<Record<string, number>>((acc, click) => {
    const day = click.clickedAt.slice(0, 10)
    acc[day] = (acc[day] || 0) + 1
    return acc
  }, {})

  const referrers = Object.entries(
    link.clicks.reduce<Record<string, number>>((acc, click) => {
      const key = click.referrer || 'Direct'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([referrer, count]) => ({ referrer, count }))

  return {
    ...link,
    shortUrl: `${getRedirectBase(event)}/r/${link.slug}`,
    analytics: {
      clickCount,
      uniqueVisitors,
      lastClickAt: lastClick?.clickedAt || null,
      byDay,
      referrers,
      recentClicks: link.clicks
        .slice()
        .sort((a, b) => b.clickedAt.localeCompare(a.clickedAt))
        .slice(0, 25)
    }
  }
}
