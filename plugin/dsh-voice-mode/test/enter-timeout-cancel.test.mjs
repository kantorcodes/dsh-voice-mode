/**
 * I-7（client 部分）回归：enter/exit/config 带超时；enter 失败补发 toggle off；
 * pending 状态再次点击可取消（不再被静默吞）。源码布线锁。
 * 运行：node test/enter-timeout-cancel.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'client.tsx'), 'utf8')
let n = 0
const ok = (c, m) => (assert.ok(c, m), n++)

ok(/const TOGGLE_TIMEOUT_MS = [678]000/.test(src), '超时常量应为 6–8s')
const enterIdx = src.indexOf('async enter(sessionId)')
const exitIdx = src.indexOf('async exit(sessionId')
ok(src.slice(enterIdx, exitIdx).includes('AbortSignal.timeout(TOGGLE_TIMEOUT_MS)'), 'bus.enter 缺超时')
const enterBody = src.slice(enterIdx, exitIdx)
const catchIdx = enterBody.lastIndexOf('} catch {')
ok(enterBody.slice(catchIdx).includes('on: false'), 'enter 失败 catch 未补发 toggle off')
ok(src.slice(exitIdx, exitIdx + 3500).includes('AbortSignal.timeout(TOGGLE_TIMEOUT_MS)'), 'bus.exit 缺超时')
ok(/\/config`, \{ signal: AbortSignal\.timeout\(TOGGLE_TIMEOUT_MS\)/.test(src), 'fetchConfig 缺超时')
// pending 可取消
ok(src.includes('const cancelPending = ()'), '缺 cancelPending')
ok(/localRef\.current === 'pending'\) cancelPending\(\)/.test(src), 'toggle() 的 pending 分支未取消')
ok(/localRef\.current === 'pending'\) \{\s*cancelPending\(\)/.test(src), 'hold 短按的 pending 分支未取消')
ok(src.includes('enterEpochRef.current !== myEnter'), 'enterMode 未按纪元判断被取消')
console.log(`enter-timeout-cancel：${n} 项通过，0 项失败`)
