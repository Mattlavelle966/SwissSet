import {
  createError,
  getHeader,
  getHeaders,
  getRequestIP,
  getRequestURL,
  getRouterParam,
  setHeader
} from 'h3'
import { randomUUID } from 'node:crypto'
import { getClientHash } from '../../utils/auth'
import { updateStore } from '../../utils/store'

const ANALYTICS_HEADERS = [
  'accept',
  'accept-language',
  'accept-encoding',
  'cache-control',
  'connection',
  'dnt',
  'host',
  'pragma',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'sec-gpc',
  'upgrade-insecure-requests',
  'user-agent',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-region',
  'cf-city',
  'cf-timezone',
  'cf-ray',
  'fly-client-ip',
  'x-vercel-ip-country',
  'x-vercel-ip-region',
  'x-vercel-ip-city',
  'x-vercel-ip-timezone'
]

const GEO_HEADERS = [
  'cf-ipcountry',
  'cf-region',
  'cf-city',
  'cf-timezone',
  'x-vercel-ip-country',
  'x-vercel-ip-region',
  'x-vercel-ip-city',
  'x-vercel-ip-timezone'
]

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'ref'
]

function getHeaderMap(event: any) {
  const headers = getHeaders(event)
  return ANALYTICS_HEADERS.reduce<Record<string, string>>((acc, name) => {
    const value = headers[name]
    if (typeof value === 'string' && value) {
      acc[name] = value.slice(0, 1000)
    }
    return acc
  }, {})
}

function getQueryMap(url: URL) {
  const query: Record<string, string | string[]> = {}

  for (const [key, value] of url.searchParams.entries()) {
    const cleanValue = value.slice(0, 500)
    if (query[key]) {
      query[key] = Array.isArray(query[key])
        ? [...query[key], cleanValue]
        : [String(query[key]), cleanValue]
    } else {
      query[key] = cleanValue
    }
  }

  return query
}

function getUtmMap(query: Record<string, string | string[]>) {
  return UTM_KEYS.reduce<Record<string, string>>((acc, key) => {
    const value = query[key]
    if (Array.isArray(value)) {
      acc[key] = value[0]
    } else if (value) {
      acc[key] = value
    }
    return acc
  }, {})
}

function getGeoMap(headers: Record<string, string>) {
  return GEO_HEADERS.reduce<Record<string, string>>((acc, key) => {
    if (headers[key]) {
      acc[key] = headers[key]
    }
    return acc
  }, {})
}

function parseUserAgent(userAgent: string, headers: Record<string, string>) {
  const browser =
    /Edg\/([\d.]+)/.exec(userAgent)
      ? ['Edge', /Edg\/([\d.]+)/.exec(userAgent)?.[1] || '']
      : /OPR\/([\d.]+)/.exec(userAgent)
        ? ['Opera', /OPR\/([\d.]+)/.exec(userAgent)?.[1] || '']
        : /Chrome\/([\d.]+)/.exec(userAgent)
          ? ['Chrome', /Chrome\/([\d.]+)/.exec(userAgent)?.[1] || '']
          : /Firefox\/([\d.]+)/.exec(userAgent)
            ? ['Firefox', /Firefox\/([\d.]+)/.exec(userAgent)?.[1] || '']
            : /Version\/([\d.]+).*Safari/.exec(userAgent)
              ? ['Safari', /Version\/([\d.]+).*Safari/.exec(userAgent)?.[1] || '']
              : ['Unknown', '']

  const os =
    /Windows NT/.test(userAgent)
      ? 'Windows'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad|iPod/.test(userAgent)
          ? 'iOS'
          : /Mac OS X/.test(userAgent)
            ? 'macOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : 'Unknown'

  const device =
    headers['sec-ch-ua-mobile'] === '?1' || /Mobile|iPhone|Android/.test(userAgent)
      ? /iPad|Tablet/.test(userAgent)
        ? 'Tablet'
        : 'Mobile'
      : 'Desktop'

  return {
    name: browser[0],
    version: browser[1],
    os,
    device
  }
}

function getBotSignal(userAgent: string) {
  const match =
    /(bot|crawler|spider|preview|slurp|facebookexternalhit|discordbot|twitterbot|linkedinbot|whatsapp|telegrambot|headless|playwright|puppeteer)/i.exec(
      userAgent
    )

  return {
    isBot: !!match,
    reason: match?.[0] || ''
  }
}

function jsString(value: string) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function htmlAttr(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function renderTrackedRedirect(clickId: string, targetUrl: string) {
  const target = jsString(targetUrl)
  const beaconUrl = jsString(`/api/links/clicks/${clickId}/enrich`)

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <noscript><meta http-equiv="refresh" content="0;url=${htmlAttr(targetUrl)}"></noscript>
  <title>Redirecting...</title>
</head>
<body>
  <a href="${htmlAttr(targetUrl)}">Continue</a>
  <script>
    (function () {
      var target = ${target};
      var beaconUrl = ${beaconUrl};
      var nav = window.navigator || {};
      var conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
      var payload = {
        capturedAt: new Date().toISOString(),
        href: window.location.href,
        referrer: document.referrer || '',
        timezone: Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
        timezoneOffset: new Date().getTimezoneOffset(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        },
        screen: window.screen ? {
          width: screen.width,
          height: screen.height,
          availWidth: screen.availWidth,
          availHeight: screen.availHeight,
          colorDepth: screen.colorDepth,
          pixelDepth: screen.pixelDepth,
          orientation: screen.orientation && screen.orientation.type
        } : {},
        navigator: {
          language: nav.language || '',
          languages: nav.languages || [],
          platform: nav.platform || '',
          vendor: nav.vendor || '',
          cookieEnabled: nav.cookieEnabled,
          doNotTrack: nav.doNotTrack || window.doNotTrack || '',
          webdriver: nav.webdriver,
          maxTouchPoints: nav.maxTouchPoints,
          hardwareConcurrency: nav.hardwareConcurrency,
          deviceMemory: nav.deviceMemory,
          pdfViewerEnabled: nav.pdfViewerEnabled
        },
        connection: {
          effectiveType: conn.effectiveType,
          downlink: conn.downlink,
          rtt: conn.rtt,
          saveData: conn.saveData,
          type: conn.type
        }
      };

      try {
        var body = JSON.stringify(payload);
        if (nav.sendBeacon) {
          nav.sendBeacon(beaconUrl, new Blob([body], { type: 'application/json' }));
        } else {
          fetch(beaconUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: body,
            keepalive: true
          }).catch(function () {});
        }
      } catch (error) {}

      window.setTimeout(function () {
        window.location.replace(target);
      }, 180);
    })();
  </script>
</body>
</html>`
}

export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') || '')
  const requestUrl = getRequestURL(event)
  const headers = getHeaderMap(event)
  const query = getQueryMap(requestUrl)
  const userAgent = getHeader(event, 'user-agent') || ''
  const ip = getRequestIP(event, { xForwardedFor: true }) || ''
  const clickId = randomUUID()

  const targetUrl = await updateStore((data) => {
    const link = data.links.find((item) => item.slug === slug)
    if (!link) {
      throw createError({ statusCode: 404, statusMessage: 'Link not found' })
    }

    link.clicks.push({
      id: clickId,
      clickedAt: new Date().toISOString(),
      referrer: getHeader(event, 'referer') || '',
      userAgent,
      ip,
      ipHash: getClientHash(event),
      method: event.node.req.method || 'GET',
      protocol: headers['x-forwarded-proto'] || requestUrl.protocol.replace(':', ''),
      host: headers['x-forwarded-host'] || headers.host || requestUrl.host,
      path: requestUrl.pathname,
      query,
      utm: getUtmMap(query),
      headers,
      geo: getGeoMap(headers),
      network: {
        ip,
        forwardedFor: headers['x-forwarded-for'] || '',
        realIp: headers['x-real-ip'] || headers['cf-connecting-ip'] || ''
      },
      browser: parseUserAgent(userAgent, headers),
      bot: getBotSignal(userAgent)
    })
    link.updatedAt = new Date().toISOString()

    if (link.clicks.length > 1000) {
      link.clicks = link.clicks
        .sort((a, b) => b.clickedAt.localeCompare(a.clickedAt))
        .slice(0, 1000)
    }

    return link.targetUrl
  })

  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  return renderTrackedRedirect(clickId, targetUrl)
})
