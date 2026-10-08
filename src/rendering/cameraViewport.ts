export interface CameraViewport {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Fits a camera image inside a canvas; x is from the left, y from the bottom. */
export function fitCameraViewport(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
): CameraViewport {
  if (
    !Number.isFinite(canvasWidth) || canvasWidth <= 0 ||
    !Number.isFinite(canvasHeight) || canvasHeight <= 0
  ) {
    throw new Error('Invalid canvas dimensions.')
  }
  if (
    !Number.isFinite(imageWidth) || imageWidth <= 0 ||
    !Number.isFinite(imageHeight) || imageHeight <= 0
  ) {
    throw new Error('Invalid camera image dimensions.')
  }

  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight)
  // Floor the caps so fractional canvas dimensions still yield integer pixels.
  const width = Math.min(Math.round(imageWidth * scale), Math.floor(canvasWidth))
  const height = Math.min(Math.round(imageHeight * scale), Math.floor(canvasHeight))

  return {
    x: Math.round((canvasWidth - width) / 2),
    y: Math.round((canvasHeight - height) / 2),
    width,
    height,
  }
}
