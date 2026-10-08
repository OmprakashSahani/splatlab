// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { createLocalGaussianAsset, type LocalGaussianAsset } from './assets/localAsset'
import { parseCapturedCameraJson } from './cameras/capturedCameraJson'
import SplatViewport from './components/SplatViewport'
import type { CapturedCamera } from './core/camera'

vi.mock('./components/SplatViewport', () => ({
  default: vi.fn(() => <div data-testid="splat-viewport" />),
}))

vi.mock('./assets/localAsset', () => ({
  createLocalGaussianAsset: vi.fn(),
}))

vi.mock('./cameras/capturedCameraJson', () => ({
  parseCapturedCameraJson: vi.fn(),
}))

const cameraA: CapturedCamera = {
  id: 'camera-a',
  name: 'Camera A',
  pose: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
  intrinsics: {
    width: 1920,
    height: 1080,
    fx: 1000,
    fy: 1000,
    cx: 960,
    cy: 540,
    near: 0.01,
    far: 1000,
  },
}

const cameraB: CapturedCamera = {
  ...cameraA,
  id: 'camera-b',
  name: 'Camera B',
}

const referenceFile = new File(['abc'], 'reference.ply')
const candidateFile = new File(['def'], 'candidate.spz')
const referenceAsset: LocalGaussianAsset = {
  descriptor: { id: 'reference-id', name: 'reference.ply', format: 'ply', sizeBytes: 3 },
  file: referenceFile,
}
const candidateAsset: LocalGaussianAsset = {
  descriptor: { id: 'candidate-id', name: 'candidate.spz', format: 'spz', sizeBytes: 3 },
  file: candidateFile,
}

function createCameraFile(name: string, readText: () => Promise<string>) {
  const file = new File([], name, { type: 'application/json' })
  const text = vi.fn(readText)
  Object.defineProperty(file, 'text', { value: text })
  return { file, text }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function latestViewportProps() {
  return vi.mocked(SplatViewport).mock.calls.at(-1)![0]
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(SplatViewport).mockImplementation(() => <div data-testid="splat-viewport" />)
  vi.mocked(createLocalGaussianAsset).mockImplementation((file) => {
    if (file === referenceFile) return referenceAsset
    if (file === candidateFile) return candidateAsset
    throw new Error('Unexpected asset file')
  })
})

afterEach(() => {
  cleanup()
})

describe('App camera JSON selection', () => {
  it('passes a valid camera file to SplatViewport and displays its summary', async () => {
    const json = JSON.stringify(cameraA)
    const { file, text } = createCameraFile('camera-a.json', async () => json)
    vi.mocked(parseCapturedCameraJson).mockReturnValue(cameraA)
    render(<App />)

    fireEvent.change(screen.getByLabelText('Open camera JSON'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(latestViewportProps().camera).toBe(cameraA)
    })
    expect(text).toHaveBeenCalledExactlyOnceWith()
    expect(parseCapturedCameraJson).toHaveBeenCalledExactlyOnceWith(json)
    expect(latestViewportProps().asset).toBeNull()
    expect(latestViewportProps().onAssetLoadError).toEqual(expect.any(Function))
    expect(screen.getByText('Camera A · 1920×1080 · camera-a')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a parse error while preserving the previous valid camera', async () => {
    const valid = createCameraFile('camera-a.json', async () => JSON.stringify(cameraA))
    const invalid = createCameraFile('invalid.json', async () => '{}')
    vi.mocked(parseCapturedCameraJson)
      .mockReturnValueOnce(cameraA)
      .mockImplementationOnce(() => {
        throw new Error('Invalid camera.pose.')
      })
    render(<App />)
    const input = screen.getByLabelText('Open camera JSON')

    fireEvent.change(input, { target: { files: [valid.file] } })
    await waitFor(() => {
      expect(latestViewportProps().camera).toBe(cameraA)
    })

    fireEvent.change(input, { target: { files: [invalid.file] } })
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Invalid camera.pose.')
    })
    expect(latestViewportProps().camera).toBe(cameraA)
    expect(screen.getByText('Camera A · 1920×1080 · camera-a')).toBeTruthy()
  })

  it('ignores an older success after a newer camera selection succeeds', async () => {
    const readA = deferred<string>()
    const readB = deferred<string>()
    const fileA = createCameraFile('camera-a.json', () => readA.promise)
    const fileB = createCameraFile('camera-b.json', () => readB.promise)
    const jsonA = JSON.stringify(cameraA)
    const jsonB = JSON.stringify(cameraB)
    vi.mocked(parseCapturedCameraJson).mockImplementation((text) => {
      if (text === jsonA) return cameraA
      if (text === jsonB) return cameraB
      throw new Error('Unexpected camera text')
    })
    render(<App />)
    const input = screen.getByLabelText('Open camera JSON')

    fireEvent.change(input, { target: { files: [fileA.file] } })
    fireEvent.change(input, { target: { files: [fileB.file] } })
    expect(fileA.text).toHaveBeenCalledOnce()
    expect(fileB.text).toHaveBeenCalledOnce()
    expect(parseCapturedCameraJson).not.toHaveBeenCalled()

    readB.resolve(jsonB)
    await waitFor(() => {
      expect(latestViewportProps().camera).toBe(cameraB)
    })

    // Flush the older handler and any resulting React updates before asserting.
    await act(async () => {
      readA.resolve(jsonA)
      await readA.promise
    })
    await waitFor(() => {
      expect(latestViewportProps().camera).toBe(cameraB)
      expect(screen.getByText('Camera B · 1920×1080 · camera-b')).toBeTruthy()
    })
    expect(parseCapturedCameraJson).toHaveBeenNthCalledWith(1, jsonB)
    expect(parseCapturedCameraJson).toHaveBeenNthCalledWith(2, jsonA)
    expect(vi.mocked(SplatViewport).mock.calls.some(([props]) => props.camera === cameraA))
      .toBe(false)
    expect(screen.queryByText('Camera A · 1920×1080 · camera-a')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ignores an older read failure after a newer camera selection succeeds', async () => {
    const readA = deferred<string>()
    const readB = deferred<string>()
    const fileA = createCameraFile('camera-a.json', () => readA.promise)
    const fileB = createCameraFile('camera-b.json', () => readB.promise)
    const jsonB = JSON.stringify(cameraB)
    vi.mocked(parseCapturedCameraJson).mockReturnValue(cameraB)
    render(<App />)
    const input = screen.getByLabelText('Open camera JSON')

    fireEvent.change(input, { target: { files: [fileA.file] } })
    fireEvent.change(input, { target: { files: [fileB.file] } })
    expect(fileA.text).toHaveBeenCalledOnce()
    expect(fileB.text).toHaveBeenCalledOnce()
    expect(parseCapturedCameraJson).not.toHaveBeenCalled()

    readB.resolve(jsonB)
    await waitFor(() => {
      expect(latestViewportProps().camera).toBe(cameraB)
    })

    // Flush the rejection handler so an erroneous alert cannot appear later.
    await act(async () => {
      readA.reject(new Error('Older camera read failed.'))
      await readA.promise.catch(() => undefined)
    })
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
      expect(latestViewportProps().camera).toBe(cameraB)
      expect(screen.getByText('Camera B · 1920×1080 · camera-b')).toBeTruthy()
    })
    expect(parseCapturedCameraJson).toHaveBeenCalledExactlyOnceWith(jsonB)
  })
})

describe('App Reference/Candidate assets', () => {
  it('starts with Reference active and one empty viewport, with both roles enabled', () => {
    render(<App />)

    const reference = screen.getByRole('button', { name: 'Reference' })
    const candidate = screen.getByRole('button', { name: 'Candidate' })
    expect(reference.getAttribute('aria-pressed')).toBe('true')
    expect(candidate.getAttribute('aria-pressed')).toBe('false')
    expect(reference.hasAttribute('disabled')).toBe(false)
    expect(candidate.hasAttribute('disabled')).toBe(false)
    expect(latestViewportProps().asset).toBeNull()
    expect(screen.getAllByTestId('splat-viewport')).toHaveLength(1)
  })

  it('selects a Reference file and displays its summary', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Open reference asset'), {
      target: { files: [referenceFile] },
    })

    expect(createLocalGaussianAsset).toHaveBeenCalledExactlyOnceWith(
      referenceFile,
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    )
    expect(latestViewportProps().asset).toBe(referenceAsset)
    expect(screen.getByRole('button', { name: 'Reference' }).getAttribute('aria-pressed'))
      .toBe('true')
    expect(screen.getByRole('button', { name: 'Candidate' }).getAttribute('aria-pressed'))
      .toBe('false')
    expect(screen.getByText('Reference · reference.ply · PLY · 3 B')).toBeTruthy()
  })

  it('activates a selected Candidate while keeping both asset summaries', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Open reference asset'), {
      target: { files: [referenceFile] },
    })

    fireEvent.change(screen.getByLabelText('Open candidate asset'), {
      target: { files: [candidateFile] },
    })

    expect(createLocalGaussianAsset).toHaveBeenNthCalledWith(2, candidateFile, expect.any(String))
    expect(latestViewportProps().asset).toBe(candidateAsset)
    expect(screen.getByRole('button', { name: 'Candidate' }).getAttribute('aria-pressed'))
      .toBe('true')
    expect(screen.getByRole('button', { name: 'Reference' }).getAttribute('aria-pressed'))
      .toBe('false')
    expect(screen.getByText('Reference · reference.ply · PLY · 3 B')).toBeTruthy()
    expect(screen.getByText('Candidate · candidate.spz · SPZ · 3 B')).toBeTruthy()
    expect(screen.getAllByTestId('splat-viewport')).toHaveLength(1)
  })

  it('switches between stored assets without recreating either asset', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Open reference asset'), {
      target: { files: [referenceFile] },
    })
    fireEvent.change(screen.getByLabelText('Open candidate asset'), {
      target: { files: [candidateFile] },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }))
    expect(latestViewportProps().asset).toBe(referenceAsset)
    expect(screen.getAllByTestId('splat-viewport')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Candidate' }))
    expect(latestViewportProps().asset).toBe(candidateAsset)
    expect(screen.getAllByTestId('splat-viewport')).toHaveLength(1)
    expect(createLocalGaussianAsset).toHaveBeenCalledTimes(2)
  })

  it('passes null for an empty Candidate slot and retains the stored Reference', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Open reference asset'), {
      target: { files: [referenceFile] },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Candidate' }))

    expect(screen.getByRole('button', { name: 'Candidate' }).getAttribute('aria-pressed'))
      .toBe('true')
    expect(screen.getByRole('button', { name: 'Reference' }).getAttribute('aria-pressed'))
      .toBe('false')
    expect(latestViewportProps().asset).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }))
    expect(latestViewportProps().asset).toBe(referenceAsset)
    expect(createLocalGaussianAsset).toHaveBeenCalledOnce()
  })

  it('clears asset errors on role changes and file selection while keeping the callback stable', () => {
    render(<App />)
    const onAssetLoadError = latestViewportProps().onAssetLoadError
    expect(onAssetLoadError).toEqual(expect.any(Function))
    if (!onAssetLoadError) throw new Error('Missing asset error callback')

    act(() => onAssetLoadError(new Error('Candidate failed')))
    expect(screen.getByRole('alert').textContent).toBe('Candidate failed')

    fireEvent.click(screen.getByRole('button', { name: 'Candidate' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(latestViewportProps().onAssetLoadError).toBe(onAssetLoadError)

    act(() => onAssetLoadError(new Error('Candidate failed')))
    expect(screen.getByRole('alert').textContent).toBe('Candidate failed')
    fireEvent.click(screen.getByRole('button', { name: 'Reference' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(latestViewportProps().onAssetLoadError).toBe(onAssetLoadError)

    act(() => onAssetLoadError(new Error('Candidate failed')))
    expect(screen.getByRole('alert').textContent).toBe('Candidate failed')
    fireEvent.change(screen.getByLabelText('Open candidate asset'), {
      target: { files: [candidateFile] },
    })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(latestViewportProps().onAssetLoadError).toBe(onAssetLoadError)
  })

  it('preserves the same camera across asset selection and role switching', async () => {
    const json = JSON.stringify(cameraA)
    const { file } = createCameraFile('camera-a.json', async () => json)
    vi.mocked(parseCapturedCameraJson).mockReturnValue(cameraA)
    render(<App />)
    fireEvent.change(screen.getByLabelText('Open camera JSON'), {
      target: { files: [file] },
    })
    await waitFor(() => {
      expect(latestViewportProps().camera).toBe(cameraA)
    })

    fireEvent.change(screen.getByLabelText('Open reference asset'), {
      target: { files: [referenceFile] },
    })
    expect(latestViewportProps().asset).toBe(referenceAsset)
    expect(latestViewportProps().camera).toBe(cameraA)
    fireEvent.change(screen.getByLabelText('Open candidate asset'), {
      target: { files: [candidateFile] },
    })
    expect(latestViewportProps().asset).toBe(candidateAsset)
    expect(latestViewportProps().camera).toBe(cameraA)

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }))
    expect(latestViewportProps().asset).toBe(referenceAsset)
    expect(latestViewportProps().camera).toBe(cameraA)
    fireEvent.click(screen.getByRole('button', { name: 'Candidate' }))
    expect(latestViewportProps().asset).toBe(candidateAsset)
    expect(latestViewportProps().camera).toBe(cameraA)
    expect(parseCapturedCameraJson).toHaveBeenCalledExactlyOnceWith(json)
    expect(screen.getAllByTestId('splat-viewport')).toHaveLength(1)
  })
})
