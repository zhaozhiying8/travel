#!/bin/bash
# Cloudflare Pages 部署脚本
# 使用方法: ./deploy-cf.sh [CF_API_TOKEN] [CF_ACCOUNT_ID] [CF_PROJECT_NAME]
# 如需创建 API Token: https://dash.cloudflare.com/profile/api-tokens
# 免费注册 Cloudflare: https://dash.cloudflare.com/sign-up

set -e

TOKEN=${1:-$CLOUDFLARE_API_TOKEN}
ACCOUNT_ID=${2:-$CLOUDFLARE_ACCOUNT_ID}
PROJECT_NAME=${3:-$CLOUDFLARE_PROJECT_NAME}

if [ -z "$TOKEN" ] || [ -z "$ACCOUNT_ID" ] || [ -z "$PROJECT_NAME" ]; then
  echo "错误: 缺少必要参数"
  echo ""
  echo "使用方法: ./deploy-cf.sh <CF_API_TOKEN> <CF_ACCOUNT_ID> <CF_PROJECT_NAME>"
  echo ""
  echo "获取方式:"
  echo "  1. 注册 Cloudflare 账号: https://dash.cloudflare.com/sign-up"
  echo "  2. 在 Zero Trust > API Tokens 创建 \"Edit Cloudflare Workers\" 权限的 Token"
  echo "  3. Account ID 在 Dashboard 右上角域名下拉菜单中查看"
  echo "  4. Project Name: Pages 项目名（如 travel-cn）"
  exit 1
fi

echo "🔨 构建项目..."
npm run build || { echo "❌ 构建失败"; exit 1; }

echo "📦 安装 Wrangler CLI..."
npx --yes wrangler --version > /dev/null 2>&1 || npm install --save-dev wrangler

echo "🚀 部署到 Cloudflare Pages..."
DEPLOY_URL=$(npx wrangler pages deploy dist \
  --project-name="$PROJECT_NAME" \
  --api-token="$TOKEN" \
  --account-id="$ACCOUNT_ID" 2>&1 | tee /dev/tty | grep -oE 'https://[a-zA-Z0-9-]+\.pages\.dev' | head -1)

if [ -n "$DEPLOY_URL" ]; then
  echo ""
  echo "✅ 部署成功!"
  echo "🌐 访问地址: $DEPLOY_URL"
  echo ""
  echo "💡 首次部署完成后，请登录 Cloudflare Dashboard:"
  echo "   1. Pages > $PROJECT_NAME 设置 GitHub 自动部署 (可选)"
  echo "   2. 在 Pages > Functions 中确认 /api/baike-proxy 函数已就绪"
  echo "   3. 访问 $DEPLOY_URL 验证功能"
else
  echo "❌ 部署失败"
  echo "请检查上方错误信息"
  exit 1
fi
