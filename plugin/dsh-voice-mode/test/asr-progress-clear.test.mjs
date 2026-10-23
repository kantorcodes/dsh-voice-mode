/**
 * I-13 回归：asr-host modelStatus().progress 在下载结束（成功/失败）后必须清空。
 * 运行：node test/asr-progress-clear.test.mjs
 *
 * 旧实现 lastProgress 只写不清：设置面板「下载中 x%」分支先于失败闩锁渲染，
 * 下载失败后仍永久显示进度，遮蔽失败态。台架同 asr-host-rebuild（sherpa/models 桩）。
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'dsh-vm-prog-'))
const sherpaStub = join(tmp, 'sherpa-stub.mjs')
writeFileSync(sherpaStub, `
const stream = { acceptWaveform() {}, clear() {}, free() {} }
export function createOnlineRecognizer() {
  return { createStream: () => stream, isReady: () => false, decode() {}, getResult: () => ({ text: '' }), free() {}, config: { featConfig: { sampleRate: 16000 } } }
}
export function createVad() { return { acceptWaveform() {}, isDetected: () => false, isEmpty: () => true, front: () => ({ samples: new Float32Array(0), start: 0 }), pop() {}, clear() {}, free() {} } }
export default { createOnlineRecognizer, createVad }
`)
const modelsStub = join(tmp, 'models-stub.mjs')
writeFileSync(modelsStub, `
export const HOST_PRIMARY = 'https://huggingface.co'
export function validateModelHost(h) { return h || HOST_PRIMARY }
export async function ensureModelFile(o) {
  o.broadcast('asr-progress', { file: o.spec.file, percent: 40 })
  globalThis.__during = globalThis.__rt.modelStatus().progress
  return globalThis.__ok
}
export async function ensureModelTree() { return true }
`)
const out = join(tmp, 'asr-host.mjs')
await build({
  entryPoints: [join(here, '..', 'src', 'asr-host.ts')], outfile: out, bundle: true, format: 'esm', platform: 'node',
  alias: { 'sherpa-onnx': sherpaStub },
  plugins: [{ name: 'm', setup(b) { b.onResolve({ filter: /\.\.?\/models\.ts$/ }, () => ({ path: modelsStub })) } }],
  logLevel: 'silent',
})
const { createAsrRuntime } = await import(pathToFileURL(out).href)

let passed = 0
for (const ok of [false, true]) {
  globalThis.__ok = ok
  const rt = createAsrRuntime({
    cacheDir: tmp, modelHost: () => 'huggingface.co', senseVoice: () => false, silenceMs: () => 1500,
    senseITN: () => true, allowCustomHost: false, broadcast: () => {}, bargeInMode: () => 'auto',
  })
  globalThis.__rt = rt
  globalThis.__during = null
  await rt.feed('s', new Float32Array(1600), false, 0, 0, true)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(globalThis.__during, '下载期间应有进度（对照：证明桩真的触发了 asr-progress）')
  assert.equal(rt.modelStatus().progress, null, `下载${ok ? '成功' : '失败'}后 progress 必须清空`)
  rt.dispose()
  passed++
}
rmSync(tmp, { recursive: true, force: true })
console.log(`asr-progress-clear：${passed} 项通过，0 项失败`)
