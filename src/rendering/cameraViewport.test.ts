import { describe, expect, it } from 'vitest'
import { fitCameraViewport } from './cameraViewport'

describe('fitCameraViewport', () => {
  it.each([
    {
      name: 'matching aspect ratios',
      canvas: [1920, 1080], image: [1920, 1080],
      expected: { x: 0, y: 0, width: 1920, height: 1080 },
    },
    {
      name: 'letterboxing',
      canvas: [1600, 1200], image: [1920, 1080],
      expected: { x: 0, y: 150, width: 1600, height: 900 },
    },
    {
      name: 'pillarboxing',
      canvas: [1920, 1080], image: [1000, 1000],
      expected: { x: 420, y: 0, width: 1080, height: 1080 },
    },
    {
      name: 'a portrait canvas with a landscape camera',
      canvas: [800, 1200], image: [1920, 1080],
      expected: { x: 0, y: 375, width: 800, height: 450 },
    },
  ])('fits $name', ({ canvas, image, expected }) => {
    expect(fitCameraViewport(canvas[0], canvas[1], image[0], image[1]))
      .toStrictEqual(expected)
  })

  it.each([
    [101, 100, { x: 1, y: 0, width: 100, height: 100 }],
    [100, 101, { x: 0, y: 1, width: 100, height: 100 }],
  ] as const)('rounds centered offsets for odd margins in %s×%s', (width, height, expected) => {
    const result = fitCameraViewport(width, height, 100, 100)
    expect(result).toStrictEqual(expected)
    expect(result.x).toBe(Math.round((width - result.width) / 2))
    expect(result.y).toBe(Math.round((height - result.height) / 2))
  })

  it.each([
    // Continuous fitted sizes: 10×6⅔, 6⅔×10, and 11×7⅓.
    [10, 10, 3, 2, { x: 0, y: 2, width: 10, height: 7 }],
    [10, 10, 2, 3, { x: 2, y: 0, width: 7, height: 10 }],
    [11, 10, 3, 2, { x: 0, y: 2, width: 11, height: 7 }],
  ] as const)(
    'rounds fractional fitted sizes for canvas %s×%s and image %s×%s',
    (canvasWidth, canvasHeight, imageWidth, imageHeight, expected) => {
      const result = fitCameraViewport(canvasWidth, canvasHeight, imageWidth, imageHeight)
      expect(result).toStrictEqual(expected)
      expect(Number.isInteger(result.width)).toBe(true)
      expect(Number.isInteger(result.height)).toBe(true)
      expect(result.x + result.width).toBeLessThanOrEqual(canvasWidth)
      expect(result.y + result.height).toBeLessThanOrEqual(canvasHeight)
    },
  )

  it('fits larger source images with the same aspect ratio identically', () => {
    const result = fitCameraViewport(1600, 1200, 3840, 2160)
    expect(result).toStrictEqual(fitCameraViewport(1600, 1200, 1920, 1080))
    expect(result).toStrictEqual({ x: 0, y: 150, width: 1600, height: 900 })
  })

  it('scales smaller source images up to fill the canvas', () => {
    expect(fitCameraViewport(1920, 1080, 640, 360)).toStrictEqual({
      x: 0, y: 0, width: 1920, height: 1080,
    })
  })

  it.each([0, -1, NaN, Infinity])('rejects invalid canvas dimensions: %s', (invalid) => {
    expect(() => fitCameraViewport(invalid, 1080, 1920, 1080))
      .toThrowError(new Error('Invalid canvas dimensions.'))
    expect(() => fitCameraViewport(1920, invalid, 1920, 1080))
      .toThrowError(new Error('Invalid canvas dimensions.'))
  })

  it.each([0, -1, NaN, Infinity])('rejects invalid image dimensions: %s', (invalid) => {
    expect(() => fitCameraViewport(1920, 1080, invalid, 1080))
      .toThrowError(new Error('Invalid camera image dimensions.'))
    expect(() => fitCameraViewport(1920, 1080, 1920, invalid))
      .toThrowError(new Error('Invalid camera image dimensions.'))
  })

  it('validates canvas dimensions before image dimensions', () => {
    expect(() => fitCameraViewport(0, NaN, -1, Infinity))
      .toThrowError(new Error('Invalid canvas dimensions.'))
  })

  it.each([
    [1920, 1080, 1920, 1080],
    [1600, 1200, 1920, 1080],
    [1920, 1080, 1000, 1000],
    [800, 1200, 1920, 1080],
    [101, 100, 100, 100],
    [10, 10, 2, 3],
    [10.8, 8.8, 10.8, 8.8],
    [800.5, 1200.75, 1920, 1080],
  ])(
    'returns bounded integer pixels for canvas %s×%s and image %s×%s',
    (canvasWidth, canvasHeight, imageWidth, imageHeight) => {
      const result = fitCameraViewport(canvasWidth, canvasHeight, imageWidth, imageHeight)
      for (const value of [result.x, result.y, result.width, result.height]) {
        expect(Number.isInteger(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
      }
      expect(result.width).toBeLessThanOrEqual(canvasWidth)
      expect(result.height).toBeLessThanOrEqual(canvasHeight)
      const xTolerance = Number.isInteger(canvasWidth) ? 0 : 1
      const yTolerance = Number.isInteger(canvasHeight) ? 0 : 1
      expect(result.x + result.width).toBeLessThanOrEqual(canvasWidth + xTolerance)
      expect(result.y + result.height).toBeLessThanOrEqual(canvasHeight + yTolerance)
    },
  )

  it('accepts fractional canvas dimensions and caps rounded sizes at floored bounds', () => {
    // Both continuous sizes round up, so both must be capped to stay inside.
    expect(fitCameraViewport(10.8, 8.8, 10.8, 8.8)).toStrictEqual({
      x: 0, y: 0, width: 10, height: 8,
    })
  })
})
