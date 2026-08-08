// Vercel Serverless Function: 百度百科代理
// 支持两种调用方式:
// 1. /baike-proxy/item/xxx (通过 rewrites 重写路径)
// 2. /api/baike-proxy?path=/item/xxx (直接调用)
export default async function handler(req, res) {
  // 从 query.path 获取路径（可能是字符串或数组）
  let path = req.query.path
  if (!path) {
    return res.status(400).json({ error: 'Missing path parameter' })
  }

  // 如果是数组，拼接成路径
  if (Array.isArray(path)) {
    path = '/' + path.join('/')
  } else if (!path.startsWith('/')) {
    path = '/' + path
  }

  const url = `https://baike.baidu.com${path}`

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })

    const html = await response.text()
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).send(html)
  } catch (error) {
    console.error('Baike proxy error:', error)
    return res.status(502).json({ error: 'Failed to fetch from baidu baike' })
  }
}
