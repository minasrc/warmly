import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Journey } from "./brand"

const { reducedMotion, path, bird } = vi.hoisted(() => ({
  reducedMotion: vi.fn(),
  path: vi.fn((_props: Record<string, unknown>) => null),
  bird: vi.fn((_props: Record<string, unknown>) => null),
}))

vi.mock("motion/react", () => ({
  useReducedMotion: reducedMotion,
  motion: { path, g: bird },
}))

describe("host journey motion", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([0.36, 0.78, 1])("updates progress %s instantly with reduced motion", (progress) => {
    reducedMotion.mockReturnValue(true)
    const markup = renderToStaticMarkup(createElement(Journey, { progress }))
    expect(markup).toContain('aria-hidden="true"')
    expect(path.mock.calls[0]?.[0]).toMatchObject({
      initial: false,
      animate: { pathLength: progress },
      transition: { duration: 0 },
    })
    expect(bird.mock.calls[0]?.[0]).toMatchObject({
      animate: { opacity: progress === 1 ? 1 : 0.65 },
      transition: { duration: 0 },
    })
  })

  it.each([false, null])("keeps the approved animation when preference is %s", (preference) => {
    reducedMotion.mockReturnValue(preference)
    renderToStaticMarkup(createElement(Journey, { progress: 0.58 }))
    expect(path.mock.calls[0]?.[0]).toMatchObject({ transition: { duration: 0.6 } })
    expect(bird.mock.calls[0]?.[0]).toMatchObject({ transition: { duration: 0.3 } })
  })
})
