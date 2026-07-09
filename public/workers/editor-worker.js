self.onmessage = (event) => {
  const { id, type, imageData, params } = event.data || {}

  try {
    if (type === 'filter') {
      const result = applyFilter(imageData, params || {})
      self.postMessage({ id, ok: true, imageData: result }, [result.data.buffer])
      return
    }

    self.postMessage({ id, ok: false, error: 'Unsupported worker operation' })
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error && error.message ? error.message : 'Worker operation failed'
    })
  }
}

function clamp(value) {
  return Math.max(0, Math.min(255, value))
}

function applyFilter(imageData, params) {
  const { data, width, height } = imageData
  const brightness = Number(params.brightness || 0)
  const contrast = Number(params.contrast || 0)
  const saturation = Number(params.saturation || 0)
  const grayscale = Number(params.grayscale || 0) / 100
  const invert = !!params.invert
  const threshold = params.threshold === undefined ? null : Number(params.threshold)
  const posterize = params.posterize ? Math.max(2, Number(params.posterize)) : 0

  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast))
  const saturationFactor = 1 + saturation / 100

  for (let index = 0; index < data.length; index += 4) {
    let r = data[index]
    let g = data[index + 1]
    let b = data[index + 2]

    r = contrastFactor * (r - 128) + 128 + brightness
    g = contrastFactor * (g - 128) + 128 + brightness
    b = contrastFactor * (b - 128) + 128 + brightness

    const luminance = r * 0.299 + g * 0.587 + b * 0.114
    r = luminance + (r - luminance) * saturationFactor
    g = luminance + (g - luminance) * saturationFactor
    b = luminance + (b - luminance) * saturationFactor

    if (grayscale > 0) {
      r = r * (1 - grayscale) + luminance * grayscale
      g = g * (1 - grayscale) + luminance * grayscale
      b = b * (1 - grayscale) + luminance * grayscale
    }

    if (invert) {
      r = 255 - r
      g = 255 - g
      b = 255 - b
    }

    if (threshold !== null) {
      const value = luminance >= threshold ? 255 : 0
      r = value
      g = value
      b = value
    }

    if (posterize) {
      const levels = posterize - 1
      r = Math.round((r / 255) * levels) * (255 / levels)
      g = Math.round((g / 255) * levels) * (255 / levels)
      b = Math.round((b / 255) * levels) * (255 / levels)
    }

    data[index] = clamp(r)
    data[index + 1] = clamp(g)
    data[index + 2] = clamp(b)
  }

  if (params.sharpen) {
    return sharpen(imageData)
  }

  return imageData
}

function sharpen(imageData) {
  const { data, width, height } = imageData
  const source = new Uint8ClampedArray(data)
  const matrix = [0, -1, 0, -1, 5, -1, 0, -1, 0]

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const sourceIndex = ((y + ky) * width + x + kx) * 4 + channel
            value += source[sourceIndex] * matrix[(ky + 1) * 3 + (kx + 1)]
          }
        }
        data[index + channel] = clamp(value)
      }
    }
  }

  return imageData
}
