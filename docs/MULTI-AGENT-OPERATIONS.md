# 多 Agent 操作流程规范 v1.0（草案）

> **状态**：评审中 · **生效**：评审通过后
> **适用范围**：所有 AI Agent（OpenClaw 子 agent）、人类开发者通过 agent 协作的场景
> **来源**：BrewYuKoLi 项目实际落地经验 + subagent-orchestrator skill v2 通用规范

---

## 目录

1. [多 Agent 协作架构](#1-多-agent-协作架构)
2. [Worktree 管理规范](#2-worktree-管理规范)
3. [任务分解与派发规范](#3-任务分解与派发规范)
4. [定时汇报与检查规范](#4-定时汇报与检查规范) ← **每15分钟汇报到WebChat**
5. [代码修改影响矩阵](#5-代码修改影响矩阵)
6. [构建产物与缓存规范](#6-构建产物与缓存规范)
7. [并行修改冲突预防](#7-并行修改冲突预防)
8. [标准提交流程规范](#8-标准提交流程规范) ← **重写：完整流程 本地提交→验证→rebase→push**
9. [风险操作清单](#9-风险操作清单)
10. [常见问题场景](#10-常见问题场景)
11. [附录](#11-附录) ← **一键检查脚本 + 定时回复异常处理**

---

## 1. 多 Agent 协作架构

### 1.1 角色定义 🔴

```
主 Agent（指挥官）
├── 任务分解、分配、质量把控
├── 定时检查进度、处理异常（每15分钟汇报一次）
├── 批量合并、验证、推送
└── 向人类汇报执行状态

子 Agent（执行者）
├── 单一明确任务（1-2 文件）
├── 在自己的 worktree 上工作
├── 完成任务后 push 到远端分支
└── 遇到问题立即报告，不自行突破限制
```

### 1.2 通信协议 🔴

| 方向 | 方式 | 触发条件 |
|------|------|---------|
| 主 → 子 | `sessions_spawn` 派发任务 | 任务分配时 |
| 子 → 主 | push 通知（GitHub 事件） | 子 agent 完成推送到远端分支 |
| 主 → 子 | `subagents(action=steer)` 干预 | 子 agent 超时/偏离轨道 |
| 子 → 主 | 子 agent 直接报告 | 遇到无法处理的失败 |
| 主 → 人类 | `message` 到 webchat | **每15分钟定时汇报** |
| 主 → 人类 | `message` 到 webchat | 异常升级、需要决策、构建失败 |
| 子 → 人类 | ⚠️ 不允许 | 子 agent **禁止**直接联系人类 |

### 1.3 并发上限 🔴

| 资源 | 上限 | 说明 |
|------|------|------|
| 子 Agent 并发 | 6 个 | 超过则拆分批次 |
| Worktree 并行 | 6 个 | 与子 agent 一一对应 |
| 同一文件同时编辑 | 1 个 | 巨型文件(>3000行)绝对串行 |
| 单次派发总 token | 子 agent 每个任务 <3000 字符 | 超过则拆分为子任务 |

### 1.4 执行环境检查 🔴

执行任何 Git 操作前，主 agent **必须在当前 session 的 worktree 目录下执行**，确保：

```bash
pwd
# 必须是 /Users/chee/Projects/BrewYuKoLi/ 或其 worktree 子目录
# 绝对不要在 homebrew、系统目录或其他项目中执行
```

---

## 2. Worktree 管理规范

### 2.1 Worktree 初始化流程 🔴

```bash
# 1. 确认主工作目录干净
cd /Users/chee/Projects/BrewYuKoLi
git status --porcelain    # 必须为空

# 2. 同步远端
git fetch origin && git checkout dev && git pull origin dev

# 3. 确认无残留 worktree
git worktree list | grep -v "^$(pwd)"

# 4. 确认无残留临时分支
git branch | grep "dev-"

# 5. 创建 worktree + node_modules 符号链接
PROJECT_DIR=$(pwd)
for suffix in a b c; do
  BRANCH="dev-feat-<描述>-${suffix}"
  WT_DIR="../BrewYuKoLi-${suffix}"
  git worktree add "$WT_DIR" -b "$BRANCH"
  ln -sf "$PROJECT_DIR/node_modules" "$WT_DIR/node_modules"
  git push origin "$BRANCH"
done

# 6. 验证 worktree 可用
cd "$WT_DIR" && node -c src/assets/js/swup-init.js && cd "$PROJECT_DIR"
```

### 2.2 Worktree 清理规范 🔴

```bash
# 清理所有 worktree（分支已合并后）
git worktree list | grep -v "^$(pwd)" | awk '{print $1}' | while read wt; do
  git worktree remove "$wt" --force 2>/dev/null
done
git branch | grep "dev-" | while read b; do
  git branch -D "$b" 2>/dev/null
done
```

### 2.3 Worktree 内的约束 🔴

- Worktree 是**完整 Git 仓库**，有自己的 `.git/`（指向主仓库的 `.git/worktrees/`）
- 每个 worktree 在**独立分支**上工作，**永远不碰 `dev` 或 `master`**
- 子 agent **只 push 到自己的远端分支**，不 merge、不 push 到 `dev`
- 子 agent 的 `user.name` / `user.email` 可能从全局配置读取，**禁止设置 `--no-verify`**
- 子 agent 工作前必须 `git pull origin <自己的分支>` 确保同步（防多人修改同一分支的极端情况）

### 2.4 依赖管理 🟡

```bash
# 创建 worktree 后必须做 node_modules 符号链接
ln -sf /Users/chee/Projects/BrewYuKoLi/node_modules /Users/chee/Projects/BrewYuKoLi-agent-a/node_modules

# 如果主项目新增了 npm 依赖，需要在主仓库安装后重新链接
npm install <pkg>   # 在主仓库执行
# worktree 的符号链接自动生效（无需重新链接）
```

---

## 3. 任务分解与派发规范

### 3.1 任务分解原则 🔴

| 规则 | 说明 |
|------|------|
| **1-2 文件** | 每个 task 只改 1-2 个文件，不超过 3 个屏幕 |
| **改不同文件 → 并行** | 各自独立，无冲突风险 |
| **改同文件 → 串行** | 一个完成后才能派下一个 |
| **巨型文件(>3000行) → 绝对串行** | 任何时候只能有 1 个子 agent 在改 |
| **精确到行号** | 任务描述给出文件路径、行号范围、修改目标 |

### 3.2 派发前检查清单 🔴

```bash
# 1. 主工作目录干净？
git status --porcelain
# 输出必须为空

# 2. 目标文件行数？
wc -l src/assets/js/<file>.js
# < 300 → 直接派发
# 300-1000 → 考虑拆分
# > 1000 → 必须先拆分

# 3. 是否有其他人正在改同一文件？
subagents(action=list)    # 检查活跃子 agent
```

### 3.3 子 Agent 任务描述模板 🔴

每条派发消息必须包含以下字段：

```
## 任务：[简短描述]

### 工作环境
- 工作目录：~/Projects/BrewYuKoLi-<suffix>（git worktree）
- 分支：dev-feat-<描述>（已 checkout，无需切换）
- 拉取：git pull origin dev-feat-<描述>（确保最新）

### 修改内容
- 文件：[精确路径]
- 行号范围：[起始行-结束行]（修改已有代码时）
- 目标：[具体要做什么]
- 🔴 禁止改的文件：[列表]

### 验证
- `node -c <文件>` 确认语法
- `git add -A && git commit -m "type(scope): <desc>"`

### 🔴 红灯
1. 禁止改其他文件
2. 禁止 git push --no-verify（如 pre-push 失败，报告给主 agent）
3. 禁止执行 npm run fix:all / lint:fix / lint:all:fix
4. 禁止 merge 或 push 到 dev
5. 禁止直接联系人类
6. 遇到验证失败，直接报告，不要自行修复

### ✅ 完成标准
- 有新的 commit（commit 内容符合规范）
- 语法检查通过
- 仅修改了任务指定的文件

### 输出格式
✅ 完成 | commit: <hash> | 改动: <文件列表>
```

### 3.4 子 Agent 产出校验（主 Agent 必须执行）🔴

收到子 agent 完成通知后，按以下顺序校验：

```bash
# 1. 确认有新 commit
git log -1 --oneline dev-feat-<描述>

# 2. 检查改动范围是否超出任务声明
git diff dev --name-only dev-feat-<描述>
# 如果改了任务外的文件 → 放弃重来

# 3. 确认 push 到了正确的分支
git log origin/dev-feat-<描述> -1 --oneline

# 4. 语法检查
node -c src/assets/js/<file>.js

# 5. 残留冲突标记检查
grep -rn "^<<<<<<< \|^=======\|^>>>>>>> " src/ 2>/dev/null
```

### 3.5 合并规范 🔴

```bash
# 合并前：拉取最新 dev
git fetch origin && git checkout dev && git pull origin dev

# 合并所有 feature 分支（逐个）
for branch in dev-feat-a dev-feat-b dev-feat-c; do
  git merge --no-ff "$branch" -m "feat: merge $branch"
  if [ $? -ne 0 ]; then
    echo "❌ $branch 有冲突，手动解决后继续"
    break
  fi
done

# 合并后验证
node -c src/assets/js/<file>.js  # 每个被改文件
grep -rn "^<<<<<<< \|^=======\|^>>>>>>> " src/  # 冲突标记
npm run lint:all
npm test

# 推送
git push origin dev
```

### 3.6 子 Agent 失效处理 🔴

| 症状 | 处理方式 |
|------|---------|
| 5 分钟无产出 | `subagents(action=list)` → kill → 改进描述重派 |
| 反复失败 3 次 | 放弃重派，主 agent 自行完成 |
| 限流(429) | kill → 等待 30s → 减少并发重试 |
| 改了额外文件 | git reset 回退 → kill → 重新派发，加强约束 |
| pre-push 失败 | 报告给主 agent 处理，不要绕过 |

---

## 4. 定时汇报与检查规范

### 4.1 每15分钟进度汇报 🔴

使用 OpenClaw cron 创建定时汇报：**每 15 分钟**执行一次，输出到 **webchat** 渠道。

```yaml
# 每15分钟定时汇报
name: "brew-yukoli-15min-check"
schedule:
  kind: "every"
  everyMs: 900000  # 15分钟 = 900000ms
payload:
  kind: "agentTurn"
  message: |
    执行 BrewYuKoLi 项目健康检查，输出当前状态简报。

    检查清单：
    1. cd ~/Projects/BrewYuKoLi
    2. git fetch origin --quiet 2>&1
    3. git status --short
    4. git log --since="15 minutes ago" --oneline --all --format="%h %s"
    5. git branch -a --no-merged dev | grep "dev-feat" | head -10
    6. subagents(action=list) 2>/dev/null
    7. git diff origin/dev --stat 2>/dev/null
    8. 检查是否有残留冲突标记: grep -rn "^<<<<<<< \|^=======\|^>>>>>>> " src/ 2>/dev/null

    按模板输出简报。如果无变化，输出 HEARTBEAT_OK（在 cron job 中不发送空消息）。
    如果发现异常（构建失败、冲突残留、子 agent 失联），立即输出简报并标记 🔴。
sessionTarget: "isolated"
delivery:
  mode: "announce"
  channel: "webchat"
```

### 4.2 简明汇报模板

```
📊 BrewYuKoLi | YYYY-MM-DD HH:mm

━━━━━━━━━━━━━━━━━━
📦 最近15分钟产出
━━━━━━━━━━━━━━━━━━
✅ type(scope): desc — Agent-X
⏳ type(scope): desc（进行中，Agent-Y）

━━━━━━━━━━━━━━━━━━
🔀 分支状态
━━━━━━━━━━━━━━━━━━
dev → origin/dev ✅（N commits ahead）
dev-feat-xxx → 待合并 📋
dev-feat-yyy → 正在运行 🔄

━━━━━━━━━━━━━━━━━━
🖥️ 子 Agent 状态
━━━━━━━━━━━━━━━━━━
Agent-X ✅ 已完成（2 commits）
Agent-Y 🔄 运行中（12分钟）
Agent-Z ⏳ 等待中

━━━━━━━━━━━━━━━━━━
⚠️ 异常
━━━━━━━━━━━━━━━━━━
🔴 [问题描述] / 无异常 ✅
```

### 4.3 定时回复异常处理 🟡

| 场景 | 行为 | 说明 |
|------|------|------|
| cron 任务**正常但无变化** | 输出 `HEARTBEAT_OK` | 不发噪音 |
| cron 任务**发现异常** | 输出简报 + `🔴` 标记 | 自动输出到 webchat |
| cron 任务**挂起/失败** | 检查 cron 任务状态 | 用 `cron action=list` 查看 |
| **连续 3 次**检查无响应 | 主动通知人类 | `message(channel=webchat)` 告知异常 |
| 主 agent **收到子 agent 完成通知** | **立即执行**产出校验 | 不等下一个 15 分钟周期 |
| 人类**在 webchat 回复** | 主 agent 立即优先处理 | 暂停其他工作，先响应人类 |

### 4.4 每日 18:00 完整报告 🟡

```yaml
name: "brew-yukoli-daily-report"
schedule:
  kind: "cron"
  expr: "0 18 * * 1-5"
  tz: "Asia/Shanghai"
payload:
  kind: "agentTurn"
  message: |
    执行 BrewYuKoLi 日终完整报告。
    ...
    （同 4.1 格式 + 本周统计）
sessionTarget: "isolated"
delivery:
  mode: "announce"
  channel: "webchat"
```

### 4.5 分支合并状态检查命令 🟡

```bash
# 提交统计
git log --since="today 00:00" --oneline --all --format="%h %s (%an)"

# 待合并分支
git branch --no-merged dev | grep "dev-"

# 与 origin 差异
git rev-list --left-right --count origin/dev...dev

# 本周统计
git log --since="1 week ago" --oneline --all | wc -l

# 活跃子 agent
subagents(action=list)

# 冲突标记残留
grep -rn "^<<<<<<< \|^=======\|^>>>>>>> " src/ 2>/dev/null
```

### 4.6 紧急情况通知 🔴

- **构建失败**：`npm run build:dev` 失败 → 立即通知主 agent → 主 agent 通知人类
- **合并冲突**：自动合并失败 → 主 agent 立即处理
- **子 agent 集体失败**：3 个以上同时失败 → 暂停并发，排查根因
- **定时回复检测到异常**（连续失败、token 耗尽）→ 输出 `🔴` 报告
- **通知链**：主 agent → `message(channel="webchat")` 发送到 webchat

---

## 5. 代码修改影响矩阵

### 5.1 修改类型与操作对照表 🔴

| 修改类型 | 需重启 dev-server? | 需重新构建? | 需删 dist? | 浏览器需刷新? |
|---------|:--:|:--:|:--:|:--:|
| **HTML 文件**（`src/pages/**/*.html`） | ❌ | ✅ | ❌ | ✅ |
| **JS 文件**（`src/assets/js/*.js`） | ❌ | ✅ | ❌ | ✅ |
| **CSS 文件**（`src/assets/css/*.css`） | ❌ | ✅ | ❌ | ✅ |
| **site.config.js** | ❌ | ✅ | ❌ | ✅ |
| **webpack 配置** | ❌ | ✅ | ✅ | ✅ |
| **build.sh / build-ssg.js** | ❌ | ✅ | ✅ | ✅ |
| **tailwind.config.js** | ❌ | ✅ | ❌ | ✅ |
| **server.js / 服务端代码** | ✅ | ❌ | ❌ | ❌ |
| **新增 npm 依赖** | ✅ | ✅ | ❌ | ✅ |
| **package.json scripts** | ❌ | ❌ | ❌ | ❌ |
| **语言文件**（`src/assets/lang/*.json`） | ❌ | ✅ | ❌ | ✅ |
| **图片**（`src/assets/images/*`） | ❌ | ✅ | ❌ | ✅ |
| **字体**（`src/assets/fonts/*`） | ❌ | ✅ | ❌ | ✅ |
| **Service Worker（`src/sw.js`）** | ❌ | ✅ | ❌ | ✅（SW 更新） |
| **文档（`docs/*.md`）** | ❌ | ❌ | ❌ | ❌ |
| **测试文件**（`tests/*`） | ❌ | ❌ | ❌ | ❌ |
| **vendor 文件**（`src/assets/js/vendor/*`） | ❌ | ❌ | ❌ | ❌（复制自 node_modules） |

### 5.2 何时需要删除 dist/ 重新构建 🔴

| 场景 | 原因 |
|------|------|
| webpack 配置变更 | 缓存规则变化，旧 dist 可能结构不兼容 |
| build.sh 或构建脚本修改 | 构建流程变化 |
| 新增/删除页面（SSG） | build-ssg.js 的页面列表变了 |
| 怀疑 dist 状态不一致 | 比如多个版本的文件混在一起 |
| 切换分支后首次构建 | 不同分支的 dist 结构可能不同 |

**不需要删 dist 的场景**：
- 修改单个 JS/CSS/HTML 文件（`npm run build:dev` 自动覆盖）
- 修改 site.config.js（配置驱动，所有页面引用同一个文件）

### 5.3 构建命令选择指南 🔴

| 场景 | 推荐命令 | 说明 |
|------|---------|------|
| 日常开发，改 JS/HTML/CSS | `npm start` | webpack dev server，HMR |
| 改完要验证构建产物 | `npm run build:dev` | 无 hash，快速 |
| 仅改产品数据 | `npm run build:dev:pack` | 跳过图片，最快 |
| 发布前 | `npm run build:production` | 完整流程 + 带 hash |
| 改 tailwind 配置 | `npm run build:css` (然后 `npm run build:dev`) | 先重新编译 Tailwind |

### 5.4 开发服务器（webpack-dev-server）重启时机 🟡

| 场景 | 热更新? | 需重启？ |
|------|:-:|:-:|
| 改 CSS（`styles.css`） | ✅ | ❌ |
| 改 JS（`*.js`） | ✅ | ❌ |
| 改 HTML（`*.html`） | ✅ 自动刷新 | ❌ |
| 改 `tailwind.config.js` | ❌ | ✅（需`npm run build:css`后重启） |
| 改 `webpack.config.js` | ❌ | ✅ |
| 改 `server.js` | ❌ | ✅（或 `npm run dev` 用 nodemon） |

---

## 6. 构建产物与缓存规范

### 6.1 产物分类 🔴

| 目录/文件 | 性质 | Git 追踪? | 说明 |
|-----------|:----:|:---------:|------|
| `dist/` | 构建产物 | ❌ `.gitignore` | 每次构建自动重新生成 |
| `src/assets/css/tailwind.css` | 生成文件 | ✅ 追踪 | Tailwind 编译产物，提交以加速部署 |
| `node_modules/` | 依赖 | ❌ | `npm install` 生成 |
| `temp/` | 临时文件 | ❌ | 构建中间产物 |
| `src/assets/js/vendor/*.umd.js` | 复制文件 | ✅ 追踪 | 从 node_modules 复制到 src |
| `*.pem`, `*.key`, `*.crt` | 本地证书 | ❌ | `https-server.js` 生成 |
| `.image-cache.json` | 缓存 | ❌ | 图片处理缓存 |
| `.tool-versions` | 配置 | ✅ 追踪 | version manager 配置 |

### 6.2 不应被修改的文件 🔴

以下文件是由工具/脚本自动生成的，**AI Agent 不要手动编辑**：

| 文件 | 生成方式 | 为什么不能改 |
|------|---------|-------------|
| `src/assets/css/tailwind.css` | `npm run build:css` 编译 | 修改会被下一次 build 覆盖 |
| `src/assets/images/*.webp` | 优化脚本或设计工具 | 源头文件在其他地方 |
| `package-lock.json` | `npm install` 自动更新 | 手动编辑会被 npm 覆盖 |
| `node_modules/` | `npm install` | 依赖包，改无效 |
| `*.pem`, `*.key`, `*.crt` | `https-server.js` 生成 | 本地开发证书，每次启动可能重生成 |
| `.image-cache.json` | 图片优化脚本 | 缓存文件，删除会自动重建 |

**例外**：`src/assets/js/product-data-table.js` 根据 BUILD.md 说明是手动维护的，可以手动修改。但如果未来改为自动化生成（CMS publish），则不再手动编辑。

### 6.3 需要手动维护的文件 🔴

| 文件 | 说明 | 修改前需确认 |
|------|------|-------------|
| `src/assets/js/product-data-table.js` | 产品数据表 | 格式是否与 JS 模块兼容 |
| `src/assets/lang/*.json` | 翻译文件 | JSON 格式是否正确，UTF-8 编码 |
| `src/assets/images/*.webp` | 产品图/素材 | 尺寸和格式是否符合 IMAGES.md 规范 |
| `site.config.js` | 站点配置 | 反向依赖表（见 SITE-CONFIG.md） |

### 6.4 Service Worker 缓存注意事项 🟡

- 生产构建带 `contenthash` 的文件名（如 `bundle.abc123.js`），浏览器自动缓存破除
- `sw.js` 内的文件列表必须与 `dist/` 实际文件一致
- 日常测试时用 `npm run build:dev`（无 hash），避免 sw.js 缓存错配
- 修改 `sw.js` 后需要：重新构建 → 浏览器中 hard refresh（Cmd+Shift+R）

### 6.5 Vendor 文件管理规范 🟡

| 操作 | 正确方式 |
|------|---------|
| 新增 npm 依赖 | `npm install <pkg>`（在主仓库执行，worktree 自动通过符号链接使用） |
| 新增 vendor UMD 文件 | `cp node_modules/<pkg>/dist/*.umd.js src/assets/js/vendor/` |
| 更新 vendor UMD 文件 | 同上 cp 覆盖 |
| 删除 vendor UMD 文件 | 确认没有页面引用后，直接删除 + 提交 |

---

## 7. 并行修改冲突预防

### 7.1 高冲突文件 🔴

以下文件可能被多个任务同时修改，需要串行处理或精确分区：

| 文件 | 冲突风险 | 策略 |
|------|---------|------|
| `site.config.js` | 🔴 极高 | 同一时间只能 1 个 agent 改 |
| `src/index.html` | 🔴 高 | 脚本加载顺序变更会互相影响，串行 |
| `src/assets/js/navigator.js` | 🔴 高 | 导航项变更加 active 状态逻辑，串行 |
| `src/assets/css/styles.css` | 🟡 中 | 如有新变量加在 `:root` 块，指定精确插入行 |
| `src/assets/js/translations.js` | 🟡 中 | 同一个模块，尽量 1 个 agent |
| 语言文件 (`zh-CN-ui.json` 等) | 🟡 中 | 不同语言 = 不同文件，可并行 |
| `build.sh` | 🟡 中 | 构建流程变更，串行 |
| `webpack.config.js` | 🔴 高 | 配置结构变化大，串行 |

### 7.2 同一文件并行处理策略 🟡

```
方案 A（推荐）：合并为 1 个 task，1 个 agent 完成所有修改
方案 B（按区域）：每个 task 声明精确行号范围 + "不要改其他区域"
方案 C（串行）：一个完成后才派下一个
```

### 7.3 分支命名约定 🔴

```bash
dev-feat-<描述>-<后缀>   # 多 agent 并行场景
  # 示例：dev-feat-i18n-a, dev-feat-i18n-b, dev-feat-i18n-c
  # 注意：不同分支不应改同一文件

# 单一任务场景（单 agent，不需要 worktree）
feat/add-footer-cta
fix/nav-mobile-close
refactor/extract-config-bridge
```

### 7.4 工作目录命名约定 🟡

```bash
../BrewYuKoLi-a/        # Agent A 的 worktree
../BrewYuKoLi-b/        # Agent B 的 worktree
../BrewYuKoLi-c/        # Agent C 的 worktree
# 与分支后缀约定一致：dev-feat-xxx-a → BrewYuKoLi-a
```

---

## 8. 标准提交流程规范 🔴

> **任何代码变更必须经历：本地提交 → 全部验证通过 → rebase 同步远端 → 处理异常与冲突直至 rebase 结束 → push（不使用 --force/--no-verify）**

### 8.1 总体流程 🔴

```
┌─────────────────────────────────────────────────────────────┐
│ ① 代码变更完成                                              │
│    ├── 汇总所有修改, 按主题分组为逻辑独立的 commit             │
│    └── 确保工作区干净 (git status --porcelain)                │
├─────────────────────────────────────────────────────────────┤
│ ② 本地提交 + 全部验证通过                                    │
│    ├── JS 语法检查  (node -c <所有改动的.js文件>)              │
│    ├── CSS 检查    (stylelint / npx htmlhint)                │
│    ├── HTML 检查   (htmlhint / 标签闭合 / 脚本标签)            │
│    ├── Lint 全量    (npm run lint:all)                       │
│    ├── 功能性检查   (构建验证: npm run build:dev)              │
│    ├── git add -A + git commit                               │
│    └── pre-commit hook 自动触发, 失败则必须先修                │
├─────────────────────────────────────────────────────────────┤
│ ③ git fetch + git rebase 同步对应 origin 分支                │
│    ├── git fetch origin <目标分支>                            │
│    ├── git rebase origin/<目标分支>                           │
│    ├── 处理所有冲突 (每次解决后验证语法)                       │
│    └── 直至 rebase 成功完成                                   │
├─────────────────────────────────────────────────────────────┤
│ ④ git push (禁止 --force/--no-verify)                       │
│    ├── git push origin <当前分支>                             │
│    ├── pre-push hook 自动触发                                 │
│    └── 失败则修复重试, 绝不用 --no-verify                      │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 标准提交流程分步详解 🔴

#### 8.2.1 代码变更完成 → 汇总分组

```bash
# 1. 确认当前工作状态
git status --short

# 2. 查看所有改动的文件
git diff --stat

# 3. 按主题分组: 将改动分为逻辑独立的 commit 组
#    例如: feat(router), chore(vendor), fix(html), docs(standards)
#    每组只涉及相关文件, 不可一个 commit 混入多个不相关的主题

# 4. 如果有新文件, 检查是否应该被 git 追踪
#    vendor/*.umd.js  → ✅ 需要追踪
#    dist/            → ❌ 已在 .gitignore
#    node_modules/    → ❌ 已在 .gitignore
```

**分组原则**:
- 每个 commit 只做一件事。"核心代码"和"第三方库"分开提交
- 如果修改 100+ 文件的格式化/属性集中变更（如批量加 data-swup-persist）, 可归入同一 commit
- 修复 pre-existing 的 bug（如 script 标签闭合）应单独备注或并入相关 commit

#### 8.2.2 验证（执行顺序不可改变）

```bash
# ── [步骤 A] 语法检查（最快, 先排除语法错误）──
# JS 语法
node -c src/assets/js/swup-init.js
node -c <其他改动的.js文件>

# CSS 语法（如修改了样式）
npx stylelint 'src/assets/css/styles.css' --config .stylelintrc.json 2>&1 | grep -E "error"

# HTML 标签检查
npx htmlhint src/index.html 2>&1

# JSON 格式（如修改了翻译文件）
node -e "JSON.parse(require('fs').readFileSync('src/assets/lang/zh-CN-ui.json','utf8'));console.log('JSON OK')"

# ── [步骤 B] Lint 全量（项目中已配置的检查项全部跑）──
npm run lint:all
# 关注 errors（必须解决）和 warnings（评估后处理）
# 以下是常见错误及处理方式:
#   - "no-undef" "no-unused-vars"       → 项目代码必须修复
#   - "Unexpected console statement"     → 非调试用途的需条件包裹
#   - "ES6+ syntax detected"             → 二方/三方库须在 EXCLUDE_FILES 中豁免

# ── [步骤 C] 功能性检查（确保代码能运行）──
# 构建验证
git stash  # 如果有未提交的配置相关修改
git add -A && git stash  # 临时存起来测试干净的 commit 状态
npm run build:dev  # 确认构建不中断
git stash pop
```

**规则**: 步骤 A 未通过 → 不进行步骤 B。步骤 B 有 error → 不进行步骤 C。

#### 8.2.3 staging 并提交

```bash
# 提交前最终检查
git status                   # 确认 stage 的是预期文件
git diff --cached --stat     # 确认 staged 文件范围

# 确保没有遗漏非预期的修改
# 特别注意以下内容不可进入 commit:
#   - console.log (未用 __DEVELOPMENT__ 包裹)
#   - 密码/token/API key
#   - 调试标记 (TODO, FIXME, DEBUG, DIAGNOSTIC)
#   - 冲突标记 (<<<<<<<, =======, >>>>>>>)
#   - 硬编码 URL（应改为 SITE_CONFIG 驱动）
#   - 硬编码品牌色（应使用 _primary 变量）

# 提交
cat > /tmp/commit-msg.txt << 'EOF'
<type>(<scope>): <简短描述>

<详细说明, 说明 why 而非 what>

<各个重要的变更点列表>
EOF
git add -A
git commit -F /tmp/commit-msg.txt

# 如果 pre-commit hook 失败:
# 1. 查看失败原因（lint 错误? 语法错误? 调试残留?）
# 2. 修复代码中的问题
# 3. 重新 git add + git commit
# 🔴 绝对禁止: git commit --no-verify
```

**Commit message 规范**:
- 第一行: `<type>(<scope>): <50字以内描述>` (见 DEV-STANDARDS.md §2.1)
- 空一行后写详细说明
- 列出各个重要的变更点
- 如果有修复 pre-existing bug, 在 foot 注明确认

#### 8.2.4 git rebase 同步远端

```bash
# 1. 确认当前工作区干净（所有变更已 commited）
git status --porcelain
# 必须为空！有未提交代码时不要 rebase

# 2. 选择目标分支
#    - feature 分支 → rebase 到 dev
#    - scaffold 分支 → rebase 到对应的 origin/scaffold/*
#    - 绝对不要 rebase 到不相干的分支

# 3. 拉取目标分支最新
TARGET_BRANCH="dev"  # 根据实际选择
git fetch origin $TARGET_BRANCH

# 4. 执行 rebase
git rebase origin/$TARGET_BRANCH

# 5. 处理冲突——完全解决后才继续
# git rebase 会暂停在每个冲突上:
#   自动合并 ...
#   冲突（内容）：合并冲突于 src/file.js
#   该文件已修改。请修改它然后提交。
#
#   未命中自动合并；修复后提交所得结果。
```

**冲突处理流程**:

```bash
# 查看当前冲突文件
git status
# UU = 内容冲突, DU/UA = 修改/删除冲突, AA = 双方都修改

# ── 处理内容冲突 (UU) ──
# 打开文件, 找到 <<<<<<<, =======, >>>>>>> 标记
# 保留两边有用的代码, 不要简单取一边
# 解决后:
git add <file>
node -c <file>  # 验证语法

# ── 处理修改/删除冲突 (DU/UA) ──
# 判断: 文件是否还应存在？
#   应存在 → git add <file>
#   不应存在 → git rm <file>

# 解决完毕后, 检查是否还有残留冲突标记:
grep -rn "^<<<<<<< \|^=======\|^>>>>>>> " src/ 2>/dev/null
# 必须无输出！

# 继续 rebase
git rebase --continue
# 会打开编辑器编写 merge commit message
# 保持默认或简注冲突类型

# 如果在某个 commit 上反复冲突, 可以用:
git rebase --skip    # 跳过当前 commit（仅当确认不需要时）
git rebase --abort   # 放弃整个 rebase, 回到开始前状态
```

**Rebase 完成标准**:
- 终端输出 `成功变基并更新 refs/heads/<分支名>`
- `git status --porcelain` 为空
- `git log --oneline -5` 显示已应用所有 commit

#### 8.2.5 提交前最终验证 (rebase 后)

```bash
# rebase 可能引入新的冲突文件, rebase 完成后必须重新验证

# JS 语法检查（所有改动的文件）
node -c src/assets/js/<file>.js

# 冲突标记残留检查（最重要！）
grep -rn "^<<<<<<< \|^=======\|^>>>>>>> " src/ 2>/dev/null
# 任何输出都意味着 rebase 冲突未完全解决, 必须修复

# 快速确认版本正确
git log --oneline -3
```

#### 8.2.6 git push

```bash
# 1. 确认分支名不是 master/main
git branch --show-current

# 2. dry-run 预检
# git push --dry-run 是只读的, 不会真的 push
git push --dry-run origin <current-branch>
# 这会显示将要推送的内容, 但不实际发送

# 3. 推送
git push origin <current-branch>

# 4. 如果 pre-push hook 失败:
# 🔴 绝对禁止: git push --no-verify
# 🔴 绝对禁止: git push --force
# ✅ 正确做法:
#    a. 查看 pre-push 失败原因
#    b. 修复代码
#    c. git add → git commit（不要 --amend 已推送的 commit）
#    d. git push origin <current-branch>
```

**Pre-push 常见失败原因**:
| 失败原因 | 处理 |
|----------|------|
| 分支保护（push 到 master） | 创建 PR, 不要在 master 上工作 |
| force push 检测 | 检查是否有 rebase 后需要 force 的情况。如果 feature 分支只有你在用, 可考虑 force, 但**必须先通知其他开发者** |
| 语法检查失败 | rebase 后的代码可能有残留问题, 修复后重新 commit |
| Lint 失败 | 同上, 修复后重新 commit |
| 构建失败 | `npm run build` 失败, 修复后重新 commit |

### 8.3 完整流程速查（一句话版）

```bash
# 完整的一次提交流程:
pwd && git branch --show-current             # 确认目录和分支
git status --short                            # 确认工作区
git diff --stat                               # 确认改动范围
node -c src/assets/js/<file>.js               # JS 语法检查
npm run lint:all | grep -E "^✖|^⚠|error"      # Lint
npm run build:dev                             # 功能性检查（构建验证）
git add -A && git commit -m "type(scope):"   # 提交, pre-commit hook 自动触发
git fetch origin dev                          # 拉取远端
git rebase origin/dev                         # 变基
# 如果有冲突 → 解决 → git add → git rebase --continue
git push --dry-run origin <分支>               # 预检
git push origin <分支>                         # 推送
```

### 8.4 禁止操作清单 🔴

| 操作 | 原因 | 替代方案 |
|------|------|---------|
| `git push --no-verify` | 绕过所有 pre-push 检查 | 修复检查失败原因后重试 |
| `git push -f` / `--force` | 破坏远端历史 | `git revert` 回滚; 通知所有人后再考虑 force |
| `git commit --no-verify` | 绕过 pre-commit 检查 | 修复代码问题后重试 |
| `git commit --amend` 修改已推送的 commit | 下次 push 需 force | 新 commit 修复, 或 revert 后重新提交 |
| `git merge dev` 到 feature 分支 | 反向 merge 污染历史 | `git rebase dev` 保持线性历史 |
| rebase 公共分支 (dev/master) | 破坏多人协作 | 只 rebase 自己的 feature 分支 |
| `git reset --hard` 未确认状态 | 丢失未提交修改 | 先 `git status` 确认, 备份到文件 |

### 8.5 误操作恢复指南

| 场景 | 恢复命令 | 说明 |
|------|---------|------|
| 刚 commit 但发现错了 | `git reset --soft HEAD~1` | 撤销 commit, 保留修改 |
| commit 后还没 push, 想丢弃修改 | `git reset --hard HEAD~1` | 彻底丢弃（确认无损失后执行） |
| 已经 push 的 commit 错了 | `git revert HEAD` | 创建反向 commit, 不破坏历史 |
| git reset 后后悔了 | `git reflog` → `git reset --hard <hash>` | reflog 保留 90 天操作记录 |
| 改文件发现不对想恢复 | `git checkout -- path/to/file.js` | 丢弃工作区改动 |
| merge 出错想撤销 | `git merge --abort` | 取消进行中的 merge |
| rebase 失败想放弃 | `git rebase --abort` | 回到 rebase 前状态 |
| 错误地 hard reset 了 | `git reflog` 找恢复点 | 只要没被 gc, 可以恢复 |

---

## 9. 风险操作清单

### 9.1 高风险：禁止自动执行 🔴

| 操作 | 风险 | 应该怎么做 |
|------|------|-----------|
| `git push -f` (force push) | 破坏分支历史 | 仅在极端情况 + 所有人知情后执行 |
| `git push --no-verify` | 绕过所有安全检查 | 绝对禁止！即使 pre-push 失败 |
| `git merge dev` 到 feature 分支 | 反向 merge 污染历史 | 应该用 `git rebase dev` |
| `git commit --amend` 修改已推送的 commit | 下次 push 需 force，破坏团队协作 | 禁止 |
| `npm run fix:all` / `lint:fix` | 批量格式化可能导致大范围变更 | 只在主 agent 确认无副作用后执行 |
| `rm -rf node_modules/ && npm install` | 耗时长，可能破坏 lock | 只在确实需要时执行 |
| `sed -i` 批量替换 | 正则/转义陷阱，破坏项目 | 见 DEV-STANDARDS.md §10 规范 |
| 修改 `.gitignore` | 可能暴露敏感文件 | 必须先确认修改原因 |
| 删除无跟踪文件（git clean） | 可能误删重要未跟踪文件 | 先 `git clean -n` 预览 |

### 9.2 中风险：自动化需确认 🟡

| 操作 | 风险 | 处理方式 |
|------|------|---------|
| `git reset --hard` | 丢失未提交修改 | 先 §8.3 清单校验 |
| `git merge --no-ff` | 产生 merge commit，有冲突风险 | 先 `--no-commit` dry-run |
| 删除 dist/ | 丢失当前构建，重新编译费时 | 只在确认需要时执行 |
| 修改 npm 版本号 | package-lock.json 变化范围大 | 先确认升级路径 |
| `npm install <pkg>` | 可能引入破坏性更新 | 先搜索包的可信度和最新版本 |
| 删除 worktree | 丢失分支 | 先确认分支已合并并推送到远端 |
| `git rebase` | 可能产生复杂的冲突 | 只在本地分支执行 |

### 9.3 低风险：可自动执行 ⚪

| 操作 | 前提 |
|------|------|
| `git add` + `git commit` | 通过 §8.1 校验 + pre-commit hook |
| `git push`（非 master/main） | 通过 §8.2 校验 + pre-push hook |
| `git fetch` / `git pull origin dev` | 无冲突预期 |
| `npm run build:dev` | 构建脚本稳定 |
| `node -c <file>` | 语法检查，无副作用 |
| 创建/删除本地分支 | 不影响 dev/master |
| `git diff --stat` | 只读操作，无副作用 |
| `git status` / `git log` | 只读操作，无副作用 |

---

## 10. 常见问题场景

### 10.1 Worktree 构建失败

**症状**：Worktree 内执行 `npm run build:dev` 失败。

**原因**：`node_modules` 符号链接未创建、或主仓库的 node_modules 未安装。

**修复**：
```bash
ls -la ../BrewYuKoLi-a/node_modules    # 检查符号链接
ln -sf /Users/chee/Projects/BrewYuKoLi/node_modules ../BrewYuKoLi-a/node_modules
cd /Users/chee/Projects/BrewYuKoLi && npm install  # 在主仓库安装
```

### 10.2 子 Agent 改了不应该改的文件

**症状**：`git diff dev --name-only dev-feat-xxx` 输出包含任务外的文件。

**处理**：
```bash
# 放弃该分支, 重新创建
git checkout dev && git branch -D dev-feat-xxx
git push origin --delete dev-feat-xxx
# 重新创建 worktree + 分支, 重新派发（加强约束描述）
```

### 10.3 Pre-push Hook 失败

**症状**：`git push origin dev-feat-xxx` 被 pre-push hook 拒绝。

**禁止**：`git push --no-verify`（红灯，无例外！）

**处理**：
1. 查看失败原因（lint 失败？语法错误？）
2. 子 agent 在自己 worktree 中修复
3. 子 agent 再次 push
4. 如果子 agent 无法修复 → 报告给主 agent

### 10.4 DEV-STANDARDS 约束冲突

**场景**：子 Agent 在修改时需要读 `DEV-STANDARDS.md`，但该文件太大（1248 行）。

**规范**：
- 子 agent **不需要完整阅读** DEV-STANDARDS.md
- 主 agent 在任务描述中**直接引用相关条款**：
  ```
  🔴 遵守 DEV-STANDARDS.md §3.1: IIFE 顶部必须声明 Config Bridge
  🔴 遵守 DEV-STANDARDS.md §4.2: IIFE 模式，ES5 语法
  ```
- 如果子 agent 不确定某个规范 → 报告给主 agent

### 10.5 合并冲突

**症状**：`git merge dev-feat-xxx` 时报冲突。

**处理**：
```bash
# 1. 查看冲突文件
git status

# 2. 手动解决（保留两边有用代码）
# 3. 标记为已解决
git add <file>

# 4. 完成合并
git merge --continue
```

**解决原则**：
- 保留两边有用的代码，不简单取一边
- 每次解决后执行 `node -c <file>` 确保语法正确
- 全局搜索冲突标记确认全部解决

### 10.6 定时汇报无响应

**症状**：cron 任务到点没有输出到 webchat。

**检查**：
```bash
cron action=list          # 查看 cron 任务状态
cron action=runs <id>     # 查看运行历史
```

**修复**：
- 如果 cron 任务被禁用 → 重新启用
- 如果 cron 任务运行失败 → 查看运行日志，修复后重试
- 如果 session 过期 → 重新创建 cron 任务
- 如果连续 3 次无响应 → 主动通知人类

### 10.7 子 Agent 集体失效（限流/Token 耗尽）

**症状**：多个子 agent 同时返回 429 或超时。

**处理**：
1. 立即 kill 所有子 agent
2. 等待 60 秒（token 配额重置）
3. 减少并发到 3 个，重新派发
4. 若还是失败 → 串行执行（一次 1 个）

### 10.8 Git 误操作恢复

参见 §8.6 误操作恢复指南。

---

## 11. 附录

### 11.1 一键环境检查脚本 `scripts/multi-agent-check.sh`

将此脚本放置在项目 `scripts/` 目录，提交到 Git 仓库。

```bash
#!/bin/bash
# multi-agent-check.sh — 多 Agent 环境健康检查
# 用法: bash scripts/multi-agent-check.sh
# 可由 cron 调用或手动执行

echo "=== BrewYuKoLi 多 Agent 环境健康检查 ==="
echo "检查时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ── 0. 工作目录检查 ──
PROJECT_DIR="/Users/chee/Projects/BrewYuKoLi"
if [ "$(pwd)" != "$PROJECT_DIR" ]; then
  cd "$PROJECT_DIR" 2>/dev/null || {
    echo "❌ 无法进入项目目录: $PROJECT_DIR"
    exit 1
  }
fi
echo "📍 目录: $(pwd)"

# ── 1. 主仓库状态 ──
echo ""
echo "━━━ 仓库状态 ━━━"
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "📌 分支: $BRANCH"
git status --short | head -10
if [ -z "$(git status --short)" ]; then
  echo "✅ 工作区干净"
fi

# ── 2. 远端同步 ──
echo ""
echo "━━━ 远端同步 ━━━"
git fetch origin --quiet 2>&1
BEHIND=$(git rev-list --count HEAD..origin/dev 2>/dev/null || echo "0")
AHEAD=$(git rev-list --count origin/dev..HEAD 2>/dev/null || echo "0")
echo "📤 落后 origin/dev: ${BEHIND} commits"
echo "📥 领先 origin/dev: ${AHEAD} commits"
if [ "$BEHIND" -gt 0 ]; then
  echo "⚠️  dev 落后远端! 执行: git pull origin dev --rebase"
fi

# ── 3. Worktree 列表 ──
echo ""
echo "━━━ Worktree ━━━"
WORKTREE_COUNT=$(git worktree list | grep -v "^$(pwd)" | wc -l | tr -d ' ')
git worktree list
echo "🔗 共 $WORKTREE_COUNT 个 worktree"

# ── 4. 待合并分支 ──
echo ""
echo "━━━ 待合并分支 ━━━"
UNMERGED=$(git branch --no-merged dev | grep "dev-feat" | head -10)
if [ -z "$UNMERGED" ]; then
  echo "✅ 无待合并分支"
else
  echo "$UNMERGED"
  UNMERGED_COUNT=$(echo "$UNMERGED" | wc -l | tr -d ' ')
  echo "📋 共 $UNMERGED_COUNT 个待合并"
fi

# ── 5. 冲突标记检查 ──
echo ""
echo "━━━ 冲突标记 ━━━"
CONFLICTS=$(grep -rn "^<<<<<<< \|^=======\|^>>>>>>> " src/ 2>/dev/null)
if [ -z "$CONFLICTS" ]; then
  echo "✅ 无冲突标记残留"
else
  echo "🔴 发现冲突标记:"
  echo "$CONFLICTS"
fi

# ── 6. 今日提交 ──
echo ""
echo "━━━ 今日提交 ━━━"
git log --since="today 00:00" --oneline --all --format="%h %s (%an)" 2>/dev/null | head -20

# ── 7. 构建状态 ──
echo ""
echo "━━━ 构建产物 ━━━"
if [ -d "dist/" ]; then
  echo "📁 dist/ 存在 ($(du -sh dist/ | cut -f1))"
else
  echo "⚠️  dist/ 不存在"
fi
if [ -f "node_modules/swup/dist/Swup.umd.js" ]; then
  echo "✅ swup 模块已安装"
else
  echo "⚠️  swup 模块缺失，执行: npm install"
fi

# ── 8. 子 Agent 状态 ──
echo ""
echo "━━━ 子 Agent 状态 ━━━"
AGENTS=$(subagents(action=list 2>/dev/null) || echo "(OpenClaw 不可用)")
echo "$AGENTS"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 检查完成"
```

### 11.2 定时回复异常处理流程

由于定时汇报每 15 分钟执行一次，可能出现以下异常：

| 异常场景 | 表现 | 处理流程 |
|---------|------|---------|
| cron 任务未触发 | 长时间无汇报 | 检查 cron 任务状态: `cron action=list` |
| cron 任务执行失败 | 运行历史显示错误 | `cron action=runs <jobId>` 查看错误日志 → 修复后 `cron run <jobId>` 重试 |
| 子 agent 失联 | 多次检查无子 agent 产出 | `subagents action=list` → 无活跃 agent → kill 所有 → 重新派发 |
| session 过期 | cron 运行正常但输出不到 webchat | 检查 session 状态 → `sessions_list` → 重建 cron 任务 |
| 主 agent 正在执行其他任务 | cron 的隔离 session 不影响 | 两个 session 互不干扰，没问题 |
| 连续 3 次检查发现相同异常 | 无改进趋势 | 升级为 🔴 通知人类 |
| webchat 渠道异常 | 消息发不出 | 检查 provider 状态 → 尝试其他渠道 |

**自动恢复策略**：
1. cron 任务失败 → 自动重试（OpenClaw 内置重试机制）
2. 连续 2 次失败 → 标记异常 + 通知主 agent
3. 连续 3 次失败 → 通知人类 + 暂停定时汇报

### 11.3 提交前校验速查表

```bash
# 快速校验（每次 git add/commit/push 前执行一行）
pwd && git branch --show-current                  # 目录 + 分支
git diff --stat                                     # 改动范围
node -c src/assets/js/<改动的文件>                   # 语法
npm run lint:all 2>/dev/null | tail -5              # 快速 lint
```

### 11.4 参考文档

| 文档 | 说明 |
|------|------|
| `docs/DEV-STANDARDS.md` | 开发规范（代码格式、提交规范、Config Bridge） |
| `docs/SCAFFOLD-USAGE.md` | 脚手架约定（Dropdown、Z-Index、SPA 路由） |
| `docs/BUILD.md` | 构建与部署指南 |
| `docs/RELEASE.md` | 发布流程 |
| `docs/SITE-CONFIG.md` | 站点配置说明 + 反向依赖表 |
| `docs/MULTI-AGENT-OPERATIONS.md`（本文） | 多 Agent 操作流程 |
| `subagent-orchestrator` skill | 通用子 Agent 编排技能 |
| `git-workflow` skill | Git 分支管理规范 |

---

## 修订历史

| 版本 | 日期 | 变更 | 作者 |
|------|------|------|------|
| v1.0-draft | 2026-05-23 | 初稿 | AI Agent |
| v1.1-draft | 2026-05-23 | 重写 §8 标准提交流程：本地提交→验证→rebase→push 完整规范 + 禁止操作 + 误操作恢复 | AI Agent |