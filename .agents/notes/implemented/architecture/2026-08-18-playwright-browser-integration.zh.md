# Agent Note: Playwright browser capability and Web details view

Status: implemented

[English](2026-08-18-playwright-browser-integration.md) | 中文

## Problem

Harness 需要一个按会话绑定的 CDP 浏览器工具，以及一个同时展示实时 Playwright dashboard 和可在刷新后恢复的动作历史的 Web details 视图。浏览器 daemon 写入进程级状态，不能经由 shell sandbox 运行；dashboard 与 provider registry 也是 Host 进程资源，而不是按会话创建的服务。

## Decision

浏览器能力拆分为 `dsh-browser`（Service Definition）、`dsh-browser-playwright`（Provider）和 `dsh-tool-browser`（Consumer）。provider 由 Host 进程直接启动锁定版本的 Playwright CLI 与 dashboard，通过 `browserHome` 和清洗后的 `dsh-<sessionId>` 名称隔离会话，dashboard 仅绑定回环地址，保持 CLI 用于判断父进程存活的 stdin 管道打开，并把 dashboard 根路径的正常重定向视为 HTTP 就绪；浏览器不可用或 dashboard 未就绪时，plugin 加载失败。默认 profile 不持久化，因为持久 profile 会携带配置 Host 用户的登录权限。

consumer 不新增 session event。它将现有 `tool/call`、`tool/result` 与 `tool/code-dispatch` 记录折叠为同步的 `browser/feed` 投影，处理持久日志中的 JSON 文本参数、结果摘录上限、pending 状态和可重放的行数限制。Host 的 `host.describe` 响应只公布可选 dashboard URL，不强制浏览器能力存在。

Web 客户端将 `conversation.details.view` 扩展为按 session 作用域的 list。DetailsPanel 保留原有 `conversation.details.tool` 子 slot 负责内建工具输出，并通过新 list 暴露非工具视图；`ui-browser` 贡献 `browser` 配置项，嵌入可选 dashboard 并渲染动作流。可选视图保持挂载，非活动配置项使用 CSS 隐藏，使 browser 组件可以观察第一条动作流并自动选择和打开自己的标签页。

Web bundle 保持三个 Host 行禁用，并始终包含 client 行。浏览器 overlay 为受信任的部署启用 Host 行。这样普通 Web session 不会意外获得进程级 Host 单例，同时保持一个在能力缺失时显示不可用状态的 client 组合。

## Alternatives considered

**通过 shell 或 subprocess capability 运行 Playwright。** shell sandbox 无法提供浏览器 daemon 所需的 Host 文件系统和 GUI 进程行为，因此 provider 由 Host 直接启动子进程，并明确记录由此产生的信任姿态。

**新增浏览器专用 session event。** 已有的 tool call、result 与 Code Mode dispatch 记录已经携带面向模型的浏览器操作和结果。对这些记录做投影可以保留 session format，让原生调用与 Code Mode 调用在不增加第二套持久词汇的情况下汇合。

**只渲染活动的 details 配置项。** 标准 `only` dispatch 会阻止非活动 browser 配置项观察动作流变化并打开面板。因此这个需要 watcher 的 details 列保持配置项挂载，并用 CSS 隐藏；包 README 记录了这项局部例外。

## Consequences

即使 shell execution 受到约束，Host 进程仍可以启动 GUI 浏览器，因此启用 provider 是有意的信任决策。启用 dashboard 时，dashboard 启动属于加载期依赖；它公布的回环 URL 不是远程访问机制。动作历史通过 session log 在刷新后保留，但 dashboard iframe 始终显示实时浏览器状态。即使 Host 浏览器行未启用，client 标签也可以挂载并报告能力缺失，不会改变基础 Web 组合。

## Verification

Provider lifecycle 与 CLI 测试覆盖直接 spawn 路径和 dashboard teardown；browser tool 与 projection 测试覆盖 schema 校验、原生及回放调用、Code Mode dispatch、边界和持久 JSON 参数。Client 与 Host TypeScript aggregate 已纳入新包，Web bundle roster 也包含禁用的 Host 行与 client 行。
