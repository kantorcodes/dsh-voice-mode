# dsh-plugin.org 市场收录提交（对应 GitHub Issue #18）

> 状态：**仓库侧要求已全部满足**（见下表）；最后一步「提交审核 issue」需人工点一次
> ——本机 GitHub 凭据是 fine-grained PAT（`github_pat_…`），对 `dshplugin/dsh-plugin-hub`
> 没有 `issues: write`，`gh issue create` 返回 `Resource not accessible by personal access token`
> （与官方 discussion #8250 同因，结论一致）。
>
> 两种完成方式（任选其一）：
> 1. **浏览器点一次**（最快）：打开下方「预填链接」→ 直接提交（正文已预填，核对一下即可）。
> 2. **给 PAT 加仓库权限**（可长期复用）：把 `dshplugin/dsh-plugin-hub` 加入该 PAT 的仓库范围，
>    然后在仓库根执行：
>    ```bash
>    gh issue create --repo dshplugin/dsh-plugin-hub \
>      --title "[插件提交] qishuilalala/dsh-voice-mode — 会话内全双工语音对话：本地识别免 API Key、开口即打断" \
>      --body-file docs/market-submission.md
>    ```

## 收录要求逐条核对（站点「提交前检查清单」）

| 要求 | 本仓状态 | 证据 |
| --- | --- | --- |
| 仓库为公开仓库 | ✅ | `gh api repos/qishuilalala/dsh-voice-mode` → `visibility: public` |
| 添加 GitHub topic `dsh-plugin` | ✅ | 仓库 topics 含 `dsh-plugin`（另有 asr / barge-in / tts 等） |
| README 含安装命令 `dsh plugin --profile web add <包名>` | ✅ | 根 README「安装」段：`dsh plugin --profile web add dsh-voice-mode` |
| 插件导出 `apply(ctx)` 模块 | ✅ | `plugin/dsh-voice-mode/src/index.ts` 导出 `apply(ctx)` |
| **仓库根目录含 package.json（写明包名与版本）** | ✅ **本轮补齐** | 仓库根新增 manifest（`name` / `version` / `license` / `repository`），并加机械守卫 `scripts/check-root-manifest.mjs` 保证与插件 manifest 一致（接进 CI 与发版门禁） |
| 有 NPM 包（才能进 DSH 内「插件中心」） | ✅ | npm `dsh-voice-mode`（latest 已发布，engines.dsh = `>=0.1.1-rc.2 <0.3.0-0`） |
| 许可证声明 | ✅ | MIT（根 LICENSE、manifest `license` 字段） |
| 截图 / 演示 | ✅ | 根 README 顶部 hero 图；`assets/`、`screenshots/` 目录 |
| 权限 / 外部服务 / 兼容性说明 | ✅ | 见下方提交正文 |

> 注：站点自述「通常一轮刷新周期内收录」，且**自动扫描**同样以「仓库根 manifest」为识别依据——
> 本轮补齐根 manifest 后，即使不提交审核 issue，也可能在下一轮刷新被自动收录（提交 issue 是走人工复核、加快收录）。

## 预填链接（打开即带好标题与正文，核对后提交即可）

<https://github.com/dshplugin/dsh-plugin-hub/issues/new?title=%5B%E6%8F%92%E4%BB%B6%E6%8F%90%E4%BA%A4%5D%20qishuilalala%2Fdsh-voice-mode%20%E2%80%94%20%E4%BC%9A%E8%AF%9D%E5%86%85%E5%85%A8%E5%8F%8C%E5%B7%A5%E8%AF%AD%E9%9F%B3%E5%AF%B9%E8%AF%9D%EF%BC%9A%E6%9C%AC%E5%9C%B0%E8%AF%86%E5%88%AB%E5%85%8D%20API%20Key%E3%80%81%E5%BC%80%E5%8F%A3%E5%8D%B3%E6%89%93%E6%96%AD&body=%E8%A7%86%E7%9C%8B%E8%AF%81%E6%9C%AC%EF%BC%9A%E8%AF%86%E5%88%AB%E5%9C%A8%E6%9C%AC%E5%9C%B0%E6%8E%A8%E7%90%86%E7%9A%84%20zipformer2%20%E6%B5%81%E5%BC%8F%20ASR%EF%BC%88%E5%AE%8C%E5%85%A8%E5%8F%98%E5%BC%8F%E5%8C%96%20VAD%20%2B%20%E6%81%92%E5%AD%98%E5%AD%97%E5%AD%98%E5%8A%A8%E6%A3%80%E6%B5%8B%EF%BC%89%EF%BC%8C%E4%B8%8D%E9%9C%80%E8%A6%81%20API%20Key%EF%BC%9B%E8%AF%AD%E9%9F%B3%E6%97%AD%E5%8F%A5%E6%94%BE%E5%A3%B0%EF%BC%8A%E5%8F%8D%E5%BE%A9%E5%8D%8F%E4%BD%9C%E5%9F%BA%E4%BA%8E%20dsh%20%E5%AE%98%E6%96%B9%20llm%2Bpi-ai%20%E7%9A%84%20api%2Fsession%20%E5%8F%82%E6%95%B0%E8%B0%83%E7%94%A8%E7%9F%A5%EF%BC%8C%E5%AE%8C%E6%88%90%E5%8F%8D%E5%BE%A9%E5%8D%95%E5%8F%A5%E5%8F%8D%E9%A6%88%E5%90%8C%E6%97%B6%E7%9C%8B%E8%BE%BE%E5%88%86%E6%AE%B5%E5%86%85%E5%AE%B9%E3%80%82%E5%8F%AF%E9%80%89%E5%90%8C%E6%AD%A5%E5%A3%B0%E9%98%85%E8%AF%BB%E3%80%82%E6%8C%87%E5%AE%9A%E6%97%B6%E9%97%B4%E5%90%8E%E6%89%93%E6%96%AD%E3%80%82>

## 提交正文（即 `gh issue create --body-file` 用的内容）

```markdown
### 仓库地址
https://github.com/qishuilalala/dsh-voice-mode

### 一句话价值
装上后，DeepSeek Harness 的会话里就能「说话 → 实时出字 → 自动发送 → 回复按句朗读（带实时字幕）→ 开口即打断」地完成整轮对话；语音识别在本地推理，**不需要 API Key**。

### 能力分类
界面与体验

### 安装命令
dsh plugin --profile web add dsh-voice-mode

### 兼容与运行要求
- DSH：**0.1.1-rc.2 起全版本**（已实证覆盖至 **0.2.1-rc.3**，含官方桌面端等价的 Electron 宿主）；`engines.dsh = ">=0.1.1-rc.2 <0.3.0-0"`（带上界：未验证的新大版本会被干净拒绝而非静默破损）。
- 平台：Windows / macOS / Linux 均可；本地识别纯 CPU 可跑。
- 运行时：Node.js ≥18（本地 TTS 引擎需要；仅用云端朗读则不强制）。
- 网络：Edge 云端朗读与模型首次下载需要联网；本地 VITS / Kokoro 朗读可离线。

### 许可证
MIT

### 截图 / 演示
README 顶部有 hero 图与真实截图（`assets/`、`screenshots/`）；Release 页面附各版本变更说明。

### 补充说明
- 权限：仅在会话内申请麦克风；无其他系统权限。
- 外部服务：Edge 云端朗读（可选，默认）、语音模型文件下载（首次，约 390MB，之后本地缓存）。
- 已知限制：本地识别模型首次使用需下载；桌面端下本地 Kokoro 需要系统 PATH 上有 Node.js ≥18。
- 其他：提供「复制诊断信息」按钮（只含版本/运行状态/设置快照，**不含任何转写原文**）。

### 提交前自查
- [x] 仓库已公开
- [x] 已添加 GitHub topic：dsh-plugin
- [x] README 包含安装命令
- [x] 插件导出 apply(ctx) 模块
- [x] 仓库根目录包含 package.json
```

## 收录后

- 把市场条目地址回填到本文件「状态」段与根 README（可选加收录徽章，站点提供
  `https://dsh-plugin.org/badges/listed.svg`）。
- 收录页的元数据会随仓库 release 定期刷新，无需重复提交。
