/**
 * B-3 回归：Edge TTS 文本必须转义 + 情绪标签必须剥离（防「整句不读」）。
 * 运行：node test/tts-edge-escape.test.mjs
 *
 * 根因：msedge-tts 的 _SSMLTemplate 把文本**原样插值**进 SSML（lib/msedge-tts.cjs
 *   的 _SSMLTemplate 直接 `${input}`），不做任何实体转义。文本含 & 或 < 时 SSML
 *   非良构 → 上游「Stream closed before...」→ 队列重试 3 次耗尽 → tts-skip
 *   （用户听到「跳过一句」，连败时甚至「朗读服务不可用」——整句不读）。
 *   情绪标签（<laugh>/<sigh>/<emphasis>/<break N ms>/<whisper>）同样含 < → 同一触发链。
 *   注：裸 > 是良构 XML，不属于触发字符（仍按 XML 规范转义，无副作用）。
 *
 * 台架：esbuild 真编译 src/tts-queue.ts，用桩替换 msedge-tts，截获 toStream 的入参
 *   ——该入参正是 SSML 模板里被原样插值的那段文本，故断言它即等价于断言 SSML 内容。
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'dsh-vm-edgeesc-'))

// msedge-tts 桩：记录 toStream 入参；回最小合法 MP3 头（0xff 同步字——isValidMp3 要求）。
const msedgeStub = join(tmp, 'msedge-stub.mjs')
writeFileSync(
  msedgeStub,
  `export const OUTPUT_FORMAT = { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3' }
globalThis.__edgeToStream = globalThis.__edgeToStream || []
export class MsEdgeTTS {
  async setMetadata() {}
  toStream(input, options) {
    globalThis.__edgeToStream.push({ input, options })
    return { audioStream: (async function* () { yield Buffer.from([0xff, 0xfb, 0x90, 0x00]) })() }
  }
  async close() {}
}
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
const { EdgeTtsEngine } = await import(pathToFileURL(bundle).href)

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

/** 最近一次 toStream 的入参（即 SSML 里被插值的那段文本）。 */
const lastInput = () => {
  const calls = globalThis.__edgeToStream ?? []
  assert.ok(calls.length > 0, 'toStream 未被调用')
  return calls[calls.length - 1].input
}

console.log('B-3：Edge 引擎的 XML 实体转义 + 情绪标签剥离')

await t('(1) 文本含 & → 入参必须转义成 &amp;（裸 & 会让 SSML 非良构 → 整句不读）', async () => {
  const eng = new EdgeTtsEngine()
  await eng.synthesize('聊聊 R&D 与 AT&T。')
  const input = lastInput()
  assert.ok(input.includes('R&amp;D'), `入参应含 R&amp;D，实际：${JSON.stringify(input)}`)
  assert.ok(input.includes('AT&amp;T'), `入参应含 AT&amp;T，实际：${JSON.stringify(input)}`)
  assert.ok(!input.includes('R&D'), '入参仍残留裸 & ——SSML 非良构，上游断流后重试耗尽 → tts-skip')
})

await t('(2) 文本含 < > → 入参必须转义成 &lt; &gt;', async () => {
  const eng = new EdgeTtsEngine()
  await eng.synthesize('比较 a<b>c。')
  const input = lastInput()
  assert.ok(input.includes('a&lt;b&gt;c'), `入参应含 a&lt;b&gt;c，实际：${JSON.stringify(input)}`)
  assert.ok(!input.includes('a<b>c'), '入参仍残留裸 < ——SSML 非良构，上游断流后重试耗尽 → tts-skip')
})

await t('(3) 情绪标签被剥离（不进 SSML），正文保留', async () => {
  const eng = new EdgeTtsEngine()
  await eng.synthesize('<laugh>大笑<sigh>')
  const input = lastInput()
  assert.ok(!input.includes('<laugh>'), `入参不得含 <laugh>，实际：${JSON.stringify(input)}`)
  assert.ok(!input.includes('<sigh>'), `入参不得含 <sigh>，实际：${JSON.stringify(input)}`)
  assert.ok(input.includes('大笑'), `入参应保留正文「大笑」，实际：${JSON.stringify(input)}`)
})

await t('(4) 纯标签句 → toStream 调用 0 次、返回 0 字节（零网络合成）', async () => {
  const before = (globalThis.__edgeToStream ?? []).length
  const eng = new EdgeTtsEngine()
  const buf = await eng.synthesize('<laugh>')
  assert.equal(
    (globalThis.__edgeToStream ?? []).length,
    before,
    '纯标签句仍发起了网络合成——上游拿到空 SSML 正文，代价是一次无谓的连接与失败重试',
  )
  assert.equal(buf.length, 0, '纯标签句应返回 0 字节（由队列层按空音频丢弃）')
})

await t('(5) 普通句 → 入参逐字节不变（防回归：不得过度转义/改写正文）', async () => {
  const eng = new EdgeTtsEngine()
  await eng.synthesize('你好，世界。')
  assert.equal(lastInput(), '你好，世界。', '普通句的入参必须与原文逐字节一致')
})

rmSync(tmp, { recursive: true, force: true })
console.log(`\ntts-edge-escape：${passed} 项通过，${failures.length} 项失败`)
if (failures.length > 0) process.exitCode = 1
