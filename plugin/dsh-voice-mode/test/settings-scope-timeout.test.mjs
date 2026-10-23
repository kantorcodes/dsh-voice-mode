/**
 * I-7（settings scope 部分）回归：读/写请求带超时信号；挂起的 GET → unavailable + 退避重试；
 * 挂起的 POST → 回滚（乐观值不永久滞留）。
 * 运行：node test/settings-scope-timeout.test.mjs
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const out = join(mkdtempSync(join(tmpdir(), 'dsh-vm-scopeto-')), 'scope.mjs')
await build({ entryPoints: [join(here, '..', 'src/settings-http-scope.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' })
const { createHttpScope } = await import(pathToFileURL(out).href)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// 挂起直到 signal 中止（真 fetch 的行为）；无 signal 则永不落定
const hang = (calls) => (url, init) =>
  new Promise((_, rej) => {
    calls.push(init?.method ?? 'GET')
    init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))
  })

const keep = setInterval(() => {}, 1000) // AbortSignal.timeout 的定时器 unref，需保活
let passed = 0
{
  const calls = []
  const scope = createHttpScope('http://x', hang(calls), 60)
  const unsub = scope.subscribe(() => {})
  await sleep(150)
  assert.equal(scope.getSnapshot().status, 'unavailable', '挂起的 GET 超时后应进 unavailable')
  await sleep(700) // 退避首发 500ms
  assert.ok(calls.length >= 2, '超时后应按退避重试')
  passed += 2
  unsub()
  scope.dispose()
}
{
  const calls = []
  let n = 0
  const f = (url, init) => {
    if (!init?.method) return Promise.resolve({ ok: true, json: async () => ({ value: { a: 1 } }) })
    n++
    return hang(calls)(url, init)
  }
  const scope = createHttpScope('http://x', f, 60)
  const unsub = scope.subscribe(() => {})
  await sleep(30)
  assert.equal(scope.getSnapshot().status, 'ready')
  const p = scope.set('a', 2)
  assert.equal(scope.getSnapshot().value.a, 2, '乐观更新')
  await p
  assert.equal(scope.getSnapshot().value.a, 1, '挂起的 POST 超时后应回滚')
  passed += 2
  unsub()
  scope.dispose()
}
clearInterval(keep)
console.log(`settings-scope-timeout：${passed} 项通过，0 项失败`)
