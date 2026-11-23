import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const fixture = mkdtempSync(join(tmpdir(), 'e-imzo-package-'))
const node = (args, cwd = fixture) => execFileSync(process.execPath, args, { cwd, stdio: 'inherit' })
const npm = [process.env.npm_execpath, '--cache', join(fixture, 'npm-cache')]

try {
  const output = execFileSync(process.execPath,
    [...npm, 'pack', '--json', '--pack-destination', fixture], { cwd: root, encoding: 'utf8' })
  const [archive] = JSON.parse(output)
  assert(!archive.files.some(({ path }) => path.startsWith('demo/')))
  writeFileSync(join(fixture, 'package.json'), '{"private":true}')
  node([...npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--legacy-peer-deps', './' + archive.filename])

  for (const dep of ['react', 'react-dom', '@types']) {
    symlinkSync(join(root, 'node_modules', dep), join(fixture, 'node_modules', dep), 'junction')
  }

  const source = `
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { EImzoError, createEImzoCore, type IEImzoCore } from 'e-imzo-web'
import { EImzoProvider, EImzoError as ReactError, useEImzo } from 'e-imzo-web/react'
import { MockEImzoCore } from 'e-imzo-web/mock'

if (EImzoError !== ReactError) throw new Error('Core and React export different error classes')
if (typeof createEImzoCore !== 'function') throw new Error('Core factory is unavailable')
const core: IEImzoCore = new MockEImzoCore({ latencyMs: 0, failWith: 'WRONG_PASSWORD' })

function App() {
  const eimzo = useEImzo({ getChallenge: async () => 'test', onSuccess: () => {} })
  return createElement('p', { onClick: () => void eimzo.signWithUsbToken() }, eimzo.status)
}

const html = renderToString(createElement(EImzoProvider, { core, children: createElement(App) }))
if (html !== '<p>idle</p>') throw new Error('Unexpected React output: ' + html)
void core.signWithUsbToken('test').then(
  () => { throw new Error('Mock signing did not fail') },
  (error) => { if (!(error instanceof EImzoError)) throw error },
)
`
  for (const extension of ['mts', 'cts']) writeFileSync(join(fixture, 'app.' + extension), source)
  node([join(root, 'node_modules/typescript/bin/tsc'), '--module', 'node16', '--strict',
    'app.mts', 'app.cts'])
  node(['app.mjs'])
  node(['app.cjs'])
  node(['-e', "require.resolve('e-imzo-web/vendor/e-imzo.js'); require.resolve('e-imzo-web/vendor/e-imzo-client.js')"])
  if (process.env.NPM_RELEASE_DIR) {
    copyFileSync(join(fixture, archive.filename), join(process.env.NPM_RELEASE_DIR, archive.filename))
  }
  console.log('Packed React consumer passed TypeScript, ESM and CommonJS checks.')
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
