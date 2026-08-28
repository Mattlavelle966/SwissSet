import { describe, expect, test } from 'bun:test'
import {
  CANVAS_COMPOSITE_BY_BLEND,
  SUPPORTED_BLEND_MODES,
  alignSelectedLayers,
  bringLayerForward,
  createDocument,
  createRasterLayer,
  createShapeLayer,
  createTextLayer,
  deleteSelectedLayers,
  distributeSelectedLayers,
  duplicateSelectedLayers,
  exceedsSafeMemory,
  hexToRgba,
  insertLayer,
  makeProjectFile,
  moveLayer,
  parseProjectFile,
  pushHistory,
  redoDocument,
  rgbaToHex,
  sendLayerBackward,
  setActiveLayer,
  undoDocument
} from '../utils/editor-core'
import {
  DEFAULT_VECTOR_SETTINGS,
  createVectorTraceOptions,
  getTraceSamplingRatio,
  preprocessLogoImageData,
  sharpenImageData
} from '../utils/vector-converter'

const transparentPng = 'data:image/png;base64,iVBORw0KGgo='

describe('editor document model', () => {
  test('creates a document with stable document state', () => {
    const doc = createDocument({ width: 800, height: 600, transparent: true, name: 'Unit test' })

    expect(doc.name).toBe('Unit test')
    expect(doc.width).toBe(800)
    expect(doc.height).toBe(600)
    expect(doc.background.transparent).toBe(true)
    expect(doc.layers).toHaveLength(1)
    expect(doc.activeLayerId).toBe(doc.layers[0].id)
    expect(doc.selectedLayerIds).toEqual([doc.layers[0].id])
    expect(doc.history.at(-1)?.name).toBe('New document')
    expect(doc.viewport.zoom).toBe(1)
  })

  test('orders, duplicates, moves, and deletes layers without losing active selection', () => {
    const doc = createDocument({ width: 320, height: 240 })
    const first = doc.layers[0]
    const second = createRasterLayer(transparentPng, 50, 50, 'Second')
    const third = createRasterLayer(transparentPng, 60, 60, 'Third')

    insertLayer(doc, second)
    insertLayer(doc, third)
    expect(doc.layers.map((layer) => layer.name)).toEqual(['Background layer', 'Second', 'Third'])

    expect(sendLayerBackward(doc, third.id)).toBe(true)
    expect(doc.layers.map((layer) => layer.id)).toEqual([first.id, third.id, second.id])

    expect(bringLayerForward(doc, third.id)).toBe(true)
    expect(doc.layers.map((layer) => layer.id)).toEqual([first.id, second.id, third.id])

    setActiveLayer(doc, second.id)
    const duplicates = duplicateSelectedLayers(doc)
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].name).toBe('Second copy')
    expect(doc.activeLayerId).toBe(duplicates[0].id)

    expect(moveLayer(doc, duplicates[0].id, 0)).toBe(true)
    expect(doc.layers[0].id).toBe(duplicates[0].id)

    expect(deleteSelectedLayers(doc)).toBe(true)
    expect(doc.layers.some((layer) => layer.id === duplicates[0].id)).toBe(false)
    expect(doc.selectedLayerIds).toEqual([doc.activeLayerId])
  })

  test('undo and redo restore document snapshots', () => {
    const doc = createDocument({ width: 500, height: 400 })
    const layer = doc.layers[0]

    layer.transform.x = 120
    layer.transform.y = 80
    pushHistory(doc, 'Move layer')

    expect(undoDocument(doc)).toBe(true)
    expect(doc.layers[0].transform.x).toBe(0)
    expect(doc.layers[0].transform.y).toBe(0)

    expect(redoDocument(doc)).toBe(true)
    expect(doc.layers[0].transform.x).toBe(120)
    expect(doc.layers[0].transform.y).toBe(80)
  })

  test('aligns and distributes selected layers', () => {
    const doc = createDocument({ width: 600, height: 400 })
    const a = createRasterLayer(transparentPng, 100, 100, 'A')
    const b = createRasterLayer(transparentPng, 100, 100, 'B')
    const c = createRasterLayer(transparentPng, 100, 100, 'C')
    a.transform.x = 0
    b.transform.x = 260
    c.transform.x = 500
    insertLayer(doc, a)
    insertLayer(doc, b)
    insertLayer(doc, c)
    doc.selectedLayerIds = [a.id, b.id, c.id]

    expect(alignSelectedLayers(doc, 'vcenter')).toBe(true)
    expect(a.transform.y).toBe(150)
    expect(b.transform.y).toBe(150)
    expect(c.transform.y).toBe(150)

    expect(distributeSelectedLayers(doc, 'horizontal')).toBe(true)
    expect(a.transform.x).toBe(0)
    expect(b.transform.x).toBe(250)
    expect(c.transform.x).toBe(500)
  })
})

describe('project serialization', () => {
  test('preserves editable layers, masks, dimensions, and metadata', () => {
    const doc = createDocument({ width: 1024, height: 512, name: 'Layered' })
    const text = createTextLayer(doc.width, doc.height, 'Editable headline')
    const shape = createShapeLayer(doc.width, doc.height, 'star')
    const raster = createRasterLayer(transparentPng, 128, 128, 'Masked')
    raster.mask = {
      id: 'mask-1',
      name: 'Mask',
      dataUrl: transparentPng,
      enabled: true,
      selected: false,
      inverted: false
    }

    insertLayer(doc, text)
    insertLayer(doc, shape)
    insertLayer(doc, raster)
    const parsed = parseProjectFile(makeProjectFile(doc))

    expect(parsed.width).toBe(1024)
    expect(parsed.height).toBe(512)
    expect(parsed.layers.find((layer) => layer.type === 'text')?.name).toBe('Text layer')
    expect(parsed.layers.find((layer) => layer.type === 'shape')?.type).toBe('shape')
    expect(parsed.layers.find((layer) => layer.name === 'Masked')?.mask?.enabled).toBe(true)
    expect(parsed.history).toHaveLength(1)
    expect(parsed.dirty).toBe(false)
  })
})

describe('rendering helpers', () => {
  test('declares all required blend modes with canvas mappings', () => {
    expect(SUPPORTED_BLEND_MODES).toContain('multiply')
    expect(SUPPORTED_BLEND_MODES).toContain('luminosity')
    expect(SUPPORTED_BLEND_MODES).toContain('erase-mask')
    for (const mode of SUPPORTED_BLEND_MODES) {
      expect(CANVAS_COMPOSITE_BY_BLEND[mode]).toBeTruthy()
    }
  })

  test('converts colors and rejects invalid hex input', () => {
    expect(hexToRgba('#0f766e')).toEqual([15, 118, 110, 255])
    expect(hexToRgba('#fff', 128)).toEqual([255, 255, 255, 128])
    expect(rgbaToHex(15, 118, 110)).toBe('#0f766e')
    expect(rgbaToHex(260, -5, 16.4)).toBe('#ff0010')
    expect(() => hexToRgba('nope')).toThrow('Invalid hex color')
  })

  test('detects documents that exceed safe browser memory limits', () => {
    expect(exceedsSafeMemory(2000, 2000)).toBe(false)
    expect(exceedsSafeMemory(9000, 100)).toBe(true)
    expect(exceedsSafeMemory(10000, 10000)).toBe(true)
  })
})

describe('vector conversion helpers', () => {
  test('uses a detailed, deterministic color trace by default', () => {
    expect(DEFAULT_VECTOR_SETTINGS.preset).toBe('color')
    expect(DEFAULT_VECTOR_SETTINGS.colorCount).toBeGreaterThanOrEqual(24)
    expect(DEFAULT_VECTOR_SETTINGS.sharpenEdges).toBe(false)

    const options = createVectorTraceOptions('color', 32, 0.9, 6)
    expect(options.numberofcolors).toBe(32)
    expect(options.colorsampling).toBe(2)
    expect(options.colorquantcycles).toBeGreaterThanOrEqual(7)
    expect(options.blurradius).toBe(1)
  })

  test('oversamples small artwork without changing its SVG dimensions', () => {
    const ratio = getTraceSamplingRatio(170, 145, 2200, 'color')
    const options = createVectorTraceOptions('color', 32, 0.9, 6, ratio)

    expect(ratio).toBe(4)
    expect(options.scale).toBe(0.25)
    expect(options.ltres).toBeCloseTo(7.2)
  })

  test('scales oversized input back to its original output dimensions', () => {
    const ratio = getTraceSamplingRatio(4400, 2200, 2200, 'color')
    const options = createVectorTraceOptions('color', 32, 0.9, 6, ratio)

    expect(ratio).toBe(0.5)
    expect(options.scale).toBe(2)
  })

  test('never sends a sub-eight-color fixed palette to a color trace', () => {
    const options = createVectorTraceOptions('crisp', 4, 1, 4)
    expect(options.numberofcolors).toBe(8)
    expect(options.colorsampling).toBe(2)
  })

  test('removes hidden colors when alpha is discarded', () => {
    const imageData = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([25, 190, 80, 5])
    } as ImageData

    preprocessLogoImageData(imageData, 0, 18)
    expect([...imageData.data]).toEqual([0, 0, 0, 0])
  })

  test('optional sharpening is restrained instead of clipping edge halos', () => {
    const imageData = {
      width: 3,
      height: 3,
      data: new Uint8ClampedArray(Array(9).fill([100, 100, 100, 255]).flat())
    } as ImageData
    imageData.data.set([120, 120, 120, 255], 16)

    sharpenImageData(imageData)
    expect(imageData.data[16]).toBe(140)
  })
})
