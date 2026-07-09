<script setup lang="ts">
import { Copy, Link2, Plus, Trash2 } from 'lucide-vue-next'

type LinkRecord = {
  id: string
  label: string
  slug: string
  targetUrl: string
  shortUrl: string
  analytics: {
    clickCount: number
    uniqueVisitors: number
    lastClickAt: string | null
    byDay: Record<string, number>
    referrers: { referrer: string; count: number }[]
    countries: { label: string; count: number }[]
    regions: { label: string; count: number }[]
    browsers: { label: string; count: number }[]
    operatingSystems: { label: string; count: number }[]
    devices: { label: string; count: number }[]
    sources: { label: string; count: number }[]
    recentClicks: any[]
  }
}

const requestFetch = useRequestFetch()
const { data, refresh } = await useAsyncData('links', () =>
  requestFetch<{ links: LinkRecord[] }>('/api/links')
)

const links = computed(() => data.value?.links || [])
const label = ref('')
const targetUrl = ref('')
const slug = ref('')
const loading = ref(false)
const error = ref('')
const copied = ref('')
const config = useRuntimeConfig()

async function createLink() {
  error.value = ''
  loading.value = true

  try {
    await $fetch('/api/links', {
      method: 'POST',
      body: {
        label: label.value,
        targetUrl: targetUrl.value,
        slug: slug.value
      }
    })
    label.value = ''
    targetUrl.value = ''
    slug.value = ''
    await refresh()
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Unable to create link'
  } finally {
    loading.value = false
  }
}

async function copyLink(link: LinkRecord) {
  await navigator.clipboard.writeText(link.shortUrl)
  copied.value = link.id
  window.setTimeout(() => {
    if (copied.value === link.id) copied.value = ''
  }, 1200)
}

async function deleteLink(link: LinkRecord) {
  await $fetch(`/api/links/${link.id}`, { method: 'DELETE' })
  await refresh()
}

function getHostname(target: string) {
  try {
    return globalThis.URL ? new globalThis.URL(target).hostname : target
  } catch {
    return target
  }
}

function firstLabel(items: { label: string; count: number }[]) {
  return items[0]?.label || 'Unknown'
}

function getClickLocation(click: any) {
  return (
    click.geo?.['cf-city'] ||
    click.geo?.['x-vercel-ip-city'] ||
    click.geo?.['cf-region'] ||
    click.geo?.['x-vercel-ip-region'] ||
    click.geo?.['cf-ipcountry'] ||
    click.geo?.['x-vercel-ip-country'] ||
    'Unknown'
  )
}

function getClientViewport(click: any) {
  const viewport = click.client?.viewport
  if (!viewport?.width || !viewport?.height) {
    return 'Unknown'
  }
  return `${viewport.width}x${viewport.height}@${viewport.devicePixelRatio || 1}`
}
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Redirect Links</p>
        <h1>Trackable URL generator</h1>
        <p class="lead">
          Create redirect links with click analytics. Production domains should be set
          with <span class="mono">REDIRECT_BASE_URL</span>.
        </p>
      </div>
    </header>

    <div
      v-if="!config.public.redirectBaseUrl"
      class="notice"
    >
      No redirect domain env var is set, so generated links use the current dev origin.
    </div>

    <div class="tool-layout">
      <section class="panel">
        <h2>Create Link</h2>
        <form @submit.prevent="createLink">
          <div class="field">
            <label for="link-label">Label</label>
            <input id="link-label" v-model="label" placeholder="Release notes" />
          </div>
          <div class="field">
            <label for="target-url">Target URL</label>
            <input
              id="target-url"
              v-model="targetUrl"
              inputmode="url"
              placeholder="https://company.com/releases/v1"
              required
            />
          </div>
          <div class="field">
            <label for="slug">Custom slug</label>
            <input id="slug" v-model="slug" placeholder="release-v1" />
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <button class="button primary" type="submit" :disabled="loading">
            <Plus aria-hidden="true" />
            {{ loading ? 'Creating...' : 'Create redirect' }}
          </button>
        </form>
      </section>

      <section class="panel">
        <h2>Analytics Summary</h2>
        <div class="metrics">
          <div class="metric">
            <span>Links</span>
            <strong>{{ links.length }}</strong>
          </div>
          <div class="metric">
            <span>Clicks</span>
            <strong>{{
              links.reduce((sum, link) => sum + link.analytics.clickCount, 0)
            }}</strong>
          </div>
          <div class="metric">
            <span>Visitors</span>
            <strong>{{
              links.reduce((sum, link) => sum + link.analytics.uniqueVisitors, 0)
            }}</strong>
          </div>
          <div class="metric">
            <span>Domain</span>
            <strong>{{ config.public.redirectBaseUrl ? 'Env' : 'Dev' }}</strong>
          </div>
        </div>
      </section>
    </div>

    <section class="grid">
      <article v-for="link in links" :key="link.id" class="panel">
        <div class="toolbar">
          <div>
            <h2>{{ link.label }}</h2>
            <p class="mono" style="margin-bottom: 0">{{ link.shortUrl }}</p>
          </div>
          <div class="button-row">
            <button class="button secondary" type="button" @click="copyLink(link)">
              <Copy aria-hidden="true" />
              {{ copied === link.id ? 'Copied' : 'Copy' }}
            </button>
            <button class="icon-button" type="button" title="Delete" @click="deleteLink(link)">
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        </div>

        <div class="metrics" style="margin-top: 14px">
          <div class="metric">
            <span>Clicks</span>
            <strong>{{ link.analytics.clickCount }}</strong>
          </div>
          <div class="metric">
            <span>Visitors</span>
            <strong>{{ link.analytics.uniqueVisitors }}</strong>
          </div>
          <div class="metric">
            <span>Last click</span>
            <strong>{{
              link.analytics.lastClickAt
                ? new Date(link.analytics.lastClickAt).toLocaleDateString()
                : 'None'
            }}</strong>
          </div>
          <div class="metric">
            <span>Target</span>
            <strong style="font-size: 0.92rem">{{ getHostname(link.targetUrl) }}</strong>
          </div>
        </div>

        <div class="metrics" style="margin-top: 14px">
          <div class="metric">
            <span>Country</span>
            <strong>{{ firstLabel(link.analytics.countries) }}</strong>
          </div>
          <div class="metric">
            <span>Browser</span>
            <strong>{{ firstLabel(link.analytics.browsers) }}</strong>
          </div>
          <div class="metric">
            <span>Device</span>
            <strong>{{ firstLabel(link.analytics.devices) }}</strong>
          </div>
          <div class="metric">
            <span>Source</span>
            <strong>{{ firstLabel(link.analytics.sources) }}</strong>
          </div>
        </div>

        <div class="grid three" style="margin-top: 14px">
          <div>
            <h3>Top Referrers</h3>
            <div v-if="!link.analytics.referrers.length" class="empty-state" style="min-height: 120px">
              No click data.
            </div>
            <div v-else class="table-wrap">
              <table>
                <tbody>
                  <tr v-for="referrer in link.analytics.referrers" :key="referrer.referrer">
                    <td>{{ referrer.referrer }}</td>
                    <td>{{ referrer.count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3>Browsers</h3>
            <div v-if="!link.analytics.browsers.length" class="empty-state" style="min-height: 120px">
              No browser data.
            </div>
            <div v-else class="table-wrap">
              <table>
                <tbody>
                  <tr v-for="browser in link.analytics.browsers" :key="browser.label">
                    <td>{{ browser.label }}</td>
                    <td>{{ browser.count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3>Countries</h3>
            <div v-if="!link.analytics.countries.length" class="empty-state" style="min-height: 120px">
              No location data.
            </div>
            <div v-else class="table-wrap">
              <table>
                <tbody>
                  <tr v-for="country in link.analytics.countries" :key="country.label">
                    <td>{{ country.label }}</td>
                    <td>{{ country.count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="grid three" style="margin-top: 14px">
          <div>
            <h3>Devices</h3>
            <div v-if="!link.analytics.devices.length" class="empty-state" style="min-height: 120px">
              No device data.
            </div>
            <div v-else class="table-wrap">
              <table>
                <tbody>
                  <tr v-for="device in link.analytics.devices" :key="device.label">
                    <td>{{ device.label }}</td>
                    <td>{{ device.count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3>Operating Systems</h3>
            <div v-if="!link.analytics.operatingSystems.length" class="empty-state" style="min-height: 120px">
              No OS data.
            </div>
            <div v-else class="table-wrap">
              <table>
                <tbody>
                  <tr v-for="os in link.analytics.operatingSystems" :key="os.label">
                    <td>{{ os.label }}</td>
                    <td>{{ os.count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3>Sources</h3>
            <div v-if="!link.analytics.sources.length" class="empty-state" style="min-height: 120px">
              No campaign data.
            </div>
            <div v-else class="table-wrap">
              <table>
                <tbody>
                  <tr v-for="source in link.analytics.sources" :key="source.label">
                    <td>{{ source.label }}</td>
                    <td>{{ source.count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style="margin-top: 14px">
          <h3>Recent Clicks</h3>
          <div v-if="!link.analytics.recentClicks.length" class="empty-state" style="min-height: 120px">
            No recent clicks.
          </div>
          <div v-else class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>IP</th>
                  <th>Location</th>
                  <th>Browser</th>
                  <th>Viewport</th>
                  <th>Referrer</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="click in link.analytics.recentClicks.slice(0, 8)" :key="click.id">
                  <td>{{ new Date(click.clickedAt).toLocaleString() }}</td>
                  <td class="mono">{{ click.ip || click.ipHash }}</td>
                  <td>{{ getClickLocation(click) }}</td>
                  <td>{{ click.browser?.name || 'Unknown' }} / {{ click.browser?.os || 'Unknown' }}</td>
                  <td class="mono">{{ getClientViewport(click) }}</td>
                  <td class="mono">{{ (click.referrer || 'Direct').slice(0, 52) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </article>

      <div v-if="!links.length" class="empty-state">
        <Link2 aria-hidden="true" />
        Create your first redirect link.
      </div>
    </section>
  </section>
</template>
