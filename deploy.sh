#!/bin/bash
# Vercel 手动部署脚本
# 使用方法: ./deploy.sh [VERCEL_TOKEN]
# 如果不传 Token，会使用环境变量 VERCEL_TOKEN

TOKEN=${1:-$VERCEL_TOKEN}
if [ -z "$TOKEN" ]; then
  echo "错误: 请提供 Vercel Personal Token"
  echo "使用方法: ./deploy.sh <VERCEL_TOKEN>"
  echo "或设置环境变量: export VERCEL_TOKEN=<your_token>"
  echo ""
  echo "获取 Token: https://vercel.com/account/tokens"
  exit 1
fi

echo "🔨 构建项目..."
npm run build || { echo "❌ 构建失败"; exit 1; }

echo "📦 部署到 Vercel..."
cd dist

DEPLOY_URL=$(curl -s -X POST "https://api.vercel.com/v1/deployments" \
  -H "Authorization: Bearer $TOKEN" \
  -F "projectId=prj_TdPOULaKXwrrggF0kAqDAtHEVY3z" \
  -F "target=production" \
  -F "files[]=@index.html;type=text/html" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('url','') or d.get('error','unknown'))" 2>/dev/null)

if echo "$DEPLOY_URL" | grep -q "vercel.app"; then
  echo "✅ 部署成功!"
  echo "🌐 访问地址: https://$DEPLOY_URL"
  echo ""
  echo "提示: 请在 Vercel Dashboard 将此 deployment promote 为 production"
else
  echo "❌ API 部署失败 ($DEPLOY_URL)"
  echo ""
  echo "尝试使用 Vercel CLI 部署..."
  cd ..
  vercel deploy --prod --yes dist --token=$TOKEN
fi
