/**
 * I-2 回归：模型下载 body 空闲看门狗。运行：node test/model-download-idle.test.mjs
 *
 * 旧实现只约束响应头阶段；头到后 body 卡死只能等 undici 默认 300s 空闲超时（每文件 2 上游×300s），
 * 且 dispose 不 abort。现要求：收到字节即重置的空闲看门狗（不设总时长）+ 外部 signal 立即中止 + 失败保留 .part。
 * fetch 全程桩化（真离线）；空闲阈值用 idleTimeoutMs 缩到毫秒级。
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureModelFile, ensureModelTree } from '../src/models.ts'

const DATA = Buffer.alloc(1000, 7)
const SHA = createHash('sha256').update(DATA).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** body：先吐 first 字节，其后按 mode 行为；abort 时 error（与 undici 一致）。 */
let mode = 'stall'
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/api/models/')) {
    return { url: u, status: 200, ok: true, headers: { get: () => null }, json: async () => ({ siblings: [{ rfilename: 'd/a' }] }), body: null }
  }
  const sig = init?.signal
  const body = new ReadableStream({
    async start(c) {
      sig?.addEventListener('abort', () => { try { c.error(sig.reason ?? new Error('aborted')) } catch {} })
      c.enqueue(new Uint8Array(DATA.subarray(0, 100)))
      if (mode === 'stall') return // 之后再无字节、也不结束
      // slow：每 40ms 一块，总时长 > 空闲阈值，但从不空闲超过阈值
      for (let off = 100; off < DATA.length; off += 100) {
        await sleep(40)
        try { c.enqueue(new Uint8Array(DATA.subarray(off, off + 100))) } catch { return }
      }
      try { c.close() } catch {}
    },
  })
  return { url: u, status: 200, headers: { get: (k) => (String(k).toLowerCase() === 'content-length' ? String(DATA.length) : null) }, body }
}

let passed = 0
const t = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`) }
const base = (dir, extra = {}) => ({
  repo: 'r', repoDir: dir, spec: { file: 'a.bin', sha256: SHA },
  primaryHost: '', allowCustomHost: false, broadcast: () => {}, ...extra,
})

await t('头到后 body 停滞 → 空闲看门狗在阈值内中止（不挂到 300s），.part 保留供续传', async () => {
  mode = 'stall'
  const dir = mkdtempSync(join(tmpdir(), 'dm-idle-'))
  try {
    const t0 = Date.now()
    const ok = await ensureModelFile(base(dir, { idleTimeoutMs: 150 }))
    assert.equal(ok, false)
    assert.ok(Date.now() - t0 < 3000, `应在 3 个上游×阈值内收敛，实际 ${Date.now() - t0}ms`)
    assert.ok(existsSync(join(dir, 'a.bin.part')), '失败须保留 .part')
    assert.ok(statSync(join(dir, 'a.bin.part')).size > 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

await t('慢网：总时长远超阈值但持续有字节 → 不误杀，下载成功', async () => {
  mode = 'slow'
  const dir = mkdtempSync(join(tmpdir(), 'dm-slow-'))
  try {
    const t0 = Date.now()
    assert.equal(await ensureModelFile(base(dir, { idleTimeoutMs: 150 })), true)
    assert.ok(Date.now() - t0 > 300, '总时长应超过单次空闲阈值（证明未设总时长）')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

await t('外部 signal abort（dispose）→ 在途下载立即中止，不换上游', async () => {
  mode = 'stall'
  const dir = mkdtempSync(join(tmpdir(), 'dm-abort-'))
  try {
    const ac = new AbortController()
    setTimeout(() => ac.abort(new Error('dispose')), 80)
    const t0 = Date.now()
    assert.equal(await ensureModelFile(base(dir, { signal: ac.signal })), false) // 默认 120s 阈值，靠 signal 中止
    assert.ok(Date.now() - t0 < 2000, `abort 后应立即返回，实际 ${Date.now() - t0}ms`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

await t('ensureModelTree 逐文件同样受空闲看门狗约束', async () => {
  mode = 'stall'
  const dir = mkdtempSync(join(tmpdir(), 'dm-tree-idle-'))
  try {
    const t0 = Date.now()
    const ok = await ensureModelTree({
      repo: 'r', repoDir: dir, subdir: 'd', primaryHost: '', allowCustomHost: false, broadcast: () => {}, idleTimeoutMs: 150,
    })
    assert.equal(ok, false)
    assert.ok(Date.now() - t0 < 3000, `实际 ${Date.now() - t0}ms`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

console.log(`model-download-idle：${passed} 项通过，0 项失败`)
