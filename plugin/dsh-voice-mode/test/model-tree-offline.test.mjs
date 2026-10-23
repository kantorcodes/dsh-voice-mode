/**
 * I-3 回归：Kokoro 离线可用。运行：node test/model-tree-offline.test.mjs
 *
 * 旧 ensureModelTree 每次先 GET HF 列举 API，离线/镜像抖动即返回 false，
 * 187MB 完整缓存形同虚设（barge-in 杀子进程后每次冷启动都重跑）。
 * 现要求：本地清单 .model-tree.json + 逐文件 stat 完整 → 0 网络；无清单用哨兵+文件数兜底；清单在整树成功后才写。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureModelTree } from '../src/models.ts'

const FILES = ['d/a', 'd/b', 'd/sub/c']
let online = true
const calls = []
globalThis.fetch = async (url) => {
  const u = String(url)
  calls.push(u)
  if (!online) throw new TypeError('fetch failed')
  if (u.includes('/api/models/')) {
    return { url: u, status: 200, ok: true, headers: { get: () => null }, json: async () => ({ siblings: FILES.map((rfilename) => ({ rfilename })) }), body: null }
  }
  return { url: u, status: 200, headers: { get: () => null }, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(10)); c.close() } }) }
}

let passed = 0
const t = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`) }
const opts = (dir, extra = {}) => ({ repo: 'r', repoDir: dir, subdir: 'd', primaryHost: '', allowCustomHost: false, broadcast: () => {}, ...extra })

await t('整树成功后写清单；之后离线 + 完整 → true 且 0 网络', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-tree-'))
  try {
    online = true
    assert.equal(await ensureModelTree(opts(dir)), true)
    assert.ok(existsSync(join(dir, 'd', '.model-tree.json')), '成功后应写清单')
    online = false
    calls.length = 0
    assert.equal(await ensureModelTree(opts(dir)), true, '离线 + 清单完整应成功')
    assert.equal(calls.length, 0, '本地完整时 0 网络')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

await t('清单存在但文件缺失/大小不符 → 不信本地，回退联网补全', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-tree-'))
  try {
    online = true
    await ensureModelTree(opts(dir))
    rmSync(join(dir, 'd', 'sub', 'c'))
    calls.length = 0
    assert.equal(await ensureModelTree(opts(dir)), true)
    assert.ok(calls.length > 0, '缺文件必须联网补')
    assert.ok(existsSync(join(dir, 'd', 'sub', 'c')))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

await t('失败的整树不写清单', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-tree-'))
  try {
    online = false
    assert.equal(await ensureModelTree(opts(dir)), false)
    assert.ok(!existsSync(join(dir, 'd', '.model-tree.json')))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

await t('无清单（旧缓存）：哨兵存在 + 文件数达标 → 离线 true；不达标 → 不兜底', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-tree-'))
  try {
    mkdirSync(join(dir, 'd'), { recursive: true })
    for (const f of ['phontab', 'x1', 'x2']) writeFileSync(join(dir, 'd', f), 'data')
    online = false
    calls.length = 0
    assert.equal(await ensureModelTree(opts(dir, { sentinel: 'd/phontab', minFiles: 3 })), true)
    assert.equal(calls.length, 0)
    assert.equal(await ensureModelTree(opts(dir, { sentinel: 'd/phontab', minFiles: 4 })), false, '文件数不足不得兜底')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

console.log(`model-tree-offline：${passed} 项通过，0 项失败`)
