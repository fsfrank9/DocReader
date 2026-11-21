# 纸间 · Leaf

把时间留给阅读。

一个为 Windows、MacBook、iPhone 和 iPad 设计的文档阅读 Web App。打开文件即可阅读；简洁的纸张界面搭配适合长文的排版。

**在线使用：** [docreader.fkonline.workers.dev](https://docreader.fkonline.workers.dev)

## 阅读

- TXT / TEXT / LOG 保留原始换行、空行和缩进。
- Markdown（MD / MARKDOWN / MDOWN）展示标题、列表、引用、表格、代码高亮、任务列表、脚注和数学公式。
- DOCX 按标题、段落、列表、表格与内嵌图片重新排版；HTML / HTM 按文档结构阅读。
- JSON 格式化高亮；CSV / TSV 展示为表格。
- 自动识别常见文本编码，也可手动选择 UTF-8、UTF-16、GB18030、Big5 等编码。
- 文档目录、文内搜索、阅读进度与阅读样式设置。
- 文档与阅读记录保存在当前设备的浏览器中；各台设备分别管理自己的书架。
- 首次联网打开并完成缓存后，可离线使用阅读器和已导入的文档。

## 安装为 App

| 设备 | 安装方式 |
| --- | --- |
| Windows | 用 Edge 或 Chrome 打开网页，在浏览器菜单中选择安装此应用。 |
| MacBook | Safari 的“文件 → 添加到程序坞”，或使用 Chrome 的安装功能。 |
| iPhone / iPad | Safari 打开网页，点“分享 → 添加到主屏幕”。 |

## 本地开发

使用 Node.js 22.12+，建议 Node.js 24 LTS。

```bash
npm ci
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## Cloudflare Workers 部署

仓库连接已有的 `docreader` Worker，`main` 提交触发自动部署：

| 设置 | 值 |
| --- | --- |
| 仓库 | `fsfrank9/DocReader` |
| 生产分支 | `main` |
| 根目录 | `/` |
| 构建命令 | `npm run build` |
| 部署命令 | `npm run deploy` |

配置位于 `cloudflare.config.ts`，使用 Cloudflare CLI `cf` 和 Cloudflare Vite 插件。静态文件、安装清单与离线缓存统一构建到 `.cloudflare/output/v1/workers/default/assets`；`npm run deploy` 发布已经构建的产物。

在已经登录 Cloudflare 的开发环境中，也可以手动部署：

```bash
npm run build
npm run deploy
```

## 技术

React、Vite、Cloudflare Workers Static Assets、IndexedDB、Markdown-it、KaTeX、Highlight.js 与 PWA。文档解析在浏览器内完成。
