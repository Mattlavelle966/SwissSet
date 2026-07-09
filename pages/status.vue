<script setup lang="ts">
import { Activity, Camera, RefreshCw } from 'lucide-vue-next'

type StatusResult = {
  id: string
  url: string
  checkedAt: string
  statusCode: number | null
  ok: boolean
  down: boolean
  slow: boolean
  durationMs: number
  title: string
  issues: string[]
  metrics: Record<string, number | null>
  screenshotDataUrl: string
  failedRequests: string[]
}

const requestFetch = useRequestFetch()
const { data: historyData, refresh } = await useAsyncData('status-history', () =>
  requestFetch<{ checks: StatusResult[] }>('/api/status/history')
)

const url = ref('https://example.com')
const loading = ref(false)
const error = ref('')
const result = ref<StatusResult | null>(null)

const checks = computed(() => historyData.value?.checks || [])
const stateClass = computed(() =>
  result.value?.down ? 'danger' : result.value?.slow ? 'warning' : 'success'
)

async function runCheck() {
  error.value = ''
  loading.value = true

  try {
    result.value = await $fetch<StatusResult>('/api/status/check', {
      method: 'POST',
      body: { url: url.value }
    })
    await refresh()
  } catch (err: any) {
    error.value = err?.statusMessage || err?.message || 'Status check failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Site Status</p>
        <h1>Screenshot and timing checks</h1>
        <p class="lead">
          Run a browser-level check against any public URL and capture the visible page,
          HTTP status, load timing, and request health.
        </p>
      </div>
    </header>

    <div class="tool-layout">
      <section class="panel">
        <h2>Run Check</h2>
        <form @submit.prevent="runCheck">
          <div class="field">
            <label for="status-url">URL</label>
            <input
              id="status-url"
              v-model="url"
              inputmode="url"
              placeholder="https://example.com"
              required
            />
          </div>
          <button class="button primary" type="submit" :disabled="loading">
            <Camera v-if="!loading" aria-hidden="true" />
            <RefreshCw v-else aria-hidden="true" />
            {{ loading ? 'Checking...' : 'Capture status' }}
          </button>
        </form>
        <p v-if="error" class="error" style="margin-top: 14px">{{ error }}</p>

        <div v-if="result" style="margin-top: 18px">
          <span class="badge" :class="stateClass">
            {{ result.down ? 'Down' : result.slow ? 'Slow' : 'Operational' }}
          </span>
          <div class="metrics" style="margin-top: 14px">
            <div class="metric">
              <span>HTTP</span>
              <strong>{{ result.statusCode || 'N/A' }}</strong>
            </div>
            <div class="metric">
              <span>Total</span>
              <strong>{{ result.durationMs }} ms</strong>
            </div>
            <div class="metric">
              <span>TTFB</span>
              <strong>{{ result.metrics.ttfbMs ?? 'N/A' }}</strong>
            </div>
            <div class="metric">
              <span>Load</span>
              <strong>{{ result.metrics.loadMs ?? 'N/A' }}</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h2>Preview</h2>
          <span v-if="result?.title" class="mono">{{ result.title }}</span>
        </div>

        <div v-if="result?.screenshotDataUrl" class="preview-frame">
          <img :src="result.screenshotDataUrl" alt="Captured website screenshot" />
        </div>
        <div v-else class="empty-state">
          Run a check to see a screenshot and analytics.
        </div>

        <div v-if="result?.issues.length" class="notice" style="margin-top: 14px">
          {{ result.issues.join(' | ') }}
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="toolbar">
        <h2>History</h2>
        <button class="button secondary" type="button" @click="refresh">
          <Activity aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div v-if="!checks.length" class="empty-state">No checks recorded.</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Checked</th>
              <th>URL</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="check in checks" :key="check.id">
              <td>{{ new Date(check.checkedAt).toLocaleString() }}</td>
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
              <td>{{ check.issues.join(', ') || 'None' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
