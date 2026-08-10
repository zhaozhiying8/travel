// Cloudflare Pages Function: 百度百科代理
// 路由: /api/baike-proxy?path=/item/xxx
export async function onRequest(context) {
  const { request } = context
  const url = new URL(request.url)
  const queryPath = url.searchParams.get('path') || '/'
  const targetPath = queryPath.startsWith('/') ? queryPath : '/' + queryPath
  const target = `https://baike.baidu.com${targetPath}`

  const headers = new Headers({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })

  try {
    const response = await fetch(target, {
      headers,
      redirect: 'follow'
    })
    const body = await response.text()
    return new Response(body, {
      status: response.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch from baidu baike', message: String(error) }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}
