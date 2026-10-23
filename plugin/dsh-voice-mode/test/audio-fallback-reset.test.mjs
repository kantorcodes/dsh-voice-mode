/**
 * I-4（client 部分）回归：decodeAudioData 失败的 <audio> 降级不再全页粘滞——
 * 单句失败仅一次性降级；连续 2 次才粘滞；enter/exit/SSE open 复位。源码布线锁。
 * 运行：node test/audio-fallback-reset.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'client.tsx'), 'utf8')
let n = 0
const ok = (c, m) => (assert.ok(c, m), n++)

ok(!/\n\s*fallback = true\n\s*playFallback\(\)/.test(src), '失败后仍无条件 fallback = true（粘滞）')
ok(/if \(\+\+decodeFailStreak >= 2\) fallback = true/.test(src), '缺连续 2 次才粘滞的判据')
ok(/const buf = await ctx!\.decodeAudioData\([^\n]*\n\s*decodeFailStreak = 0/.test(src), '解码成功未清零失败计数')
ok(/resetFallback\(\): void/.test(src) && /resetFallback\(\) \{\s*fallback = false\s*decodeFailStreak = 0/.test(src), '缺 resetFallback 实现')
const open = src.indexOf("source.addEventListener('open'")
ok(src.slice(open, open + 200).includes('engine.resetFallback()'), 'SSE open 未复位')
ok(/async enter\(sessionId\) \{\s*engine\.resetFallback\(\)/.test(src), 'enter 未复位')
ok(/async exit\(sessionId, keepAudio\?: boolean\) \{\s*engine\.resetFallback\(\)/.test(src), 'exit 未复位')
ok(src.includes('fallbackBusy'), '一次性降级期间缺并发守卫')
console.log(`audio-fallback-reset：${n} 项通过，0 项失败`)
