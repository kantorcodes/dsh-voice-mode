#!/usr/bin/env node
/**
 * 发布门（E-1 / OQ3）：入库的 lib/client.js 里的 BUILD_TAG 必须是 HEAD 的祖先（或自身），
 * 且 BUILD_TAG..HEAD 之间 src/ 与 build.mjs 没有变化——即「入库产物 = 当前源码的构建物」。
 * 为什么不要求 BUILD_TAG == HEAD：lib 自己的提交必然晚于它所嵌入的哈希（自指），
 * 正典流程 = 提交源码 → build（BUILD_TAG=该提交）→ 提交 lib → 在 lib 提交打 tag；
 * 只要中间没再改 src，就等价。v0.7.26/27/28 的缺陷是 tag 内 lib 落后于 src（见 OQ3）。
 * 用法：node scripts/check-build-tag.mjs [ref=HEAD]   退出码 0 绿 / 1 红
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'

const root = join(dirname(new URL(import.meta.url).pathname), '..')
const ref = process.argv[2] || 'HEAD'
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const fail = (m) => { console.error('✗ check-build-tag: ' + m); process.exit(1) }

const m = readFileSync(join(root, 'lib/client.js'), 'utf8').match(/BUILD_TAG\s*=\s*"([0-9a-f]{7,40}|unknown)"/)
if (!m) fail('lib/client.js 里找不到 BUILD_TAG')
const tag = m[1]
if (tag === 'unknown') fail('BUILD_TAG=unknown（在非 git 环境构建）')
try { git('cat-file', '-e', tag + '^{commit}') } catch { fail(`BUILD_TAG ${tag} 不是仓库中的提交（浅克隆？需 fetch-depth: 0）`) }
try { git('merge-base', '--is-ancestor', tag, ref) } catch { fail(`BUILD_TAG ${tag} 不是 ${ref} 的祖先`) }
const changed = git('diff', '--name-only', tag, ref, '--', 'src', 'build.mjs').split('\n').filter(Boolean)
if (changed.length) fail(`BUILD_TAG ${tag} 之后源码已变化，lib 落后：\n  ${changed.join('\n  ')}\n  → 重新 node build.mjs 并提交 lib，再打 tag`)
console.log(`✓ BUILD_TAG ${tag} 与 ${ref} 的源码一致`)
