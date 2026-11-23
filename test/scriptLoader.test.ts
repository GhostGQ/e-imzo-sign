// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

import { ScriptLoader } from '../src/core/scriptLoader'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.Base64
  delete window.CAPIWS
  delete window.EIMZOClient
  document.getElementById('eimzo-vendor-base')?.remove()
  document.getElementById('eimzo-vendor-client')?.remove()
})

it('retries failed auto injection and keeps the base script that succeeded', async () => {
  let blocked = true
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    if (node instanceof HTMLScriptElement && node.id === 'eimzo-vendor-base') {
      vi.stubGlobal('CAPIWS', {})
      vi.stubGlobal('Base64', {})
    }
    if (node instanceof HTMLScriptElement && node.id === 'eimzo-vendor-client' && !blocked) {
      vi.stubGlobal('EIMZOClient', {})
    }
    return document.head.insertBefore(node, null)
  })
  const loader = new ScriptLoader({ mode: 'auto' })

  await expect(loader.loadScripts()).rejects.toMatchObject({ code: 'UNKNOWN' })
  const baseTag = document.getElementById('eimzo-vendor-base')
  expect(window.CAPIWS).toBeDefined()
  blocked = false
  await expect(loader.loadScripts()).resolves.toBeUndefined()
  expect(document.getElementById('eimzo-vendor-base')).toBe(baseTag)
  expect(document.head.querySelectorAll('#eimzo-vendor-client')).toHaveLength(1)
})

it('retries a manual failure on the same loader after the missing client loads', async () => {
  const loader = new ScriptLoader({ mode: 'manual' })
  vi.stubGlobal('CAPIWS', {})
  vi.stubGlobal('Base64', {})
  loader.markBaseScriptLoaded()
  const first = loader.loadScripts()
  expect(loader.loadScripts()).toBe(first)
  const original = new Error('script network failure')
  loader.markScriptError(original)
  await expect(first).rejects.toMatchObject({ code: 'APP_NOT_RUNNING', original })

  const retried = loader.loadScripts()
  vi.stubGlobal('EIMZOClient', {})
  loader.markClientScriptLoaded()
  await expect(retried).resolves.toBeUndefined()
})
