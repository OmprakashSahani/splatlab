import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { SplatMesh } from '@sparkjsdev/spark'
import type { LocalGaussianAsset } from '../assets/localAsset'
import type { CapturedCamera } from '../core/camera'
import { applyCapturedCamera } from '../rendering/capturedCamera'
import { fitCameraViewport } from '../rendering/cameraViewport'
import {
  createSparkRenderSession,
  renderSparkSession,
  disposeSparkRenderSession,
  type SparkRenderSession,
} from '../rendering/renderSession'
import { loadLocalSplatMesh, disposeSplatMesh } from '../rendering/sparkAsset'

export interface SplatViewportProps {
  readonly asset?: LocalGaussianAsset | null
  readonly camera?: CapturedCamera | null
  readonly onAssetLoadError?: (error: unknown) => void
}

/**
 * SplatViewport owns THREE.WebGLRenderer and owns and disposes each attached SplatMesh.
 * SparkRenderSession owns the scene, camera, and SparkRenderer.
 * A provided CapturedCamera updates the existing session camera without replacing it.
 * The last applied captured camera also determines the fitted renderer viewport.
 */
export default function SplatViewport({
  asset = null,
  camera = null,
  onAssetLoadError,
}: SplatViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<SparkRenderSession | null>(null)
  const activeCameraRef = useRef<CapturedCamera | null>(null)
  const meshRef = useRef<SplatMesh | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const session = createSparkRenderSession(renderer)
    sessionRef.current = session

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width > 0 && height > 0) {
        renderer.setSize(width, height, false)
        const activeCamera = activeCameraRef.current
        if (activeCamera) {
          const viewport = fitCameraViewport(
            width,
            height,
            activeCamera.intrinsics.width,
            activeCamera.intrinsics.height,
          )
          renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height)
        }
      }
    }

    window.addEventListener('resize', resize)
    resize()

    let animationFrameId: number
    const renderFrame = () => {
      renderSparkSession(session)
      animationFrameId = requestAnimationFrame(renderFrame)
    }
    animationFrameId = requestAnimationFrame(renderFrame)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', resize)
      sessionRef.current = null
      activeCameraRef.current = null
      const mesh = meshRef.current
      if (mesh) {
        meshRef.current = null
        disposeSplatMesh(mesh)
      }
      disposeSparkRenderSession(session)
      renderer.dispose()
    }
  }, [])

  useEffect(() => {
    const session = sessionRef.current
    if (!camera || !session) return

    applyCapturedCamera(session.camera, camera)
    activeCameraRef.current = camera

    const canvas = canvasRef.current
    if (!canvas) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width > 0 && height > 0) {
      const viewport = fitCameraViewport(
        width,
        height,
        camera.intrinsics.width,
        camera.intrinsics.height,
      )
      session.renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height)
    }
  }, [camera])

  useEffect(() => {
    const session = sessionRef.current
    if (!asset || !session) return

    let cancelled = false
    let loadedMesh: SplatMesh | null = null

    void loadLocalSplatMesh(asset)
      .then((mesh) => {
        if (cancelled || sessionRef.current !== session) {
          disposeSplatMesh(mesh)
          return
        }

        session.scene.add(mesh)
        loadedMesh = mesh
        meshRef.current = mesh
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onAssetLoadError?.(error)
        }
      })

    return () => {
      cancelled = true
      if (loadedMesh && meshRef.current === loadedMesh) {
        meshRef.current = null
        disposeSplatMesh(loadedMesh)
      }
    }
  }, [asset, onAssetLoadError])

  return <canvas ref={canvasRef} aria-label="Gaussian splat viewport" />
}
