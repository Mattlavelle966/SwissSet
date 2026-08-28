<script setup lang="ts">
import { ArrowRightLeft, Download, FileImage, Upload, Wand2 } from 'lucide-vue-next'
import {
  DEFAULT_VECTOR_SETTINGS,
  createVectorTraceOptions,
  getTraceSamplingRatio,
  normalizeForMonochrome,
  preprocessLogoImageData,
  sharpenImageData,
  type VectorPreset
} from '~/utils/vector-converter'

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
const vectorPreset = ref<VectorPreset>(DEFAULT_VECTOR_SETTINGS.preset)
const colorCount = ref(DEFAULT_VECTOR_SETTINGS.colorCount)
const simplify = ref(DEFAULT_VECTOR_SETTINGS.simplify)
const despeckle = ref(DEFAULT_VECTOR_SETTINGS.despeckle)
const traceMaxSide = ref(2200)
const sharpenEdges = ref(DEFAULT_VECTOR_SETTINGS.sharpenEdges)
const alphaThreshold = ref(DEFAULT_VECTOR_SETTINGS.alphaThreshold)
const contrastBoost = ref(DEFAULT_VECTOR_SETTINGS.contrastBoost)
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

    const maxSide = traceMaxSide.value
    const ratio = getTraceSamplingRatio(
      image.naturalWidth,
      image.naturalHeight,
      maxSide,
      vectorPreset.value
    )
    const width = Math.max(1, Math.round(image.naturalWidth * ratio))
    const height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, width, height)
    let imageData = ctx.getImageData(0, 0, width, height)

    imageData = preprocessLogoImageData(
      imageData,
      vectorPreset.value === 'color' ? 0 : contrastBoost.value,
      alphaThreshold.value
    )

    if (sharpenEdges.value && vectorPreset.value !== 'color') {
      imageData = sharpenImageData(imageData)
    }

    if (vectorPreset.value === 'mono') {
      imageData = normalizeForMonochrome(imageData)
    }

    const module = await import('imagetracerjs')
    const ImageTracer = (module as any).default || module
    const options = createVectorTraceOptions(
      vectorPreset.value,
      colorCount.value,
      simplify.value,
      despeckle.value,
      ratio
    )

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
            <option value="color">Detailed color (recommended)</option>
            <option value="crisp">Crisp flat-color logo</option>
            <option value="logo">Balanced logo</option>
            <option value="mono">Single-color mark</option>
          </select>
        </div>

        <div class="compact-grid">
          <div class="field">
            <label for="color-count">Colors</label>
            <input id="color-count" v-model.number="colorCount" type="range" min="2" max="64" />
            <small>{{ colorCount }} colors</small>
          </div>
          <div class="field">
            <label for="simplify">Smooth</label>
            <input id="simplify" v-model.number="simplify" type="range" min="0.5" max="2" step="0.1" />
          </div>
          <div class="field">
            <label for="despeckle">Cleanup</label>
            <input id="despeckle" v-model.number="despeckle" type="range" min="0" max="24" />
          </div>
          <div class="field">
            <label for="trace-size">Detail</label>
            <select id="trace-size" v-model.number="traceMaxSide">
              <option :value="1200">Standard</option>
              <option :value="2200">Sharp</option>
              <option :value="3200">Maximum</option>
            </select>
          </div>
          <div class="field">
            <label for="contrast-boost">Contrast</label>
            <input id="contrast-boost" v-model.number="contrastBoost" type="range" min="0" max="42" />
          </div>
          <div class="field">
            <label for="alpha-threshold">Alpha</label>
            <input id="alpha-threshold" v-model.number="alphaThreshold" type="range" min="0" max="80" />
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
        <label class="row" style="margin-bottom: 14px">
          <input v-model="sharpenEdges" type="checkbox" />
          Sharpen source before tracing
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
