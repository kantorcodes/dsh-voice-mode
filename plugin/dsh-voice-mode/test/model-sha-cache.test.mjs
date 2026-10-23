/**
 * I-10 回归：SHA256 校验结果按 size+ino+ctime 缓存。运行：node test/model-sha-cache.test.mjs
 *
 * 每次 barge-in 杀子进程后 ensureReady 重走 ensureModelFile，239MB 全量哈希在 host 主线程分块执行
 * 0.6–1.6s。现要求：文件未动且曾校验通过 → 不再重算；但缓存不得削弱 SHA 钉死——
 * 「改内容再回填 mtime」（utimes / cp -p / 解压的形态）必须被识别为改动（ctime 无法回填）。
 * 改 size 同样必须重算并判损坏（fetch 桩 404 无法重下 → false）。
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureModelFile } from '../src/models.ts'

globalThis.fetch = async (url) => ({ url: String(url), status: 404, headers: { get: () => null }, body: null })
const DATA = Buffer.alloc(1000, 7)
const SHA = createHash('sha256').update(DATA).digest('hex')
const o = (dir) => ({ repo: 'r', repoDir: dir, spec: { file: 'a.bin', sha256: SHA }, primaryHost: '', allowCustomHost: false, broadcast: () => {} })

const dir = mkdtempSync(join(tmpdir(), 'dm-shac-'))
const p = join(dir, 'a.bin')
let passed = 0
try {
  writeFileSync(p, DATA)
  utimesSync(p, 1_700_000_000, 1_700_000_000) // 整秒 mtime，避开亚毫秒精度差
  assert.equal(await ensureModelFile(o(dir)), true)
  passed++
  // 文件未动：再次调用仍 true（走缓存）
  assert.equal(await ensureModelFile(o(dir)), true)
  passed++
  // 同 size、内容不同、mtime 回填原值：ctime 已变 → 缓存失效，重算判损坏
  writeFileSync(p, Buffer.alloc(1000, 9))
  utimesSync(p, 1_700_000_000, 1_700_000_000)
  assert.equal(await ensureModelFile(o(dir)), false, '回填 mtime 的篡改不得命中缓存')
  passed++
  // size 变化 → 缓存失效，重算判损坏（404 无法重下 → false）
  writeFileSync(p, Buffer.alloc(999, 9))
  assert.equal(await ensureModelFile(o(dir)), false, 'size 变化必须重新校验')
  passed++
} finally { rmSync(dir, { recursive: true, force: true }) }
console.log(`model-sha-cache：${passed} 项通过，0 项失败`)
