<script setup lang="ts">
import { Download, FileCode2, ImagePlus, QrCode, RefreshCw } from 'lucide-vue-next'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const payloadMode = ref<'url' | 'text' | 'wifi' | 'contact'>('url')
const textValue = ref('https://example.com')
const wifiSsid = ref('')
const wifiPassword = ref('')
const wifiEncryption = ref('WPA')
const contactName = ref('')
const contactCompany = ref('')
const contactPhone = ref('')
const contactEmail = ref('')
const foreground = ref('#0f172a')
const gradientEnd = ref('#0f766e')
const background = ref('#ffffff')
const useGradient = ref(true)
const style = ref<'squares' | 'dots' | 'rounded'>('rounded')
const errorCorrection = ref<'M' | 'Q' | 'H'>('H')
const canvasSize = ref(880)
const margin = ref(3)
const logoSize = ref(18)
const logoDataUrl = ref('')
const logoImage = shallowRef<HTMLImageElement | null>(null)
const renderError = ref('')
const svgOutput = ref('')

const qrPayload = computed(() => {
  if (payloadMode.value === 'wifi') {
    const escapedSsid = wifiSsid.value.replace(/([\\;,":])/g, '\\$1')
    const escapedPassword = wifiPassword.value.replace(/([\\;,":])/g, '\\$1')
    return `WIFI:T:${wifiEncryption.value};S:${escapedSsid};P:${escapedPassword};;`
  }

  if (payloadMode.value === 'contact') {
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${contactName.value}`,
      contactCompany.value ? `ORG:${contactCompany.value}` : '',
      contactPhone.value ? `TEL:${contactPhone.value}` : '',
      contactEmail.value ? `EMAIL:${contactEmail.value}` : '',
      'END:VCARD'
    ]
      .filter(Boolean)
      .join('\n')
  }

  return textValue.value || 'SwissSet'
})

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius)
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius)
  ctx.arcTo(x, y + height, x, y, safeRadius)
  ctx.arcTo(x, y, x + width, y, safeRadius)
  ctx.closePath()
  ctx.fill()
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.click()
}

async function getQr() {
  const QRCode = await import('qrcode')
  return QRCode.create(qrPayload.value || 'SwissSet', {
    errorCorrectionLevel: errorCorrection.value,
    margin: 0
  }) as any
}

async function renderQr() {
  if (!canvasRef.value || !process.client) return

  renderError.value = ''

  try {
    const canvas = canvasRef.value
    const qr = await getQr()
    const size = canvasSize.value
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = '100%'
    canvas.style.height = 'auto'

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = background.value
    ctx.fillRect(0, 0, size, size)

    const moduleCount = qr.modules.size
    const cell = size / (moduleCount + margin.value * 2)
    const offset = cell * margin.value
    const fill = useGradient.value
      ? ctx.createLinearGradient(0, 0, size, size)
      : foreground.value

    if (typeof fill !== 'string') {
      fill.addColorStop(0, foreground.value)
      fill.addColorStop(1, gradientEnd.value)
    }

    ctx.fillStyle = fill

    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (!qr.modules.data[row * moduleCount + col]) continue

        const x = offset + col * cell
        const y = offset + row * cell

        if (style.value === 'dots') {
          ctx.beginPath()
          ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2)
          ctx.fill()
        } else if (style.value === 'rounded') {
          drawRoundedRect(ctx, x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.22)
        } else {
          ctx.fillRect(x, y, cell, cell)
        }
      }
    }

    if (logoImage.value && logoDataUrl.value) {
      const logoPixels = size * (logoSize.value / 100)
      const x = (size - logoPixels) / 2
      const y = (size - logoPixels) / 2
      ctx.fillStyle = background.value
      drawRoundedRect(ctx, x - 14, y - 14, logoPixels + 28, logoPixels + 28, 22)
      ctx.drawImage(logoImage.value, x, y, logoPixels, logoPixels)
    }

    svgOutput.value = await buildSvg()
  } catch (error: any) {
    renderError.value = error?.message || 'QR generation failed'
  }
}

async function buildSvg() {
  const qr = await getQr()
  const moduleCount = qr.modules.size
  const size = canvasSize.value
  const cell = size / (moduleCount + margin.value * 2)
  const offset = cell * margin.value
  const fill = useGradient.value ? 'url(#qr-gradient)' : foreground.value
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    '<defs>',
    `<linearGradient id="qr-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${foreground.value}"/><stop offset="100%" stop-color="${gradientEnd.value}"/></linearGradient>`,
    '</defs>',
    `<rect width="100%" height="100%" fill="${background.value}"/>`
  ]

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!qr.modules.data[row * moduleCount + col]) continue

      const x = Number((offset + col * cell).toFixed(3))
      const y = Number((offset + row * cell).toFixed(3))
      const moduleSize = Number(cell.toFixed(3))

      if (style.value === 'dots') {
        parts.push(
          `<circle cx="${x + moduleSize / 2}" cy="${y + moduleSize / 2}" r="${moduleSize * 0.42}" fill="${fill}"/>`
        )
      } else {
        const radius = style.value === 'rounded' ? moduleSize * 0.2 : 0
        parts.push(
          `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" rx="${radius}" fill="${fill}"/>`
        )
      }
    }
  }

  if (logoDataUrl.value) {
    const logoPixels = size * (logoSize.value / 100)
    const x = (size - logoPixels) / 2
    const y = (size - logoPixels) / 2
    parts.push(
      `<rect x="${x - 14}" y="${y - 14}" width="${logoPixels + 28}" height="${logoPixels + 28}" rx="22" fill="${background.value}"/>`,
      `<image href="${logoDataUrl.value}" x="${x}" y="${y}" width="${logoPixels}" height="${logoPixels}" preserveAspectRatio="xMidYMid meet"/>`
    )
  }

  parts.push('</svg>')
  return parts.join('')
}

async function handleLogo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async () => {
    logoDataUrl.value = String(reader.result || '')
    const image = new Image()
    image.src = logoDataUrl.value
    await image.decode().catch(() => undefined)
    logoImage.value = image
    await renderQr()
  }
  reader.readAsDataURL(file)
}

function downloadPng() {
  if (!canvasRef.value) return
  downloadDataUrl(canvasRef.value.toDataURL('image/png'), 'swissset-qr.png')
}

function downloadSvg() {
  const blob = new Blob([svgOutput.value], { type: 'image/svg+xml' })
  downloadDataUrl(URL.createObjectURL(blob), 'swissset-qr.svg')
}

watch(
  [
    qrPayload,
    foreground,
    gradientEnd,
    background,
    useGradient,
    style,
    errorCorrection,
    canvasSize,
    margin,
    logoSize
  ],
  renderQr
)

onMounted(renderQr)
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">QR Generator</p>
        <h1>Branded QR codes</h1>
        <p class="lead">
          Generate QR assets for URLs, text, Wi-Fi, or vCards with gradients, module
          styles, and logo overlays.
        </p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" @click="downloadSvg">
          <FileCode2 aria-hidden="true" />
          SVG
        </button>
        <button class="button primary" type="button" @click="downloadPng">
          <Download aria-hidden="true" />
          PNG
        </button>
      </div>
    </header>

    <div class="tool-layout">
      <section class="panel">
        <h2>Payload</h2>
        <div class="segmented" style="margin-bottom: 14px">
          <button :class="{ active: payloadMode === 'url' }" type="button" @click="payloadMode = 'url'">
            URL
          </button>
          <button :class="{ active: payloadMode === 'text' }" type="button" @click="payloadMode = 'text'">
            Text
          </button>
          <button :class="{ active: payloadMode === 'wifi' }" type="button" @click="payloadMode = 'wifi'">
            Wi-Fi
          </button>
          <button :class="{ active: payloadMode === 'contact' }" type="button" @click="payloadMode = 'contact'">
            vCard
          </button>
        </div>

        <div v-if="payloadMode === 'wifi'">
          <div class="field">
            <label for="ssid">Network</label>
            <input id="ssid" v-model="wifiSsid" />
          </div>
          <div class="field">
            <label for="wifi-password">Password</label>
            <input id="wifi-password" v-model="wifiPassword" />
          </div>
          <div class="field">
            <label for="wifi-encryption">Encryption</label>
            <select id="wifi-encryption" v-model="wifiEncryption">
              <option>WPA</option>
              <option>WEP</option>
              <option>nopass</option>
            </select>
          </div>
        </div>

        <div v-else-if="payloadMode === 'contact'">
          <div class="field">
            <label for="contact-name">Name</label>
            <input id="contact-name" v-model="contactName" />
          </div>
          <div class="field">
            <label for="contact-company">Company</label>
            <input id="contact-company" v-model="contactCompany" />
          </div>
          <div class="grid two">
            <div class="field">
              <label for="contact-phone">Phone</label>
              <input id="contact-phone" v-model="contactPhone" />
            </div>
            <div class="field">
              <label for="contact-email">Email</label>
              <input id="contact-email" v-model="contactEmail" />
            </div>
          </div>
        </div>

        <div v-else class="field">
          <label for="qr-text">{{ payloadMode === 'url' ? 'URL' : 'Text' }}</label>
          <textarea id="qr-text" v-model="textValue" />
        </div>

        <h2>Style</h2>
        <div class="field">
          <label for="style">Module Style</label>
          <select id="style" v-model="style">
            <option value="rounded">Rounded</option>
            <option value="squares">Squares</option>
            <option value="dots">Dots</option>
          </select>
        </div>
        <div class="color-grid">
          <div class="field">
            <label for="foreground">Start</label>
            <input id="foreground" v-model="foreground" type="color" />
          </div>
          <div class="field">
            <label for="gradient-end">End</label>
            <input id="gradient-end" v-model="gradientEnd" type="color" />
          </div>
          <div class="field">
            <label for="background">Background</label>
            <input id="background" v-model="background" type="color" />
          </div>
          <div class="field">
            <label for="error-correction">Recovery</label>
            <select id="error-correction" v-model="errorCorrection">
              <option value="M">Standard</option>
              <option value="Q">High</option>
              <option value="H">Logo-safe</option>
            </select>
          </div>
        </div>
        <label class="row" style="margin-bottom: 14px">
          <input v-model="useGradient" type="checkbox" />
          Use gradient fill
        </label>
        <div class="field">
          <label for="logo">Logo</label>
          <input id="logo" type="file" accept="image/*" @change="handleLogo" />
        </div>
        <div class="compact-grid">
          <div class="field">
            <label for="margin">Quiet zone</label>
            <input id="margin" v-model.number="margin" type="range" min="1" max="8" />
          </div>
          <div class="field">
            <label for="logo-size">Logo size</label>
            <input id="logo-size" v-model.number="logoSize" type="range" min="8" max="28" />
          </div>
          <div class="field">
            <label for="canvas-size">Export</label>
            <select id="canvas-size" v-model.number="canvasSize">
              <option :value="512">512 px</option>
              <option :value="880">880 px</option>
              <option :value="1200">1200 px</option>
              <option :value="1800">1800 px</option>
            </select>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h2>Preview</h2>
          <button class="button secondary" type="button" @click="renderQr">
            <RefreshCw aria-hidden="true" />
            Render
          </button>
        </div>
        <p v-if="renderError" class="error">{{ renderError }}</p>
        <div class="preview-frame">
          <canvas ref="canvasRef" aria-label="QR code preview" />
        </div>
        <p class="notice" style="margin-top: 14px">
          Logo-safe recovery is selected by default because branded center overlays reduce
          QR readability.
        </p>
      </section>
    </div>
  </section>
</template>
