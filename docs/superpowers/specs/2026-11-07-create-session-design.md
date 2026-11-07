# 新建 tmux 会话(设计)

## 目的
让用户在 Paseo(尤其手机端)里直接新建一个空的 tmux 会话,不必先去终端里执行 `tmux new`。创建后立刻附加,打开终端标签页。

## 目标 / 非目标
- 目标:输入一个名字,创建后台空会话,成功后自动附加。
- 非目标:选择工作目录、创建时运行命令、模板、重命名。
- 反目标:不能覆盖或影响已有会话;不能让会话名触发 tmux 格式展开或 shell 执行。

## 方案(已选 B)
- A. 只创建,留在列表:最简单,但还要再点一次附加。
- **B. 创建后自动附加(选中)**:复用现有附加流程,一步到位。
- C. 名字加目录选择:需要额外的选择界面,留待以后。

## 设计
- 共享:`shared/tmux.ts` 新增 `createSessionRpc`(`tmux.create`),输入 `{ name }`,输出 `{ name }`。
- 服务端 `server/tmux.ts`:新增 `createSession(name)`:
  - 校验:复用 `isValidSessionName`,另外拒绝 `.` 和 `:`(tmux 会静默改成 `_`)。
  - 同名检查:已存在则报错,不覆盖。
  - 执行 `new-session -d -s <name> -c $HOME`,argv 数组,无 shell。`name` 里的 `#` 双写,与 PR #1 的处理一致,避免格式展开。
- 服务端 `server/handlers.ts`:`tmux.create` 处理器调用 `createSession`;客户端随后调用现有 `tmux.attach`。
- 客户端 `client/tmux-screen.tsx`:头部加"新建"按钮,弹出名字输入框(Modal),提交后 create → attach → `openTerminalTab`;失败显示错误,成功后刷新列表。
- 文档:更新 README 和 OVERVIEW 里"插件从不创建会话"的描述。

## 构建者自行决定
- 弹窗文案、按钮图标、输入框校验的即时提示。
- 创建成功但附加失败时:保留会话并显示附加错误。
- 目录默认 `$HOME`,会话因此归入 tmux-ops 兜底 workspace(除非 `$HOME` 匹配某个 workspace)。
