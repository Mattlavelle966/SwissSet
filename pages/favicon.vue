<script setup lang="ts">
import { BadgeCheck, Download, ImagePlus, RefreshCw } from 'lucide-vue-next'

type IconPreview = {
  size: number
  dataUrl: string
}

const sourceDataUrl = ref('')
const removeBackground = ref(true)
const tolerance = ref(34)
const padding = ref(14)
const background = ref('#0f766e')
const foreground = ref('#ffffff')
const useTransparentMatte = ref(false)
const shape = ref<'square' | 'rounded' | 'circle' | 'squircle'>('rounded')
const radius = ref(22)
const previews = ref<IconPreview[]>([])
const generating = ref(false)
const error = ref('')
const sizes = [16, 32, 48, 64, 180, 192, 512]

function drawShape(ctx: CanvasRenderingContext2D, size: number) {
  if (shape.value === 'circle') {
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    return
  }

  const r =
    shape.value === 'square'
      ? 0
      : shape.value === 'squircle'
        ? size * 0.32
        : size * (radius.value / 100)

  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(size, 0, size, size, r)
  ctx.arcTo(size, size, 0, size, r)
  ctx.arcTo(0, size, 0, 0, r)
  ctx.arcTo(0, 0, size, 0, r)
  ctx.closePath()
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function removeSampledBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const samplePoints = [
    0,
    (width - 1) * 4,
    ((height - 1) * width) * 4,
    ((height - 1) * width + width - 1) * 4
  ]
  const sample = samplePoints.reduce(
    (acc, point) => {
      acc.r += data[point]
      acc.g += data[point + 1]
      acc.b += data[point + 2]
      return acc
    },
    { r: 0, g: 0, b: 0 }
  )
  sample.r /= samplePoints.length
  sample.g /= samplePoints.length
  sample.b /= samplePoints.length

  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.hypot(
      data[index] - sample.r,
      data[index + 1] - sample.g,
      data[index + 2] - sample.b
    )
    if (distance < tolerance.value) {
      data[index + 3] = 0
    }
  }

  ctx.putImageData(imageData, 0, 0)
}

function fitRect(image: HTMLImageElement, size: number) {
  const safePadding = size * (padding.value / 100)
  const box = Math.max(1, size - safePadding * 2)
  const ratio = Math.min(box / image.naturalWidth, box / image.naturalHeight)
  const width = image.naturalWidth * ratio
  const height = image.naturalHeight * ratio
  return {
    x: (size - width) / 2,
    y: (size - height) / 2,
    width,
    height
  }
}

async function renderIcon(size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.save()
  drawShape(ctx, size)
  ctx.clip()

  if (!useTransparentMatte.value) {
    ctx.fillStyle = background.value
    ctx.fillRect(0, 0, size, size)
  }

  const image = await loadImage(sourceDataUrl.value)
  const rect = fitRect(image, size)

  const temp = document.createElement('canvas')
  temp.width = size
  temp.height = size
  const tempCtx = temp.getContext('2d', { willReadFrequently: true })
  if (!tempCtx) return canvas

  tempCtx.drawImage(image, rect.x, rect.y, rect.width, rect.height)
  if (removeBackground.value) {
    removeSampledBackground(tempCtx, size, size)
  }

  ctx.drawImage(temp, 0, 0)
  ctx.restore()
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to export PNG'))
    }, 'image/png')
  })
}

async function renderPreviews() {
  if (!sourceDataUrl.value || !process.client) return
  error.value = ''
  generating.value = true

  try {
    const selected = [32, 64, 180, 512]
    previews.value = await Promise.all(
      selected.map(async (size) => ({
        size,
        dataUrl: (await renderIcon(size)).toDataURL('image/png')
      }))
    )
  } catch (err: any) {
    error.value = err?.message || 'Unable to render favicon previews'
  } finally {
    generating.value = false
  }
}

async function handleUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async () => {
    sourceDataUrl.value = String(reader.result || '')
    await renderPreviews()
  }
  reader.readAsDataURL(file)
}

function makeDefaultMark() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = background.value
  ctx.fillRect(0, 0, 512, 512)
  ctx.fillStyle = foreground.value
  ctx.font = '700 248px Inter, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('S', 256, 266)
  sourceDataUrl.value = canvas.toDataURL('image/png')
  void renderPreviews()
}

async function downloadPack() {
  if (!sourceDataUrl.value) return
  generating.value = true

  try {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    for (const size of sizes) {
      const canvas = await renderIcon(size)
      const blob = await canvasToBlob(canvas)
      const name =
        size === 180
          ? 'apple-touch-icon.png'
          : size === 192
            ? 'android-chrome-192x192.png'
            : size === 512
              ? 'android-chrome-512x512.png'
              : `favicon-${size}x${size}.png`
      zip.file(name, blob)
    }

    zip.file(
      'site.webmanifest',
      JSON.stringify(
        {
          name: 'SwissSet App',
          short_name: 'SwissSet',
          icons: [
            {
              src: '/android-chrome-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ],
          theme_color: background.value,
          background_color: background.value,
          display: 'standalone'
        },
        null,
        2
      )
    )
    zip.file(
      'favicon-snippet.html',
      [
        '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
        '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
        '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
        '<link rel="manifest" href="/site.webmanifest">'
      ].join('\n')
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'favicon-pack.zip'
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (err: any) {
    error.value = err?.message || 'Unable to build favicon pack'
  } finally {
    generating.value = false
  }
}

watch(
  [removeBackground, tolerance, padding, background, useTransparentMatte, shape, radius],
  renderPreviews
)

onMounted(async () => {
  makeDefaultMark()
  await renderPreviews()
})
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Favicon Generator</p>
        <h1>Browser icon packs</h1>
        <p class="lead">
          Upload a logo or mark, clean up the background, tune the mask, and export a
          ready-to-drop favicon bundle.
        </p>
      </div>
      <button class="button primary" type="button" :disabled="generating" @click="downloadPack">
        <Download aria-hidden="true" />
        {{ generating ? 'Building...' : 'Download pack' }}
      </button>
    </header>

    <div class="tool-layout">
      <section class="panel">
        <h2>Source</h2>
        <div class="field">
          <label for="favicon-source">Logo image</label>
          <input id="favicon-source" type="file" accept="image/*" @change="handleUpload" />
        </div>

        <div class="color-grid">
          <div class="field">
            <label for="fav-bg">Matte</label>
            <input id="fav-bg" v-model="background" type="color" />
          </div>
          <div class="field">
            <label for="fav-fg">Default mark</label>
            <input id="fav-fg" v-model="foreground" type="color" @input="makeDefaultMark" />
          </div>
        </div>

        <label class="row" style="margin-bottom: 14px">
          <input v-model="removeBackground" type="checkbox" />
          Remove sampled background
        </label>
        <label class="row" style="margin-bottom: 14px">
          <input v-model="useTransparentMatte" type="checkbox" />
          Transparent matte
        </label>

        <div class="field">
          <label for="shape">Shape</label>
          <select id="shape" v-model="shape">
            <option value="rounded">Rounded square</option>
            <option value="squircle">Squircle</option>
            <option value="circle">Circle</option>
            <option value="square">Square</option>
          </select>
        </div>

        <div class="compact-grid">
          <div class="field">
            <label for="fav-padding">Padding</label>
            <input id="fav-padding" v-model.number="padding" type="range" min="0" max="34" />
          </div>
          <div class="field">
            <label for="fav-radius">Radius</label>
            <input id="fav-radius" v-model.number="radius" type="range" min="0" max="42" />
          </div>
          <div class="field">
            <label for="fav-tolerance">Cleanup</label>
            <input id="fav-tolerance" v-model.number="tolerance" type="range" min="0" max="120" />
          </div>
        </div>

        <div class="button-row">
          <button class="button secondary" type="button" @click="renderPreviews">
            <RefreshCw aria-hidden="true" />
            Refresh
          </button>
          <button class="button secondary" type="button" @click="makeDefaultMark">
            <BadgeCheck aria-hidden="true" />
            Default mark
          </button>
        </div>
        <p v-if="error" class="error" style="margin-top: 14px">{{ error }}</p>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h2>Previews</h2>
          <span class="badge neutral">PNG pack</span>
        </div>

        <div v-if="!previews.length" class="empty-state">
          <ImagePlus aria-hidden="true" />
          Upload a source image to generate previews.
        </div>
        <div v-else class="grid two">
          <div v-for="preview in previews" :key="preview.size" class="card">
            <div class="preview-frame" style="min-height: 180px">
              <img
                :src="preview.dataUrl"
                :alt="`${preview.size}px favicon preview`"
                :style="{ width: `${Math.min(128, preview.size)}px` }"
              />
            </div>
            <div class="toolbar">
              <strong>{{ preview.size }} x {{ preview.size }}</strong>
              <span class="mono">PNG</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
