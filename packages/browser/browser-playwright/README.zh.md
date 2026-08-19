# @deepseek-ai/dsh-browser-playwright

[English](README.md) | 中文

[browser capability seam](../browser/README.md) 的 playwright-cli 提供者：以锁定版本的 `@playwright/cli` 启动专属 daemon 桶，并提供 `show` 面板——Web GUI（`dsh-client-ui-browser`）嵌入其实时 screencast。面向模型的消费方是 [`dsh-tool-browser`](../tool-browser/README.md)。

## 本包职责

- **锁定 CLI** — 依赖 `@playwright/cli@0.1.17`（playwright-core `1.62.0-alpha-1783623505000`）；提供者用 `process.execPath` 运行自身依赖树里的 `<cli>/playwright-cli.js`，从不使用用户全局安装。
- **隔离的 daemon 桶** — 每次调用都以 `browserHome`（默认 `<进程 cwd>/.dsh-browser`）为 cwd，该目录内含 `.playwright` 标记，使 playwright 注册表按此目录给会话分桶，绝不与本机其它 playwright-cli 使用混在一起。因此 `close-all` 只影响 dsh 自己的浏览器。
- **按会话命名** — 每个 dsh 会话经 `-s=` 映射为后端会话 `<sessionPrefix>-<sessionId>`，并行 dsh 会话互不共享浏览器状态。同一后端会话内跨命令保留 cookie；`persistent: true` 时重启后仍保留（`open --persistent`）。
- **面板** — `playwright-cli show --port=<dashboard.port> --host=<dashboard.host>` 在 `browserHome` 目录中以独立进程组运行。提供方保持 CLI 用于判断父进程存活的 stdin 管道打开，将面板根路径的正常重定向视为 HTTP 就绪，并在 dispose 时整组回收。Cordis 插件会等待面板就绪，启动失败时加载失败；面板尚未提供服务时，直接读取可选能力的调用仍会得到 `undefined`。
- **进程姿态** — 浏览器进程由本 host 插件直接启动，绝不经过 shell 沙箱（沙箱无法承载 GUI 浏览器）。这是有意为之：CDP 浏览器是不受限的 GUI 进程，因此 `persistent` 登录态在闭源站点上代表用户的真实权限。默认保持非持久；只在 agent 值得信任的 composition 中挂载本行。

## 配置

```yaml
- id: browser-playwright
  name: '@deepseek-ai/dsh-browser-playwright'
  config:
    dashboard: { enabled: true, port: 12789, host: '127.0.0.1' }
    persistent: false
    sessionPrefix: dsh
    requireBrowser: true
    maxOutputBytes: 65536
    timeoutMs: 120000
```

- `requireBrowser: true` 时，若既无 playwright 托管浏览器也无系统 Chrome 候选，插件加载直接失败；错误信息给出 `playwright-cli install-browser` 修复指引。测试或延后安装时可设为 false，把失败推迟到第一次 `open`。
- `cliPath` 覆盖锁定入口（测试指向 fixture 脚本）；`browserHome` 覆盖 daemon 桶目录。
- 单次 CLI 回复在 stdout+stderr 合计 `maxOutputBytes` 字节处截断并加标记；`timeoutMs` 为每条命令的墙钟预算，超时先 SIGTERM 再 SIGKILL。

## 错误码

`BROWSER_UNKNOWN_COMMAND`、`BROWSER_INVALID_ARGS`、`BROWSER_COMMAND_TIMEOUT`、`BROWSER_COMMAND_ABORTED`、`BROWSER_COMMAND_FAILED`（消息携带 CLI 的有界回复，其中指出真实原因，如浏览器缺失或会话未打开）。

## 模型体验

间接，经由 [`dsh-tool-browser`](../tool-browser/README.md) 把本提供者的有界回复与失败消息渲染进模型上下文；本包不触碰任何 prompt、消息、schema、流或工具结果。

#### KV Cache 效应

无；本包不组装也不发送提供者请求。

## 已知限制与待办

- **面板就绪探测只确认 HTTP 可用** — 端口上已有任意 HTTP 应答即视为就绪，即使属于别的进程；面板无法自证身份。默认端口为本仓库未占用的回环端口。
- **`sessions()` 只报告 dsh 拥有的名字** — 镜像记录本提供者执行过命令的后端会话；URL/标题等事实待 CLI 提供可解析的 `list` 格式。
- **`close` 把 "is not open" 视为成功** — 匹配文本而非退出语义；未来 CLI 可能改写该诊断文案。
- **浏览器构建与版本锁定** — 升级锁定 CLI 需要 `playwright-cli install-browser` 配套构建，并复核 [cli.ts](src/cli.ts) 的 `BROWSER_COMMANDS` 允许清单。
