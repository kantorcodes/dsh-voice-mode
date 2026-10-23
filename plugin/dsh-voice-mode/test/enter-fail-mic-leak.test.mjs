/**
 * I-6 行为锁：enter 失败（getUserMedia 成功后异常）不得泄露麦克风。
 * 运行：node test/enter-fail-mic-leak.test.mjs
 *
 * 根因：startRecorder 取流后无 try/catch，AudioContext 构造/createMediaStreamSource 抛错时
 * 流与 ctx 无人释放；client 侧 engine.stop() 因 !wasActive 早退兜不住。
 * 不变量：本测试只读 src/，不改任何源码。
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'dsh-vm-p1asr-'))

// ---------------------------------------------------------------- 可控时钟
let NOW = 1_000_000
Date.now = () => NOW
globalThis.performance = { now: () => NOW }

// ---------------------------------------------------------------- 浏览器 API mock
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
globalThis.location = { origin: 'http://127.0.0.1:3018' }

const SR = 16000
const FRAME = 1024 // 64ms
const SIL_AMP = 0.0005 // 静音（低于门限，不产字）
const AMP_A = 0.06 // 频段甲
const AMP_B = 0.12 // 频段乙
const CHAR_A = '甲'
const CHAR_B = '乙'

let capturedNode = null
class FakeAudioWorkletNode {
  constructor(ctx) {
    if (!ctx) throw new TypeError('AudioWorkletNode: null AudioContext')
    this.port = { onmessage: null }
    capturedNode = this
  }
  connect() {}
  disconnect() {}
}
const rig = { acThrows: false, srcThrows: false, trackStops: 0, ctxCloses: 0 }
class FakeAudioContext {
  constructor() {
    if (rig.acThrows) throw new Error('AudioContext ctor boom')
    this.sampleRate = SR
    this.destination = {}
    this.audioWorklet = { addModule: async () => {} }
  }
  createMediaStreamSource() {
    if (rig.srcThrows) throw new Error('createMediaStreamSource boom')
    return { connect() {} }
  }
  createScriptProcessor() {
    return { connect() {}, disconnect() {}, onaudioprocess: null }
  }
  async resume() {}
  async close() { rig.ctxCloses++ }
}
const fakeTrack = { getSettings: () => ({ echoCancellation: true }), stop() { rig.trackStops++ } }
const fakeStream = { getAudioTracks: () => [fakeTrack], getTracks: () => [fakeTrack] }
globalThis.AudioContext = FakeAudioContext
globalThis.window = { AudioContext: FakeAudioContext }
Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: { getUserMedia: async () => fakeStream } },
  configurable: true,
  writable: true,
})
globalThis.AudioWorkletNode = FakeAudioWorkletNode

// ---------------------------------------------------------------- 假 host（按 epoch 累积）
const BLOCK = Math.round((SR * 200) / 1000) // 200ms 一块，一块产一个字
const streams = new Map() // epoch -> { fed, blocks }
const hostLog = { partials: 0, finals: 0, resets: 0, details: 0 }
const hostCtl = { p202: false, speech: false, reqs: [] }
// 5s 重试间隔压成 0（测试不真等）
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms >= 5000 ? 0 : ms, ...a)

/** 把样本并入 epoch 流的块统计（绝对位置 → 块号；缺口补静音保块边界稳定）。 */
const appendBlock = (st, absStart, samples) => {
  for (let i = 0; i < samples.length; i++) {
    const bi = Math.floor((absStart + i) / BLOCK)
    let b = st.blocks.get(bi)
    if (!b) {
      b = { sum: 0, n: 0 }
      st.blocks.set(bi, b)
    }
    b.sum += Math.abs(samples[i])
    b.n++
  }
}

const feed = (epoch, offset, samples) => {
  let st = streams.get(epoch)
  if (!st) {
    st = { fed: 0, blocks: new Map() }
    streams.set(epoch, st)
  }
  if (samples.length === 0) return st
  const end = offset + samples.length
  if (end > st.fed) {
    const gap = Math.max(0, offset - st.fed)
    if (gap > 0) appendBlock(st, st.fed, new Float32Array(gap)) // 缺口补静音
    const skip = Math.max(0, st.fed - offset)
    if (skip < samples.length) appendBlock(st, offset + skip, samples.subarray(skip))
    st.fed = end
  }
  return st
}

/** 整条 epoch 流的转写：逐块按均值定频段（静音块不产字）。 */
const streamText = (st) => {
  if (!st) return ''
  const idx = [...st.blocks.keys()].sort((a, b) => a - b)
  let out = ''
  for (const bi of idx) {
    const b = st.blocks.get(bi)
    const mean = b.sum / Math.max(1, b.n)
    if (mean < 0.015) continue
    out += mean >= 0.09 ? CHAR_B : CHAR_A
  }
  return out
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url))
  const p = u.searchParams
  const epoch = Number(p.get('epoch') ?? 0)
  const offset = Number(p.get('offset') ?? 0)
  const final = p.get('final') === '1'
  if (p.get('reset') === '1') {
    hostLog.resets++
    streams.clear()
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  if (p.get('vadOnly') === '1') {
    hostLog.details++
    return new Response(JSON.stringify({ isSpeech: hostCtl.speech }), { status: 200 })
  }
  const raw = init.body ? new Float32Array(init.body) : new Float32Array(0)
  if (final) {
    hostLog.finals++
    const st = feed(epoch, offset, raw)
    return new Response(JSON.stringify({ text: streamText(st) }), { status: 200 })
  }
  hostLog.partials++
  if (hostCtl.p202) {
    hostCtl.reqs.push({ offset, status: 202 })
    return new Response('{}', { status: 202 })
  }
  hostCtl.reqs.push({ offset, status: 200 })
  const st = feed(epoch, offset, raw)
  return new Response(JSON.stringify({ text: streamText(st), endpoint: false }), { status: 200 })
}

// ---------------------------------------------------------------- bundle 真引擎
const sherpaStub = join(tmp, 'sherpa-stub.mjs')
writeFileSync(sherpaStub, `export function createOnlineRecognizer(){return {}}\nexport function createVad(){return {}}\nexport default {}\n`)
const modelsStub = join(tmp, 'models-stub.mjs')
writeFileSync(
  modelsStub,
  `export const HOST_PRIMARY='https://huggingface.co'\nexport function validateModelHost(h){return h||HOST_PRIMARY}\nexport async function ensureModelFile(){return true}\nexport async function ensureModelTree(){return true}\n`,
)
const bundle = join(tmp, 'asr.bundle.mjs')
await build({
  entryPoints: [join(here, '..', 'src', 'asr.ts')],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  external: ['sherpa-onnx'],
  define: { __AUDIO_WORKLET__: JSON.stringify('/* noop worklet */') },
  plugins: [
    { name: 'stub-models', setup(b) { b.onResolve({ filter: /\.\.?\/models\.ts$/ }, () => ({ path: modelsStub })) } },
  ],
  logLevel: 'silent',
})
const { createAsrEngine } = await import(pathToFileURL(bundle).href)

// ---------------------------------------------------------------- 驱动辅助
const tick = () => new Promise((r) => setImmediate(r))
/** 让引擎异步链（fetch → 校验 → 发射）跑完。 */
const settle = async (n = 20) => {
  for (let i = 0; i < n; i++) await tick()
}
const msToFrames = (ms) => Math.max(1, Math.round(ms / ((FRAME / SR) * 1000)))

async function frame(amp) {
  NOW += (FRAME / SR) * 1000
  capturedNode.port.onmessage({ data: new Float32Array(FRAME).fill(amp) })
  await tick()
}
async function say(amp, ms) {
  for (let i = 0; i < msToFrames(ms); i++) await frame(amp)
}

function makeEngine(extra = {}) {
  streams.clear()
  hostLog.partials = 0
  hostLog.finals = 0
  hostLog.resets = 0
  hostLog.details = 0
  hostCtl.p202 = false
  hostCtl.speech = false
  hostCtl.reqs = []
  const ctl = { playing: false, raw: false }
  const segments = []
  const engine = createAsrEngine(
    {
      silenceMs: 1500,
      basePath: '/voice-mode',
      mode: 'toggle',
      bargeInMode: 'auto',
      wakeWord: '',
      isPlaying: () => ctl.playing,
      ...(extra)(ctl),
    },
    'sess-p1asr',
  )
  engine.onSegment((t) => segments.push(t))
  return { engine, segments, ctl }
}

let passed = 0
const t = async (name, fn) => {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const mk = () => makeEngine(() => ({}))

console.log('① enter 失败（取流成功后异常）：必须释放麦克风')

await t('AudioContext 构造抛 → start 重抛且 track 全部 stop', async () => {
  const h = mk()
  rig.trackStops = 0
  rig.acThrows = true
  let err = null
  try { await h.engine.start() } catch (e) { err = e }
  rig.acThrows = false
  assert.ok(err, 'start 应重抛')
  assert.ok(rig.trackStops >= 1, `取流后 AudioContext 构造抛，麦克风 track 必须 stop（实际 stop 计数 ${rig.trackStops}）`)
  assert.equal(h.engine.state, 'idle')
})

await t('createMediaStreamSource 抛 → track stop 且 ctx 关闭', async () => {
  const h = mk()
  rig.trackStops = 0
  rig.ctxCloses = 0
  rig.srcThrows = true
  let err = null
  try { await h.engine.start() } catch (e) { err = e }
  rig.srcThrows = false
  assert.ok(err, 'start 应重抛')
  assert.ok(rig.trackStops >= 1, `track 必须 stop（实际 ${rig.trackStops}）`)
  assert.ok(rig.ctxCloses >= 1, `已建的 AudioContext 必须 close（实际 ${rig.ctxCloses}）`)
})

console.log('② 对照：失败后可重新 start 正常收音')

await t('失败后再 start 成功，stop 正常停 track', async () => {
  const h = mk()
  rig.acThrows = true
  await h.engine.start().catch(() => {})
  rig.acThrows = false
  rig.trackStops = 0
  await h.engine.start()
  await h.engine.stop()
  assert.ok(rig.trackStops >= 1)
})

rmSync(tmp, { recursive: true, force: true })
console.log(`\nenter-fail-mic-leak：${passed} 项通过，0 项失败`)
