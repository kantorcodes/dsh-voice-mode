/**
 * I-11 回归：SSE 背压——res.writableLength > 4MB 即 destroy() + 日志（源码布线锁）。
 * 运行：node test/sse-backpressure.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'index.ts'), 'utf8')
const i = src.indexOf('const send: SseSink = (event, payload) => {')
assert.ok(i >= 0, '缺 SSE send')
const win = src.slice(i, i + 900)
assert.ok(/res\.writableLength\s*>\s*SSE_MAX_BUFFERED/.test(win), 'send 未检查 res.writableLength 水位')
assert.ok(win.includes('res.destroy()'), '超水位未 destroy()')
assert.ok(win.includes('console.warn'), '超水位未记日志')
assert.ok(/SSE_MAX_BUFFERED\s*=\s*4\s*\*\s*1024\s*\*\s*1024/.test(src), '水位阈值应为 4MB')
console.log('sse-backpressure：4 项通过，0 项失败')
