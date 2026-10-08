import { useCallback, useRef, useState } from 'react'
import { createLocalGaussianAsset, type LocalGaussianAsset } from './assets/localAsset'
import { parseCapturedCameraJson } from './cameras/capturedCameraJson'
import SplatViewport from './components/SplatViewport'
import type { CapturedCamera } from './core/camera'
import './App.css'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function App() {
  const [asset, setAsset] = useState<LocalGaussianAsset | null>(null)
  const [assetLoadError, setAssetLoadError] = useState<string | null>(null)
  const [camera, setCamera] = useState<CapturedCamera | null>(null)
  const [cameraLoadError, setCameraLoadError] = useState<string | null>(null)
  const cameraSelectionVersionRef = useRef(0)

  const handleAssetLoadError = useCallback((error: unknown) => {
    setAssetLoadError(
      error instanceof Error ? error.message : 'Failed to load Gaussian asset.',
    )
  }, [])

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-header-main">
          <h1>SplatLab</h1>
          <p>Reproducible Gaussian Splatting comparison and debugging.</p>
        </div>
        <div className="asset-controls">
          <label>
            Open Gaussian asset
            <input
              className="asset-input"
              type="file"
              accept=".ply,.spz"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (!file) return

                setAsset(createLocalGaussianAsset(file, crypto.randomUUID()))
                setAssetLoadError(null)
              }}
            />
          </label>
          {asset && (
            <p className="asset-summary">
              {asset.descriptor.name} · {asset.descriptor.format.toUpperCase()} ·{' '}
              {formatBytes(asset.descriptor.sizeBytes)}
            </p>
          )}
          {assetLoadError && (
            <p className="asset-error" role="alert">
              {assetLoadError}
            </p>
          )}
          <label>
            Open camera JSON
            <input
              className="camera-input"
              type="file"
              accept=".json"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0]
                if (!file) return

                const selectionVersion = ++cameraSelectionVersionRef.current
                setCameraLoadError(null)

                try {
                  const text = await file.text()
                  const parsedCamera = parseCapturedCameraJson(text)
                  if (selectionVersion !== cameraSelectionVersionRef.current) return

                  setCamera(parsedCamera)
                  setCameraLoadError(null)
                } catch (error) {
                  if (selectionVersion !== cameraSelectionVersionRef.current) return

                  setCameraLoadError(
                    error instanceof Error ? error.message : 'Failed to load camera.',
                  )
                }
              }}
            />
          </label>
          {camera && (
            <p className="camera-summary">
              {camera.name || camera.id} · {camera.intrinsics.width}×{camera.intrinsics.height}
              {camera.name && ` · ${camera.id}`}
            </p>
          )}
          {cameraLoadError && (
            <p className="camera-error" role="alert">
              {cameraLoadError}
            </p>
          )}
        </div>
      </header>
      <section className="viewport-panel">
        <SplatViewport asset={asset} camera={camera} onAssetLoadError={handleAssetLoadError} />
      </section>
    </main>
  )
}

export default App
