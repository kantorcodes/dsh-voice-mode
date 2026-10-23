/**
 * I-8 回归：纠错护栏——长度门后的归一化相似度 ≥0.45 + 前言正则补形态。
 * 运行：node test/llm-correct-similarity.test.mjs
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const { correctText } = await import(pathToFileURL(join(here, '..', 'src', 'llm-correct.ts')).href)

const ctxWith = (out) => ({
  get: (name) =>
    name === 'llm'
      ? { stream: () => ({ async *[Symbol.asyncIterator]() { yield { type: 'text-delta', text: out } } }) }
      : name === 'agentDefaultModel'
        ? { currentSelection: () => ({ provider: 'p', model: 'm' }) }
        : undefined,
})
let passed = 0
const t = async (name, input, out, expectKept) => {
  const r = await correctText(ctxWith(out), input, 'zh')
  assert.equal(r, expectKept ? out : input, name)
  passed++
}

// 等长作答：长度门够不到，相似度拦
await t('作答被拦', '现在几点', '下午三点整', false)
await t('作答被拦 en', 'what time is it', 'It is three pm.', false)
// 合法纠错放行
await t('同音字纠错放行', '今天天汽不错', '今天天气不错。', true)
await t('en 纠错放行', 'i went to the stor yesterday', 'I went to the store yesterday.', true)
// 前言正则新形态（相似度高，只有正则能拦）
await t('已修正', '今天天气不错', '已修正：今天天气不错', false)
await t('文本修正如下', '今天天气不错', '文本修正如下：今天天气不错', false)
await t('I have corrected', 'the weather is nice today', 'I have corrected: the weather is nice today', false)
await t('Text after correction', 'the weather is nice today', 'Text after correction: the weather is nice today', false)
console.log(`llm-correct-similarity：${passed} 项通过，0 项失败`)
