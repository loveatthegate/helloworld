# 履职系统 DEMO

用视觉模型（VLM）核验现场作业视频是否符合 SOP 手册。验证阶段不部署独立 CV 小模型，分析引擎预留了同一套适配器接口，后续可替换。

## 功能

- 上传 SOP（PDF / Word / 图片 / 文本）并解析为可视化检查项
- 上传作业视频，浏览器按可配置间隔抽帧
- 用 Gemini / GPT-4o / Claude 等视觉模型逐项判定满足 / 不满足 / 存疑 / 未观察到
- 生成可回溯报告（手册、模型、抽帧参数、证据帧）
- 设置页切换默认模型与抽帧频率

演示阶段无登录。

## 本地运行

```bash
npm install
npm run dev
```

打开提示的本地地址。未配置模型密钥时，**文本 SOP 会用本地规则抽出检查项**，便于先看界面；视频比对需要视觉模型。

复制 `.env.example` 为 `.env` 并填写其一：

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

## 部署到 Netlify

1. 将本仓库连接到 Netlify 站点并完成一次生产部署（会按 `package.json` 中的 `@netlify/database` 开通 Postgres）。
2. 在站点中启用 AI Gateway，**不要**再手动填写供应商 `*_API_KEY`（否则会绕过网关）。
3. 部署后网关才会注入密钥；`netlify/database/migrations` 会在部署时自动执行。

本地开发数据库使用 PGlite（`.data/pglite`）。文件默认写到 `.data/blobs`；在 Netlify 上走 Blobs。

长任务使用 `parse-sop-background` 与 `analyze-video-background`（最长 15 分钟）。同步函数 60 秒不够完成多帧视觉分析。

## 抽帧说明

工作视频通常大于 Functions 6MB 限制，因此抽帧在浏览器完成，只上传 JPEG 证据帧。小于 5.5MB 的视频会额外存档便于回溯。
