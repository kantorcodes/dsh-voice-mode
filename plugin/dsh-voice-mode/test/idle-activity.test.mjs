/**
 * B-2：空闲超时误退并切断朗读（文档承诺「朗读计为活动，长朗读不会中途下线」被违反）。
 * 运行：node test/idle-activity.test.mjs（npm test 串联）。
 *
 * 根因：client.tsx 的空闲定时器只看「有没有进入语音模式」，不看当前是否正在朗读/
 * 说话/生成 → 长朗读中途被空闲退出切断，README 的承诺落空。
 *
 * 覆盖（本仓 client.tsx 无组件挂载设施的既定模式：纯函数单测 + 源码锁）：
 *  1) mic-gesture.ts 的 idleBusy：活动口径（朗读 / agent-speaking / 运行中）；
 *  2) mic-gesture.ts 的 idleAction：续期 / 预警 / 退出三态 + 2h 绝对上限；
 *  3) client.tsx 接线（源码锁）：预警回调与退出回调都走 idleAction 判定。
 *
 * 接线锁的强度约定（第三轮审查结论：前一轮能抓语义变异，但仍留两类边界）：
 *  - 每条断言都**限定窗口**——不得用「文件包含某字符串」这种恒真写法；
 *  - 窗口按语义锚点切分：idleBusyNow 定义 / 30s 预警回调 / 空闲退出回调 / resetIdle 本体；
 *    锚点用**正则**（空格 / 数字分隔符等纯格式变化不得误红）；
 *  - 取证据按**行**并**先剥行尾 `//` 注释**——注释里出现的同名字样不算证据
 *    （`hidden: false, // document.hidden` 不是「接了 document.hidden」的证据）；
 *  - 关键取值用**整行精确匹配**（`busy: idleBusyNow()` / `warn: true` /
 *    `sinceUserActivityMs: Date.now() - idleUserActivityAtRef.current`）——
 *    仅做「子串包含」会把「取反」「写死 0」这类语义变异放过。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  IDLE_USER_ACTIVITY_CAP_MS,
  RENEW_WHILE_HIDDEN,
  idleAction,
  idleBusy,
} from '../src/mic-gesture.ts'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = join(here, '..')
const clientSrc = readFileSync(join(root, 'src/client.tsx'), 'utf8')

let passed = 0
const t = (name, fn) => {
  fn()
  passed++
  console.log('  ✓ ' + name)
}

/** 全闲的活动输入（无播放 / 无回合 / 无运行）。 */
const IDLE_INPUT = { playing: false, turn: undefined, running: false }

// ── 1) idleBusy：活动口径 ───────────────────────────────────────────────────
t('idleBusy：正在朗读（playing）→ 活动', () => {
  assert.equal(idleBusy({ ...IDLE_INPUT, playing: true }), true)
})

t('idleBusy：回合状态 agent-speaking → 活动', () => {
  assert.equal(idleBusy({ ...IDLE_INPUT, turn: 'agent-speaking' }), true)
})

t('idleBusy：会话运行中（running）→ 活动', () => {
  assert.equal(idleBusy({ ...IDLE_INPUT, running: true }), true)
})

t('idleBusy：全闲 → 非活动', () => {
  assert.equal(idleBusy(IDLE_INPUT), false)
  // 非 agent-speaking 的回合（如 listening）不算活动
  assert.equal(idleBusy({ ...IDLE_INPUT, turn: 'listening' }), false)
})

t('idleBusy：不含 ttsDrained（readAloud=off 时长期 false，纳入会永不退出）', () => {
  // ttsDrained 不在活动口径里：给出额外字段也不应改变判定
  assert.equal(idleBusy({ ...IDLE_INPUT, ttsDrained: false }), false)
  assert.equal(idleBusy({ ...IDLE_INPUT, ttsDrained: true }), false)
})

t('idleBusy：隐藏标签页口径（RENEW_WHILE_HIDDEN）', () => {
  assert.equal(RENEW_WHILE_HIDDEN, true, '隐藏即续期（隐藏时麦克风已关，隐私收益≈0）')
  // 隐藏时仍在朗读 → 仍算活动（长朗读不会在后台被切断）
  assert.equal(idleBusy({ ...IDLE_INPUT, playing: true, hidden: true }), true)
  // 隐藏时全闲 → 仍是非活动（隐藏不制造虚假活动）
  assert.equal(idleBusy({ ...IDLE_INPUT, hidden: true }), false)
})

// ── 2) idleAction：续期 / 预警 / 退出 ────────────────────────────────────────
t('idleAction：忙且未超上限 → 续期（不预警、不退出）', () => {
  assert.equal(idleAction({ busy: true, warn: true, sinceUserActivityMs: 1000 }), 'renew')
  assert.equal(idleAction({ busy: true, warn: false, sinceUserActivityMs: 1000 }), 'renew')
})

t('idleAction：不忙 + 预警窗 → 预警', () => {
  assert.equal(idleAction({ busy: false, warn: true, sinceUserActivityMs: 1000 }), 'warn')
})

t('idleAction：不忙 + 非预警窗 → 退出', () => {
  assert.equal(idleAction({ busy: false, warn: false, sinceUserActivityMs: 1000 }), 'exit')
})

t('idleAction：忙但超过 2h 绝对上限 → 退出（不再无限续期）', () => {
  assert.equal(IDLE_USER_ACTIVITY_CAP_MS, 2 * 60 * 60 * 1000, '上限应为 2h')
  const over = IDLE_USER_ACTIVITY_CAP_MS + 1
  assert.equal(idleAction({ busy: true, warn: false, sinceUserActivityMs: over }), 'exit')
  // 恰好等于上限：未超（> 判定）→ 仍续期
  assert.equal(idleAction({ busy: true, warn: false, sinceUserActivityMs: IDLE_USER_ACTIVITY_CAP_MS }), 'renew')
})

// ── 3) client.tsx 接线（源码锁）──────────────────────────────────────────────
/** 去掉行尾 `//` 注释（跳过引号内的 `//`，避免误伤 URL 字符串）。 */
const stripComment = (line) => {
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c
    } else if (c === '/' && line[i + 1] === '/') {
      return line.slice(0, i)
    }
  }
  return line
}

/** 一行的「去注释后代码」；空行 / 块注释续行返回 null（不算证据）。 */
const codeOf = (line) => {
  const code = stripComment(line).trim()
  if (!code || code.startsWith('*') || code.startsWith('/*')) return null
  return code
}

/** 片段里首个**非注释**行包含 needle 的行号（-1 = 没有）。 */
const lineOf = (text, needle) => {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const code = codeOf(lines[i])
    if (code !== null && code.includes(needle)) return i
  }
  return -1
}

/** 片段里首个**非注释**行包含 needle 的**去注释后**代码文本（null = 没有）。 */
const codeLine = (text, needle) => {
  const i = lineOf(text, needle)
  return i < 0 ? null : codeOf(text.split('\n')[i])
}

/** 片段里首个**非注释**行**整体**匹配 re 的位置与代码（null = 没有）。 */
const findMatch = (text, re) => {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const code = codeOf(lines[i])
    if (code !== null && re.test(code)) return { index: i, text: code }
  }
  return null
}

/** 片段里首个**非注释**行整体匹配 re 的行号（-1 = 没有）。 */
const matchIndex = (text, re) => {
  const m = findMatch(text, re)
  return m ? m.index : -1
}

/** 片段里首个**非注释**行整体匹配 re 的行文本（null = 没有）。 */
const matchLine = (text, re) => {
  const m = findMatch(text, re)
  return m ? m.text : null
}

/** 断言：片段里存在一行整体匹配 re。 */
const assertLine = (text, re, msg) => {
  assert.ok(findMatch(text, re), `${msg}（未匹配：${re}）`)
}

/** 按语义锚点截取 client.tsx 源码片段（锚点为正则，容忍纯格式变化）。 */
const srcBetween = (startRe, endRe) => {
  const s = startRe.exec(clientSrc)
  assert.ok(s, `client.tsx 里找不到起始锚点 ${startRe}`)
  const tail = clientSrc.slice(s.index + s[0].length)
  const e = endRe.exec(tail)
  assert.ok(e, `client.tsx 里找不到结束锚点 ${endRe}（片段未闭合）`)
  return clientSrc.slice(s.index, s.index + s[0].length + e.index)
}

/** 活动口径定义：idleBusyNow 的函数体（到 clearIdle 为止）。 */
const busyWin = srcBetween(
  /const\s+idleBusyNow\s*=\s*\(\s*\)\s*:\s*boolean\s*=>/,
  /const\s+clearIdle\s*=\s*\(\s*\)\s*:\s*void\s*=>\s*\{/,
)
/** 30s 预警回调：idleWarnTimerRef 的 setTimeout 块（到 arm 完成为止）。 */
const warnWin = srcBetween(
  /idleWarnTimerRef\.current\s*=\s*setTimeout\(\s*\(\s*\)\s*=>\s*\{/,
  /\}\s*,\s*idleMs\s*-\s*(?:30_000|30000)\s*\)/,
)
/** 空闲退出回调：idleTimerRef 的 setTimeout 块（到 arm 完成为止）。 */
const exitWin = srcBetween(
  /idleTimerRef\.current\s*=\s*setTimeout\(\s*\(\s*\)\s*=>\s*\{/,
  /\}\s*,\s*idleMs\s*\)/,
)
/** resetIdle 本体（到预警定时器 arm 为止）。 */
const resetWin = srcBetween(
  /const\s+resetIdle\s*=\s*\(\s*userActivity\s*=\s*true\s*\)\s*:\s*void\s*=>\s*\{/,
  /idleWarnTimerRef\.current\s*=\s*setTimeout\(\s*\(\s*\)\s*=>\s*\{/,
)

t('client.tsx：空闲退出回调走 idleAction 判定（长朗读不再被切断）', () => {
  assert.ok(exitWin.includes('idleAction('), '空闲退出回调未走 idleAction 判定——长朗读会被空闲退出切断')
  assert.ok(lineOf(exitWin, "exitModeRef.current('idle')") >= 0, '空闲退出回调缺空闲退出调用')
})

t('client.tsx：30s 预警回调走 busy 判定（正在朗读不预警）', () => {
  assert.ok(warnWin.includes('idleAction('), '空闲预警回调未走 idleAction 判定')
  assertLine(
    warnWin,
    /^busy:\s*idleBusyNow\(\),?$/,
    '空闲预警回调缺 busy 判定（正在朗读时仍会弹「30 秒后自动退出」）',
  )
})

t('client.tsx：resetIdle 支持「非用户活动」的续期调用（续期不刷新 2h 上限起点）', () => {
  assert.ok(clientSrc.includes('idleUserActivityAtRef'), '缺 idleUserActivityAtRef（最后一次真实用户活动时刻）')
  assert.ok(
    /const\s+resetIdle\s*=\s*\(\s*userActivity\s*=\s*true\s*\)/.test(clientSrc),
    'resetIdle 缺 userActivity 参数',
  )
  assert.ok(clientSrc.includes('resetIdle(false)'), '缺续期调用 resetIdle(false)')
})

// ── 3b) 接线锁（窗口化 + 整行精确匹配）──────────────────────────────────────
t('client.tsx：idleBusyNow 接到真实活动源（播放 / 回合 / running / 隐藏）', () => {
  assert.ok(busyWin.includes('idleBusy('), 'idleBusyNow 未走 idleBusy 判定（整个空闲修复被废掉）')
  assertLine(
    busyWin,
    /^playing:\s*bus\.ui\.playing,?$/,
    'idleBusyNow 未取 bus.ui.playing——正在朗读不算活动 → 长朗读会被空闲退出切断',
  )
  assertLine(
    busyWin,
    /^turn:\s*bus\.ui\.turn,?$/,
    'idleBusyNow 未取 bus.ui.turn——AI 正在说话不算活动',
  )
  assertLine(
    busyWin,
    /^running:\s*runningRef\.current,?$/,
    'idleBusyNow 未取 runningRef.current——会话在跑不算活动',
  )
  assertLine(
    busyWin,
    /^hidden:\s*document\.hidden,?$/,
    'idleBusyNow 未接 document.hidden——隐藏口径失效',
  )
})

t('client.tsx：30s 预警回调的 renew 分支存在且走 resetIdle(false)', () => {
  assert.ok(warnWin.includes('idleAction('), '预警回调未走 idleAction 判定')
  assert.ok(lineOf(warnWin, 'idleBusyNow()') >= 0, '预警回调未用 idleBusyNow()——正在朗读时仍会弹「30 秒后自动退出」')
  const renew = lineOf(warnWin, "action === 'renew'")
  assert.ok(renew >= 0, '预警回调缺 renew 分支——正在朗读会被判成「30 秒后自动退出」')
  const reset = lineOf(warnWin, 'resetIdle(false)')
  assert.ok(reset >= 0, '预警回调的续期未走 resetIdle(false)——续期会刷新 2h 上限起点 → 上限永不生效')
  assert.ok(reset > renew, 'resetIdle(false) 必须落在 renew 分支内')
})

t('client.tsx：空闲退出回调的 renew 分支存在且走 resetIdle(false)', () => {
  assert.ok(exitWin.includes('idleAction('), '退出回调未走 idleAction 判定')
  assert.ok(lineOf(exitWin, 'idleBusyNow()') >= 0, '退出回调未用 idleBusyNow()——长朗读到点会被空闲退出切断')
  const renew = lineOf(exitWin, "action === 'renew'")
  assert.ok(renew >= 0, '退出回调缺 renew 分支——长朗读到点仍被空闲退出切断')
  const reset = lineOf(exitWin, 'resetIdle(false)')
  assert.ok(reset >= 0, '退出回调的续期未走 resetIdle(false)——续期会刷新 2h 上限起点 → 上限永不生效')
  assert.ok(reset > renew, 'resetIdle(false) 必须落在 renew 分支内')
})

t('client.tsx：renew 分支早于「弹预警」与「退出」', () => {
  const wRenew = lineOf(warnWin, "action === 'renew'")
  const wWarn = matchIndex(warnWin, /bus\.setUi\(\s*\{\s*idleWarn:\s*true\s*\}\s*\)/)
  assert.ok(wRenew >= 0 && wWarn >= 0, '预警回调缺 renew 分支或缺 idleWarn 写入')
  assert.ok(wRenew < wWarn, 'renew 分支必须早于写 idleWarn——否则正在朗读仍会弹「30 秒后自动退出」')
  const eRenew = lineOf(exitWin, "action === 'renew'")
  const eExit = lineOf(exitWin, "exitModeRef.current('idle')")
  assert.ok(eRenew >= 0 && eExit >= 0, '退出回调缺 renew 分支或缺空闲退出调用')
  assert.ok(eRenew < eExit, 'renew 分支必须早于空闲退出——否则长朗读到点仍被切断')
})

t('client.tsx：resetIdle 只在真实用户活动时刷新 2h 上限起点', () => {
  const line = codeLine(resetWin, 'idleUserActivityAtRef.current = Date.now()')
  assert.ok(line, 'resetIdle 未刷新 idleUserActivityAtRef（2h 上限无起点）')
  assert.ok(
    /^if\s*\(\s*userActivity\s*\)/.test(line),
    '「用户活动时刻」的刷新必须在 userActivity 守卫内——续期（resetIdle(false)）不得刷新 2h 起点',
  )
})

// ── 3c) 语义取值的整行精确匹配（第三轮审查补强：取反 / 写死 / 注释伪装）──────
t('client.tsx：idleAction 的 busy 取值就是 idleBusyNow() 本身（未被取反）', () => {
  assertLine(
    warnWin,
    /^busy:\s*idleBusyNow\(\),?$/,
    '预警回调的 busy 取值不是 idleBusyNow() 本身——正在朗读会被误判成「要退出」',
  )
  assertLine(
    exitWin,
    /^busy:\s*idleBusyNow\(\),?$/,
    '退出回调的 busy 取值不是 idleBusyNow() 本身——长朗读到点会被空闲退出切断',
  )
})

t('client.tsx：预警回调在预警窗（warn: true）、退出回调不在（warn: false）', () => {
  assertLine(
    warnWin,
    /^warn:\s*true,?$/,
    '预警回调缺 warn: true——到点会直接退出而不弹「30 秒后自动退出」',
  )
  assertLine(
    exitWin,
    /^warn:\s*false,?$/,
    '退出回调的 warn 不是 false——退出路径与预警路径语义混淆',
  )
})

t('client.tsx：2h 上限的起点取自 idleUserActivityAtRef（sinceUserActivityMs）', () => {
  assertLine(
    warnWin,
    /^sinceUserActivityMs:\s*Date\.now\(\)\s*-\s*idleUserActivityAtRef\.current,?$/,
    '预警回调的 sinceUserActivityMs 不是「距最后一次真实用户活动」——2h 上限口径失效',
  )
  assertLine(
    exitWin,
    /^sinceUserActivityMs:\s*Date\.now\(\)\s*-\s*idleUserActivityAtRef\.current,?$/,
    '退出回调的 sinceUserActivityMs 不是「距最后一次真实用户活动」——2h 上限失效（写死 0 即上限永不生效）',
  )
})

t('源码锁工具：行尾 `//` 注释里的同名样张不算证据', () => {
  const fake = [
    'const a = 1',
    'hidden: false, // document.hidden',
    '// busy: idleBusyNow(),',
    'busy: idleBusyNow(),',
  ].join('\n')
  assert.equal(lineOf(fake, 'document.hidden'), -1, '行尾注释里的 document.hidden 被当成了证据')
  assert.equal(codeLine(fake, 'document.hidden'), null, '行尾注释里的 document.hidden 被当成了证据')
  assert.equal(lineOf(fake, 'busy: idleBusyNow()'), 3, '注释行不应被当证据（真正的代码在第 4 行）')
  assert.equal(
    matchLine(fake, /^busy:\s*idleBusyNow\(\),?$/),
    'busy: idleBusyNow(),',
    '整行匹配必须跳过注释行',
  )
  // 字符串里的 `//`（URL）不得被当成注释
  assert.equal(
    codeOf('const u = "https://example.com/a" // 备注'),
    'const u = "https://example.com/a"',
    '引号内的 // 被误当成注释',
  )
})

console.log(`\nidle-activity：${passed} 项通过`)
