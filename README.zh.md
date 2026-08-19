# dsh-browser

[English](README.md) | 中文

`dsh-browser` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的浏览器能力源码发行版。它为 DSH Web UI 添加基于 Playwright、按会话隔离的浏览器能力：agent 可以打开网页、读取快照、操作元素，并在自己的会话中保留 cookie。

本仓库是独立的社区发行版，不是 DeepSeek 官方发布。仓库只包含已提交的开源源码；浏览器 profile、下载文件、截图、凭据和本地配置均不会被纳入。

## Browser 操作演示

下面的视频展示 DSH agent 如何使用这套 harness 搜索公开网页、读取浏览器快照，并与页面进行交互。

https://github.com/user-attachments/assets/03d771ff-a1d8-4df8-b34c-3dda8e8c0617

## 安装与运行

### 从源码运行

浏览器相关包尚未作为独立 npm 包发布，因此请从源码安装。

```sh
git clone https://github.com/ROOKIE02314/dsh-browser.git
cd dsh-browser
pnpm install --frozen-lockfile
pnpm --filter @deepseek-ai/dsh-browser-playwright exec playwright-cli install-browser
pnpm run build
pnpm dsh web --patch examples/browser/cordis.yml
```

需要 Node.js `^22.19.0 || >=24`、pnpm 11.7.0，以及以上命令安装的浏览器或受支持的本机 Google Chrome。打开 `dsh web` 输出的网址，创建一个会话后，让 agent 依次执行 `browser open https://example.com`、`browser snapshot` 和 `browser click e21`。

`examples/browser/cordis.yml` 会启用 `browser`、`browser-playwright` 和 `tool-browser` 三个 row。它们在普通 Web profile 中保持关闭，因此浏览器自动化始终需要显式启用。

## 安全性

Playwright 浏览器由 Host 进程直接启动，不在 DSH shell sandbox 内运行。它可以访问 Host 可访问的网站；登录后，也会以相应账号的权限执行操作。只应为可信 agent 启用此能力。

- 除非明确需要在重启后保留登录状态，否则保持 `persistent: false`。
- dashboard 默认只绑定 loopback；不要通过公开代理暴露它。
- 不要把浏览器 profile、截图、下载文件、cookie、API key 或 `.env` 文件加入 Git。仓库已忽略常见的本地浏览器目录，但每次提交前仍应检查 `git status`。

Web UI 使用方式见 [browser 示例](examples/browser/README.md)，能力设计见 [browser 子系统参考](docs/subsystems/browser.md)，配置见 [Playwright provider README](packages/browser/browser-playwright/README.md)。

## 社区贡献

代码按 DSH capability seam 组织：

- `packages/browser/browser` 定义 `ctx.browser` 和 provider 选择。
- `packages/browser/browser-playwright` 提供锁定版本的 Playwright CLI 后端。
- `packages/browser/tool-browser` 添加面向模型的 `browser` 与 `browser_help` 工具。
- `packages/client/ui-browser` 渲染可重放的操作记录和实时 dashboard。

欢迎贡献新的 browser provider。请把 provider 进程和会话状态放在 provider 包中，并保持面向模型的工具 schema 与具体 provider 无关。修改 `packages/` 前请先阅读[架构文档](docs/architecture.md)。

## 许可证与来源

源码按 [MIT License](LICENSE) 发布，来自 DeepSeek Harness 的源码提交 `5bb9087465203c46704a9a7ccfa0588d6db7bcb4`；依赖许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
