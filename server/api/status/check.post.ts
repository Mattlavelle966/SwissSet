import { createError, readBody } from 'h3'
import { chromium } from 'playwright'
import { randomUUID } from 'node:crypto'
import { requireUser } from '../../utils/auth'
import { normalizeHttpUrl } from '../../utils/urls'
import { updateStore, type StatusMetrics, type StatusRecord } from '../../utils/store'

const EMPTY_METRICS: StatusMetrics = {
  dnsMs: null,
  connectMs: null,
  tlsMs: null,
  ttfbMs: null,
  domReadyMs: null,
  loadMs: null,
  transferSize: null
}

function roundMetric(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null
}

function cleanPlaywrightMessage(message: string) {
  return message
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('Call log:')[0]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ url?: string }>(event)
  const url = normalizeHttpUrl(String(body.url || ''))
  const checkedAt = new Date().toISOString()
  const started = performance.now()

  let statusCode: number | null = null
  let finalUrl = url
  let title = ''
  let screenshotDataUrl = ''
  let metrics: StatusMetrics = { ...EMPTY_METRICS }
  let navigationError = ''
  const failedRequests: string[] = []

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    })

    const context = await browser.newContext({
      viewport: { width: 1365, height: 768 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true
    })
    const page = await context.newPage()

    page.on('requestfailed', (request) => {
      if (failedRequests.length >= 8) {
        return
      }
      failedRequests.push(
        `${request.resourceType()} ${request.url()} ${request.failure()?.errorText || ''}`.trim()
      )
    })

    try {
      const response = await page.goto(url, {
        waitUntil: 'load',
        timeout: 30_000
      })
      statusCode = response?.status() ?? null
      finalUrl = response?.url() ?? url
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)
      title = await page.title().catch(() => '')
      metrics = await page
        .evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0] as
            | PerformanceNavigationTiming
            | undefined

          if (!nav) {
            return null
          }

          return {
            dnsMs: nav.domainLookupEnd - nav.domainLookupStart,
            connectMs: nav.connectEnd - nav.connectStart,
            tlsMs:
              nav.secureConnectionStart > 0
                ? nav.connectEnd - nav.secureConnectionStart
                : null,
            ttfbMs: nav.responseStart - nav.requestStart,
            domReadyMs: nav.domContentLoadedEventEnd - nav.startTime,
            loadMs: nav.loadEventEnd - nav.startTime,
            transferSize: nav.transferSize || null
          }
        })
        .then((value) => ({
          dnsMs: roundMetric(value?.dnsMs),
          connectMs: roundMetric(value?.connectMs),
          tlsMs: roundMetric(value?.tlsMs),
          ttfbMs: roundMetric(value?.ttfbMs),
          domReadyMs: roundMetric(value?.domReadyMs),
          loadMs: roundMetric(value?.loadMs),
          transferSize: roundMetric(value?.transferSize)
        }))
        .catch(() => ({ ...EMPTY_METRICS }))
    } catch (error: any) {
      navigationError = cleanPlaywrightMessage(error?.message || 'Navigation failed')
    }

    screenshotDataUrl = await page
      .screenshot({ type: 'png', fullPage: false, timeout: 10_000 })
      .then((buffer) => `data:image/png;base64,${buffer.toString('base64')}`)
      .catch(() => '')
  } catch (error: any) {
    const message = cleanPlaywrightMessage(error?.message || '')
    throw createError({
      statusCode: 500,
      statusMessage:
        message.includes('error while loading shared libraries')
          ? 'Playwright Chromium is missing native system libraries on this host.'
          : message || 'Unable to launch Playwright Chromium.'
    })
  } finally {
    await browser?.close().catch(() => undefined)
  }

  const durationMs = Math.round(performance.now() - started)
  const ok = !!statusCode && statusCode >= 200 && statusCode < 400 && !navigationError
  const down = !statusCode || statusCode >= 500 || !!navigationError
  const slow = durationMs > 3000 || (metrics.loadMs ?? 0) > 3000 || (metrics.ttfbMs ?? 0) > 800
  const issues: string[] = []

  if (navigationError) {
    issues.push(navigationError)
  }
  if (statusCode && statusCode >= 400) {
    issues.push(`HTTP ${statusCode}`)
  }
  if (slow) {
    issues.push('Slow response threshold exceeded')
  }
  if (failedRequests.length) {
    issues.push(`${failedRequests.length} subresource request failure(s)`)
  }

  const record: StatusRecord = {
    id: randomUUID(),
    userId: user.id,
    url: finalUrl,
    checkedAt,
    statusCode,
    ok,
    down,
    slow,
    durationMs,
    title,
    issues,
    metrics
  }

  await updateStore((data) => {
    data.statusChecks.push(record)
    const userChecks = data.statusChecks
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
    const keepIds = new Set(userChecks.slice(0, 50).map((item) => item.id))
    data.statusChecks = data.statusChecks.filter(
      (item) => item.userId !== user.id || keepIds.has(item.id)
    )
  })

  return {
    ...record,
    screenshotDataUrl,
    failedRequests
  }
})
