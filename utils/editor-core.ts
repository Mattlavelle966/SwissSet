export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'lighten'
  | 'darken'
  | 'color-dodge'
  | 'color-burn'
  | 'overlay'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'alpha-mask'
  | 'erase-mask'

export type LayerType =
  | 'raster'
  | 'text'
  | 'shape'
  | 'frame'
  | 'group'
  | 'adjustment'

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect'

export type SelectionShape =
  | {
      type: 'rect'
      x: number
      y: number
      width: number
      height: number
      feather: number
      mode: SelectionMode
    }
  | {
      type: 'ellipse'
      x: number
      y: number
      width: number
      height: number
      feather: number
      mode: SelectionMode
    }
  | null

export type Transform = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scaleX: number
  scaleY: number
}

export type LayerMask = {
  id: string
  name: string
  dataUrl: string
  enabled: boolean
  selected: boolean
  inverted: boolean
}

export type BaseLayer = {
  id: string
  type: LayerType
  name: string
  visible: boolean
  locked: boolean
  positionLocked: boolean
  opacity: number
  blendMode: BlendMode
  transform: Transform
  mask?: LayerMask
  parentId?: string | null
  clipping?: boolean
}

export type RasterLayer = BaseLayer & {
  type: 'raster'
  dataUrl: string
}

export type TextLayer = BaseLayer & {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: string
  italic: boolean
  underline: boolean
  color: string
  align: CanvasTextAlign
  lineHeight: number
  letterSpacing: number
  boxWidth: number
  effects: {
    strokeColor: string
    strokeWidth: number
    shadowColor: string
    shadowBlur: number
    shadowOffsetX: number
    shadowOffsetY: number
  }
}

export type ShapeKind =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'star'
  | 'polygon'

export type ShapeLayer = BaseLayer & {
  type: 'shape'
  shape: ShapeKind
  fill: string
  stroke: string
  strokeWidth: number
  radius: number
  sides: number
}

export type FrameLayer = BaseLayer & {
  type: 'frame'
  shape: 'rectangle' | 'ellipse' | 'rounded-rectangle'
  imageDataUrl?: string
  imageTransform: Transform
  fill: string
}

export type GroupLayer = BaseLayer & {
  type: 'group'
  childIds: string[]
  collapsed: boolean
}

export type AdjustmentLayer = BaseLayer & {
  type: 'adjustment'
  adjustment: 'brightness-contrast' | 'hue-saturation' | 'invert'
  params: Record<string, number>
}

export type EditorLayer =
  | RasterLayer
  | TextLayer
  | ShapeLayer
  | FrameLayer
  | GroupLayer
  | AdjustmentLayer

export type HistoryEntry = {
  id: string
  name: string
  at: string
  snapshot: string
}

export type ViewportState = {
  zoom: number
  panX: number
  panY: number
}

export type EditorDocument = {
  id: string
  name: string
  width: number
  height: number
  resolution: number
  background: {
    transparent: boolean
    color: string
  }
  layers: EditorLayer[]
  activeLayerId: string
  selectedLayerIds: string[]
  selection: SelectionShape
  savedSelections: Array<{ id: string; name: string; selection: SelectionShape }>
  history: HistoryEntry[]
  redo: HistoryEntry[]
  viewport: ViewportState
  metadata: {
    createdAt: string
    updatedAt: string
    savedAt?: string
    source?: string
  }
  dirty: boolean
}

export type ProjectFile = {
  version: 1
  app: 'SwissSet Studio'
  savedAt: string
  document: Omit<EditorDocument, 'history' | 'redo'>
}

export const SUPPORTED_BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'lighten',
  'darken',
  'color-dodge',
  'color-burn',
  'overlay',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
  'alpha-mask',
  'erase-mask'
]

export const CANVAS_COMPOSITE_BY_BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  lighten: 'lighten',
  darken: 'darken',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  overlay: 'overlay',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'alpha-mask': 'destination-in',
  'erase-mask': 'destination-out'
}

export const MAX_SAFE_DIMENSION = 8192
export const MAX_SAFE_PIXELS = 48_000_000

export function editorId(prefix = 'ed') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function cloneDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function defaultTransform(width: number, height: number): Transform {
  return {
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1
  }
}

export function createBaseLayer(
  type: LayerType,
  name: string,
  width: number,
  height: number
): BaseLayer {
  return {
    id: editorId('layer'),
    type,
    name,
    visible: true,
    locked: false,
    positionLocked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: defaultTransform(width, height),
    parentId: null,
    clipping: false
  }
}

export function createEmptyRasterLayer(
  width: number,
  height: number,
  name = 'Empty layer'
): RasterLayer {
  return {
    ...createBaseLayer('raster', name, width, height),
    type: 'raster',
    dataUrl: ''
  }
}

export function createRasterLayer(
  dataUrl: string,
  width: number,
  height: number,
  name = 'Image layer'
): RasterLayer {
  return {
    ...createBaseLayer('raster', name, width, height),
    type: 'raster',
    dataUrl
  }
}

export function createTextLayer(width: number, height: number, text = 'Text'): TextLayer {
  return {
    ...createBaseLayer('text', 'Text layer', width, height),
    type: 'text',
    text,
    fontFamily: 'Inter, Arial, sans-serif',
    fontSize: 72,
    fontWeight: '700',
    italic: false,
    underline: false,
    color: '#101820',
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    boxWidth: Math.min(700, width),
    effects: {
      strokeColor: '#ffffff',
      strokeWidth: 0,
      shadowColor: 'rgba(0,0,0,0.25)',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0
    }
  }
}

export function createShapeLayer(
  width: number,
  height: number,
  shape: ShapeKind = 'rectangle'
): ShapeLayer {
  const layer = createBaseLayer('shape', 'Shape layer', width * 0.4, height * 0.3)
  layer.transform.x = Math.round(width * 0.3)
  layer.transform.y = Math.round(height * 0.35)

  return {
    ...layer,
    type: 'shape',
    shape,
    fill: '#0f766e',
    stroke: '#101820',
    strokeWidth: 0,
    radius: 24,
    sides: 5
  }
}

export function createFrameLayer(width: number, height: number): FrameLayer {
  const layer = createBaseLayer('frame', 'Frame layer', width * 0.48, height * 0.42)
  layer.transform.x = Math.round(width * 0.26)
  layer.transform.y = Math.round(height * 0.29)

  return {
    ...layer,
    type: 'frame',
    shape: 'rounded-rectangle',
    imageTransform: defaultTransform(layer.transform.width, layer.transform.height),
    fill: '#eef2f7'
  }
}

export function createAdjustmentLayer(
  width: number,
  height: number,
  adjustment: AdjustmentLayer['adjustment'] = 'invert'
): AdjustmentLayer {
  return {
    ...createBaseLayer('adjustment', 'Adjustment layer', width, height),
    type: 'adjustment',
    adjustment,
    params: {}
  }
}

export function createDocument(input: {
  name?: string
  width: number
  height: number
  backgroundColor?: string
  transparent?: boolean
  layers?: EditorLayer[]
  source?: string
}): EditorDocument {
  const now = new Date().toISOString()
  const baseLayer =
    input.layers?.[0] ||
    createEmptyRasterLayer(input.width, input.height, 'Background layer')
  const layers = input.layers?.length ? input.layers : [baseLayer]

  const doc: EditorDocument = {
    id: editorId('doc'),
    name: input.name || 'Untitled',
    width: input.width,
    height: input.height,
    resolution: 72,
    background: {
      transparent: !!input.transparent,
      color: input.backgroundColor || '#ffffff'
    },
    layers,
    activeLayerId: layers[layers.length - 1].id,
    selectedLayerIds: [layers[layers.length - 1].id],
    selection: null,
    savedSelections: [],
    history: [],
    redo: [],
    viewport: {
      zoom: 1,
      panX: 0,
      panY: 0
    },
    metadata: {
      createdAt: now,
      updatedAt: now,
      source: input.source
    },
    dirty: false
  }

  pushHistory(doc, 'New document', false)
  return doc
}

export function getActiveLayer(doc: EditorDocument) {
  return doc.layers.find((layer) => layer.id === doc.activeLayerId) || null
}

export function setActiveLayer(doc: EditorDocument, layerId: string, additive = false) {
  if (!doc.layers.some((layer) => layer.id === layerId)) {
    return
  }

  doc.activeLayerId = layerId
  if (additive) {
    const set = new Set(doc.selectedLayerIds)
    set.add(layerId)
    doc.selectedLayerIds = [...set]
  } else {
    doc.selectedLayerIds = [layerId]
  }
}

export function serializeDocumentState(doc: EditorDocument) {
  const { history: _history, redo: _redo, ...snapshot } = doc
  return JSON.stringify(snapshot)
}

export function restoreDocumentState(doc: EditorDocument, snapshot: string) {
  const restored = JSON.parse(snapshot) as Omit<EditorDocument, 'history' | 'redo'>
  const history = doc.history
  const redo = doc.redo
  Object.assign(doc, restored, { history, redo })
}

export function pushHistory(doc: EditorDocument, name: string, markDirty = true) {
  doc.metadata.updatedAt = new Date().toISOString()
  doc.history.push({
    id: editorId('history'),
    name,
    at: doc.metadata.updatedAt,
    snapshot: serializeDocumentState(doc)
  })
  if (doc.history.length > 60) {
    doc.history.shift()
  }
  doc.redo = []
  if (markDirty) {
    doc.dirty = true
  }
}

export function undoDocument(doc: EditorDocument) {
  if (doc.history.length <= 1) {
    return false
  }

  const current = doc.history.pop()
  if (current) {
    doc.redo.push(current)
  }

  const previous = doc.history[doc.history.length - 1]
  restoreDocumentState(doc, previous.snapshot)
  doc.dirty = true
  return true
}

export function redoDocument(doc: EditorDocument) {
  const next = doc.redo.pop()
  if (!next) {
    return false
  }

  restoreDocumentState(doc, next.snapshot)
  doc.history.push(next)
  doc.dirty = true
  return true
}

export function insertLayer(doc: EditorDocument, layer: EditorLayer, index = doc.layers.length) {
  doc.layers.splice(Math.max(0, Math.min(index, doc.layers.length)), 0, layer)
  setActiveLayer(doc, layer.id)
  pushHistory(doc, `Add ${layer.name}`)
}

export function deleteSelectedLayers(doc: EditorDocument) {
  const ids = new Set(doc.selectedLayerIds)
  if (!ids.size || doc.layers.length <= ids.size) {
    return false
  }

  const activeIndex = doc.layers.findIndex((layer) => layer.id === doc.activeLayerId)
  doc.layers = doc.layers.filter((layer) => !ids.has(layer.id))
  const next = doc.layers[Math.max(0, Math.min(activeIndex, doc.layers.length - 1))]
  doc.activeLayerId = next.id
  doc.selectedLayerIds = [next.id]
  pushHistory(doc, 'Delete layer')
  return true
}

export function duplicateSelectedLayers(doc: EditorDocument) {
  const ids = new Set(doc.selectedLayerIds)
  const duplicates = doc.layers
    .filter((layer) => ids.has(layer.id))
    .map((layer) => ({
      ...cloneDocument(layer),
      id: editorId('layer'),
      name: `${layer.name} copy`
    })) as EditorLayer[]

  if (!duplicates.length) {
    return []
  }

  const insertAt = Math.max(...doc.layers.map((layer, index) => (ids.has(layer.id) ? index : -1))) + 1
  doc.layers.splice(insertAt, 0, ...duplicates)
  doc.selectedLayerIds = duplicates.map((layer) => layer.id)
  doc.activeLayerId = duplicates[duplicates.length - 1].id
  pushHistory(doc, 'Duplicate layer')
  return duplicates
}

export function moveLayer(doc: EditorDocument, layerId: string, toIndex: number) {
  const fromIndex = doc.layers.findIndex((layer) => layer.id === layerId)
  if (fromIndex < 0) {
    return false
  }
  const [layer] = doc.layers.splice(fromIndex, 1)
  doc.layers.splice(Math.max(0, Math.min(toIndex, doc.layers.length)), 0, layer)
  pushHistory(doc, 'Reorder layer')
  return true
}

export function bringLayerForward(doc: EditorDocument, layerId = doc.activeLayerId) {
  const index = doc.layers.findIndex((layer) => layer.id === layerId)
  if (index < 0 || index >= doc.layers.length - 1) return false
  return moveLayer(doc, layerId, index + 1)
}

export function sendLayerBackward(doc: EditorDocument, layerId = doc.activeLayerId) {
  const index = doc.layers.findIndex((layer) => layer.id === layerId)
  if (index <= 0) return false
  return moveLayer(doc, layerId, index - 1)
}

export function bringLayerToFront(doc: EditorDocument, layerId = doc.activeLayerId) {
  return moveLayer(doc, layerId, doc.layers.length - 1)
}

export function sendLayerToBack(doc: EditorDocument, layerId = doc.activeLayerId) {
  return moveLayer(doc, layerId, 0)
}

export function selectedLayers(doc: EditorDocument) {
  const ids = new Set(doc.selectedLayerIds)
  return doc.layers.filter((layer) => ids.has(layer.id))
}

export function alignSelectedLayers(
  doc: EditorDocument,
  alignment: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
) {
  const layers = selectedLayers(doc).filter((layer) => !layer.locked && !layer.positionLocked)
  if (!layers.length) return false

  for (const layer of layers) {
    if (alignment === 'left') layer.transform.x = 0
    if (alignment === 'hcenter') layer.transform.x = (doc.width - layer.transform.width) / 2
    if (alignment === 'right') layer.transform.x = doc.width - layer.transform.width
    if (alignment === 'top') layer.transform.y = 0
    if (alignment === 'vcenter') layer.transform.y = (doc.height - layer.transform.height) / 2
    if (alignment === 'bottom') layer.transform.y = doc.height - layer.transform.height
  }

  pushHistory(doc, 'Align layers')
  return true
}

export function distributeSelectedLayers(
  doc: EditorDocument,
  axis: 'horizontal' | 'vertical'
) {
  const layers = selectedLayers(doc)
    .filter((layer) => !layer.locked && !layer.positionLocked)
    .sort((a, b) =>
      axis === 'horizontal'
        ? a.transform.x - b.transform.x
        : a.transform.y - b.transform.y
    )
  if (layers.length < 3) return false

  const first = layers[0]
  const last = layers[layers.length - 1]
  const start = axis === 'horizontal' ? first.transform.x : first.transform.y
  const end =
    axis === 'horizontal'
      ? last.transform.x + last.transform.width
      : last.transform.y + last.transform.height
  const total = layers.reduce(
    (sum, layer) => sum + (axis === 'horizontal' ? layer.transform.width : layer.transform.height),
    0
  )
  const gap = (end - start - total) / (layers.length - 1)
  let cursor = start

  for (const layer of layers) {
    if (axis === 'horizontal') {
      layer.transform.x = cursor
      cursor += layer.transform.width + gap
    } else {
      layer.transform.y = cursor
      cursor += layer.transform.height + gap
    }
  }

  pushHistory(doc, 'Distribute layers')
  return true
}

export function makeProjectFile(doc: EditorDocument): ProjectFile {
  const { history: _history, redo: _redo, ...document } = cloneDocument(doc)
  document.dirty = false
  document.metadata.savedAt = new Date().toISOString()
  return {
    version: 1,
    app: 'SwissSet Studio',
    savedAt: document.metadata.savedAt,
    document
  }
}

export function parseProjectFile(value: unknown): EditorDocument {
  if (!value || typeof value !== 'object') {
    throw new Error('Project file is not valid JSON')
  }
  const project = value as Partial<ProjectFile>
  if (project.version !== 1 || project.app !== 'SwissSet Studio' || !project.document) {
    throw new Error('Unsupported or corrupted SwissSet project file')
  }
  const doc = cloneDocument(project.document) as EditorDocument
  doc.history = []
  doc.redo = []
  doc.dirty = false
  pushHistory(doc, 'Open project', false)
  return doc
}

export function estimatePixelMemory(width: number, height: number) {
  return width * height * 4
}

export function exceedsSafeMemory(width: number, height: number) {
  return (
    width > MAX_SAFE_DIMENSION ||
    height > MAX_SAFE_DIMENSION ||
    width * height > MAX_SAFE_PIXELS
  )
}

export function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const normalized = hex.trim().replace('#', '')
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized
  if (!/^[\da-f]{6}$/i.test(expanded)) {
    throw new Error('Invalid hex color')
  }
  const value = Number.parseInt(expanded, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha]
}

export function rgbaToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')}`
}
