<script setup lang="ts">
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  FileImage,
  Link2,
  Paintbrush,
  QrCode,
  Wand2
} from 'lucide-vue-next'

const requestFetch = useRequestFetch()
const { data: statusData } = await useAsyncData('dashboard-status', () =>
  requestFetch<{ checks: any[] }>('/api/status/history')
)
const { data: linksData } = await useAsyncData('dashboard-links', () =>
  requestFetch<{ links: any[] }>('/api/links')
)

const tools = [
  {
    to: '/status',
    title: 'Site Status',
    body: 'Screenshot a URL, detect outages, and measure navigation timing.',
    icon: Activity
  },
  {
    to: '/qr',
    title: 'QR Generator',
    body: 'Create branded QR codes with logo overlays and gradient fills.',
    icon: QrCode
  },
  {
    to: '/converter',
    title: 'SVG Converter',
    body: 'Convert SVGs to PNGs and trace raster logos into editable vectors.',
    icon: Wand2
  },
  {
    to: '/favicon',
    title: 'Favicon Generator',
    body: 'Prepare multi-size favicon packs with background cleanup controls.',
    icon: BadgeCheck
  },
  {
    to: '/studio',
    title: 'Image Studio',
    body: 'Make quick edits, exports, and asset adjustments without leaving the suite.',
    icon: Paintbrush
  },
  {
    to: '/links',
    title: 'Redirect Links',
    body: 'Create trackable short links scoped to your configured domain.',
    icon: Link2
  }
]

const checks = computed(() => statusData.value?.checks || [])
const links = computed(() => linksData.value?.links || [])
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Command Center</p>
        <h1>SDLC utility bench</h1>
        <p class="lead">
          A focused internal suite for monitoring sites, producing brand assets, and
          sharing trackable links during delivery work.
        </p>
      </div>
    </header>

    <div class="metrics">
      <div class="metric">
        <span>Status checks</span>
        <strong>{{ checks.length }}</strong>
      </div>
      <div class="metric">
        <span>Tracked links</span>
        <strong>{{ links.length }}</strong>
      </div>
      <div class="metric">
        <span>Total clicks</span>
        <strong>{{
          links.reduce((sum, link) => sum + link.analytics.clickCount, 0)
        }}</strong>
      </div>
      <div class="metric">
        <span>Tool pages</span>
        <strong>6</strong>
      </div>
    </div>

    <div class="grid three">
      <NuxtLink v-for="tool in tools" :key="tool.to" class="card" :to="tool.to">
        <component :is="tool.icon" aria-hidden="true" />
        <div>
          <h2>{{ tool.title }}</h2>
          <p>{{ tool.body }}</p>
        </div>
        <span class="button secondary" style="width: fit-content">
          Open
          <ArrowRight aria-hidden="true" />
        </span>
      </NuxtLink>
    </div>

    <div class="grid two">
      <section class="panel">
        <div class="toolbar">
          <h2>Recent Status Checks</h2>
          <NuxtLink class="button secondary" to="/status">
            <Activity aria-hidden="true" />
            Run check
          </NuxtLink>
        </div>
        <div v-if="!checks.length" class="empty-state">
          No status checks yet.
        </div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th>State</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="check in checks.slice(0, 5)" :key="check.id">
                <td class="mono">{{ check.url }}</td>
                <td>
                  <span
                    class="badge"
                    :class="check.down ? 'danger' : check.slow ? 'warning' : 'success'"
                  >
                    {{ check.down ? 'Down' : check.slow ? 'Slow' : 'OK' }}
                  </span>
                </td>
                <td>{{ check.durationMs }} ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h2>Redirect Analytics</h2>
          <NuxtLink class="button secondary" to="/links">
            <Link2 aria-hidden="true" />
            Create link
          </NuxtLink>
        </div>
        <div v-if="!links.length" class="empty-state">
          No redirect links yet.
        </div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Link</th>
                <th>Clicks</th>
                <th>Visitors</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="link in links.slice(0, 5)" :key="link.id">
                <td>
                  <strong>{{ link.label }}</strong>
                  <div class="mono">{{ link.slug }}</div>
                </td>
                <td>{{ link.analytics.clickCount }}</td>
                <td>{{ link.analytics.uniqueVisitors }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </section>
</template>
