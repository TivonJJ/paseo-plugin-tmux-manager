# 新建 tmux 会话 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户在列表页点"新建",输入名字,创建空 tmux 会话并自动附加。

**Architecture:** 新增 `tmux.create` RPC(shared 定义,server 实现),新名字校验放在 `shared/` 以便用 `node --test` 单测;客户端 create 成功后调用现有 attach 流程。

**Tech Stack:** TypeScript、zod、`@getpaseo/plugin`、react-query、`node --test`(`shared/*.test.mjs`)。

**Spec:** `docs/superpowers/specs/2026-11-07-create-session-design.md`

## Global Constraints

- tmux 命令只用 argv 数组,不经 shell。
- 新建名字:非空、≤256、不以 `-` 开头、无空白/控制字符(同 `isValidSessionName`),另外拒绝 `.` 和 `:`。
- 创建命令:`new-session -d -s <name> -c $HOME`;`#` 双写为 `##`。
- 同名会话已存在时报错,不覆盖。
- 创建成功但附加失败:保留会话,只显示附加错误。
- 测试运行:`npm test`,类型检查:`npm run typecheck`。

## Review Focus

- 名字含 `#(touch x)`:不得执行命令,会话名按字面创建。
- 名字含 `.` 或 `:`:创建前拒绝并提示,不静默改名。
- 同名已存在:报错且原会话不受影响。
- 名字前后带空格:视为非法(与现有校验一致),不 trim 后偷偷创建。
- 创建成功、附加失败:列表里能看到新会话,界面给出附加错误。

---

### Task 1: 新建名字校验与 RPC 定义

**Files:**
- Create: `shared/session-name.ts`
- Create: `shared/session-name.test.mjs`
- Modify: `shared/tmux.ts`(末尾追加 `createSessionRpc`)

**Interfaces:**
- Produces: `validateNewSessionName(name: string): string | null`(合法返回 `null`,否则返回错误文案);`createSessionRpc`(`tmux.create`,input `{ name: string }`,output `{ name: string }`)。

- [ ] **Step 1: 写失败测试** `shared/session-name.test.mjs`,用 `node:test`,断言:`validateNewSessionName("work")===null`;`""`、`"-x"`、`"a b"`、`"a.b"`、`"a:b"`、`" work"`、`"a".repeat(257)` 均返回非 null 字符串;`"work#(touch x)"` 返回 null(`#` 合法,由服务端转义)。
- [ ] **Step 2: 运行** `npm test`,预期 FAIL(模块不存在)。
- [ ] **Step 3: 实现** `shared/session-name.ts` 中的 `validateNewSessionName`,正则与现有 `SESSION_NAME_RE` 一致,再加 `.`、`:` 检查;错误文案用中文或英文均可,但同一文件内统一(界面现有文案为英文,用英文)。
- [ ] **Step 4: 在** `shared/tmux.ts` 追加 `createSessionRpc = defineRpc({ name: "tmux.create", input: z.object({ name: z.string() }), output: z.object({ name: z.string() }) })`。
- [ ] **Step 5: 运行** `npm test && npm run typecheck`,预期全部通过。
- [ ] **Step 6: 提交** `feat: add create-session rpc and name validation`

### Task 2: 服务端创建会话

**Files:**
- Modify: `server/tmux.ts`(新增导出 `createSession`)
- Modify: `server/handlers.ts`(注册 `createSessionRpc` 处理器)

**Interfaces:**
- Consumes: `validateNewSessionName`、`createSessionRpc`(Task 1);`listSessions`、`run`、`TmuxCommandError`(现有)。
- Produces: `createSession(name: string): Promise<void>`。

- [ ] **Step 1: 实现** `createSession(name)`:先 `validateNewSessionName`,非 null 则抛 `Error(该文案)`;再用现有 `listSessions()` 检查同名(包含已有的非 paseo 会话),存在则抛 `Error("tmux session already exists: <name>")`;然后执行 `new-session -d -s <name 中 # 替换为 ##> -c <process.env.HOME || "/">`。
- [ ] **Step 2: 在** `registerHandlers` 中 `server.handle(createSessionRpc, async ({ name }) => { await createSession(name); return { name }; })`。
- [ ] **Step 3: 手动验证**(本机 tmux,用私有 socket 不适用于 `run`,因此用真实默认 socket 并事后清理):在 node 下以 `--experimental-strip-types` 调用 `createSession("plan-check")`,`tmux ls` 能看到该会话;再次调用同名抛错;`createSession("x#(touch /tmp/plan_pwned)")` 后 `/tmp/plan_pwned` 不存在且会话名字面包含 `#(`;最后 `tmux kill-session` 清理这些会话。
- [ ] **Step 4: 运行** `npm run typecheck`,预期无错误。
- [ ] **Step 5: 提交** `feat: create tmux sessions from the plugin server`

### Task 3: 客户端"新建"入口

**Files:**
- Modify: `client/tmux-screen.tsx`

**Interfaces:**
- Consumes: `createSessionRpc`(Task 1)、`validateNewSessionName`(Task 1)、现有 `attachSessionRpc`、`openTerminalTab`。

- [ ] **Step 1: 在** `TmuxScreen` 中加 `const create = useRpc(createSessionRpc)`、状态 `newOpen: boolean`、`newName: string`。
- [ ] **Step 2: 加** `createMutation`:`mutationFn` 先 `create({ name })`,成功后立即 `query.refetch()`,再调用已有的 attach(复用 `attachMutation.mutate(name)`);创建失败显示 `Create failed: <message>`,附加失败沿用现有 `Attach failed` 文案。
- [ ] **Step 3: 头部栏加"New"按钮**(与 Refresh 并排,`accessibilityLabel="New tmux session"`);点击打开 `Modal`,内含 `TextInput`(`autoCapitalize="none"`、`autoCorrect={false}`)和 Cancel / Create 按钮。名字未通过 `validateNewSessionName` 时,在输入框下显示错误文案并禁用 Create。
- [ ] **Step 4: 运行** `npm run typecheck && npm test`,预期通过。
- [ ] **Step 5: 无法在本机启动 Paseo 应用时**,明确说明界面未实机验证,只验证了类型检查与服务端行为。
- [ ] **Step 6: 提交** `feat: add New session button to the tmux screen`

### Task 4: 文档

**Files:**
- Modify: `OVERVIEW.md`、`README.md`

- [ ] **Step 1: 将** OVERVIEW.md 中"The plugin never creates or kills tmux sessions."改为说明插件可以新建空会话并自动附加,也可以关闭会话;同步修改 README.md 里相关描述,并在命令列表中补上 `tmux new-session`。
- [ ] **Step 2: 提交** `docs: document creating tmux sessions`

---

## Self-Review

- Spec 覆盖:RPC/校验(Task 1)、服务端创建/同名/`#` 转义/`$HOME`(Task 2)、按钮+弹窗+自动附加+失败处理(Task 3)、文档(Task 4)。
- 类型一致:`validateNewSessionName`、`createSessionRpc`、`createSession` 在各任务中命名一致。
- Review Focus 的五项分别由 Task 1 测试(名字、`.`/`:`、空格)、Task 2 手动验证(同名、`#(`)、Task 3(附加失败)覆盖。
