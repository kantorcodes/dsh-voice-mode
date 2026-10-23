/**
 * B-3 回归：队列层空音频丢弃（0 字节 / 44 字节空 WAV）。
 * 运行：node test/tts-empty-audio.test.mjs
 *
 * 背景：Edge 引擎对「纯情绪标签句」返回 0 字节（零网络合成，见 tts-edge-escape）。
 *   若队列把 0 字节当成功帧下发，客户端会收到一段空音频（无声却占了一句的句号与字幕），
 *   播放链路出现「有帧无声」的空洞；更糟的是它会占掉 sentenceId（全局发号器）并把
 *   failStreak 清零——「朗读服务不可用」的连败提示因此被无声地洗掉。
 *   故队列层必须显式识别空音频并整句丢弃：不发帧、不占句号、不计失败、不 onSkip。
 *
 * 台架：esbuild 真编译 src/tts-queue.ts（msedge-tts 桩），配可控桩引擎
 *   （按文本返回 0 字节 / 44 字节空 WAV / 正常 MP3 / 抛错）。
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'dsh-vm-emptyaud-'))

const msedgeStub = join(tmp, 'msedge-stub.mjs')
writeFileSync(
  msedgeStub,
  `export const OUTPUT_FORMAT = { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3' }
export class MsEdgeTTS {}
export default { MsEdgeTTS, OUTPUT_FORMAT }
`,
)

const bundle = join(tmp, 'tts-queue.mjs')
await build({
  entryPoints: [join(here, '..', 'src', 'tts-queue.ts')],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'node',
  plugins: [
    { name: 'stub-msedge', setup(b) { b.onResolve({ filter: /^msedge-tts$/ }, () => ({ path: msedgeStub })) } },
  ],
  logLevel: 'silent',
})
const { TtsQueue } = await import(pathToFileURL(bundle).href)

let passed = 0
const failures = []
// 逐项收集失败（不首个即中止）：一次跑完能看到每个用例各自的判据表现
const t = async (name, fn) => {
  try {
    await fn()
    passed++
    console.log('  ✓ ' + name)
  } catch (e) {
    failures.push(name)
    console.log('  ✗ ' + name + ' —— ' + (e?.message ?? String(e)))
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (fn, timeoutMs = 8000) => {
  const t0 = Date.now()
  for (;;) {
    if (fn()) return true
    if (Date.now() - t0 > timeoutMs) return false
    await sleep(10)
  }
}

/** 44 字节空 WAV：RIFF/WAVE 头齐全，data 块 size=0（旧形态的空音频）。 */
const emptyWav44 = () => {
  const b = Buffer.alloc(44)
  b.write('RIFF', 0, 'latin1')
  b.writeUInt32LE(36, 4) // RIFF chunk size（= 36 + data size）
  b.write('WAVE', 8, 'latin1')
  b.write('fmt ', 12, 'latin1')
  b.writeUInt32LE(16, 16) // fmt 子块长度
  b.writeUInt16LE(1, 20) // PCM
  b.writeUInt16LE(1, 22) // 单声道
  b.writeUInt32LE(24000, 24) // 采样率
  b.writeUInt32LE(48000, 28) // 字节率
  b.writeUInt16LE(2, 32) // 块对齐
  b.writeUInt16LE(16, 34) // 位深
  b.write('data', 36, 'latin1')
  b.writeUInt32LE(0, 40) // data 长度 = 0 → 空
  return b
}

/** 可控桩引擎：按文本返回不同结果（Buffer = 正常音频；抛错 = 合成失败）。 */
const makeEngine = (map) => ({
  mime: 'audio/mpeg',
  calls: [],
  updateVoice() {},
  async synthesize(text) {
    this.calls.push(text)
    const r = map[text]
    if (typeof r === 'function') return r()
    if (r instanceof Error) throw r
    return r
  },
  async close() {},
})

const MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00])

console.log('B-3：队列层空音频丢弃')

await t('(1) 0 字节空音频 → 不下发帧、不触发 onSkip、队列仍发 onIdle', async () => {
  const frames = []
  const skipped = []
  const idles = []
  const engine = makeEngine({ '空句': Buffer.alloc(0) })
  const q = new TtsQueue({
    engine,
    onSkip: (sid, text, streak) => skipped.push({ sid, text, streak }),
    onIdle: (sid) => idles.push(sid),
  })
  q.subscribe((f) => frames.push(f))
  q.enqueue('s1', '空句')
  assert.ok(await waitFor(() => idles.length === 1), '队列排空后必须发 onIdle（否则「说完就关」永不收尾）')
  assert.equal(frames.length, 0, '空音频不得下发帧（客户端会拿到一段无声的「成功句」）')
  assert.deepEqual(skipped, [], '空音频不得触发 onSkip——它不是合成失败，跳过提示会误导用户')
  assert.deepEqual(engine.calls, ['空句'], '前置条件：桩引擎确实被调用过')
  await q.close()
})

await t('(2) 44 字节空 WAV（RIFF + data size=0）→ 同样整句丢弃', async () => {
  const frames = []
  const skipped = []
  const idles = []
  const engine = makeEngine({ '空句': emptyWav44() })
  const q = new TtsQueue({
    engine,
    onSkip: (sid, text, streak) => skipped.push({ sid, text, streak }),
    onIdle: (sid) => idles.push(sid),
  })
  q.subscribe((f) => frames.push(f))
  q.enqueue('s1', '空句')
  assert.ok(await waitFor(() => idles.length === 1), '队列排空后必须发 onIdle')
  assert.equal(frames.length, 0, '44 字节空 WAV 不得下发帧')
  assert.deepEqual(skipped, [], '44 字节空 WAV 不得触发 onSkip')
  await q.close()
})

await t('(3) 空音频不消耗 sentenceId → 随后的正常句仍拿 sentenceId=0', async () => {
  const frames = []
  const idles = []
  const engine = makeEngine({ '空句': Buffer.alloc(0), '正常句': MP3 })
  const q = new TtsQueue({ engine, onIdle: (sid) => idles.push(sid) })
  q.subscribe((f) => frames.push(f))
  q.enqueue('s1', '空句')
  q.enqueue('s1', '正常句')
  assert.ok(await waitFor(() => idles.length === 1), '队列排空后必须发 onIdle')
  assert.equal(frames.length, 2, '只应有正常句的 data + final 两帧')
  assert.equal(frames[0].sentenceId, 0, '空音频占掉了句号——句号是全局发号器，占掉即出现空洞')
  assert.equal(frames[1].sentenceId, 0, 'final 帧与 data 帧同句号')
  await q.close()
})

await t('(4) 空音频不计失败 → 随后的失败句连败计数仍是 1', async () => {
  const skipped = []
  const idles = []
  const engine = makeEngine({
    '空句': Buffer.alloc(0),
    '坏句': new Error('ETIMEDOUT (stub)'),
  })
  const q = new TtsQueue({
    engine,
    onSkip: (sid, text, streak) => skipped.push({ sid, text, streak }),
    onIdle: (sid) => idles.push(sid),
  })
  q.enqueue('s1', '空句')
  q.enqueue('s1', '坏句')
  assert.ok(await waitFor(() => skipped.length === 1, 15000), '失败句耗尽重试后必须跳过')
  assert.equal(skipped[0].streak, 1, '空音频不得被计为一次失败（连败计数应从 1 起）')
  assert.equal(skipped[0].text, '坏句')
  await q.close()
})

rmSync(tmp, { recursive: true, force: true })
console.log(`\ntts-empty-audio：${passed} 项通过，${failures.length} 项失败`)
if (failures.length > 0) process.exitCode = 1
