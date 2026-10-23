/**
 * B-4 行为锁：hold 取消后上传水位必须复位（否则下一句整句无输出或丢句首）。
 * 运行：node test/hold-cancel-watermark.test.mjs
 *
 * 背景（2026-10-23 P0 复审 B-4）：endHeld(cancel=true) 清了 segment / 段纪元，却漏了
 * uploadedSamples = 0（对照 beginHeld 的同口径重置）——下一句的增量上传从**陈旧水位**起算：
 *   - 下一句短于水位 → 整句永不上行（定稿拿到空包 → 界面永远没反应）；
 *   - 下一句长于水位 → 句首一段永远不上行（定稿缺句首字）。
 *
 * 台架约定（复用 wake-flow 台架：mode toggle、wakeWord 空、isPlaying 可控）：
 *   - 时钟：Date.now / performance.now 走可控 NOW，每帧推进 64ms。
 *   - 帧：1024 样本 @16k，常数幅度——0.06 = 频段甲（转写「甲」）、0.12 = 频段乙（转写「乙」）、
 *     <0.015 = 静音（不产字）。
 *   - host：按 epoch 累积音频（缺口补静音保块边界），每 200ms 一块产一个字（块均值定频段）；
 *     final 请求立即返回（整条 epoch 流的转写）。
 *
 * 不变量：本测试只读 src/，不改任何源码。
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'dsh-vm-holdcancel-'))

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
class FakeAudioContext {
  constructor() {
    this.sampleRate = SR
    this.destination = {}
    this.audioWorklet = { addModule: async () => {} }
  }
  createMediaStreamSource() {
    return { connect() {} }
  }
  createScriptProcessor() {
    return { connect() {}, disconnect() {}, onaudioprocess: null }
  }
  async resume() {}
  async close() {}
}
const fakeTrack = { getSettings: () => ({ echoCancellation: true }), stop() {} }
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
const hostLog = { partials: 0, finals: 0, resets: 0 }

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
  if (p.get('vadOnly') === '1') return new Response(JSON.stringify({ isSpeech: false }), { status: 200 })
  const raw = init.body ? new Float32Array(init.body) : new Float32Array(0)
  if (final) {
    hostLog.finals++
    const st = feed(epoch, offset, raw)
    return new Response(JSON.stringify({ text: streamText(st) }), { status: 200 })
  }
  hostLog.partials++
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

function makeEngine() {
  streams.clear()
  hostLog.partials = 0
  hostLog.finals = 0
  hostLog.resets = 0
  const ctl = { playing: true }
  const segments = []
  const engine = createAsrEngine(
    {
      silenceMs: 1500,
      basePath: '/voice-mode',
      mode: 'toggle',
      bargeInMode: 'auto',
      wakeWord: '',
      isPlaying: () => ctl.playing,
    },
    'sess-holdcancel',
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

// ---------------------------------------------------------------- ① 取消后下一句短于陈旧水位
console.log('① hold 取消后下一句（短于陈旧水位）：必须产出定稿')

await t('取消 hold 段后说 600ms → 恰好 1 条定稿且含预期字', async () => {
  const h = makeEngine()
  await h.engine.start()
  h.ctl.playing = true
  h.engine.beginHeld()
  await say(AMP_A, 1300) // hold 段：1300ms（水位推到这个水位）
  h.engine.endHeld(true) // 取消：段作废，但上传水位必须复位
  h.ctl.playing = false
  await say(AMP_A, 600) // 下一句 600ms（短于陈旧水位）
  await say(SIL_AMP, 1600) // 静音到点 → 定稿
  await settle(30)
  assert.equal(
    h.segments.length,
    1,
    `应产出 1 条定稿（实际 ${h.segments.length} 条：${JSON.stringify(h.segments)}）——取消后上传水位未复位，整句永不上行`,
  )
  assert.ok(
    h.segments[0].includes(CHAR_A),
    `定稿应含下一句的字（实际 "${h.segments[0]}"）`,
  )
  await h.engine.stop()
})

// ---------------------------------------------------------------- ② 取消后下一句长于陈旧水位：不得丢句首
console.log('② hold 取消后下一句（长于陈旧水位）：不得丢句首')

await t('取消 hold 段后说 3000ms → 定稿必须含句首字', async () => {
  const h = makeEngine()
  await h.engine.start()
  h.ctl.playing = true
  h.engine.beginHeld()
  await say(AMP_A, 1300) // hold 段：1300ms
  h.engine.endHeld(true) // 取消
  h.ctl.playing = false
  await say(AMP_B, 600) // 下一句句首 600ms（频段乙，可与句身区分）
  await say(AMP_A, 2400) // 句身 2400ms
  await say(SIL_AMP, 1600) // 静音到点 → 定稿
  await settle(30)
  assert.equal(
    h.segments.length,
    1,
    `应产出 1 条定稿（实际 ${h.segments.length} 条：${JSON.stringify(h.segments)}）`,
  )
  assert.ok(
    h.segments[0].startsWith(CHAR_B),
    `定稿必须含句首字（实际 "${h.segments[0]}"）——取消后上传水位未复位，句首一段永远不上行`,
  )
  await h.engine.stop()
})

// ---------------------------------------------------------------- ③ 取消段本身不得 emit
console.log('③ 被取消的 hold 段：不得 emit，且不得发 final 请求')

await t('取消的 hold 段 → 0 条定稿且 0 次 final 请求', async () => {
  const h = makeEngine()
  await h.engine.start()
  h.ctl.playing = true
  const finalsBefore = hostLog.finals
  h.engine.beginHeld()
  await say(AMP_A, 1300)
  h.engine.endHeld(true) // 取消
  await settle(30)
  assert.equal(h.segments.length, 0, `被取消的段不得 emit（实际 ${JSON.stringify(h.segments)}）`)
  assert.equal(hostLog.finals, finalsBefore, `被取消的段不得发 final 请求（实际 ${hostLog.finals - finalsBefore} 次）`)
  await h.engine.stop()
})

rmSync(tmp, { recursive: true, force: true })
console.log(`\nhold-cancel-watermark：${passed} 项通过`)
