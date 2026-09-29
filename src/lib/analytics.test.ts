/** Verifies that deployed visit tracking queues valid commands without exposing route identifiers. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initializeVisitTracking } from './analytics'

afterEach(() => vi.unstubAllGlobals())

describe('initializeVisitTracking', () => {
  it('queues native arguments commands and a sanitized page location on Pages', () => {
    const browserWindow = {
      location: {
        hostname: 'paciowg.github.io',
        pathname: '/pacio-explorer-reference-client/',
        origin: 'https://paciowg.github.io',
      },
      dataLayer: undefined as unknown[] | undefined,
      gtag: undefined as ((...args: unknown[]) => void) | undefined,
    }
    const append = vi.fn()
    vi.stubGlobal('window', browserWindow)
    vi.stubGlobal('document', { createElement: () => ({}), head: { append } })

    initializeVisitTracking('G-FYXYTTDGQM')

    expect(browserWindow.dataLayer).toHaveLength(2)
    expect(Array.isArray(browserWindow.dataLayer?.[0])).toBe(false)
    expect(Array.isArray(browserWindow.dataLayer?.[1])).toBe(false)
    expect(Array.from(browserWindow.dataLayer?.[0] as IArguments)[0]).toBe('js')
    expect(Array.from(browserWindow.dataLayer?.[1] as IArguments)).toEqual([
      'config',
      'G-FYXYTTDGQM',
      { page_location: 'https://paciowg.github.io/pacio-explorer-reference-client/' },
    ])
    expect(append).toHaveBeenCalledWith({
      async: true,
      src: 'https://www.googletagmanager.com/gtag/js?id=G-FYXYTTDGQM',
    })
  })

  it.each([
    ['localhost', '/pacio-explorer-reference-client/', 'G-FYXYTTDGQM'],
    ['paciowg.github.io', '/other-site/', 'G-FYXYTTDGQM'],
    ['paciowg.github.io', '/pacio-explorer-reference-client/', undefined],
  ])('does not initialize outside the configured deployment', (hostname, pathname, measurementId) => {
    const browserWindow = { location: { hostname, pathname }, dataLayer: undefined }
    const append = vi.fn()
    vi.stubGlobal('window', browserWindow)
    vi.stubGlobal('document', { createElement: () => ({}), head: { append } })

    initializeVisitTracking(measurementId)

    expect(browserWindow.dataLayer).toBeUndefined()
    expect(append).not.toHaveBeenCalled()
  })
})
