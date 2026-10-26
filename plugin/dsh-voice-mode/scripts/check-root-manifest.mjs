#!/usr/bin/env node
/**
 * 根 manifest 一致性守卫（2026-10-26 起）。
 *
 * 背景：社区插件市场 dsh-plugin.org 的收录要求写着「仓库根目录需包含 package.json
 * （写明插件包名与版本）：本站据此识别包名并核对对应的 NPM 包，缺少根 package.json 的
 * 仓库无法通过自动扫描」。故仓库根有一份 manifest（`/package.json`），它**不是**可发布的
 * npm 包（真正发布的是 `plugin/dsh-voice-mode`），只承担「包名 + 版本」的身份声明。
 *
 * 风险：两份 manifest 各自手改 → 版本漂移 → 市场展示的版本与 npm 上的实际版本对不上
 * （或包名对不上，扫不到条目）。本守卫把「根 manifest 的 name/version 必须与插件 manifest
 * 完全一致」变成机械判定，接进 CI 与本地门禁。
 *
 * 用法：node scripts/check-root-manifest.mjs
 * 退出码：0=一致；1=不一致（点名差在哪）；2=文件缺失/无法解析。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..')
const rootPath = join(repoRoot, 'package.json')
const pluginPath = join(repoRoot, 'plugin', 'dsh-voice-mode', 'package.json')

if (!existsSync(rootPath)) {
  console.error(`✗ 缺少根 manifest：${rootPath}\n  插件市场（dsh-plugin.org）要求仓库根有 package.json 才能自动扫描收录。`)
  process.exit(2)
}
if (!existsSync(pluginPath)) {
  console.error(`✗ 缺少插件 manifest：${pluginPath}`)
  process.exit(2)
}

let root
let plugin
try {
  root = JSON.parse(readFileSync(rootPath, 'utf8'))
  plugin = JSON.parse(readFileSync(pluginPath, 'utf8'))
} catch (error) {
  console.error(`✗ manifest 解析失败：${error.message}`)
  process.exit(2)
}

const problems = []
if (root.name !== plugin.name) problems.push(`name：根=${root.name} 插件=${plugin.name}`)
if (root.version !== plugin.version) problems.push(`version：根=${root.version} 插件=${plugin.version}`)
if (root.license !== plugin.license) problems.push(`license：根=${root.license} 插件=${plugin.license}`)
if (!root.scripts?.prepublishOnly) problems.push('根 manifest 缺少 prepublishOnly 守卫（防止在根目录误发布）')

if (problems.length > 0) {
  console.error('✗ 根 manifest 与插件 manifest 不一致：')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('  修法：同步两份 manifest 的 name/version/license 后重试。')
  process.exit(1)
}

console.log(`✓ 根 manifest 与插件 manifest 一致（${root.name}@${root.version}）`)
