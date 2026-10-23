/**
 * I-12 回归：热重载/卸载回收 SSE——ctx.effect 清理函数清 ownerYieldTimer、end 全部 sseClients、清两张表。
 * 运行：node test/sse-teardown.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'index.ts'), 'utf8')
const i = src.indexOf('const latestConnByTab = new Map')
assert.ok(i >= 0, '缺 latestConnByTab')
const m = src.slice(i, i + 1600).match(/ctx\.effect\(\(\) => \(\) => \{([\s\S]*?)\n  \}\)/)
assert.ok(m, 'latestConnByTab 之后缺 SSE 回收 ctx.effect')
const body = m[1]
assert.ok(/clearTimeout\(ownerYieldTimer\)/.test(body), '未清 ownerYieldTimer')
assert.ok(/\.end\(\)/.test(body), '未 end 全部 sseClients')
assert.ok(/sseClients\.clear\(\)/.test(body), '未清 sseClients')
assert.ok(/latestConnByTab\.clear\(\)/.test(body), '未清 latestConnByTab')
assert.ok(body.indexOf('latestConnByTab.clear()') < body.indexOf('.end()'), '须先清表再 end（否则迟到 close 会武装让出计时）')
console.log('sse-teardown：6 项通过，0 项失败')
