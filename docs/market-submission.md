# dsh-plugin.org 市场收录提交（对应 GitHub Issue #18）

> 状态：**审核已通过 · 收录全自动**（2026-10-26 18:07 CST）
> - 提交 issue：`dshplugin/dsh-plugin-hub#452`（qishuilalala 于 2026-10-26 08:58 提交）
> - 审核机器人 `dshplugin` 回复：**「收录流程全自动运行：提交由定期的仓库扫描统一拾取处理，你这边无需任何操作。这一条会在下一轮扫描中自动进入目录，并展示在 https://dsh-plugin.org」**，并确认「插件中心只展示能用 NPM 一键安装的插件」——本仓 npm 包已发布（latest 0.7.31），满足该条件。该 issue 随即被机器人关闭。
> - 因此**不再需要人工操作**；剩余动作只是等下一轮扫描后核对条目页是否上线（`/plugins/qishuilalala/dsh-voice-mode`），上线后登记条目地址、给根 README 加市场徽章（徽章需先经用户同意）。
> - 本机 PAT 对市场仓库只有读权限（无法代发评论/追问），若日后审核方另有提问，需由用户发布或给该仓库加 `issues: write` 权限。

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

<https://github.com/dshplugin/dsh-plugin-hub/issues/new?title=%5B%E6%8F%92%E4%BB%B6%E6%8F%90%E4%BA%A4%5D%20qishuilalala%2Fdsh-voice-mode%20%E2%80%94%20%E4%BC%9A%E8%AF%9D%E5%86%85%E5%85%A8%E5%8F%8C%E5%B7%A5%E8%AF%AD%E9%9F%B3%E5%AF%B9%E8%AF%9D%EF%BC%9A%E6%9C%AC%E5%9C%B0%E8%AF%86%E5%88%AB%E5%85%8D%20API%20Key%E3%80%81%E5%BC%80%E5%8F%A3%E5%8D%B3%E6%89%93%E6%96%AD&body=%23%23%23%20%E4%BB%93%E5%BA%93%E5%9C%B0%E5%9D%80%0Ahttps%3A%2F%2Fgithub.com%2Fqishuilalala%2Fdsh-voice-mode%0A%0A%23%23%23%20%E4%B8%80%E5%8F%A5%E8%AF%9D%E4%BB%B7%E5%80%BC%0A%E8%AE%A9%20DeepSeek%20Harness%20%E7%9A%84%E4%BC%9A%E8%AF%9D%E6%94%AF%E6%8C%81%E5%85%A8%E5%8F%8C%E5%B7%A5%E8%AF%AD%E9%9F%B3%E5%AF%B9%E8%AF%9D%EF%BC%9A%E8%AF%B4%E8%AF%9D%E5%AE%9E%E6%97%B6%E8%BD%AC%E5%86%99%E5%88%B0%E8%8D%89%E7%A8%BF%E3%80%81%E5%81%9C%E9%A1%BF%E5%90%8E%E8%87%AA%E5%8A%A8%E5%8F%91%E9%80%81%EF%BC%8C%E5%9B%9E%E5%A4%8D%E6%8C%89%E5%8F%A5%E6%9C%97%E8%AF%BB%E5%B9%B6%E9%85%8D%E5%AE%9E%E6%97%B6%E5%AD%97%E5%B9%95%EF%BC%8C%E6%9C%97%E8%AF%BB%E4%B8%AD%E5%BC%80%E5%8F%A3%E5%8D%B3%E6%89%93%E6%96%AD%E3%80%82%E8%AF%AD%E9%9F%B3%E8%AF%86%E5%88%AB%E5%9C%A8%E6%9C%AC%E5%9C%B0%E6%8E%A8%E7%90%86%EF%BC%8C%E4%B8%8D%E9%9C%80%E8%A6%81%20API%20Key%E3%80%82%0A%0A%23%23%23%20%E8%83%BD%E5%8A%9B%E5%88%86%E7%B1%BB%0A%E7%95%8C%E9%9D%A2%E4%B8%8E%E4%BD%93%E9%AA%8C%0A%0A%23%23%23%20%E5%AE%89%E8%A3%85%E5%91%BD%E4%BB%A4%0Adsh%20plugin%20--profile%20web%20add%20dsh-voice-mode%0A%0A%23%23%23%20%E5%85%BC%E5%AE%B9%E4%B8%8E%E8%BF%90%E8%A1%8C%E8%A6%81%E6%B1%82%0A-%20DSH%EF%BC%9A0.1.1-rc.2%20%E8%B5%B7%E5%85%A8%E7%89%88%E6%9C%AC%EF%BC%8C%E5%B7%B2%E5%AE%9E%E8%AF%81%E8%A6%86%E7%9B%96%E8%87%B3%200.2.1-rc.3%EF%BC%88%E5%90%AB%E5%AE%98%E6%96%B9%E6%A1%8C%E9%9D%A2%E7%AB%AF%E7%AD%89%E4%BB%B7%E7%9A%84%20Electron%20%E5%AE%BF%E4%B8%BB%EF%BC%89%EF%BC%9B%60engines.dsh%20%3D%20%22%3E%3D0.1.1-rc.2%20%3C0.3.0-0%22%60%EF%BC%8C%E6%9C%AA%E9%AA%8C%E8%AF%81%E7%9A%84%E6%96%B0%E5%A4%A7%E7%89%88%E6%9C%AC%E4%BC%9A%E8%A2%AB%E6%8B%92%E7%BB%9D%E5%8A%A0%E8%BD%BD%E8%80%8C%E9%9D%9E%E9%9D%99%E9%BB%98%E7%A0%B4%E6%8D%9F%E3%80%82%0A-%20%E5%B9%B3%E5%8F%B0%EF%BC%9AWindows%20%2F%20macOS%20%2F%20Linux%EF%BC%9B%E6%9C%AC%E5%9C%B0%E8%AF%86%E5%88%AB%E7%BA%AF%20CPU%20%E5%8F%AF%E8%BF%90%E8%A1%8C%E3%80%82%0A-%20%E8%BF%90%E8%A1%8C%E6%97%B6%EF%BC%9ANode.js%20%E2%89%A518%EF%BC%88%E4%BB%85%E6%9C%AC%E5%9C%B0%20TTS%20%E5%BC%95%E6%93%8E%E9%9C%80%E8%A6%81%EF%BC%89%E3%80%82%0A-%20%E7%BD%91%E7%BB%9C%EF%BC%9AEdge%20%E4%BA%91%E7%AB%AF%E6%9C%97%E8%AF%BB%E4%B8%8E%E6%A8%A1%E5%9E%8B%E9%A6%96%E6%AC%A1%E4%B8%8B%E8%BD%BD%E9%9C%80%E8%A6%81%E8%81%94%E7%BD%91%EF%BC%9B%E6%9C%AC%E5%9C%B0%20VITS%20%2F%20Kokoro%20%E6%9C%97%E8%AF%BB%E5%8F%AF%E7%A6%BB%E7%BA%BF%E3%80%82%0A%0A%23%23%23%20%E8%AE%B8%E5%8F%AF%E8%AF%81%0AMIT%0A%0A%23%23%23%20%E6%88%AA%E5%9B%BE%20%2F%20%E6%BC%94%E7%A4%BA%0AREADME%20%E9%A6%96%E5%B1%8F%E4%B8%BA%E5%8A%9F%E8%83%BD%E5%9B%BE%E4%B8%8E%E7%9C%9F%E5%AE%9E%E6%88%AA%E5%9B%BE%EF%BC%8C%E4%BB%93%E5%BA%93%E5%90%AB%20%60assets%2F%60%20%E4%B8%8E%20%60screenshots%2F%60%20%E7%9B%AE%E5%BD%95%EF%BC%9B%E5%90%84%E7%89%88%E6%9C%AC%E5%8F%98%E6%9B%B4%E8%AF%B4%E6%98%8E%E8%A7%81%20Releases%E3%80%82%0A%0A%23%23%23%20%E8%A1%A5%E5%85%85%E8%AF%B4%E6%98%8E%0A-%20%E6%9D%83%E9%99%90%EF%BC%9A%E4%BB%85%E5%9C%A8%E4%BC%9A%E8%AF%9D%E5%86%85%E7%94%B3%E8%AF%B7%E9%BA%A6%E5%85%8B%E9%A3%8E%EF%BC%8C%E6%97%A0%E5%85%B6%E4%BB%96%E7%B3%BB%E7%BB%9F%E6%9D%83%E9%99%90%E3%80%82%0A-%20%E5%A4%96%E9%83%A8%E6%9C%8D%E5%8A%A1%EF%BC%9AEdge%20%E4%BA%91%E7%AB%AF%E6%9C%97%E8%AF%BB%EF%BC%88%E9%BB%98%E8%AE%A4%EF%BC%8C%E5%8F%AF%E5%88%87%E6%8D%A2%E6%9C%AC%E5%9C%B0%E5%BC%95%E6%93%8E%EF%BC%89%E3%80%81%E8%AF%AD%E9%9F%B3%E6%A8%A1%E5%9E%8B%E6%96%87%E4%BB%B6%E4%B8%8B%E8%BD%BD%EF%BC%88%E9%A6%96%E6%AC%A1%E7%BA%A6%20390%20MB%EF%BC%89%E3%80%82%0A-%20%E5%B7%B2%E7%9F%A5%E9%99%90%E5%88%B6%EF%BC%9A%E6%9C%AC%E5%9C%B0%E8%AF%86%E5%88%AB%E6%A8%A1%E5%9E%8B%E9%A6%96%E6%AC%A1%E4%BD%BF%E7%94%A8%E9%9C%80%E4%B8%8B%E8%BD%BD%EF%BC%9B%E6%A1%8C%E9%9D%A2%E7%AB%AF%E4%B8%8B%E6%9C%AC%E5%9C%B0%20Kokoro%20%E9%9C%80%E8%A6%81%E7%B3%BB%E7%BB%9F%20PATH%20%E4%B8%8A%E5%AD%98%E5%9C%A8%20Node.js%20%E2%89%A518%E3%80%82%0A%0A%23%23%23%20%E6%8F%90%E4%BA%A4%E5%89%8D%E8%87%AA%E6%9F%A5%0A-%20%5Bx%5D%20%E4%BB%93%E5%BA%93%E5%B7%B2%E5%85%AC%E5%BC%80%0A-%20%5Bx%5D%20%E5%B7%B2%E6%B7%BB%E5%8A%A0%20GitHub%20topic%EF%BC%9Adsh-plugin%0A-%20%5Bx%5D%20README%20%E5%8C%85%E5%90%AB%E5%AE%89%E8%A3%85%E5%91%BD%E4%BB%A4%0A-%20%5Bx%5D%20%E6%8F%92%E4%BB%B6%E5%AF%BC%E5%87%BA%20apply%28ctx%29%20%E6%A8%A1%E5%9D%97%0A-%20%5Bx%5D%20%E4%BB%93%E5%BA%93%E6%A0%B9%E7%9B%AE%E5%BD%95%E5%8C%85%E5%90%AB%20package.json%0A>

## 提交正文（即 `gh issue create --body-file` 用的内容）

```markdown
### 仓库地址
https://github.com/qishuilalala/dsh-voice-mode

### 一句话价值
让 DeepSeek Harness 的会话支持全双工语音对话：说话实时转写到草稿、停顿后自动发送，回复按句朗读并配实时字幕，朗读中开口即打断。语音识别在本地推理，不需要 API Key。

### 能力分类
界面与体验

### 安装命令
dsh plugin --profile web add dsh-voice-mode

### 兼容与运行要求
- DSH：0.1.1-rc.2 起全版本，已实证覆盖至 0.2.1-rc.3（含官方桌面端等价的 Electron 宿主）；`engines.dsh = ">=0.1.1-rc.2 <0.3.0-0"`，未验证的新大版本会被拒绝加载而非静默破损。
- 平台：Windows / macOS / Linux；本地识别纯 CPU 可运行。
- 运行时：Node.js ≥18（仅本地 TTS 引擎需要）。
- 网络：Edge 云端朗读与模型首次下载需要联网；本地 VITS / Kokoro 朗读可离线。

### 许可证
MIT

### 截图 / 演示
README 首屏为功能图与真实截图，仓库含 `assets/` 与 `screenshots/` 目录；各版本变更说明见 Releases。

### 补充说明
- 权限：仅在会话内申请麦克风，无其他系统权限。
- 外部服务：Edge 云端朗读（默认，可切换本地引擎）、语音模型文件下载（首次约 390 MB）。
- 已知限制：本地识别模型首次使用需下载；桌面端下本地 Kokoro 需要系统 PATH 上存在 Node.js ≥18。

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
