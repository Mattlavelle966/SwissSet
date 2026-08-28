export type VectorPreset = 'exact' | 'crisp' | 'logo' | 'mono' | 'color'

export type VectorTraceOptions = {
  numberofcolors: number
  ltres: number
  qtres: number
  pathomit: number
  colorsampling: number
  colorquantcycles: number
  blurradius: number
  blurdelta: number
  scale: number
  roundcoords: number
  strokewidth: number
  linefilter: boolean
  rightangleenhance: boolean
}

export const DEFAULT_VECTOR_SETTINGS = {
  preset: 'exact' as VectorPreset,
  colorCount: 32,
  simplify: 0.9,
  despeckle: 6,
  sharpenEdges: false,
  alphaThreshold: 18,
  contrastBoost: 0
}

export function createEmbeddedRasterSvg(dataUrl: string, width: number, height: number) {
  if (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl)) {
    throw new Error('Unsupported raster image data')
  }

  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><image width="${safeWidth}" height="${safeHeight}" preserveAspectRatio="none" href="${dataUrl}"/></svg>`
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

/**
 * ImageTracer's generated palette becomes grayscale below eight colors and its
 * random palette sampler makes repeated conversions inconsistent. These
 * presets always use deterministic image sampling for color traces and reserve
 * the generated grayscale palette for the intentionally monochrome preset.
 */
export function createVectorTraceOptions(
  preset: VectorPreset,
  colorCount: number,
  simplify: number,
  despeckle: number,
  samplingRatio = 1
): VectorTraceOptions {
  if (preset === 'exact') {
    throw new Error('Exact appearance does not use path tracing options')
  }
  const colors = Math.round(clamp(colorCount, 2, 64))
  const smoothing = clamp(simplify, 0.5, 2)
  const cleanup = Math.round(clamp(despeckle, 0, 24))
  const renderRatio = Math.max(0.01, samplingRatio)
  const oversampling = Math.max(1, renderRatio)
  const scaledTolerance = oversampling * oversampling
  const scaledCleanup = Math.sqrt(oversampling)
  const common = {
    // Trace from more pixels while preserving the source image dimensions in
    // the generated SVG. Tolerances scale with the coordinate system so the
    // extra pixels create smoother curves instead of noisy extra detail.
    scale: 1 / renderRatio,
    roundcoords: 2,
    strokewidth: 0,
    linefilter: false
  }

  if (preset === 'mono') {
    return {
      ...common,
      numberofcolors: 2,
      ltres: 0.45 * smoothing * scaledTolerance,
      qtres: 0.45 * smoothing * scaledTolerance,
      pathomit: Math.round(cleanup * scaledCleanup),
      colorsampling: 0,
      colorquantcycles: 3,
      blurradius: 0,
      blurdelta: 20,
      rightangleenhance: true
    }
  }

  if (preset === 'crisp') {
    return {
      ...common,
      numberofcolors: Math.max(8, colors),
      ltres: 0.4 * smoothing * scaledTolerance,
      qtres: 0.4 * smoothing * scaledTolerance,
      pathomit: Math.round(cleanup * scaledCleanup),
      colorsampling: 2,
      colorquantcycles: 7,
      blurradius: 0,
      blurdelta: 20,
      rightangleenhance: true
    }
  }

  if (preset === 'logo') {
    return {
      ...common,
      numberofcolors: Math.max(12, colors),
      ltres: 0.55 * smoothing * scaledTolerance,
      qtres: 0.55 * smoothing * scaledTolerance,
      pathomit: Math.round(cleanup * scaledCleanup),
      colorsampling: 2,
      colorquantcycles: 7,
      blurradius: 1,
      blurdelta: 24,
      rightangleenhance: true
    }
  }

  return {
    ...common,
    numberofcolors: Math.max(24, colors),
    ltres: 0.5 * smoothing * scaledTolerance,
    qtres: 0.5 * smoothing * scaledTolerance,
    pathomit: Math.max(2, Math.round((cleanup / 2) * scaledCleanup)),
    colorsampling: 2,
    colorquantcycles: 8,
    blurradius: 1,
    blurdelta: 20,
    rightangleenhance: false
  }
}

export function getTraceSamplingRatio(
  width: number,
  height: number,
  maxSide: number,
  preset: VectorPreset
) {
  const sourceMaxSide = Math.max(1, width, height)
  const preferredOversampling = preset === 'color' ? 4 : 3
  return Math.min(preferredOversampling, Math.max(1, maxSide) / sourceMaxSide)
}

export function normalizeForMonochrome(imageData: ImageData) {
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

export function preprocessLogoImageData(
  imageData: ImageData,
  contrastBoost: number,
  alphaThreshold: number
) {
  const data = imageData.data
  const contrast = clamp(contrastBoost, 0, 42) / 100
  const threshold = clamp(alphaThreshold, 0, 80)
  const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255))

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] <= threshold) {
      // Hidden RGB values in transparent pixels otherwise become palette colors
      // and create colored fringe paths around transparent artwork.
      data[index] = 0
      data[index + 1] = 0
      data[index + 2] = 0
      data[index + 3] = 0
      continue
    }

    if (data[index + 3] > 255 - threshold) {
      data[index + 3] = 255
    }

    if (contrast > 0) {
      data[index] = clamp(factor * (data[index] - 128) + 128, 0, 255)
      data[index + 1] = clamp(factor * (data[index + 1] - 128) + 128, 0, 255)
      data[index + 2] = clamp(factor * (data[index + 2] - 128) + 128, 0, 255)
    }
  }

  return imageData
}

export function sharpenImageData(imageData: ImageData, amount = 0.25) {
  const source = new Uint8ClampedArray(imageData.data)
  const { width, height, data } = imageData
  const strength = clamp(amount, 0, 1)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4

      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel]
        const neighbors =
          source[index - width * 4 + channel] +
          source[index - 4 + channel] +
          source[index + 4 + channel] +
          source[index + width * 4 + channel]
        const sharpened = center * 5 - neighbors
        data[index + channel] = center + (sharpened - center) * strength
      }
    }
  }

  return imageData
}
