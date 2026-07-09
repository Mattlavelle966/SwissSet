<script setup lang="ts">
import {
  ArrowUpRight,
  Brush,
  Circle,
  Crop,
  Download,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  ImagePlus,
  Maximize2,
  Minus,
  PaintBucket,
  Pipette,
  Redo2,
  RotateCcw,
  RotateCw,
  ScanLine,
  Shapes,
  Sparkles,
  Square,
  Type,
  Undo2,
  Wand2
} from 'lucide-vue-next'

type StudioTool =
  | 'brush'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'fill'
  | 'picker'

type Point = {
  x: number
  y: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const tool = ref<StudioTool>('brush')
const drawing = ref(false)
const history = ref<string[]>([])
const redoHistory = ref<string[]>([])
const brushColor = ref('#0f766e')
const fillColor = ref('#ffffff')
const brushSize = ref(12)
const useFill = ref(false)
const textValue = ref('Launch ready')
const textColor = ref('#101820')
const fontSize = ref(72)
const shapeType = ref<'rect' | 'circle'>('rect')
const shapeColor = ref('#0f766e')
const shapeOpacity = ref(72)
const overlayOpacity = ref(84)
const blendMode = ref<GlobalCompositeOperation>('source-over')
const brightness = ref(100)
const contrast = ref(100)
const saturation = ref(100)
const grayscale = ref(0)
const sepia = ref(0)
const blur = ref(0)
const cropAspect = ref('16:9')
const bgTolerance = ref(42)
const canvasReady = ref(false)
const resizeWidth = ref(1280)
const resizeHeight = ref(720)
const exportFormat = ref<'png' | 'jpeg' | 'webp'>('png')
const exportQuality = ref(92)
const dragStart = shallowRef<Point | null>(null)
const dragSnapshot = shallowRef<ImageData | null>(null)

const toolItems = [
  { id: 'brush', label: 'Brush', icon: Brush },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'rect', label: 'Rect', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'fill', label: 'Fill', icon: PaintBucket },
  { id: 'picker', label: 'Picker', icon: Pipette }
] as const

const canUndo = computed(() => history.value.length > 1)
const canRedo = computed(() => redoHistory.value.length > 0)

function getCanvas() {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d', { willReadFrequently: true })
  if (!canvas || !ctx) {
    throw new Error('Canvas not ready')
  }
  return { canvas, ctx }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function syncSizeInputs(width: number, height: number) {
  resizeWidth.value = Math.round(width)
  resizeHeight.value = Math.round(height)
}

function saveHistory(clearRedo = true) {
  const { canvas } = getCanvas()
  history.value.push(canvas.toDataURL('image/png'))
  if (history.value.length > 24) {
    history.value.shift()
  }
  if (clearRedo) {
    redoHistory.value = []
  }
}

async function restore(dataUrl: string) {
  const image = await loadImage(dataUrl)
  const { canvas, ctx } = getCanvas()
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  syncSizeInputs(canvas.width, canvas.height)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0)
}

async function undo() {
  if (!canUndo.value) return
  const current = history.value.pop()
  if (current) {
    redoHistory.value.push(current)
  }
  await restore(history.value[history.value.length - 1])
}

async function redo() {
  if (!canRedo.value) return
  const next = redoHistory.value.pop()
  if (!next) return
  history.value.push(next)
  await restore(next)
}

function initCanvas() {
  const { canvas, ctx } = getCanvas()
  canvas.width = 1280
  canvas.height = 720
  syncSizeInputs(canvas.width, canvas.height)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0f766e'
  ctx.fillRect(0, 0, canvas.width, 96)
  ctx.fillStyle = '#101820'
  ctx.font = '700 68px Inter, Arial, sans-serif'
  ctx.fillText('SwissSet Studio', 72, 270)
  ctx.fillStyle = '#657483'
  ctx.font = '400 34px Inter, Arial, sans-serif'
  ctx.fillText('Drop in a logo, screenshot, or product image.', 72, 326)
  ctx.fillStyle = '#0f766e'
  ctx.fillRect(72, 390, 320, 76)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 30px Inter, Arial, sans-serif'
  ctx.fillText('Internal asset draft', 105, 438)
  history.value = []
  redoHistory.value = []
  saveHistory(false)
  canvasReady.value = true
}

async function handleUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
  const image = await loadImage(dataUrl)
  const { canvas, ctx } = getCanvas()
  const maxSide = 1800
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.round(image.naturalWidth * ratio)
  canvas.height = Math.round(image.naturalHeight * ratio)
  syncSizeInputs(canvas.width, canvas.height)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  history.value = []
  redoHistory.value = []
  saveHistory(false)
}

async function applyFilters() {
  const { canvas, ctx } = getCanvas()
  const snapshot = canvas.toDataURL('image/png')
  const image = await loadImage(snapshot)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.filter = [
    `brightness(${brightness.value}%)`,
    `contrast(${contrast.value}%)`,
    `saturate(${saturation.value}%)`,
    `grayscale(${grayscale.value}%)`,
    `sepia(${sepia.value}%)`,
    `blur(${blur.value}px)`
  ].join(' ')
  ctx.drawImage(image, 0, 0)
  ctx.filter = 'none'
  brightness.value = 100
  contrast.value = 100
  saturation.value = 100
  grayscale.value = 0
  sepia.value = 0
  blur.value = 0
  saveHistory()
}

function addText() {
  const { canvas, ctx } = getCanvas()
  ctx.fillStyle = textColor.value
  ctx.font = `700 ${fontSize.value}px Inter, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(255,255,255,0.72)'
  ctx.shadowBlur = 12
  ctx.fillText(textValue.value, canvas.width / 2, canvas.height / 2)
  ctx.shadowBlur = 0
  saveHistory()
}

function addShape() {
  const { canvas, ctx } = getCanvas()
  const width = canvas.width * 0.38
  const height = canvas.height * 0.24
  const x = (canvas.width - width) / 2
  const y = (canvas.height - height) / 2
  ctx.globalAlpha = shapeOpacity.value / 100
  ctx.fillStyle = shapeColor.value

  if (shapeType.value === 'circle') {
    ctx.beginPath()
    ctx.ellipse(canvas.width / 2, canvas.height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, Math.min(width, height) * 0.08)
    ctx.fill()
  }

  ctx.globalAlpha = 1
  saveHistory()
}

function getPointerPoint(event: PointerEvent) {
  const { canvas } = getCanvas()
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  }
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const value = Number.parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : clean,
    16
  )

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
    .join('')}`
}

function colorDistance(data: Uint8ClampedArray, index: number, color: number[]) {
  return Math.hypot(
    data[index] - color[0],
    data[index + 1] - color[1],
    data[index + 2] - color[2],
    data[index + 3] - color[3]
  )
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  size: number
) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  ctx.beginPath()
  ctx.moveTo(end.x, end.y)
  ctx.lineTo(
    end.x - size * Math.cos(angle - Math.PI / 6),
    end.y - size * Math.sin(angle - Math.PI / 6)
  )
  ctx.moveTo(end.x, end.y)
  ctx.lineTo(
    end.x - size * Math.cos(angle + Math.PI / 6),
    end.y - size * Math.sin(angle + Math.PI / 6)
  )
  ctx.stroke()
}

function drawInteractiveShape(ctx: CanvasRenderingContext2D, start: Point, end: Point) {
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = brushSize.value
  ctx.strokeStyle = brushColor.value
  ctx.fillStyle = fillColor.value
  ctx.globalAlpha = shapeOpacity.value / 100

  if (tool.value === 'line' || tool.value === 'arrow') {
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    if (tool.value === 'arrow') {
      drawArrowHead(ctx, start, end, Math.max(14, brushSize.value * 2.4))
    }
    ctx.restore()
    return
  }

  if (tool.value === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(
      x + width / 2,
      y + height / 2,
      Math.max(1, width / 2),
      Math.max(1, height / 2),
      0,
      0,
      Math.PI * 2
    )
  } else {
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, Math.min(width, height) * 0.08)
  }

  if (useFill.value) {
    ctx.fill()
  }
  ctx.stroke()
  ctx.restore()
}

function pickColor(point: Point) {
  const { ctx } = getCanvas()
  const pixel = ctx.getImageData(point.x, point.y, 1, 1).data
  const color = rgbToHex(pixel[0], pixel[1], pixel[2])
  brushColor.value = color
  textColor.value = color
  shapeColor.value = color
}

function floodFill(point: Point) {
  const { canvas, ctx } = getCanvas()
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const width = canvas.width
  const height = canvas.height
  const startX = Math.floor(point.x)
  const startY = Math.floor(point.y)
  const startIndex = (startY * width + startX) * 4
  const target = [
    data[startIndex],
    data[startIndex + 1],
    data[startIndex + 2],
    data[startIndex + 3]
  ]
  const fill = hexToRgb(brushColor.value)
  const replacement = [fill.r, fill.g, fill.b, 255]

  if (Math.hypot(target[0] - replacement[0], target[1] - replacement[1], target[2] - replacement[2], target[3] - replacement[3]) < 2) {
    return
  }

  const visited = new Uint8Array(width * height)
  const stack: Point[] = [{ x: startX, y: startY }]
  const tolerance = bgTolerance.value

  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const x = Math.floor(current.x)
    const y = Math.floor(current.y)
    if (x < 0 || x >= width || y < 0 || y >= height) continue

    const offset = y * width + x
    if (visited[offset]) continue
    visited[offset] = 1

    const index = offset * 4
    if (colorDistance(data, index, target) > tolerance) continue

    data[index] = replacement[0]
    data[index + 1] = replacement[1]
    data[index + 2] = replacement[2]
    data[index + 3] = replacement[3]

    stack.push({ x: x + 1, y })
    stack.push({ x: x - 1, y })
    stack.push({ x, y: y + 1 })
    stack.push({ x, y: y - 1 })
  }

  ctx.putImageData(imageData, 0, 0)
  saveHistory()
}

function isShapeTool(value: StudioTool) {
  return ['line', 'rect', 'ellipse', 'arrow'].includes(value)
}

function pointerDown(event: PointerEvent) {
  const { canvas, ctx } = getCanvas()
  const point = getPointerPoint(event)

  if (tool.value === 'picker') {
    pickColor(point)
    return
  }

  if (tool.value === 'fill') {
    floodFill(point)
    return
  }

  drawing.value = true
  canvas.setPointerCapture(event.pointerId)
  dragStart.value = point

  if (isShapeTool(tool.value)) {
    dragSnapshot.value = ctx.getImageData(0, 0, canvas.width, canvas.height)
  }

  ctx.beginPath()
  ctx.moveTo(point.x, point.y)
}

function pointerMove(event: PointerEvent) {
  if (!drawing.value) return
  const { ctx } = getCanvas()
  const point = getPointerPoint(event)

  if (isShapeTool(tool.value) && dragStart.value && dragSnapshot.value) {
    ctx.putImageData(dragSnapshot.value, 0, 0)
    drawInteractiveShape(ctx, dragStart.value, point)
    return
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = brushSize.value
  ctx.globalCompositeOperation =
    tool.value === 'eraser' ? 'destination-out' : 'source-over'
  ctx.strokeStyle = brushColor.value
  ctx.lineTo(point.x, point.y)
  ctx.stroke()
}

function pointerUp(event: PointerEvent) {
  if (!drawing.value) return
  const { canvas, ctx } = getCanvas()
  const point = getPointerPoint(event)

  if (isShapeTool(tool.value) && dragStart.value && dragSnapshot.value) {
    ctx.putImageData(dragSnapshot.value, 0, 0)
    drawInteractiveShape(ctx, dragStart.value, point)
  }

  drawing.value = false
  ctx.globalCompositeOperation = 'source-over'
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId)
  }
  dragStart.value = null
  dragSnapshot.value = null
  saveHistory()
}

function parseAspect() {
  if (cropAspect.value === '1:1') return 1
  if (cropAspect.value === '4:3') return 4 / 3
  if (cropAspect.value === '3:1') return 3
  return 16 / 9
}

function centerCrop() {
  const { canvas, ctx } = getCanvas()
  const targetAspect = parseAspect()
  const currentAspect = canvas.width / canvas.height
  let cropWidth = canvas.width
  let cropHeight = canvas.height

  if (currentAspect > targetAspect) {
    cropWidth = canvas.height * targetAspect
  } else {
    cropHeight = canvas.width / targetAspect
  }

  const sx = (canvas.width - cropWidth) / 2
  const sy = (canvas.height - cropHeight) / 2
  const temp = document.createElement('canvas')
  temp.width = Math.round(cropWidth)
  temp.height = Math.round(cropHeight)
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return

  tempCtx.drawImage(canvas, sx, sy, cropWidth, cropHeight, 0, 0, temp.width, temp.height)
  canvas.width = temp.width
  canvas.height = temp.height
  ctx.drawImage(temp, 0, 0)
  saveHistory()
}

function removeBackground() {
  const { canvas, ctx } = getCanvas()
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const sample = { r: data[0], g: data[1], b: data[2] }

  for (let index = 0; index < data.length; index += 4) {
    const distance = Math.hypot(
      data[index] - sample.r,
      data[index + 1] - sample.g,
      data[index + 2] - sample.b
    )
    if (distance < bgTolerance.value) {
      data[index + 3] = 0
    }
  }

  ctx.putImageData(imageData, 0, 0)
  saveHistory()
}

function commitCanvas(temp: HTMLCanvasElement) {
  const { canvas, ctx } = getCanvas()
  canvas.width = temp.width
  canvas.height = temp.height
  syncSizeInputs(canvas.width, canvas.height)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(temp, 0, 0)
  saveHistory()
}

function rotateClockwise() {
  const { canvas } = getCanvas()
  const temp = document.createElement('canvas')
  temp.width = canvas.height
  temp.height = canvas.width
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return

  tempCtx.translate(temp.width, 0)
  tempCtx.rotate(Math.PI / 2)
  tempCtx.drawImage(canvas, 0, 0)
  commitCanvas(temp)
}

function flipCanvas(horizontal: boolean) {
  const { canvas } = getCanvas()
  const temp = document.createElement('canvas')
  temp.width = canvas.width
  temp.height = canvas.height
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return

  if (horizontal) {
    tempCtx.translate(temp.width, 0)
    tempCtx.scale(-1, 1)
  } else {
    tempCtx.translate(0, temp.height)
    tempCtx.scale(1, -1)
  }

  tempCtx.drawImage(canvas, 0, 0)
  commitCanvas(temp)
}

function resizeCanvas() {
  const { canvas } = getCanvas()
  const width = Math.max(1, Math.round(resizeWidth.value))
  const height = Math.max(1, Math.round(resizeHeight.value))
  const temp = document.createElement('canvas')
  temp.width = width
  temp.height = height
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return

  tempCtx.imageSmoothingQuality = 'high'
  tempCtx.drawImage(canvas, 0, 0, width, height)
  commitCanvas(temp)
}

function applyInvert() {
  const { canvas, ctx } = getCanvas()
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255 - data[index]
    data[index + 1] = 255 - data[index + 1]
    data[index + 2] = 255 - data[index + 2]
  }

  ctx.putImageData(imageData, 0, 0)
  saveHistory()
}

function applySharpen() {
  const { canvas, ctx } = getCanvas()
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const output = ctx.createImageData(source)
  output.data.set(source.data)
  const matrix = [0, -1, 0, -1, 5, -1, 0, -1, 0]
  const width = canvas.width
  const height = canvas.height

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const outIndex = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const sourceIndex = ((y + ky) * width + x + kx) * 4 + channel
            const weight = matrix[(ky + 1) * 3 + (kx + 1)]
            value += source.data[sourceIndex] * weight
          }
        }
        output.data[outIndex + channel] = Math.max(0, Math.min(255, value))
      }
      output.data[outIndex + 3] = source.data[outIndex + 3]
    }
  }

  ctx.putImageData(output, 0, 0)
  saveHistory()
}

function applyPixelate() {
  const { canvas, ctx } = getCanvas()
  const block = Math.max(4, Math.round(brushSize.value))
  const temp = document.createElement('canvas')
  temp.width = Math.max(1, Math.round(canvas.width / block))
  temp.height = Math.max(1, Math.round(canvas.height / block))
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return

  tempCtx.imageSmoothingEnabled = false
  tempCtx.drawImage(canvas, 0, 0, temp.width, temp.height)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(temp, 0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  saveHistory()
}

function applyVignette() {
  const { canvas, ctx } = getCanvas()
  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    Math.min(canvas.width, canvas.height) * 0.2,
    canvas.width / 2,
    canvas.height / 2,
    Math.max(canvas.width, canvas.height) * 0.65
  )
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.36)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  saveHistory()
}

async function handleOverlayUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
  const image = await loadImage(dataUrl)
  const { canvas, ctx } = getCanvas()
  const maxWidth = canvas.width * 0.72
  const maxHeight = canvas.height * 0.72
  const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
  const width = image.naturalWidth * ratio
  const height = image.naturalHeight * ratio
  const x = (canvas.width - width) / 2
  const y = (canvas.height - height) / 2

  ctx.save()
  ctx.globalAlpha = overlayOpacity.value / 100
  ctx.globalCompositeOperation = blendMode.value
  ctx.drawImage(image, x, y, width, height)
  ctx.restore()
  saveHistory()
  ;(event.target as HTMLInputElement).value = ''
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return target.isContentEditable || ['input', 'textarea', 'select'].includes(tag)
}

async function handleKeyboard(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || isTypingTarget(event.target)) return

  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault()
    await undo()
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    event.preventDefault()
    await redo()
  }
}

function exportImage() {
  const { canvas } = getCanvas()
  const mime =
    exportFormat.value === 'jpeg'
      ? 'image/jpeg'
      : exportFormat.value === 'webp'
        ? 'image/webp'
        : 'image/png'
  const extension = exportFormat.value === 'jpeg' ? 'jpg' : exportFormat.value
  const anchor = document.createElement('a')
  anchor.href = canvas.toDataURL(mime, exportQuality.value / 100)
  anchor.download = `swissset-studio.${extension}`
  anchor.click()
}

onMounted(() => {
  initCanvas()
  window.addEventListener('keydown', handleKeyboard)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboard)
})
</script>

<template>
  <section class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Image Studio</p>
        <h1>Fast asset edits</h1>
        <p class="lead">
          A compact canvas editor for quick SDLC image work: screenshots, logos, social
          previews, docs assets, and release graphics.
        </p>
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" :disabled="!canUndo" @click="undo">
          <Undo2 aria-hidden="true" />
          Undo
        </button>
        <button class="button secondary" type="button" :disabled="!canRedo" @click="redo">
          <Redo2 aria-hidden="true" />
          Redo
        </button>
        <button class="button primary" type="button" @click="exportImage">
          <Download aria-hidden="true" />
          {{ exportFormat.toUpperCase() }}
        </button>
      </div>
    </header>

    <div class="tool-layout">
      <section class="panel">
        <h2>Canvas</h2>
        <div class="field">
          <label for="studio-upload">Image</label>
          <input id="studio-upload" type="file" accept="image/*" @change="handleUpload" />
        </div>

        <div class="segmented" style="margin-bottom: 14px">
          <button
            v-for="item in toolItems"
            :key="item.id"
            :class="{ active: tool === item.id }"
            :title="item.label"
            type="button"
            @click="tool = item.id"
          >
            <component :is="item.icon" aria-hidden="true" />
          </button>
        </div>

        <div class="color-grid">
          <div class="field">
            <label for="brush-color">Stroke</label>
            <input id="brush-color" v-model="brushColor" type="color" />
          </div>
          <div class="field">
            <label for="fill-color">Fill</label>
            <input id="fill-color" v-model="fillColor" type="color" />
          </div>
          <div class="field">
            <label for="brush-size">Size</label>
            <input id="brush-size" v-model.number="brushSize" type="range" min="2" max="90" />
          </div>
          <label class="row" style="align-self: center">
            <input v-model="useFill" type="checkbox" />
            Fill shapes
          </label>
        </div>

        <h2>Export</h2>
        <div class="compact-grid">
          <div class="field">
            <label for="export-format">Format</label>
            <select id="export-format" v-model="exportFormat">
              <option value="png">PNG</option>
              <option value="jpeg">JPG</option>
              <option value="webp">WebP</option>
            </select>
          </div>
          <div class="field">
            <label for="export-quality">Quality</label>
            <input id="export-quality" v-model.number="exportQuality" type="range" min="30" max="100" />
          </div>
          <div class="field">
            <label for="blend-mode">Blend</label>
            <select id="blend-mode" v-model="blendMode">
              <option value="source-over">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
            </select>
          </div>
        </div>

        <h2>Filters</h2>
        <div class="compact-grid">
          <div class="field">
            <label for="brightness">Bright</label>
            <input id="brightness" v-model.number="brightness" type="range" min="30" max="170" />
          </div>
          <div class="field">
            <label for="contrast">Contrast</label>
            <input id="contrast" v-model.number="contrast" type="range" min="30" max="180" />
          </div>
          <div class="field">
            <label for="saturation">Saturate</label>
            <input id="saturation" v-model.number="saturation" type="range" min="0" max="220" />
          </div>
          <div class="field">
            <label for="grayscale">Gray</label>
            <input id="grayscale" v-model.number="grayscale" type="range" min="0" max="100" />
          </div>
          <div class="field">
            <label for="sepia">Sepia</label>
            <input id="sepia" v-model.number="sepia" type="range" min="0" max="100" />
          </div>
          <div class="field">
            <label for="blur">Blur</label>
            <input id="blur" v-model.number="blur" type="range" min="0" max="10" />
          </div>
        </div>
        <button class="button secondary" type="button" @click="applyFilters">
          <Wand2 aria-hidden="true" />
          Apply filters
        </button>
        <div class="button-row" style="margin-top: 10px">
          <button class="button secondary" type="button" @click="applyInvert">
            <Sparkles aria-hidden="true" />
            Invert
          </button>
          <button class="button secondary" type="button" @click="applySharpen">
            <ScanLine aria-hidden="true" />
            Sharpen
          </button>
          <button class="button secondary" type="button" @click="applyPixelate">
            <Maximize2 aria-hidden="true" />
            Pixelate
          </button>
          <button class="button secondary" type="button" @click="applyVignette">
            <Circle aria-hidden="true" />
            Vignette
          </button>
        </div>

        <h2 style="margin-top: 18px">Objects</h2>
        <div class="field">
          <label for="studio-text">Text</label>
          <input id="studio-text" v-model="textValue" />
        </div>
        <div class="compact-grid">
          <div class="field">
            <label for="text-color">Text</label>
            <input id="text-color" v-model="textColor" type="color" />
          </div>
          <div class="field">
            <label for="font-size">Size</label>
            <input id="font-size" v-model.number="fontSize" type="range" min="18" max="180" />
          </div>
          <div class="field">
            <label for="shape-color">Shape</label>
            <input id="shape-color" v-model="shapeColor" type="color" />
          </div>
          <div class="field">
            <label for="shape-opacity">Opacity</label>
            <input id="shape-opacity" v-model.number="shapeOpacity" type="range" min="10" max="100" />
          </div>
          <div class="field">
            <label for="overlay-opacity">Overlay</label>
            <input id="overlay-opacity" v-model.number="overlayOpacity" type="range" min="10" max="100" />
          </div>
        </div>

        <div class="button-row">
          <button class="button secondary" type="button" @click="addText">
            <Type aria-hidden="true" />
            Add text
          </button>
          <button class="button secondary" type="button" @click="addShape">
            <Shapes aria-hidden="true" />
            Add shape
          </button>
          <label class="button secondary">
            <ImagePlus aria-hidden="true" />
            Add image
            <input type="file" accept="image/*" hidden @change="handleOverlayUpload" />
          </label>
        </div>

        <h2 style="margin-top: 18px">Transform</h2>
        <div class="compact-grid">
          <div class="field">
            <label for="crop-aspect">Aspect</label>
            <select id="crop-aspect" v-model="cropAspect">
              <option value="16:9">16:9</option>
              <option value="4:3">4:3</option>
              <option value="1:1">1:1</option>
              <option value="3:1">3:1</option>
            </select>
          </div>
          <div class="field">
            <label for="bg-tolerance">BG Clean</label>
            <input id="bg-tolerance" v-model.number="bgTolerance" type="range" min="0" max="120" />
          </div>
          <div class="field">
            <label for="shape-type">Shape</label>
            <select id="shape-type" v-model="shapeType">
              <option value="rect">Rect</option>
              <option value="circle">Circle</option>
            </select>
          </div>
          <div class="field">
            <label for="resize-width">Width</label>
            <input id="resize-width" v-model.number="resizeWidth" type="number" min="1" />
          </div>
          <div class="field">
            <label for="resize-height">Height</label>
            <input id="resize-height" v-model.number="resizeHeight" type="number" min="1" />
          </div>
        </div>
        <div class="button-row">
          <button class="button secondary" type="button" @click="centerCrop">
            <Crop aria-hidden="true" />
            Crop
          </button>
          <button class="button secondary" type="button" @click="resizeCanvas">
            <Maximize2 aria-hidden="true" />
            Resize
          </button>
          <button class="button secondary" type="button" @click="rotateClockwise">
            <RotateCw aria-hidden="true" />
            Rotate
          </button>
          <button class="button secondary" type="button" @click="flipCanvas(true)">
            <FlipHorizontal2 aria-hidden="true" />
            Flip H
          </button>
          <button class="button secondary" type="button" @click="flipCanvas(false)">
            <FlipVertical2 aria-hidden="true" />
            Flip V
          </button>
          <button class="button secondary" type="button" @click="removeBackground">
            <ImagePlus aria-hidden="true" />
            Remove BG
          </button>
          <button class="button secondary" type="button" @click="initCanvas">
            <RotateCcw aria-hidden="true" />
            Reset
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <h2>Workspace</h2>
          <span class="badge neutral">{{ canvasReady ? 'Ready' : 'Loading' }}</span>
        </div>
        <canvas
          ref="canvasRef"
          class="workspace-canvas"
          @pointerdown="pointerDown"
          @pointermove="pointerMove"
          @pointerup="pointerUp"
          @pointercancel="pointerUp"
          @pointerleave="pointerUp"
        />
      </section>
    </div>
  </section>
</template>
