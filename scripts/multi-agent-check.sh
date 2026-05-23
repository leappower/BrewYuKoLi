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
echo "━━━ 子 Agent 状态 (请通过 OpenClaw 查询) ━━━"
echo "命令: subagents action=list"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 检查完成"
