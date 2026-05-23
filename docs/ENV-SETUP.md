# ENV-SETUP.md — 环境搭建指南

> **最后更新**：2026-05-23
> **适用人群**：新加入的开发者、接手维护的开发者

---

## 目录

1. [前置要求](#1-前置要求)
2. [初次克隆](#2-初次克隆)
3. [开发流程](#3-开发流程)
4. [常见问题](#4-常见问题)
5. [目录速查](#5-目录速查)

---

## 1. 前置要求

| 工具 | 版本要求 | 安装方法 | 用途 |
|------|---------|---------|------|
| **Node.js** | >= 18.x | `brew install node` (Mac) | 运行 server.js、构建脚本 |
| **npm** | >= 9.x | 随 Node.js 附带 | 包管理 |
| **git** | >= 2.30 | `brew install git` (Mac) | 版本控制 |
| **Playwright** (可选) | latest | `npx playwright install chromium` | E2E 测试 |
| **npx** | >= 10.x | 随 npm 附带 | 运行 CLI 工具 |

验证安装：

```bash
node --version   # 应 >= v18.0.0
npm --version    # 应 >= 9.0.0
git --version    # 应 >= 2.30.0
```

---

## 2. 初次克隆

### 2.1 克隆仓库

```bash
git clone git@github.com:leappower/BrewYuKoLi.git
cd BrewYuKoLi
```

### 2.2 切换到工作分支

```bash
# 当前开发基线
git checkout scaffold/v1.0

# 或查看所有分支
git branch -a
```

### 2.3 安装依赖

```bash
npm install
```

这个过程会：
1. 安装项目 npm 依赖
2. 安装 Tailwind CSS
3. 安装 lefthook（git hooks 管理器）
4. 自动配置 git hooks（pre-commit, pre-push, commit-msg）

### 2.4 首次构建

```bash
# 完整构建（生成 dist/）
npm run build
```

构建完成后应看到：

```
✅ Build complete: 777 files in dist/
   Version: v=202605231400
```

### 2.5 验证项目可运行

```bash
npm run dev
```

打开浏览器访问 `http://localhost:3099`

应看到首页正常加载，包含：
- 顶部导航栏
- Hero 区域
- 骨架屏（首次访问瞬间可见，随后渐隐）
- 产品展示区
- 页脚

---

## 3. 开发流程

### 3.1 日常开发命令

```bash
# 启动开发服务器
npm run dev              # nodemon 自动重启，端口 3099

# 文件变更自动构建 (另一个终端窗口)
npm run watch            # 监听 src/ 变更 → 自动运行 ./build.sh

# 手动构建
npm run build            # ./build.sh

# 完整生产构建 (含 webpack)
npm run build:production

# 运行代码检查
npm run lint:all         # 全部 lint 检查

# 运行 E2E 测试 (需要 npm run dev 在另一个终端)
npm run test:e2e         # Playwright headless
npm run test:e2e:headed  # Playwright 有界面
npm run test:e2e:ui      # Playwright UI 模式
```

### 3.2 标准开发流程

```bash
# 1. 更新代码
git checkout scaffold/v1.0
git pull origin scaffold/v1.0  # 仅适用于已有上游追踪时

# 2. 创建 feature 分支
git checkout -b feat/my-feature

# 3. 开发
#   - 修改 src/pages/ 下的 HTML 页面
#   - 修改 src/assets/js/ 下的 JS 模块
#   - npm run build 验证构建

# 4. 本地验证
npm run dev             # 手动浏览确认
npm run test:e2e        # 运行 E2E 测试

# 5. 提交（自动触发 pre-commit hooks）
git add -A
git commit -m "feat: xxx"

# 6. 推送到远端
git push origin feat/my-feature
```

### 3.3 修改页面

**修改已有页面**：
```bash
# 编辑对应的 SSG 页面源文件
vim src/pages/home/index-pc.html
vim src/pages/home/index-mobile.html
vim src/pages/home/index-tablet.html

# 重新构建
npm run build

# 刷新浏览器查看效果
```

**新增页面**：
```bash
# 1. 创建页面目录
mkdir -p src/pages/my-new-page

# 2. 创建三屏页面
cp src/pages/home/index-pc.html src/pages/my-new-page/index-pc.html
cp src/pages/home/index-mobile.html src/pages/my-new-page/index-mobile.html
cp src/pages/home/index-tablet.html src/pages/my-new-page/index-tablet.html

# 3. 编辑页面内容（确保包含 navigator + footer persist 标记）

# 4. 构建
npm run build

# 5. 验证
# 访问 http://localhost:3099/my-new-page/
```

**修改 JS 模块**：
```bash
# JS 文件在 src/assets/js/
# 修改后重新构建
npm run build

# 如果修改了 swup-init.js，运行 E2E 测试
npm run test:e2e
```

### 3.4 分支策略

参考 [DEV-STANDARDS.md §1](DEV-STANDARDS.md#1-git-工作流与分支管理)：

```
scaffold/v1.0 (当前开发基线)
  ├── feat/xxx    (功能开发)
  ├── fix/xxx     (Bug 修复)
  └── refactor/xxx (重构)
```

**禁止操作**：
- `git push --force` 到共享分支
- `git commit --amend` 已推送的 commit
- 绕过 pre-commit / pre-push hooks

---

## 4. 常见问题

### Q: `npm run dev` 报错 "EADDRINUSE"

```bash
# 端口 3099 被占用
lsof -i :3099          # 找到占用进程
kill -9 <PID>          # 杀掉进程
npm run dev            # 重新启动
```

### Q: 构建后浏览器看不到改动

```bash
# 1. 确认 dist/ 已更新
ls -la dist/pages/home/index-pc.html | grep "$(date +%Y)"

# 2. 硬刷新浏览器 (Cmd+Shift+R 或 Ctrl+Shift+R)

# 3. 检查 server.js 是否正常 serve dist/
curl -s http://localhost:3099/home/ | head -20
```

### Q: Pre-commit hook 阻止提交

```bash
# 查看具体错误信息
git commit -m "test" 2>&1 | tail -30

# 常见原因：
# - console.log 未包裹 if (__DEVELOPMENT__)
# - HTML 标签未闭合
# - JS 语法错误 (node -c 检查)
# - ES6+ 语法在非测试文件中使用
```

### Q: E2E 测试失败

```bash
# 1. 确保开发服务器正在运行
npm run dev          # 另一个终端窗口

# 2. 确保端口正确 (playwright.config.js 配置为 3099)

# 3. 重装 Playwright 浏览器
npx playwright install chromium

# 4. 单独运行失败测试
npx playwright test --headed tests/e2e/swup-navigation.spec.js

# 5. 查看截图
ls test-results/*/
```

### Q: SWUP 导航不工作，点击链接变成整页刷新

```bash
# 原因1: swup-init.js 未加载
# 检查: 打开浏览器 DevTools → Console → 输入 window.Swup (应为 object)

# 原因2: 脚本加载顺序错误
# 检查: DevTools → Network → 确认 swup.umd.js 在 swup-init.js 之前加载

# 原因3: #spa-content 容器不存在
# 检查: DevTools → Elements → 搜索 #spa-content

# 原因4: <a> 标签不匹配 linkSelector
# SWUP 只拦截 href 不以 http/#/mailto:/tel: 开头的内部链接
```

### Q: 骨架屏一直不消失

```bash
# 原因1: skeleton.css 没有更新到 CSS transition 方案
# 检查: 打开 DevTools → Elements → 检查 #skeleton-overlay[hidden] 的 CSS

# 原因2: SWUP content:replace 未触发
# 检查: DevTools → Console → 查看 SWUP debug plugin 日志

# 原因3: 3 秒安全兜底未生效
# 检查: swup-init.js 中 ensureSkeletonHidden() 是否正确执行
```

---

## 5. 目录速查

```text
src/pages/           ← 页面 HTML 源文件 (修改内容来这里)
src/assets/js/       ← JavaScript 源文件
src/assets/css/      ← CSS 源文件
src/assets/lang/     ← 国际化 JSON 文件
src/assets/images/   ← 图片资源
src/index.html       ← SPA Shell (首次入口)
dist/                ← 构建产物 (不要手动编辑)
docs/                ← 项目文档
tests/e2e/           ← E2E 测试
scripts/             ← 构建/检查脚本
```

**核心文件速查**：

| 要改什么 | 改哪里 |
|---------|-------|
| 页面内容 | `src/pages/<页面名>/index-{pc,mobile,tablet}.html` |
| 全局配置 | `src/assets/js/site.config.js` |
| 导航菜单 | `src/assets/js/ui/navigator.js` (JS) + `src/pages/*/index-*.html` (HTML) |
| 路由逻辑 | `src/assets/js/swup-init.js` |
| 样式 | `src/assets/css/styles.css` |
| 骨架屏 | `src/assets/css/skeleton.css` + `src/assets/js/swup-init.js` |
| 国际化翻译 | `src/assets/lang/<语言>.json` |
| 产品数据 | `src/assets/js/product-grid.js` + 外部 JSON API |
