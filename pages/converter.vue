<script setup lang="ts">
import { ArrowRightLeft, Download, FileImage, Upload, Wand2 } from 'lucide-vue-next'

type VectorPreset = 'logo' | 'mono' | 'color'

const svgText = ref(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 180">
  <rect width="500" height="180" rx="24" fill="#0f766e"/>
  <text x="250" y="112" text-anchor="middle" font-family="Inter, Arial" font-size="64" font-weight="700" fill="white">SwissSet</text>
</svg>`)
const pngDataUrl = ref('')
const svgScale = ref(2)
const pngBackground = ref('#ffffff')
const transparentPng = ref(true)
const rasterName = ref('')
const rasterPreview = ref('')
const rasterObjectUrl = ref('')
const vectorSvg = ref('')
const vectorPreset = ref<VectorPreset>('logo')
const colorCount = ref(5)
const simplify = ref(1)
const despeckle = ref(8)
const vectorError = ref('')
const converting = ref(false)
const autoTrace = ref(true)
const syncVectorToRenderer = ref(true)

const vectorPreview = computed(() =>
  vectorSvg.value
    ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(vectorSvg.value)))}`
    : ''
)

function downloadBlob(content: string | Blob, filename: string, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function parseSvgDimensions(source: string) {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const svg = doc.querySelector('svg')

  if (!svg) {
    return { width: 1024, height: 1024 }
  }

  const parseSize = (value: string | null) => {
    const parsed = Number(String(value || '').replace(/[^\d.]/g, ''))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  const width = parseSize(svg.getAttribute('width'))
  const height = parseSize(svg.getAttribute('height'))
  const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number)

  if (width && height) {
    return { width, height }
  }

  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    return { width: viewBox[2], height: viewBox[3] }
  }

  return { width: 1024, height: 1024 }
}

async function svgToPng() {
  vectorError.value = ''
  converting.value = true

  try {
    const dims = parseSvgDimensions(svgText.value)
    const width = Math.round(dims.width * svgScale.value)
    const height = Math.round(dims.height * svgScale.value)
    const blob = new Blob([svgText.value], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.src = url
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!transparentPng.value) {
      ctx.fillStyle = pngBackground.value
      ctx.fillRect(0, 0, width, height)
    }

    ctx.drawImage(image, 0, 0, width, height)
    pngDataUrl.value = canvas.toDataURL('image/png')
    URL.revokeObjectURL(url)
  } catch (error: any) {
    vectorError.value = error?.message || 'SVG could not be rendered'
  } finally {
    converting.value = false
  }
}

async function handleSvgUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  svgText.value = await file.text()
  await svgToPng()
}

function normalizeForMonochrome(imageData: ImageData) {
  const data = imageData.data
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3]
    const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const value = alpha < 20 || luminance > 170 ? 255 : 0
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
    data[index + 3] = alpha
  }
  return imageData
}

async function handleRasterUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (rasterObjectUrl.value) {
    URL.revokeObjectURL(rasterObjectUrl.value)
  }

  rasterName.value = file.name.replace(/\.[^.]+$/, '')
  rasterObjectUrl.value = URL.createObjectURL(file)
  rasterPreview.value = rasterObjectUrl.value
  vectorSvg.value = ''

  if (autoTrace.value) {
    await nextTick()
    await vectorizeRaster()
  }
}

async function vectorizeRaster() {
  if (!rasterPreview.value) return

  vectorError.value = ''
  converting.value = true

  try {
    const image = new Image()
    image.src = rasterPreview.value
    await image.decode()

    const maxSide = 1200
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * ratio))
    const height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.drawImage(image, 0, 0, width, height)
    let imageData = ctx.getImageData(0, 0, width, height)

    if (vectorPreset.value === 'mono') {
      imageData = normalizeForMonochrome(imageData)
    }

    const module = await import('imagetracerjs')
    const ImageTracer = (module as any).default || module
    const options =
      vectorPreset.value === 'mono'
        ? {
            numberofcolors: 2,
            ltres: 0.7 * simplify.value,
            qtres: 0.7 * simplify.value,
            pathomit: despeckle.value,
            colorsampling: 0,
            scale: 1,
            strokewidth: 0
          }
        : vectorPreset.value === 'logo'
          ? {
              numberofcolors: colorCount.value,
              ltres: 0.55 * simplify.value,
              qtres: 0.55 * simplify.value,
              pathomit: despeckle.value,
              colorsampling: 2,
              colorquantcycles: 4,
              blurradius: 1,
              blurdelta: 18,
              scale: 1,
              strokewidth: 0
            }
          : {
              numberofcolors: Math.max(8, colorCount.value),
              ltres: 1 * simplify.value,
              qtres: 1 * simplify.value,
              pathomit: Math.max(2, despeckle.value / 2),
              colorsampling: 2,
              colorquantcycles: 5,
              scale: 1,
              strokewidth: 0
            }

    vectorSvg.value = ImageTracer.imagedataToSVG(imageData, options)

    if (syncVectorToRenderer.value) {
      svgText.value = vectorSvg.value
      await svgToPng()
    }
  } catch (error: any) {
    vectorError.value = error?.message || 'Raster could not be vectorized'
  } finally {
    converting.value = false
  }
}

function downloadPng() {
  if (!pngDataUrl.value) return
  const anchor = document.createElement('a')
  anchor.href = pngDataUrl.value
  anchor.download = 'converted-svg.png'
  anchor.click()
}

async function sendVectorToPngRenderer() {
  if (!vectorSvg.value) return
  svgText.value = vectorSvg.value
  await svgToPng()
}

onBeforeUnmount(() => {
  if (rasterObjectUrl.value) {
    URL.revokeObjectURL(rasterObjectUrl.value)
  }
})
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">SVG Converter</p>
        <h1>Raster and vector exchange</h1>
        <p class="lead">
          Convert in both directions: SVG to PNG exports, and PNG/JPG/WebP source
          images into editable SVG paths.
        </p>
      </div>
    </header>

    <div class="grid two">
      <section class="panel">
        <div class="toolbar">
          <h2>SVG -> PNG</h2>
          <label class="button secondary">
            <Upload aria-hidden="true" />
            Upload SVG
            <input type="file" accept=".svg,image/svg+xml" hidden @change="handleSvgUpload" />
          </label>
        </div>

        <div class="field">
          <label for="svg-source">SVG Source</label>
          <textarea id="svg-source" v-model="svgText" style="min-height: 260px" />
        </div>

        <div class="compact-grid">
          <div class="field">
            <label for="svg-scale">Scale</label>
            <select id="svg-scale" v-model.number="svgScale">
              <option :value="1">1x</option>
              <option :value="2">2x</option>
              <option :value="3">3x</option>
              <option :value="4">4x</option>
            </select>
          </div>
          <div class="field">
            <label for="png-background">Matte</label>
            <input id="png-background" v-model="pngBackground" type="color" />
          </div>
          <label class="row" style="align-self: center">
            <input v-model="transparentPng" type="checkbox" />
            Transparent
          </label>
        </div>

        <div class="button-row">
          <button class="button primary" type="button" :disabled="converting" @click="svgToPng">
            <FileImage aria-hidden="true" />
            {{ converting ? 'Converting...' : 'Render PNG' }}
          </button>
          <button class="button secondary" type="button" :disabled="!pngDataUrl" @click="downloadPng">
            <Download aria-hidden="true" />
            Download PNG
          </button>
        </div>

        <p v-if="vectorError" class="error" style="margin-top: 14px">{{ vectorError }}</p>

        <div class="preview-frame" style="margin-top: 14px">
          <img v-if="pngDataUrl" :src="pngDataUrl" alt="Converted PNG preview" />
          <span v-else>PNG preview appears here.</span>
        </div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h2>PNG -> SVG</h2>
          <label class="button secondary">
            <Upload aria-hidden="true" />
            Upload PNG/JPG
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleRasterUpload" />
          </label>
        </div>

        <div class="field">
          <label for="vector-preset">Preset</label>
          <select id="vector-preset" v-model="vectorPreset">
            <option value="logo">Business logo</option>
            <option value="mono">Single-color mark</option>
            <option value="color">Full-color artwork</option>
          </select>
        </div>

        <div class="compact-grid">
          <div class="field">
            <label for="color-count">Colors</label>
            <input id="color-count" v-model.number="colorCount" type="range" min="2" max="16" />
          </div>
          <div class="field">
            <label for="simplify">Smooth</label>
            <input id="simplify" v-model.number="simplify" type="range" min="0.5" max="2" step="0.1" />
          </div>
          <div class="field">
            <label for="despeckle">Cleanup</label>
            <input id="despeckle" v-model.number="despeckle" type="range" min="0" max="24" />
          </div>
        </div>

        <label class="row" style="margin-bottom: 14px">
          <input v-model="autoTrace" type="checkbox" />
          Trace immediately after upload
        </label>
        <label class="row" style="margin-bottom: 14px">
          <input v-model="syncVectorToRenderer" type="checkbox" />
          Send traced SVG to PNG renderer
        </label>

        <div class="button-row">
          <button
            class="button primary"
            type="button"
            :disabled="!rasterPreview || converting"
            @click="vectorizeRaster"
          >
            <Wand2 aria-hidden="true" />
            {{ converting ? 'Tracing...' : 'Trace SVG' }}
          </button>
          <button
            class="button secondary"
            type="button"
            :disabled="!vectorSvg || converting"
            @click="sendVectorToPngRenderer"
          >
            <ArrowRightLeft aria-hidden="true" />
            SVG -> PNG
          </button>
          <button
            class="button secondary"
            type="button"
            :disabled="!vectorSvg"
            @click="downloadBlob(vectorSvg, `${rasterName || 'vectorized'}.svg`, 'image/svg+xml')"
          >
            <Download aria-hidden="true" />
            Download SVG
          </button>
        </div>

        <div class="grid two" style="margin-top: 14px">
          <div class="preview-frame">
            <img v-if="rasterPreview" :src="rasterPreview" alt="Raster source preview" />
            <span v-else>Raster source.</span>
          </div>
          <div class="preview-frame">
            <img v-if="vectorPreview" :src="vectorPreview" alt="Vector output preview" />
            <span v-else>SVG output.</span>
          </div>
        </div>

        <div v-if="vectorSvg" class="field" style="margin-top: 14px">
          <label for="vector-source">Generated SVG</label>
          <textarea id="vector-source" v-model="vectorSvg" style="min-height: 180px" />
        </div>
      </section>
    </div>
  </section>
</template>
