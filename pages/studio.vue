<script setup lang="ts">
import {
  Brush,
  ChevronDown,
  Circle,
  Copy,
  Crop,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Hand,
  History,
  ImagePlus,
  Layers,
  Lock,
  MousePointer2,
  Navigation,
  PaintBucket,
  Pipette,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  ZoomIn,
  ZoomOut
} from 'lucide-vue-next'
import {
  CANVAS_COMPOSITE_BY_BLEND,
  SUPPORTED_BLEND_MODES,
  alignSelectedLayers,
  bringLayerForward,
  bringLayerToFront,
  cloneDocument,
  createDocument,
  createEmptyRasterLayer,
  createFrameLayer,
  createRasterLayer,
  createShapeLayer,
  createTextLayer,
  deleteSelectedLayers,
  distributeSelectedLayers,
  duplicateSelectedLayers,
  editorId,
  exceedsSafeMemory,
  getActiveLayer,
  insertLayer,
  makeProjectFile,
  moveLayer,
  parseProjectFile,
  pushHistory,
  redoDocument,
  sendLayerBackward,
  sendLayerToBack,
  setActiveLayer,
  undoDocument,
  type BlendMode,
  type EditorDocument,
  type EditorLayer,
  type RasterLayer,
  type SelectionShape,
  type ShapeKind
} from '~/utils/editor-core'

type EditorTool =
  | 'move'
  | 'hand'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'picker'
  | 'marquee'
  | 'text'
  | 'shape'
  | 'crop'

type Point = {
  x: number
  y: number
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

type TransformRect = {
  x: number
  y: number
  width: number
  height: number
}

type Preferences = {
  theme: 'light' | 'dark'
  accent: string
  defaultExport: 'png' | 'jpeg' | 'webp'
  exportQuality: number
  historyLimit: number
  maxDimension: number
  autoSaveMs: number
  panelWidth: number
  previewMode: boolean
  panels: Record<'navigator' | 'layers' | 'history', { visible: boolean; collapsed: boolean }>
}

const TOOL_ITEMS = [
  { id: 'move', label: 'Move', shortcut: 'V', icon: MousePointer2 },
  { id: 'hand', label: 'Hand', shortcut: 'H', icon: Hand },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: Brush },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: Eraser },
  { id: 'fill', label: 'Fill', shortcut: 'G', icon: PaintBucket },
  { id: 'picker', label: 'Eyedropper', shortcut: 'I', icon: Pipette },
  { id: 'marquee', label: 'Marquee', shortcut: 'M', icon: Crop },
  { id: 'text', label: 'Text', shortcut: 'T', icon: Type },
  { id: 'shape', label: 'Shape', shortcut: 'U', icon: Square }
] as const

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/bmp']
const PROJECT_EXTENSION = 'swissset-project.json'
const AUTOSAVE_KEY = 'swissset:studio:autosave:v1'
const PREF_KEY = 'swissset:studio:prefs:v1'
const RECENT_KEY = 'swissset:studio:recent:v1'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const navigatorRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const layerFileInputRef = ref<HTMLInputElement | null>(null)
const projectInputRef = ref<HTMLInputElement | null>(null)
const documents = ref<EditorDocument[]>([])
const activeDocumentId = ref('')
const activeTool = ref<EditorTool>('move')
const statusMessage = ref('')
const errorMessage = ref('')
const busy = ref(false)
const busyLabel = ref('')
const remoteUrl = ref('')
const activeMenu = ref('')
const fullscreen = ref(false)
const previewMode = ref(false)
const dragState = shallowRef<{
  type: 'paint' | 'move' | 'resize' | 'marquee' | 'pan'
  start: Point
  last: Point
  layerStart?: Point
  layerStartTransform?: TransformRect
  resizeHandle?: ResizeHandle
  panStart?: Point
  scratch?: HTMLCanvasElement
} | null>(null)
const draggedLayerId = ref('')
const worker = shallowRef<Worker | null>(null)
const workerJobs = new Map<string, { resolve: (value: ImageData) => void; reject: (error: Error) => void }>()
const imageCache = new Map<string, Promise<HTMLImageElement>>()

const prefs = ref<Preferences>({
  theme: 'light',
  accent: '#0f766e',
  defaultExport: 'png',
  exportQuality: 0.92,
  historyLimit: 60,
  maxDimension: 8192,
  autoSaveMs: 15_000,
  panelWidth: 320,
  previewMode: false,
  panels: {
    navigator: { visible: true, collapsed: false },
    layers: { visible: true, collapsed: false },
    history: { visible: true, collapsed: false }
  }
})

const newDoc = reactive({
  width: 1280,
  height: 720,
  background: '#ffffff',
  transparent: false,
  preset: '1280x720'
})

const exportSettings = reactive({
  fileName: 'swissset-export',
  format: 'png' as 'png' | 'jpeg' | 'webp',
  width: 1280,
  height: 720,
  scale: 1,
  quality: 0.92,
  transparency: true,
  background: '#ffffff',
  estimatedSize: ''
})

const toolOptions = reactive({
  brushSize: 18,
  brushHardness: 0.9,
  brushOpacity: 1,
  brushFlow: 1,
  brushSmoothing: 0.35,
  foreground: '#0f766e',
  background: '#ffffff',
  fillTolerance: 32,
  shape: 'rectangle' as ShapeKind,
  shapeFill: '#0f766e',
  shapeStroke: '#101820',
  shapeStrokeWidth: 0,
  text: 'Text',
  fontFamily: 'Inter, Arial, sans-serif',
  fontSize: 72,
  selectionMode: 'replace' as 'replace' | 'add' | 'subtract' | 'intersect',
  feather: 0
})

const activeDocument = computed(() =>
  documents.value.find((doc) => doc.id === activeDocumentId.value) || null
)
const activeLayer = computed(() => {
  const doc = activeDocument.value
  return doc ? getActiveLayer(doc) : null
})
const activeShapeLayer = computed(() => {
  const layer = activeLayer.value
  return layer?.type === 'shape' ? layer : null
})
const activeTextLayer = computed(() => {
  const layer = activeLayer.value
  return layer?.type === 'text' ? layer : null
})
const activeFrameLayer = computed(() => {
  const layer = activeLayer.value
  return layer?.type === 'frame' ? layer : null
})
const resizeHandles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const canvasWrapStyle = computed(() => {
  const doc = activeDocument.value
  if (!doc) return {}
  const layer = activeLayer.value
  const zoom = doc.viewport.zoom
  const margin = 36
  const offsetX = layer ? Math.max(0, -layer.transform.x * zoom + margin) : 0
  const offsetY = layer ? Math.max(0, -layer.transform.y * zoom + margin) : 0
  const right = layer
    ? Math.max(doc.width, layer.transform.x + layer.transform.width + margin / zoom)
    : doc.width
  const bottom = layer
    ? Math.max(doc.height, layer.transform.y + layer.transform.height + margin / zoom)
    : doc.height
  return {
    width: `${offsetX + right * zoom}px`,
    height: `${offsetY + bottom * zoom}px`,
    paddingLeft: `${offsetX}px`,
    paddingTop: `${offsetY}px`
  }
})
const transformOverlayStyle = computed(() => {
  const doc = activeDocument.value
  const layer = activeLayer.value
  if (!doc || !layer || !layer.visible) return null
  const zoom = doc.viewport.zoom
  const margin = 36
  const offsetX = Math.max(0, -layer.transform.x * zoom + margin)
  const offsetY = Math.max(0, -layer.transform.y * zoom + margin)
  return {
    left: `${offsetX + layer.transform.x * zoom}px`,
    top: `${offsetY + layer.transform.y * zoom}px`,
    width: `${layer.transform.width * zoom}px`,
    height: `${layer.transform.height * zoom}px`
  }
})
const canUndo = computed(() => !!activeDocument.value && activeDocument.value.history.length > 1)
const canRedo = computed(() => !!activeDocument.value && activeDocument.value.redo.length > 0)
const visiblePanels = computed(() =>
  (['navigator', 'layers', 'history'] as const).filter((panel) => prefs.value.panels[panel].visible)
)

const menus = computed(() => [
  {
    id: 'file',
    label: 'File',
    items: [
      { label: 'New Document', shortcut: 'Ctrl+N', run: createBlankDocument },
      { label: 'Open Images', shortcut: 'Ctrl+O', run: () => fileInputRef.value?.click() },
      { label: 'Open Project', run: () => projectInputRef.value?.click() },
      { label: 'Open Remote URL', run: openRemoteImage, disabled: !remoteUrl.value.trim(), reason: 'Enter a URL first' },
      { label: 'Save Project', shortcut: 'Ctrl+S', run: saveProject, disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'Quick Export PNG', shortcut: 'Ctrl+E', run: () => exportDocument('png'), disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'Print', shortcut: 'Ctrl+P', run: printDocument, disabled: !activeDocument.value, reason: 'No document is open' }
    ]
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { label: 'Undo', shortcut: 'Ctrl+Z', run: undo, disabled: !canUndo.value, reason: 'No earlier history state' },
      { label: 'Redo', shortcut: 'Ctrl+Y', run: redo, disabled: !canRedo.value, reason: 'No later history state' },
      { label: 'Copy Layer', shortcut: 'Ctrl+C', run: copyActiveLayer, disabled: !activeLayer.value, reason: 'No active layer' },
      { label: 'Paste Image as Layer', shortcut: 'Ctrl+V', run: pasteFromClipboard },
      { label: 'Delete Layer', shortcut: 'Delete', run: deleteLayers, disabled: !activeLayer.value, reason: 'No active layer' },
      { label: 'Preferences', run: showPreferences }
    ]
  },
  {
    id: 'image',
    label: 'Image',
    items: [
      { label: 'Resize Image', run: resizeDocument, disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'Resize Canvas', run: resizeCanvasOnly, disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'Trim Transparent Edges', disabled: true, reason: 'Unavailable: tiled transparent-edge scanning is not implemented yet' },
      { label: 'Generative Expand', disabled: true, reason: 'Unavailable: AI provider is not configured' }
    ]
  },
  {
    id: 'layer',
    label: 'Layer',
    items: [
      { label: 'New Raster Layer', run: addRasterLayer, disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'New Text Layer', run: addTextLayer, disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'New Shape Layer', run: addShapeLayer, disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'New Frame Layer', run: addFrameLayer, disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'Duplicate Layer', shortcut: 'Ctrl+J', run: duplicateLayers, disabled: !activeLayer.value, reason: 'No active layer' },
      { label: 'Merge Down', run: mergeDown, disabled: !activeLayer.value, reason: 'No active layer' },
      { label: 'Flatten Document', run: flattenDocument, disabled: !activeDocument.value, reason: 'No document is open' }
    ]
  },
  {
    id: 'select',
    label: 'Select',
    items: [
      { label: 'Select All', shortcut: 'Ctrl+A', run: selectAll, disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'Deselect', shortcut: 'Ctrl+D', run: deselect, disabled: !activeDocument.value, reason: 'No document is open' },
      { label: 'Save Selection', run: saveSelection, disabled: !activeDocument.value?.selection, reason: 'No active selection' },
      { label: 'AI Subject Selection', disabled: true, reason: 'Unavailable: AI provider is not configured' }
    ]
  },
  {
    id: 'adjustment',
    label: 'Adjustment',
    items: [
      { label: 'Auto Adjust', run: () => applyWorkerFilter('Auto Adjust', { brightness: 8, contrast: 14, saturation: 8 }) },
      { label: 'Brightness / Contrast', run: () => applyWorkerFilter('Brightness / Contrast', { brightness: 10, contrast: 18 }) },
      { label: 'Desaturate', run: () => applyWorkerFilter('Desaturate', { grayscale: 100 }) },
      { label: 'Invert', run: () => applyWorkerFilter('Invert', { invert: true }) },
      { label: 'Threshold', run: () => applyWorkerFilter('Threshold', { threshold: 128 }) },
      { label: 'Curves', disabled: true, reason: 'Unavailable: curve editor is not implemented yet' },
      { label: 'Levels', disabled: true, reason: 'Unavailable: levels histogram editor is not implemented yet' }
    ]
  },
  {
    id: 'filter',
    label: 'Filter',
    items: [
      { label: 'Sharpen', run: () => applyWorkerFilter('Sharpen', { sharpen: true }) },
      { label: 'Posterize', run: () => applyWorkerFilter('Posterize', { posterize: 5 }) },
      { label: 'AI Noise Removal', disabled: true, reason: 'Unavailable: AI provider is not configured' }
    ]
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { label: 'Zoom In', shortcut: 'Ctrl++', run: () => setZoom((activeDocument.value?.viewport.zoom || 1) * 1.2) },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', run: () => setZoom((activeDocument.value?.viewport.zoom || 1) / 1.2) },
      { label: 'Actual Size', shortcut: 'Ctrl+1', run: () => setZoom(1) },
      { label: 'Fit to Workspace', shortcut: 'Ctrl+0', run: fitToWorkspace },
      { label: 'Preview Mode', run: togglePreviewMode },
      { label: 'Full Screen', shortcut: 'F', run: toggleFullscreen },
      { label: 'Restore Workspace', run: restoreDefaultWorkspace }
    ]
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { label: 'Keyboard Shortcuts', run: showShortcuts },
      { label: 'Issue Reporting', run: () => setStatus('Report issues through your internal SwissSet repository.') },
      { label: 'AI Features', disabled: true, reason: 'Unavailable: configure a server-side AI provider first' }
    ]
  }
])

watch(activeDocument, async (doc) => {
  if (!doc) return
  exportSettings.width = doc.width
  exportSettings.height = doc.height
  await nextTick()
  await render()
}, { immediate: true })

watch(documents, () => {
  scheduleRender()
  scheduleAutosave()
}, { deep: true })

watch(prefs, (value) => {
  if (!process.client) return
  document.documentElement.style.setProperty('--accent', value.accent)
  localStorage.setItem(PREF_KEY, JSON.stringify(value))
}, { deep: true })

let renderQueued = false
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let globalPointerMoveHandler: ((event: PointerEvent) => void) | null = null
let globalPointerEndHandler: ((event: PointerEvent) => void) | null = null

function setError(message: string) {
  errorMessage.value = message
  window.setTimeout(() => {
    if (errorMessage.value === message) errorMessage.value = ''
  }, 6000)
}

function setStatus(message: string) {
  statusMessage.value = message
  window.setTimeout(() => {
    if (statusMessage.value === message) statusMessage.value = ''
  }, 4000)
}

function requireDocument() {
  if (!activeDocument.value) {
    throw new Error('No document is open')
  }
  return activeDocument.value
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return target.isContentEditable || ['input', 'textarea', 'select'].includes(tag)
}

function scheduleRender() {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(async () => {
    renderQueued = false
    await render()
  })
}

function scheduleAutosave() {
  if (!process.client) return
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    const serializable = documents.value.map((doc) => {
      const copy = cloneDocument(doc)
      copy.history = []
      copy.redo = []
      return copy
    })
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ at: new Date().toISOString(), documents: serializable }))
  }, prefs.value.autoSaveMs)
}

function cleanupGlobalPointerListeners() {
  if (globalPointerMoveHandler) {
    window.removeEventListener('pointermove', globalPointerMoveHandler)
    globalPointerMoveHandler = null
  }
  if (globalPointerEndHandler) {
    window.removeEventListener('pointerup', globalPointerEndHandler)
    window.removeEventListener('pointercancel', globalPointerEndHandler)
    globalPointerEndHandler = null
  }
}

function bindGlobalPointerListeners() {
  cleanupGlobalPointerListeners()
  globalPointerMoveHandler = (event: PointerEvent) => {
    void pointerMove(event)
  }
  globalPointerEndHandler = (event: PointerEvent) => {
    event.preventDefault()
    void pointerUp()
  }
  window.addEventListener('pointermove', globalPointerMoveHandler)
  window.addEventListener('pointerup', globalPointerEndHandler)
  window.addEventListener('pointercancel', globalPointerEndHandler)
}

async function imageFromSource(source: string) {
  if (!source) return null
  if (!imageCache.has(source)) {
    imageCache.set(source, new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Image data could not be loaded'))
      image.src = source
    }))
  }
  return imageCache.get(source)!
}

function createTransparentDataUrl(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas.toDataURL('image/png')
}

function drawShapePath(ctx: CanvasRenderingContext2D, layer: Extract<EditorLayer, { type: 'shape' }>) {
  const { width, height } = layer.transform
  ctx.beginPath()
  if (layer.shape === 'ellipse') {
    ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
  } else if (layer.shape === 'line' || layer.shape === 'arrow') {
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
  } else if (layer.shape === 'star' || layer.shape === 'polygon') {
    const sides = Math.max(3, layer.sides)
    const points = layer.shape === 'star' ? sides * 2 : sides
    const radius = Math.min(width, height) / 2
    for (let index = 0; index < points; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / points
      const pointRadius = layer.shape === 'star' && index % 2 ? radius * 0.45 : radius
      const x = width / 2 + Math.cos(angle) * pointRadius
      const y = height / 2 + Math.sin(angle) * pointRadius
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  } else if (layer.shape === 'rounded-rectangle') {
    ctx.roundRect(0, 0, width, height, layer.radius)
  } else {
    ctx.rect(0, 0, width, height)
  }
}

async function renderLayerToContext(ctx: CanvasRenderingContext2D, layer: EditorLayer) {
  if (!layer.visible || layer.opacity <= 0) return
  const temp = document.createElement('canvas')
  temp.width = Math.max(1, Math.round(layer.transform.width))
  temp.height = Math.max(1, Math.round(layer.transform.height))
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return

  if (layer.type === 'raster') {
    const image = await imageFromSource(layer.dataUrl)
    if (image) tempCtx.drawImage(image, 0, 0, temp.width, temp.height)
  } else if (layer.type === 'text') {
    tempCtx.fillStyle = layer.color
    tempCtx.font = `${layer.italic ? 'italic ' : ''}${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`
    tempCtx.textAlign = layer.align
    tempCtx.textBaseline = 'top'
    tempCtx.globalAlpha = layer.opacity
    tempCtx.shadowColor = layer.effects.shadowColor
    tempCtx.shadowBlur = layer.effects.shadowBlur
    tempCtx.shadowOffsetX = layer.effects.shadowOffsetX
    tempCtx.shadowOffsetY = layer.effects.shadowOffsetY
    const x = layer.align === 'center' ? layer.boxWidth / 2 : layer.align === 'right' ? layer.boxWidth : 0
    const lines = layer.text.split('\n')
    lines.forEach((line, index) => {
      const y = index * layer.fontSize * layer.lineHeight
      if (layer.effects.strokeWidth) {
        tempCtx.lineWidth = layer.effects.strokeWidth
        tempCtx.strokeStyle = layer.effects.strokeColor
        tempCtx.strokeText(line, x, y)
      }
      tempCtx.fillText(line, x, y)
      if (layer.underline) {
        const metrics = tempCtx.measureText(line)
        const start = layer.align === 'center' ? x - metrics.width / 2 : layer.align === 'right' ? x - metrics.width : x
        tempCtx.fillRect(start, y + layer.fontSize * 1.08, metrics.width, Math.max(1, layer.fontSize / 18))
      }
    })
  } else if (layer.type === 'shape') {
    drawShapePath(tempCtx, layer)
    if (layer.shape === 'arrow') {
      const size = Math.max(16, layer.strokeWidth * 3)
      tempCtx.moveTo(temp.width, temp.height / 2)
      tempCtx.lineTo(temp.width - size, temp.height / 2 - size / 2)
      tempCtx.moveTo(temp.width, temp.height / 2)
      tempCtx.lineTo(temp.width - size, temp.height / 2 + size / 2)
    }
    if (layer.fill && layer.shape !== 'line' && layer.shape !== 'arrow') {
      tempCtx.fillStyle = layer.fill
      tempCtx.fill()
    }
    if (layer.strokeWidth || layer.shape === 'line' || layer.shape === 'arrow') {
      tempCtx.lineWidth = Math.max(1, layer.strokeWidth || 4)
      tempCtx.strokeStyle = layer.stroke
      tempCtx.stroke()
    }
  } else if (layer.type === 'frame') {
    tempCtx.fillStyle = layer.fill
    if (layer.shape === 'ellipse') {
      tempCtx.beginPath()
      tempCtx.ellipse(temp.width / 2, temp.height / 2, temp.width / 2, temp.height / 2, 0, 0, Math.PI * 2)
      tempCtx.fill()
      tempCtx.clip()
    } else {
      tempCtx.beginPath()
      tempCtx.roundRect(0, 0, temp.width, temp.height, layer.shape === 'rounded-rectangle' ? 24 : 0)
      tempCtx.fill()
      tempCtx.clip()
    }
    if (layer.imageDataUrl) {
      const image = await imageFromSource(layer.imageDataUrl)
      if (image) tempCtx.drawImage(image, layer.imageTransform.x, layer.imageTransform.y, layer.imageTransform.width, layer.imageTransform.height)
    }
  } else if (layer.type === 'adjustment') {
    return
  }

  ctx.save()
  ctx.globalAlpha = layer.opacity
  ctx.globalCompositeOperation = CANVAS_COMPOSITE_BY_BLEND[layer.blendMode]
  ctx.translate(layer.transform.x + layer.transform.width / 2, layer.transform.y + layer.transform.height / 2)
  ctx.rotate((layer.transform.rotation * Math.PI) / 180)
  ctx.scale(layer.transform.scaleX, layer.transform.scaleY)
  ctx.drawImage(temp, -layer.transform.width / 2, -layer.transform.height / 2, layer.transform.width, layer.transform.height)
  ctx.restore()
}

function drawSelection(ctx: CanvasRenderingContext2D, doc: EditorDocument) {
  if (!doc.selection) return
  const selection = doc.selection
  ctx.save()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.setLineDash([6, 4])
  ctx.lineDashOffset = Date.now() / 80
  if (selection.type === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(
      selection.x + selection.width / 2,
      selection.y + selection.height / 2,
      Math.abs(selection.width / 2),
      Math.abs(selection.height / 2),
      0,
      0,
      Math.PI * 2
    )
    ctx.stroke()
  } else {
    ctx.strokeRect(selection.x, selection.y, selection.width, selection.height)
  }
  ctx.strokeStyle = '#101820'
  ctx.lineDashOffset = Date.now() / 80 + 5
  if (selection.type === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(
      selection.x + selection.width / 2,
      selection.y + selection.height / 2,
      Math.abs(selection.width / 2),
      Math.abs(selection.height / 2),
      0,
      0,
      Math.PI * 2
    )
    ctx.stroke()
  } else {
    ctx.strokeRect(selection.x, selection.y, selection.width, selection.height)
  }
  ctx.restore()
}

function handleSizeForZoom(doc: EditorDocument) {
  return Math.max(6, 10 / Math.max(0.1, doc.viewport.zoom))
}

function layerRect(layer: EditorLayer): TransformRect {
  return {
    x: layer.transform.x,
    y: layer.transform.y,
    width: layer.transform.width,
    height: layer.transform.height
  }
}

function resizeHandlePoints(rect: TransformRect): Array<{ handle: ResizeHandle; x: number; y: number }> {
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return [
    { handle: 'nw', x: rect.x, y: rect.y },
    { handle: 'n', x: midX, y: rect.y },
    { handle: 'ne', x: right, y: rect.y },
    { handle: 'e', x: right, y: midY },
    { handle: 'se', x: right, y: bottom },
    { handle: 's', x: midX, y: bottom },
    { handle: 'sw', x: rect.x, y: bottom },
    { handle: 'w', x: rect.x, y: midY }
  ]
}

function transformHandleStyle(handle: ResizeHandle) {
  const x = handle.includes('w') ? '0%' : handle.includes('e') ? '100%' : '50%'
  const y = handle.includes('n') ? '0%' : handle.includes('s') ? '100%' : '50%'
  return { left: x, top: y }
}

async function render(targetCanvas = canvasRef.value, includeUi = true, doc = activeDocument.value, updateNavigator = true) {
  if (!targetCanvas || !doc) return
  const dpr = window.devicePixelRatio || 1
  targetCanvas.width = Math.round(doc.width * dpr)
  targetCanvas.height = Math.round(doc.height * dpr)
  targetCanvas.style.width = `${doc.width * doc.viewport.zoom}px`
  targetCanvas.style.height = `${doc.height * doc.viewport.zoom}px`
  const ctx = targetCanvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, doc.width, doc.height)
  if (!doc.background.transparent) {
    ctx.fillStyle = doc.background.color
    ctx.fillRect(0, 0, doc.width, doc.height)
  }
  for (const layer of doc.layers) {
    await renderLayerToContext(ctx, layer)
  }
  if (includeUi) {
    drawSelection(ctx, doc)
  }
  if (updateNavigator) {
    await renderNavigator()
  }
}

async function renderNavigator() {
  const doc = activeDocument.value
  const canvas = navigatorRef.value
  if (!doc || !canvas) return
  const width = 220
  const height = Math.max(80, Math.round((doc.height / doc.width) * width))
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  const temp = document.createElement('canvas')
  await render(temp, false, doc, false)
  ctx.drawImage(temp, 0, 0, width, height)
  ctx.strokeStyle = prefs.value.accent
  ctx.lineWidth = 2
  ctx.strokeRect(0, 0, width, height)
}

function createBlankDocument() {
  if (exceedsSafeMemory(newDoc.width, newDoc.height) || newDoc.width > prefs.value.maxDimension || newDoc.height > prefs.value.maxDimension) {
    const ok = confirm('This document may exceed safe browser memory. Continue?')
    if (!ok) return
  }
  const doc = createDocument({
    name: `Untitled ${documents.value.length + 1}`,
    width: newDoc.width,
    height: newDoc.height,
    backgroundColor: newDoc.background,
    transparent: newDoc.transparent
  })
  documents.value.push(doc)
  activeDocumentId.value = doc.id
  setStatus('New document created')
}

function setPreset(value: string) {
  newDoc.preset = value
  const [width, height] = value.split('x').map(Number)
  if (width && height) {
    newDoc.width = width
    newDoc.height = height
  }
}

async function sanitizeSvg(file: File) {
  const text = await file.text()
  const clean = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(clean)))}`
}

async function readImageFile(file: File) {
  if (!IMAGE_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.svg')) {
    throw new Error(`${file.name} is not a supported image type`)
  }
  const dataUrl = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
    ? await sanitizeSvg(file)
    : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
        reader.readAsDataURL(file)
      })
  const image = await imageFromSource(dataUrl)
  if (!image) throw new Error(`${file.name} could not be decoded`)
  if (exceedsSafeMemory(image.naturalWidth, image.naturalHeight)) {
    const ok = confirm(`${file.name} is large and may exceed safe browser memory. Continue?`)
    if (!ok) throw new Error('Open canceled')
  }
  return { dataUrl, width: image.naturalWidth, height: image.naturalHeight }
}

async function openFiles(files: FileList | File[]) {
  errorMessage.value = ''
  busy.value = true
  busyLabel.value = 'Opening files'
  try {
    for (const file of Array.from(files)) {
      if (file.name.endsWith(PROJECT_EXTENSION) || file.type === 'application/json') {
        await openProjectFile(file)
        continue
      }
      const image = await readImageFile(file)
      const layer = createRasterLayer(image.dataUrl, image.width, image.height, file.name)
      const doc = createDocument({
        name: file.name.replace(/\.[^.]+$/, ''),
        width: image.width,
        height: image.height,
        transparent: true,
        layers: [layer],
        source: file.name
      })
      documents.value.push(doc)
      activeDocumentId.value = doc.id
    }
    setStatus('File import complete')
  } catch (error: any) {
    setError(error?.message || 'File import failed')
  } finally {
    busy.value = false
  }
}

async function importFilesAsLayers(files: FileList | File[]) {
  const doc = requireDocument()
  busy.value = true
  busyLabel.value = 'Importing layers'
  try {
    for (const file of Array.from(files)) {
      const image = await readImageFile(file)
      const layer = createRasterLayer(image.dataUrl, image.width, image.height, file.name)
      layer.transform.width = image.width
      layer.transform.height = image.height
      layer.transform.x = Math.round((doc.width - image.width) / 2)
      layer.transform.y = Math.round((doc.height - image.height) / 2)
      doc.layers.push(layer)
      setActiveLayer(doc, layer.id)
    }
    pushHistory(doc, 'Import image layer')
  } catch (error: any) {
    setError(error?.message || 'Layer import failed')
  } finally {
    busy.value = false
  }
}

async function openRemoteImage() {
  const url = remoteUrl.value.trim()
  if (!url) return
  busy.value = true
  busyLabel.value = 'Opening remote image'
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) throw new Error(`Remote image returned HTTP ${response.status}`)
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) throw new Error('Remote URL did not return an image')
    await openFiles([new File([blob], new URL(url).pathname.split('/').pop() || 'remote-image', { type: blob.type })])
  } catch (error: any) {
    setError(error?.message || 'Remote image could not be opened. The server may block CORS.')
  } finally {
    busy.value = false
  }
}

async function openProjectFile(file: File) {
  try {
    const parsed = JSON.parse(await file.text())
    const doc = parseProjectFile(parsed)
    documents.value.push(doc)
    activeDocumentId.value = doc.id
    rememberRecent(doc.name)
    setStatus('Project opened')
  } catch (error: any) {
    setError(error?.message || 'Project file is corrupted or unsupported')
  }
}

function handleOpenFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) openFiles(input.files)
  input.value = ''
}

function handleLayerFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) importFilesAsLayers(input.files)
  input.value = ''
}

function handleProjectInput(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) openProjectFile(file)
  input.value = ''
}

function rememberRecent(name: string) {
  const existing = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]
  const next = [name, ...existing.filter((item) => item !== name)].slice(0, 8)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function saveProject() {
  const doc = requireDocument()
  const project = makeProjectFile(doc)
  downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${doc.name}.${PROJECT_EXTENSION}`)
  doc.metadata.savedAt = project.savedAt
  doc.dirty = false
  rememberRecent(doc.name)
  setStatus('Project saved')
}

async function exportToBlob(doc: EditorDocument, settings = exportSettings, onlyLayer?: EditorLayer) {
  const canvas = document.createElement('canvas')
  const width = Math.max(1, Math.round(settings.width * settings.scale))
  const height = Math.max(1, Math.round(settings.height * settings.scale))
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Export canvas could not be created')
  ctx.scale(width / doc.width, height / doc.height)
  if (!settings.transparency || settings.format === 'jpeg') {
    ctx.fillStyle = settings.background
    ctx.fillRect(0, 0, doc.width, doc.height)
  } else if (!doc.background.transparent) {
    ctx.fillStyle = doc.background.color
    ctx.fillRect(0, 0, doc.width, doc.height)
  }
  const layers = onlyLayer ? [onlyLayer] : doc.layers
  for (const layer of layers) {
    await renderLayerToContext(ctx, layer)
  }
  const mime = settings.format === 'jpeg' ? 'image/jpeg' : settings.format === 'webp' ? 'image/webp' : 'image/png'
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Export failed'))
    }, mime, settings.quality)
  })
}

async function exportDocument(format?: 'png' | 'jpeg' | 'webp') {
  const doc = requireDocument()
  if (format) exportSettings.format = format
  busy.value = true
  busyLabel.value = 'Exporting'
  try {
    const blob = await exportToBlob(doc)
    exportSettings.estimatedSize = `${Math.round(blob.size / 1024)} KB`
    downloadBlob(blob, `${exportSettings.fileName || doc.name}.${exportSettings.format === 'jpeg' ? 'jpg' : exportSettings.format}`)
    setStatus('Export complete')
  } catch (error: any) {
    setError(error?.message || 'Export failed')
  } finally {
    busy.value = false
  }
}

async function exportActiveLayer() {
  const doc = requireDocument()
  const layer = getActiveLayer(doc)
  if (!layer) return
  const blob = await exportToBlob(doc, { ...exportSettings, format: 'png', transparency: true }, layer)
  downloadBlob(blob, `${layer.name}.png`)
}

function addRasterLayer() {
  const doc = requireDocument()
  const layer = createEmptyRasterLayer(doc.width, doc.height, 'Raster layer')
  layer.dataUrl = createTransparentDataUrl(doc.width, doc.height)
  insertLayer(doc, layer)
}

function addTextLayer() {
  const doc = requireDocument()
  const layer = createTextLayer(doc.width, doc.height, toolOptions.text)
  layer.transform.x = Math.round(doc.width * 0.18)
  layer.transform.y = Math.round(doc.height * 0.18)
  layer.fontFamily = toolOptions.fontFamily
  layer.fontSize = toolOptions.fontSize
  layer.color = toolOptions.foreground
  insertLayer(doc, layer)
}

function addShapeLayer() {
  const doc = requireDocument()
  const layer = createShapeLayer(doc.width, doc.height, toolOptions.shape)
  layer.fill = toolOptions.shapeFill
  layer.stroke = toolOptions.shapeStroke
  layer.strokeWidth = toolOptions.shapeStrokeWidth
  insertLayer(doc, layer)
}

function addFrameLayer() {
  const doc = requireDocument()
  insertLayer(doc, createFrameLayer(doc.width, doc.height))
}

function duplicateLayers() {
  const doc = requireDocument()
  if (!duplicateSelectedLayers(doc).length) {
    setError('No layer is selected')
  }
}

function deleteLayers() {
  const doc = requireDocument()
  if (!deleteSelectedLayers(doc)) setError('At least one layer must remain')
}

function orderActiveLayer(direction: 'backward' | 'forward' | 'back' | 'front') {
  const doc = requireDocument()
  const moved =
    direction === 'backward'
      ? sendLayerBackward(doc)
      : direction === 'forward'
        ? bringLayerForward(doc)
        : direction === 'back'
          ? sendLayerToBack(doc)
          : bringLayerToFront(doc)
  if (!moved) {
    setError('The active layer cannot move farther in that direction')
  }
}

function alignLayers(alignment: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
  const doc = requireDocument()
  if (!alignSelectedLayers(doc, alignment)) {
    setError('Select at least one unlocked layer to align')
  }
}

function distributeLayers(axis: 'horizontal' | 'vertical') {
  const doc = requireDocument()
  if (!distributeSelectedLayers(doc, axis)) {
    setError('Select at least three unlocked layers to distribute')
  }
}

function undo() {
  const doc = requireDocument()
  if (!undoDocument(doc)) setError('Nothing to undo')
  scheduleRender()
}

function redo() {
  const doc = requireDocument()
  if (!redoDocument(doc)) setError('Nothing to redo')
  scheduleRender()
}

function closeDocument(doc: EditorDocument) {
  if (doc.dirty && !confirm(`${doc.name} has unsaved changes. Close it anyway?`)) return
  documents.value = documents.value.filter((item) => item.id !== doc.id)
  activeDocumentId.value = documents.value[0]?.id || ''
}

function resizeDocument() {
  const doc = requireDocument()
  const previousWidth = doc.width
  const previousHeight = doc.height
  const width = Math.max(1, exportSettings.width)
  const height = Math.max(1, exportSettings.height)
  if (exceedsSafeMemory(width, height) && !confirm('This resize may exceed safe browser memory. Continue?')) return
  doc.width = width
  doc.height = height
  for (const layer of doc.layers) {
    layer.transform.x *= width / previousWidth
    layer.transform.y *= height / previousHeight
    layer.transform.width *= width / previousWidth
    layer.transform.height *= height / previousHeight
  }
  pushHistory(doc, 'Resize image')
}

function resizeCanvasOnly() {
  const doc = requireDocument()
  doc.width = Math.max(1, exportSettings.width)
  doc.height = Math.max(1, exportSettings.height)
  pushHistory(doc, 'Resize canvas')
}

function trimTransparentEdges() {
  setError('Trim transparent edges is unavailable until tiled pixel scanning is implemented.')
}

async function printDocument() {
  const doc = requireDocument()
  const blob = await exportToBlob(doc, { ...exportSettings, format: 'png' })
  const url = URL.createObjectURL(blob)
  const win = window.open('', '_blank')
  if (!win) {
    setError('Popup blocked. Allow popups to print.')
    return
  }
  win.document.write(`<img src="${url}" style="max-width:100%">`)
  win.document.close()
  win.focus()
  win.print()
  URL.revokeObjectURL(url)
}

function setZoom(value: number) {
  const doc = requireDocument()
  doc.viewport.zoom = Math.max(0.05, Math.min(8, value))
  scheduleRender()
}

function fitToWorkspace() {
  const doc = requireDocument()
  const workspace = document.querySelector('.editor-workspace')
  if (!workspace) return
  const rect = workspace.getBoundingClientRect()
  setZoom(Math.min((rect.width - 80) / doc.width, (rect.height - 80) / doc.height))
}

function togglePreviewMode() {
  previewMode.value = !previewMode.value
  prefs.value.previewMode = previewMode.value
}

async function toggleFullscreen() {
  const el = document.querySelector('.studio-editor-app') as HTMLElement | null
  if (!document.fullscreenElement && el) {
    await el.requestFullscreen()
    fullscreen.value = true
  } else if (document.fullscreenElement) {
    await document.exitFullscreen()
    fullscreen.value = false
  }
}

function restoreDefaultWorkspace() {
  prefs.value = {
    theme: 'light',
    accent: '#0f766e',
    defaultExport: 'png',
    exportQuality: 0.92,
    historyLimit: 60,
    maxDimension: 8192,
    autoSaveMs: 15_000,
    panelWidth: 320,
    previewMode: false,
    panels: {
      navigator: { visible: true, collapsed: false },
      layers: { visible: true, collapsed: false },
      history: { visible: true, collapsed: false }
    }
  }
  previewMode.value = false
  setStatus('Workspace restored')
}

function showPreferences() {
  const panel = document.querySelector('.preferences-panel') as HTMLElement | null
  panel?.scrollIntoView({ block: 'nearest' })
  setStatus('Preferences are available in the right panel')
}

function selectAll() {
  const doc = requireDocument()
  doc.selection = { type: 'rect', x: 0, y: 0, width: doc.width, height: doc.height, feather: 0, mode: 'replace' }
  pushHistory(doc, 'Select all')
}

function deselect() {
  const doc = requireDocument()
  doc.selection = null
  pushHistory(doc, 'Deselect')
}

function saveSelection() {
  const doc = requireDocument()
  if (!doc.selection) return
  doc.savedSelections.push({ id: editorId('selection'), name: `Selection ${doc.savedSelections.length + 1}`, selection: cloneDocument(doc.selection) })
  pushHistory(doc, 'Save selection')
}

async function copyActiveLayer() {
  const doc = requireDocument()
  const layer = getActiveLayer(doc)
  if (!layer) return
  const blob = await exportToBlob(doc, { ...exportSettings, format: 'png', transparency: true }, layer)
  if (navigator.clipboard && 'write' in navigator.clipboard) {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    setStatus('Layer copied')
  } else {
    setError('Image clipboard writing is not supported in this browser')
  }
}

async function pasteFromClipboard() {
  const doc = activeDocument.value
  if (!doc || !navigator.clipboard?.read) {
    setError('Clipboard image paste is not supported in this browser')
    return
  }
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((entry) => entry.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    await importFilesAsLayers([new File([blob], 'clipboard-image.png', { type })])
    return
  }
  setError('Clipboard does not contain an image')
}

async function ensureRasterLayer(layer: EditorLayer | null) {
  if (!layer || layer.type !== 'raster') {
    throw new Error('The active layer must be a raster layer. Rasterize or select a raster layer first.')
  }
  if (layer.locked) throw new Error('The active layer is locked')
  if (!layer.dataUrl) {
    const doc = requireDocument()
    layer.dataUrl = createTransparentDataUrl(doc.width, doc.height)
  }
  return layer as RasterLayer
}

async function layerCanvas(layer: RasterLayer) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(layer.transform.width))
  canvas.height = Math.max(1, Math.round(layer.transform.height))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Layer canvas could not be created')
  const image = await imageFromSource(layer.dataUrl)
  if (image) ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return { canvas, ctx }
}

function applySelectionClip(ctx: CanvasRenderingContext2D, doc: EditorDocument, layer: EditorLayer) {
  if (!doc.selection) return
  const selection = doc.selection
  const x = selection.x - layer.transform.x
  const y = selection.y - layer.transform.y
  ctx.beginPath()
  if (selection.type === 'ellipse') {
    ctx.ellipse(x + selection.width / 2, y + selection.height / 2, Math.abs(selection.width / 2), Math.abs(selection.height / 2), 0, 0, Math.PI * 2)
  } else {
    ctx.rect(x, y, selection.width, selection.height)
  }
  ctx.clip()
}

function pointAllowedBySelection(doc: EditorDocument, layer: EditorLayer, x: number, y: number) {
  if (!doc.selection) return true
  const docX = x + layer.transform.x
  const docY = y + layer.transform.y
  const selection = doc.selection
  if (selection.type === 'ellipse') {
    const rx = Math.abs(selection.width / 2)
    const ry = Math.abs(selection.height / 2)
    if (!rx || !ry) return false
    const cx = selection.x + selection.width / 2
    const cy = selection.y + selection.height / 2
    return ((docX - cx) ** 2) / (rx ** 2) + ((docY - cy) ** 2) / (ry ** 2) <= 1
  }
  return docX >= selection.x && docX <= selection.x + selection.width && docY >= selection.y && docY <= selection.y + selection.height
}

function docPointFromPointer(event: PointerEvent): Point {
  const canvas = canvasRef.value
  const doc = requireDocument()
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * doc.width,
    y: ((event.clientY - rect.top) / rect.height) * doc.height
  }
}

function pointInLayer(point: Point, layer: EditorLayer) {
  const rect = layerRect(layer)
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
}

function hitTestLayer(doc: EditorDocument, point: Point) {
  for (let index = doc.layers.length - 1; index >= 0; index -= 1) {
    const layer = doc.layers[index]
    if (!layer.visible || layer.opacity <= 0) continue
    if (pointInLayer(point, layer)) return layer
  }
  return null
}

function hitTestResizeHandle(doc: EditorDocument, point: Point) {
  const layer = getActiveLayer(doc)
  if (!layer || !layer.visible || layer.locked || layer.positionLocked) return null
  const handleSize = handleSizeForZoom(doc) * 1.6
  for (const item of resizeHandlePoints(layerRect(layer))) {
    if (Math.abs(point.x - item.x) <= handleSize && Math.abs(point.y - item.y) <= handleSize) {
      return item.handle
    }
  }
  return null
}

function resizeTransform(start: TransformRect, handle: ResizeHandle, point: Point, anchor: Point, keepAspect: boolean) {
  const next = { ...start }
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  const minSize = 4

  if (handle.includes('e')) next.width = start.width + dx
  if (handle.includes('s')) next.height = start.height + dy
  if (handle.includes('w')) {
    next.x = start.x + dx
    next.width = start.width - dx
  }
  if (handle.includes('n')) {
    next.y = start.y + dy
    next.height = start.height - dy
  }

  if (keepAspect && handle.length === 2 && start.height !== 0) {
    const ratio = start.width / start.height
    if (Math.abs(dx) > Math.abs(dy)) {
      next.height = Math.max(minSize, Math.abs(next.width / ratio))
      if (handle.includes('n')) next.y = start.y + start.height - next.height
    } else {
      next.width = Math.max(minSize, Math.abs(next.height * ratio))
      if (handle.includes('w')) next.x = start.x + start.width - next.width
    }
  }

  if (next.width < minSize) {
    if (handle.includes('w')) next.x = start.x + start.width - minSize
    next.width = minSize
  }
  if (next.height < minSize) {
    if (handle.includes('n')) next.y = start.y + start.height - minSize
    next.height = minSize
  }

  return next
}

function startResizeFromHandle(event: PointerEvent, handle: ResizeHandle) {
  const doc = requireDocument()
  const layer = getActiveLayer(doc)
  if (!layer || layer.locked || layer.positionLocked) {
    setError('The active layer is locked')
    return
  }
  const point = docPointFromPointer(event)
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  activeTool.value = 'move'
  dragState.value = {
    type: 'resize',
    start: point,
    last: point,
    resizeHandle: handle,
    layerStartTransform: layerRect(layer)
  }
  bindGlobalPointerListeners()
}

async function pointerDown(event: PointerEvent) {
  const doc = requireDocument()
  const point = docPointFromPointer(event)
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  if (activeTool.value === 'hand') {
    dragState.value = { type: 'pan', start: point, last: point, panStart: { x: doc.viewport.panX, y: doc.viewport.panY } }
    return
  }
  if (activeTool.value === 'marquee' || activeTool.value === 'crop') {
    dragState.value = { type: 'marquee', start: point, last: point }
    doc.selection = { type: 'rect', x: point.x, y: point.y, width: 0, height: 0, feather: toolOptions.feather, mode: toolOptions.selectionMode }
    return
  }
  if (activeTool.value === 'move') {
    const handle = hitTestResizeHandle(doc, point)
    if (handle) {
      const layer = getActiveLayer(doc)
      if (!layer) return
      dragState.value = {
        type: 'resize',
        start: point,
        last: point,
        resizeHandle: handle,
        layerStartTransform: layerRect(layer)
      }
      bindGlobalPointerListeners()
      return
    }

    const hitLayer = hitTestLayer(doc, point)
    if (hitLayer) {
      setActiveLayer(doc, hitLayer.id, event.shiftKey)
    }
    const layer = hitLayer || getActiveLayer(doc)
    if (!layer || layer.locked || layer.positionLocked) return
    dragState.value = { type: 'move', start: point, last: point, layerStart: { x: layer.transform.x, y: layer.transform.y } }
    return
  }
  if (activeTool.value === 'text') {
    addTextLayer()
    const layer = getActiveLayer(doc)
    if (layer) {
      layer.transform.x = point.x
      layer.transform.y = point.y
      pushHistory(doc, 'Place text')
    }
    return
  }
  if (activeTool.value === 'shape') {
    addShapeLayer()
    const layer = getActiveLayer(doc)
    if (layer) {
      layer.transform.x = point.x
      layer.transform.y = point.y
      layer.transform.width = 1
      layer.transform.height = 1
      dragState.value = { type: 'move', start: point, last: point, layerStart: { x: point.x, y: point.y } }
    }
    return
  }
  if (activeTool.value === 'picker') {
    const ctx = canvasRef.value?.getContext('2d')
    if (!ctx || !canvasRef.value) return
    const dpr = window.devicePixelRatio || 1
    const pixel = ctx.getImageData(point.x * dpr, point.y * dpr, 1, 1).data
    toolOptions.foreground = `#${[pixel[0], pixel[1], pixel[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    setStatus('Color sampled')
    return
  }
  if (activeTool.value === 'fill') {
    const hitLayer = hitTestLayer(doc, point)
    if (hitLayer) {
      setActiveLayer(doc, hitLayer.id)
    }
    await floodFill(point)
    return
  }
  const layer = await ensureRasterLayer(getActiveLayer(doc))
  const scratch = (await layerCanvas(layer)).canvas
  dragState.value = { type: 'paint', start: point, last: point, scratch }
  await paintPoint(point, event.pressure || 1)
}

async function pointerMove(event: PointerEvent) {
  const doc = requireDocument()
  const state = dragState.value
  if (!state) return
  const point = docPointFromPointer(event)
  if (state.type === 'pan' && state.panStart) {
    doc.viewport.panX = state.panStart.x + point.x - state.start.x
    doc.viewport.panY = state.panStart.y + point.y - state.start.y
    return
  }
  if (state.type === 'marquee') {
    doc.selection = {
      type: 'rect',
      x: Math.min(state.start.x, point.x),
      y: Math.min(state.start.y, point.y),
      width: Math.abs(point.x - state.start.x),
      height: Math.abs(point.y - state.start.y),
      feather: toolOptions.feather,
      mode: toolOptions.selectionMode
    }
    scheduleRender()
    return
  }
  if (state.type === 'move') {
    const layer = getActiveLayer(doc)
    if (!layer || !state.layerStart) return
    if (activeTool.value === 'shape') {
      layer.transform.width = Math.max(1, Math.abs(point.x - state.start.x))
      layer.transform.height = Math.max(1, Math.abs(point.y - state.start.y))
    } else {
      layer.transform.x = state.layerStart.x + point.x - state.start.x
      layer.transform.y = state.layerStart.y + point.y - state.start.y
    }
    state.last = point
    scheduleRender()
    return
  }
  if (state.type === 'resize') {
    const layer = getActiveLayer(doc)
    if (!layer || !state.layerStartTransform || !state.resizeHandle) return
    const next = resizeTransform(state.layerStartTransform, state.resizeHandle, point, state.start, event.shiftKey)
    layer.transform.x = next.x
    layer.transform.y = next.y
    layer.transform.width = next.width
    layer.transform.height = next.height
    state.last = point
    scheduleRender()
    return
  }
  if (state.type === 'paint') {
    await paintLine(state.last, point, event.pressure || 1)
    state.last = point
  }
}

async function pointerUp() {
  const doc = activeDocument.value
  const state = dragState.value
  if (!doc || !state) {
    cleanupGlobalPointerListeners()
    return
  }
  if (state.type === 'paint') {
    const layer = await ensureRasterLayer(getActiveLayer(doc))
    layer.dataUrl = state.scratch!.toDataURL('image/png')
    pushHistory(doc, activeTool.value === 'eraser' ? 'Erase stroke' : 'Brush stroke')
  } else if (state.type === 'move') {
    if (Math.hypot(state.last.x - state.start.x, state.last.y - state.start.y) > 0.5) {
      pushHistory(doc, activeTool.value === 'shape' ? 'Draw shape' : 'Move layer')
    }
  } else if (state.type === 'resize') {
    if (Math.hypot(state.last.x - state.start.x, state.last.y - state.start.y) > 0.5) {
      pushHistory(doc, 'Resize layer')
    }
  } else if (state.type === 'marquee') {
    pushHistory(doc, 'Create selection')
  }
  dragState.value = null
  cleanupGlobalPointerListeners()
}

async function paintPoint(point: Point, pressure = 1) {
  const state = dragState.value
  const doc = requireDocument()
  const layer = await ensureRasterLayer(getActiveLayer(doc))
  const canvas = state?.scratch || (await layerCanvas(layer)).canvas
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const x = point.x - layer.transform.x
  const y = point.y - layer.transform.y
  ctx.save()
  applySelectionClip(ctx, doc, layer)
  ctx.globalAlpha = toolOptions.brushOpacity * Math.max(0.2, pressure)
  ctx.globalCompositeOperation = activeTool.value === 'eraser' ? 'destination-out' : 'source-over'
  ctx.fillStyle = toolOptions.foreground
  ctx.beginPath()
  ctx.arc(x, y, toolOptions.brushSize / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  layer.dataUrl = canvas.toDataURL('image/png')
  scheduleRender()
}

async function paintLine(from: Point, to: Point, pressure = 1) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, toolOptions.brushSize * (1 - toolOptions.brushSmoothing))))
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    await paintPoint({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, pressure)
  }
}

async function floodFill(point: Point) {
  const doc = requireDocument()
  const active = getActiveLayer(doc)
  if (!active) {
    setError('No active layer to fill')
    return
  }
  if (active.locked) {
    setError('The active layer is locked')
    return
  }
  if (active.type === 'shape') {
    if (active.shape === 'line' || active.shape === 'arrow') {
      active.stroke = toolOptions.foreground
      active.strokeWidth = Math.max(active.strokeWidth, toolOptions.shapeStrokeWidth || 4)
      pushHistory(doc, 'Fill shape stroke')
    } else {
      active.fill = toolOptions.foreground
      pushHistory(doc, 'Fill shape')
    }
    setStatus('Shape color updated')
    return
  }
  if (active.type === 'text') {
    active.color = toolOptions.foreground
    pushHistory(doc, 'Fill text color')
    setStatus('Text color updated')
    return
  }
  if (active.type === 'frame') {
    active.fill = toolOptions.foreground
    pushHistory(doc, 'Fill frame')
    setStatus('Frame color updated')
    return
  }
  if (active.type !== 'raster') {
    setError('Fill is not available for this layer type')
    return
  }
  const layer = await ensureRasterLayer(active)
  const { canvas, ctx } = await layerCanvas(layer)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const x = Math.floor(point.x - layer.transform.x)
  const y = Math.floor(point.y - layer.transform.y)
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    setError('Click inside the active raster layer to fill it')
    return
  }
  const startIndex = (y * canvas.width + x) * 4
  const target = [data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]]
  const fill = hexToRgba(toolOptions.foreground)
  const stack = [{ x, y }]
  const visited = new Uint8Array(canvas.width * canvas.height)
  while (stack.length) {
    const current = stack.pop()!
    if (current.x < 0 || current.y < 0 || current.x >= canvas.width || current.y >= canvas.height) continue
    const offset = current.y * canvas.width + current.x
    if (visited[offset]) continue
    visited[offset] = 1
    const index = offset * 4
    if (Math.hypot(data[index] - target[0], data[index + 1] - target[1], data[index + 2] - target[2], data[index + 3] - target[3]) > toolOptions.fillTolerance) continue
    if (!pointAllowedBySelection(doc, layer, current.x, current.y)) continue
    data[index] = fill[0]
    data[index + 1] = fill[1]
    data[index + 2] = fill[2]
    data[index + 3] = 255
    stack.push({ x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y }, { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 })
  }
  ctx.putImageData(imageData, 0, 0)
  layer.dataUrl = canvas.toDataURL('image/png')
  pushHistory(doc, 'Fill')
}

function hexToRgba(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255]
}

async function mergeDown() {
  const doc = requireDocument()
  const index = doc.layers.findIndex((layer) => layer.id === doc.activeLayerId)
  if (index <= 0) {
    setError('There is no layer below to merge into')
    return
  }
  if (!confirm('Merge down will rasterize the two layers into one raster layer. Continue?')) return
  const lower = doc.layers[index - 1]
  const active = doc.layers[index]
  const canvas = document.createElement('canvas')
  canvas.width = doc.width
  canvas.height = doc.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  await renderLayerToContext(ctx, lower)
  await renderLayerToContext(ctx, active)
  const merged = createRasterLayer(canvas.toDataURL('image/png'), doc.width, doc.height, `${lower.name} merged`)
  doc.layers.splice(index - 1, 2, merged)
  setActiveLayer(doc, merged.id)
  pushHistory(doc, 'Merge down')
}

async function flattenDocument() {
  const doc = requireDocument()
  if (!confirm('Flattening rasterizes all visible layers and removes editable layer content. Continue?')) return
  const canvas = document.createElement('canvas')
  await render(canvas, false, doc)
  const flattened = createRasterLayer(canvas.toDataURL('image/png'), doc.width, doc.height, 'Flattened image')
  doc.layers = [flattened]
  setActiveLayer(doc, flattened.id)
  pushHistory(doc, 'Flatten document')
}

async function rasterizeActiveLayer() {
  const doc = requireDocument()
  const layer = getActiveLayer(doc)
  if (!layer) return
  if (layer.type === 'raster') return
  if (!confirm('Rasterizing converts this editable layer to pixels. Continue?')) return
  const canvas = document.createElement('canvas')
  canvas.width = doc.width
  canvas.height = doc.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  await renderLayerToContext(ctx, layer)
  const raster = createRasterLayer(canvas.toDataURL('image/png'), doc.width, doc.height, `${layer.name} rasterized`)
  const index = doc.layers.findIndex((item) => item.id === layer.id)
  doc.layers.splice(index, 1, raster)
  setActiveLayer(doc, raster.id)
  pushHistory(doc, 'Rasterize layer')
}

async function applyWorkerFilter(name: string, params: Record<string, unknown>) {
  const doc = requireDocument()
  const layer = await ensureRasterLayer(getActiveLayer(doc))
  busy.value = true
  busyLabel.value = name
  try {
    const { canvas, ctx } = await layerCanvas(layer)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const result = await runWorkerFilter(imageData, params)
    ctx.putImageData(result, 0, 0)
    layer.dataUrl = canvas.toDataURL('image/png')
    pushHistory(doc, name)
  } catch (error: any) {
    setError(error?.message || `${name} failed`)
  } finally {
    busy.value = false
  }
}

function getWorker() {
  if (!worker.value) {
    worker.value = new Worker('/workers/editor-worker.js')
    worker.value.onmessage = (event) => {
      const { id, ok, imageData, error } = event.data || {}
      const job = workerJobs.get(id)
      if (!job) return
      workerJobs.delete(id)
      ok ? job.resolve(imageData) : job.reject(new Error(error || 'Worker failed'))
    }
  }
  return worker.value
}

function runWorkerFilter(imageData: ImageData, params: Record<string, unknown>) {
  const id = editorId('job')
  return new Promise<ImageData>((resolve, reject) => {
    workerJobs.set(id, { resolve, reject })
    getWorker().postMessage({ id, type: 'filter', imageData, params }, [imageData.data.buffer])
  })
}

function reorderLayerDrop(layerId: string) {
  const doc = requireDocument()
  if (!draggedLayerId.value || draggedLayerId.value === layerId) return
  const toIndex = doc.layers.findIndex((layer) => layer.id === layerId)
  moveLayer(doc, draggedLayerId.value, toIndex)
  draggedLayerId.value = ''
}

function showShortcuts() {
  alert([
    'New: Ctrl+N',
    'Open: Ctrl+O',
    'Save project: Ctrl+S',
    'Export: Ctrl+E',
    'Undo/Redo: Ctrl+Z / Ctrl+Y',
    'Select all / Deselect: Ctrl+A / Ctrl+D',
    'Zoom: Ctrl+Plus / Ctrl+Minus / Ctrl+0 / Ctrl+1',
    'Tools: V Move, H Hand, B Brush, E Eraser, G Fill, I Picker, M Marquee, T Text, U Shape'
  ].join('\n'))
}

function handleMenuItem(item: any) {
  if (item.disabled) {
    setError(item.reason || 'Command unavailable')
    return
  }
  activeMenu.value = ''
  item.run?.()
}

function handleKeydown(event: KeyboardEvent) {
  if (isTypingTarget(event.target)) return
  const doc = activeDocument.value
  const key = event.key.toLowerCase()
  const ctrl = event.ctrlKey || event.metaKey
  if (ctrl && key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return }
  if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); redo(); return }
  if (ctrl && key === 'n') { event.preventDefault(); createBlankDocument(); return }
  if (ctrl && key === 'o') { event.preventDefault(); fileInputRef.value?.click(); return }
  if (ctrl && key === 's') { event.preventDefault(); saveProject(); return }
  if (ctrl && key === 'e') { event.preventDefault(); exportDocument('png'); return }
  if (ctrl && key === 'a') { event.preventDefault(); selectAll(); return }
  if (ctrl && key === 'd') { event.preventDefault(); deselect(); return }
  if (ctrl && (event.key === '+' || event.key === '=')) { event.preventDefault(); if (doc) setZoom(doc.viewport.zoom * 1.2); return }
  if (ctrl && event.key === '-') { event.preventDefault(); if (doc) setZoom(doc.viewport.zoom / 1.2); return }
  if (ctrl && key === '0') { event.preventDefault(); fitToWorkspace(); return }
  if (ctrl && key === '1') { event.preventDefault(); setZoom(1); return }
  if (event.key === 'Delete') { event.preventDefault(); deleteLayers(); return }
  const tool = TOOL_ITEMS.find((item) => item.shortcut.toLowerCase() === key)
  if (tool) {
    activeTool.value = tool.id
    setStatus(`${tool.label} tool`)
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  if (!event.dataTransfer?.files.length) return
  if (activeDocument.value && event.altKey) importFilesAsLayers(event.dataTransfer.files)
  else openFiles(event.dataTransfer.files)
}

function clearTemporaryProjects() {
  localStorage.removeItem(AUTOSAVE_KEY)
  localStorage.removeItem(RECENT_KEY)
  setStatus('Temporary project state cleared')
}

function loadPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREF_KEY) || 'null')
    if (stored) prefs.value = { ...prefs.value, ...stored, panels: { ...prefs.value.panels, ...stored.panels } }
  } catch {}
  previewMode.value = prefs.value.previewMode
}

function recoverAutosave() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null')
    if (!saved?.documents?.length) return false
    if (!confirm('Recover temporary editor state from the last browser session?')) return false
    documents.value = saved.documents.map((doc: EditorDocument) => {
      doc.history = []
      doc.redo = []
      pushHistory(doc, 'Recovered project', false)
      return doc
    })
    activeDocumentId.value = documents.value[0]?.id || ''
    return true
  } catch {
    setError('Temporary project recovery failed')
    return false
  }
}

function init() {
  loadPreferences()
  if (!recoverAutosave()) {
    createBlankDocument()
  }
  exportSettings.format = prefs.value.defaultExport
  exportSettings.quality = prefs.value.exportQuality
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('paste', handlePaste)
}

async function handlePaste(event: ClipboardEvent) {
  if (isTypingTarget(event.target)) return
  const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith('image/'))
  if (!item) return
  const file = item.getAsFile()
  if (file) {
    event.preventDefault()
    if (activeDocument.value) await importFilesAsLayers([file])
    else await openFiles([file])
  }
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (documents.value.some((doc) => doc.dirty)) {
    event.preventDefault()
    event.returnValue = ''
  }
}

onMounted(init)

onBeforeUnmount(() => {
  cleanupGlobalPointerListeners()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('paste', handlePaste)
  worker.value?.terminate()
})
</script>

<template>
  <section
    class="studio-editor-app"
    :class="[`theme-${prefs.theme}`, { 'preview-mode': previewMode }]"
    :style="{ '--editor-accent': prefs.accent, '--panel-width': `${prefs.panelWidth}px` }"
    @drop="handleDrop"
    @dragover.prevent
  >
    <input ref="fileInputRef" type="file" accept="image/*,.svg,.bmp,.json" multiple hidden @change="handleOpenFileInput" />
    <input ref="layerFileInputRef" type="file" accept="image/*,.svg,.bmp" multiple hidden @change="handleLayerFileInput" />
    <input ref="projectInputRef" type="file" accept=".json" hidden @change="handleProjectInput" />

    <header class="editor-menubar" v-if="!previewMode">
      <div v-for="menu in menus" :key="menu.id" class="editor-menu">
        <button class="editor-menu-button" type="button" @click="activeMenu = activeMenu === menu.id ? '' : menu.id">
          {{ menu.label }}
          <ChevronDown aria-hidden="true" />
        </button>
        <div v-if="activeMenu === menu.id" class="editor-menu-popover">
          <button
            v-for="item in menu.items"
            :key="item.label"
            type="button"
            :disabled="item.disabled"
            :title="item.disabled ? item.reason : item.shortcut"
            @click="handleMenuItem(item)"
          >
            <span>{{ item.label }}</span>
            <span>{{ item.disabled ? 'Unavailable' : item.shortcut }}</span>
          </button>
        </div>
      </div>
      <div class="editor-url-open">
        <input v-model="remoteUrl" placeholder="Open image URL" />
        <button class="button secondary" type="button" :disabled="!remoteUrl.trim()" :title="remoteUrl.trim() ? 'Open remote image URL' : 'Enter a URL first'" @click="openRemoteImage">Open URL</button>
      </div>
      <span class="editor-build">SwissSet Studio 0.2</span>
    </header>

    <div class="editor-doc-tabs" v-if="!previewMode">
      <button
        v-for="doc in documents"
        :key="doc.id"
        type="button"
        :class="{ active: doc.id === activeDocumentId }"
        @click="activeDocumentId = doc.id"
      >
        {{ doc.name }}<span v-if="doc.dirty">*</span>
        <span class="close-tab" @click.stop="closeDocument(doc)">x</span>
      </button>
      <button type="button" title="New document" @click="createBlankDocument">+</button>
    </div>

    <div class="editor-options" v-if="!previewMode">
      <template v-if="activeTool === 'brush' || activeTool === 'eraser'">
        <label>Size <input v-model.number="toolOptions.brushSize" type="range" min="1" max="220" /></label>
        <label>Opacity <input v-model.number="toolOptions.brushOpacity" type="range" min="0.05" max="1" step="0.05" /></label>
        <label>Hardness <input v-model.number="toolOptions.brushHardness" type="range" min="0" max="1" step="0.05" /></label>
        <label>Color <input v-model="toolOptions.foreground" type="color" /></label>
      </template>
      <template v-else-if="activeTool === 'shape'">
        <label>Shape
          <select v-model="toolOptions.shape">
            <option value="rectangle">Rectangle</option>
            <option value="rounded-rectangle">Rounded rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="line">Line</option>
            <option value="arrow">Arrow</option>
            <option value="star">Star</option>
            <option value="polygon">Polygon</option>
          </select>
        </label>
        <label>Fill <input v-model="toolOptions.shapeFill" type="color" /></label>
        <label>Stroke <input v-model="toolOptions.shapeStroke" type="color" /></label>
        <label>Stroke width <input v-model.number="toolOptions.shapeStrokeWidth" type="number" min="0" /></label>
      </template>
      <template v-else-if="activeTool === 'text'">
        <label>Text <input v-model="toolOptions.text" /></label>
        <label>Font <input v-model="toolOptions.fontFamily" /></label>
        <label>Size <input v-model.number="toolOptions.fontSize" type="number" min="8" /></label>
        <label>Color <input v-model="toolOptions.foreground" type="color" /></label>
      </template>
      <template v-else-if="activeTool === 'marquee' || activeTool === 'crop'">
        <label>Mode
          <select v-model="toolOptions.selectionMode">
            <option value="replace">Replace</option>
            <option value="add">Add</option>
            <option value="subtract">Subtract</option>
            <option value="intersect">Intersect</option>
          </select>
        </label>
        <label>Feather <input v-model.number="toolOptions.feather" type="number" min="0" /></label>
      </template>
      <span v-else>{{ activeTool }} tool</span>

      <div v-if="activeShapeLayer" class="selected-layer-options">
        <span>Selected shape</span>
        <label>Type
          <select v-model="activeShapeLayer.shape" @change="pushHistory(activeDocument, 'Shape type')">
            <option value="rectangle">Rectangle</option>
            <option value="rounded-rectangle">Rounded rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="line">Line</option>
            <option value="arrow">Arrow</option>
            <option value="star">Star</option>
            <option value="polygon">Polygon</option>
          </select>
        </label>
        <label>Fill <input v-model="activeShapeLayer.fill" type="color" @change="pushHistory(activeDocument, 'Shape fill')" /></label>
        <label>Stroke <input v-model="activeShapeLayer.stroke" type="color" @change="pushHistory(activeDocument, 'Shape stroke')" /></label>
        <label>Stroke W <input v-model.number="activeShapeLayer.strokeWidth" type="number" min="0" @change="pushHistory(activeDocument, 'Shape stroke width')" /></label>
      </div>

      <div v-else-if="activeTextLayer" class="selected-layer-options">
        <span>Selected text</span>
        <label>Text <input v-model="activeTextLayer.text" @change="pushHistory(activeDocument, 'Edit text')" /></label>
        <label>Color <input v-model="activeTextLayer.color" type="color" @change="pushHistory(activeDocument, 'Text color')" /></label>
        <label>Size <input v-model.number="activeTextLayer.fontSize" type="number" min="8" @change="pushHistory(activeDocument, 'Text size')" /></label>
        <label>Font <input v-model="activeTextLayer.fontFamily" @change="pushHistory(activeDocument, 'Text font')" /></label>
      </div>

      <div v-else-if="activeFrameLayer" class="selected-layer-options">
        <span>Selected frame</span>
        <label>Fill <input v-model="activeFrameLayer.fill" type="color" @change="pushHistory(activeDocument, 'Frame fill')" /></label>
        <label>Shape
          <select v-model="activeFrameLayer.shape" @change="pushHistory(activeDocument, 'Frame shape')">
            <option value="rectangle">Rectangle</option>
            <option value="rounded-rectangle">Rounded rectangle</option>
            <option value="ellipse">Ellipse</option>
          </select>
        </label>
      </div>

      <button class="button secondary" type="button" :disabled="!canUndo" @click="undo"><Undo2 aria-hidden="true" />Undo</button>
      <button class="button secondary" type="button" :disabled="!canRedo" @click="redo"><Redo2 aria-hidden="true" />Redo</button>
      <button class="button primary" type="button" @click="exportDocument('png')"><Download aria-hidden="true" />Quick PNG</button>
    </div>

    <div class="editor-body" :class="{ 'preview-body': previewMode }">
      <aside class="editor-tools" v-if="!previewMode" aria-label="Tools">
        <button
          v-for="item in TOOL_ITEMS"
          :key="item.id"
          type="button"
          :class="{ active: activeTool === item.id }"
          :title="`${item.label} (${item.shortcut})`"
          :aria-label="item.label"
          @click="activeTool = item.id"
        >
          <component :is="item.icon" aria-hidden="true" />
        </button>
      </aside>

      <main class="editor-workspace">
        <div v-if="!activeDocument" class="empty-state">Create or open a document.</div>
        <div
          v-else
          class="editor-canvas-stage"
          :style="{
            transform: `translate(${activeDocument.viewport.panX}px, ${activeDocument.viewport.panY}px)`
          }"
        >
          <div class="editor-canvas-wrap" :style="canvasWrapStyle">
            <canvas
              ref="canvasRef"
              class="editor-main-canvas"
              @pointerdown="pointerDown"
              @pointermove="pointerMove"
              @pointerup="pointerUp"
              @pointercancel="pointerUp"
              @pointerleave="pointerUp"
            />
            <div
              v-if="transformOverlayStyle"
              class="transform-overlay"
              :style="transformOverlayStyle"
              @pointermove="pointerMove"
              @pointerup="pointerUp"
              @pointercancel="pointerUp"
            >
              <button
                v-for="handle in resizeHandles"
                :key="handle"
                type="button"
                class="transform-handle"
                :class="`handle-${handle}`"
                :style="transformHandleStyle(handle)"
                :aria-label="`Resize ${handle}`"
                :title="`Resize ${handle}`"
                @pointerdown.stop.prevent="startResizeFromHandle($event, handle)"
              />
            </div>
          </div>
        </div>
        <div v-if="busy" class="editor-busy">{{ busyLabel }}...</div>
      </main>

      <aside class="editor-panels" v-if="!previewMode" :style="{ width: `${prefs.panelWidth}px` }">
        <section class="editor-panel">
          <header><h2>Document</h2></header>
          <label>Preset
            <select v-model="newDoc.preset" @change="setPreset(newDoc.preset)">
              <option value="1280x720">HD 1280 x 720</option>
              <option value="1920x1080">Full HD 1920 x 1080</option>
              <option value="1080x1080">Square 1080</option>
              <option value="1080x1920">Story 1080 x 1920</option>
              <option value="2480x3508">A4 300 DPI</option>
              <option value="2550x3300">US Letter 300 DPI</option>
            </select>
          </label>
          <div class="compact-grid two-col">
            <label>Width <input v-model.number="newDoc.width" type="number" min="1" :max="prefs.maxDimension" /></label>
            <label>Height <input v-model.number="newDoc.height" type="number" min="1" :max="prefs.maxDimension" /></label>
          </div>
          <label>Background <input v-model="newDoc.background" type="color" /></label>
          <label class="check-row"><input v-model="newDoc.transparent" type="checkbox" /> Transparent background</label>
          <div class="button-row">
            <button class="button primary" type="button" @click="createBlankDocument"><FilePlus2 aria-hidden="true" />New</button>
            <button class="button secondary" type="button" @click="fileInputRef?.click()"><FolderOpen aria-hidden="true" />Open</button>
            <button class="button secondary" type="button" :disabled="!activeDocument" @click="saveProject"><Save aria-hidden="true" />Save</button>
          </div>
        </section>

        <section class="editor-panel" v-if="activeDocument">
          <header><h2>Export</h2></header>
          <label>File name <input v-model="exportSettings.fileName" /></label>
          <label>Format
            <select v-model="exportSettings.format">
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </label>
          <div class="compact-grid two-col">
            <label>Width <input v-model.number="exportSettings.width" type="number" min="1" /></label>
            <label>Height <input v-model.number="exportSettings.height" type="number" min="1" /></label>
          </div>
          <label>Scale <input v-model.number="exportSettings.scale" type="number" min="0.05" max="8" step="0.05" /></label>
          <label>Quality <input v-model.number="exportSettings.quality" type="range" min="0.1" max="1" step="0.01" /></label>
          <label class="check-row"><input v-model="exportSettings.transparency" type="checkbox" /> Preserve transparency when supported</label>
          <label>Fallback background <input v-model="exportSettings.background" type="color" /></label>
          <div class="button-row">
            <button class="button primary" type="button" @click="exportDocument()"><Download aria-hidden="true" />Export</button>
            <button class="button secondary" type="button" @click="exportActiveLayer"><ImagePlus aria-hidden="true" />Layer PNG</button>
          </div>
          <p class="mono" v-if="exportSettings.estimatedSize">Estimated last export: {{ exportSettings.estimatedSize }}</p>
        </section>

        <section v-if="prefs.panels.navigator.visible" class="editor-panel">
          <header>
            <h2>Navigator</h2>
            <button type="button" @click="prefs.panels.navigator.collapsed = !prefs.panels.navigator.collapsed">{{ prefs.panels.navigator.collapsed ? '+' : '-' }}</button>
          </header>
          <div v-if="!prefs.panels.navigator.collapsed">
            <canvas ref="navigatorRef" class="navigator-canvas" />
            <div class="compact-grid">
              <button class="button secondary" type="button" @click="setZoom((activeDocument?.viewport.zoom || 1) / 1.2)"><ZoomOut aria-hidden="true" /></button>
              <button class="button secondary" type="button" @click="fitToWorkspace">Fit</button>
              <button class="button secondary" type="button" @click="setZoom((activeDocument?.viewport.zoom || 1) * 1.2)"><ZoomIn aria-hidden="true" /></button>
            </div>
            <p class="mono" v-if="activeDocument">{{ activeDocument.width }} x {{ activeDocument.height }} | {{ Math.round(activeDocument.viewport.zoom * 100) }}%</p>
          </div>
        </section>

        <section v-if="prefs.panels.layers.visible" class="editor-panel">
          <header>
            <h2>Layers</h2>
            <button type="button" @click="prefs.panels.layers.collapsed = !prefs.panels.layers.collapsed">{{ prefs.panels.layers.collapsed ? '+' : '-' }}</button>
          </header>
          <div v-if="!prefs.panels.layers.collapsed && activeDocument">
            <div class="button-row">
              <button class="icon-button" type="button" title="New raster layer" @click="addRasterLayer"><Layers aria-hidden="true" /></button>
              <button class="icon-button" type="button" title="Import image as layer" @click="layerFileInputRef?.click()"><Upload aria-hidden="true" /></button>
              <button class="icon-button" type="button" title="Duplicate layer" @click="duplicateLayers"><Copy aria-hidden="true" /></button>
              <button class="icon-button" type="button" title="Delete layer" @click="deleteLayers"><Trash2 aria-hidden="true" /></button>
            </div>
            <div class="layer-list">
              <article
                v-for="(layer, index) in [...activeDocument.layers].reverse()"
                :key="layer.id"
                draggable="true"
                :class="{ active: activeDocument.selectedLayerIds.includes(layer.id) }"
                @dragstart="draggedLayerId = layer.id"
                @drop.prevent="reorderLayerDrop(layer.id)"
                @dragover.prevent
                @click="setActiveLayer(activeDocument, layer.id, $event.shiftKey)"
              >
                <button type="button" :title="layer.visible ? 'Hide layer' : 'Show layer'" @click.stop="layer.visible = !layer.visible; pushHistory(activeDocument, 'Toggle layer visibility')">
                  <Eye v-if="layer.visible" aria-hidden="true" />
                  <EyeOff v-else aria-hidden="true" />
                </button>
                <span class="layer-thumb">{{ layer.type.slice(0, 1).toUpperCase() }}</span>
                <input v-model="layer.name" @change="pushHistory(activeDocument, 'Rename layer')" />
                <button type="button" :title="layer.locked ? 'Unlock layer' : 'Lock layer'" @click.stop="layer.locked = !layer.locked; pushHistory(activeDocument, 'Toggle layer lock')">
                  <Lock v-if="layer.locked" aria-hidden="true" />
                  <Unlock v-else aria-hidden="true" />
                </button>
              </article>
            </div>
            <div v-if="activeLayer" class="layer-controls">
              <div class="compact-grid two-col">
                <label>X <input v-model.number="activeLayer.transform.x" type="number" @change="pushHistory(activeDocument, 'Layer position')" /></label>
                <label>Y <input v-model.number="activeLayer.transform.y" type="number" @change="pushHistory(activeDocument, 'Layer position')" /></label>
                <label>W <input v-model.number="activeLayer.transform.width" type="number" min="1" @change="pushHistory(activeDocument, 'Layer size')" /></label>
                <label>H <input v-model.number="activeLayer.transform.height" type="number" min="1" @change="pushHistory(activeDocument, 'Layer size')" /></label>
                <label>Rotate <input v-model.number="activeLayer.transform.rotation" type="number" @change="pushHistory(activeDocument, 'Layer rotation')" /></label>
                <label>Lock pos <input v-model="activeLayer.positionLocked" type="checkbox" @change="pushHistory(activeDocument, 'Lock layer position')" /></label>
              </div>
              <label>Opacity <input v-model.number="activeLayer.opacity" type="range" min="0" max="1" step="0.01" @change="pushHistory(activeDocument, 'Layer opacity')" /></label>
              <label>Blend
                <select v-model="activeLayer.blendMode" @change="pushHistory(activeDocument, 'Layer blend mode')">
                  <option v-for="mode in SUPPORTED_BLEND_MODES" :key="mode" :value="mode">{{ mode }}</option>
                </select>
              </label>
              <div v-if="activeShapeLayer" class="object-controls">
                <h3>Shape</h3>
                <div class="compact-grid two-col">
                  <label>Fill <input v-model="activeShapeLayer.fill" type="color" @change="pushHistory(activeDocument, 'Shape fill')" /></label>
                  <label>Stroke <input v-model="activeShapeLayer.stroke" type="color" @change="pushHistory(activeDocument, 'Shape stroke')" /></label>
                  <label>Stroke W <input v-model.number="activeShapeLayer.strokeWidth" type="number" min="0" @change="pushHistory(activeDocument, 'Shape stroke width')" /></label>
                  <label>Radius <input v-model.number="activeShapeLayer.radius" type="number" min="0" @change="pushHistory(activeDocument, 'Shape radius')" /></label>
                  <label>Sides <input v-model.number="activeShapeLayer.sides" type="number" min="3" max="24" @change="pushHistory(activeDocument, 'Shape sides')" /></label>
                </div>
              </div>
              <div v-else-if="activeTextLayer" class="object-controls">
                <h3>Text</h3>
                <label>Content <input v-model="activeTextLayer.text" @change="pushHistory(activeDocument, 'Edit text')" /></label>
                <div class="compact-grid two-col">
                  <label>Color <input v-model="activeTextLayer.color" type="color" @change="pushHistory(activeDocument, 'Text color')" /></label>
                  <label>Size <input v-model.number="activeTextLayer.fontSize" type="number" min="8" @change="pushHistory(activeDocument, 'Text size')" /></label>
                </div>
              </div>
              <div class="compact-grid">
                <button class="button secondary" type="button" @click="orderActiveLayer('backward')">Back</button>
                <button class="button secondary" type="button" @click="orderActiveLayer('forward')">Forward</button>
                <button class="button secondary" type="button" @click="orderActiveLayer('back')">Bottom</button>
                <button class="button secondary" type="button" @click="orderActiveLayer('front')">Top</button>
              </div>
              <div class="compact-grid">
                <button class="button secondary" type="button" @click="alignLayers('left')">Left</button>
                <button class="button secondary" type="button" @click="alignLayers('hcenter')">Center</button>
                <button class="button secondary" type="button" @click="alignLayers('right')">Right</button>
                <button class="button secondary" type="button" @click="distributeLayers('horizontal')">Distribute</button>
                <button class="button secondary" type="button" @click="rasterizeActiveLayer">Rasterize</button>
                <button class="button secondary" type="button" @click="exportActiveLayer">Layer PNG</button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="prefs.panels.history.visible" class="editor-panel">
          <header>
            <h2>History</h2>
            <button type="button" @click="prefs.panels.history.collapsed = !prefs.panels.history.collapsed">{{ prefs.panels.history.collapsed ? '+' : '-' }}</button>
          </header>
          <ol v-if="!prefs.panels.history.collapsed && activeDocument" class="history-list">
            <li v-for="entry in activeDocument.history" :key="entry.id">{{ entry.name }}</li>
          </ol>
        </section>

        <section class="editor-panel preferences-panel">
          <header><h2>Preferences</h2></header>
          <label>Theme
            <select v-model="prefs.theme">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>Accent <input v-model="prefs.accent" type="color" /></label>
          <label>Panel width <input v-model.number="prefs.panelWidth" type="range" min="260" max="520" /></label>
          <button class="button secondary" type="button" @click="clearTemporaryProjects">Clear temporary projects</button>
        </section>
      </aside>
    </div>

    <footer class="editor-status" aria-live="polite">
      <span v-if="errorMessage" class="error">{{ errorMessage }}</span>
      <span v-else>{{ statusMessage || (activeDocument ? `${activeDocument.name} | ${activeLayer?.name || 'No layer'}` : 'No document') }}</span>
      <span v-if="exportSettings.estimatedSize">Last export: {{ exportSettings.estimatedSize }}</span>
    </footer>
  </section>
</template>
