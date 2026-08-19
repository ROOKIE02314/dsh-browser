# browser

[English](README.md) | 中文

该 overlay 为 Web bundle 启用 Playwright 浏览器能力。它面向受信任的 browser preset：提供方由 Host 进程直接启动 CDP 浏览器与 dashboard，不经过 shell sandbox；会话 agent 可使用 `browser` 工具。

## 运行

先构建前端，再使用 overlay 启动 Web：

```sh
pnpm run build
pnpm dsh web --patch examples/browser/cordis.yml
```

打开终端打印的 URL，创建或选择一个会话，然后让 agent 使用 `browser open https://example.com`、`browser snapshot`，以及后续的 `browser click e21` 等操作。第一次动作到达后，details 栏会打开 Browser 标签；provider 就绪时可以看到实时 Playwright dashboard。

通过 dashboard 手动登录后，该会话的 cookie 会被后续工具调用复用。除非部署明确接受登录状态留在 Host 进程中，否则保持 `persistent: false`。

## 范围

该 overlay 启用三个 Host 行，但不定义独立的 agent preset 格式。若部署只希望特定会话访问浏览器，应将这组组合接入已有 preset 机制，并保持这些行属于 Host plane。dashboard 只绑定回环地址，动作流可从会话日志重放；iframe 本身是实时视图，不参与回放。

## Model Experience

会话从 [`dsh-tool-browser`](../../packages/browser/tool-browser/README.md) 获得 `browser` 与 `browser_help` 工具；Browser 标签由 [`dsh-client-ui-browser`](../../packages/client/ui-browser/README.md) 提供。

## 已知限制与后续工作

- provider 对进程使用一个 `browserHome` 与 dashboard workspace，暂不提供按 workspace 分组的 dashboard。
- 浏览器可执行文件缺失或 dashboard 启动失败会阻止 browser provider 加载；错误信息会指出安装问题或需要修正的端口。
- dashboard 仅绑定回环地址，且直接 Host spawn 会绕过 shell sandbox；不要为不受信任的 agent 启用该 overlay。
