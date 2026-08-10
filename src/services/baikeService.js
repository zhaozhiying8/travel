// 百度百科数据服务 - 通过抓取百度百科页面获取景点图片和介绍
// 所有请求通过 Vite proxy 代理到 baike.baidu.com 以解决跨域问题

// 缓存已获取的百度百科数据，避免重复请求
const baikeCache = {}

// 获取百度百科数据（图片URL + 描述）
export async function fetchBaikeData(name) {
  // 检查缓存
  if (baikeCache[name]) return baikeCache[name]

  try {
    // 代理地址:
    // - 开发环境 (Vite): /baike-proxy/* 由 vite.config.js proxy 转发到 baike.baidu.com
    // - Cloudflare Pages 生产环境: /api/baike-proxy?path=* 由 Pages Function 处理
    // - Vercel 生产环境: /baike-proxy/* 由 vercel.json rewrites 重写到 /api/baike-proxy?path=*
    const isCfProd = typeof window !== 'undefined' && window.location.hostname.endsWith('.pages.dev')
    const base = isCfProd ? '/api/baike-proxy' : '/baike-proxy'
    const url = isCfProd
      ? `${base}?path=/item/${encodeURIComponent(name)}`
      : `${base}/item/${encodeURIComponent(name)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) {
      console.warn(`百度百科页⾯访问失败: ${name}, status: ${response.status}`)
      return null
    }
    const html = await response.text()

    // 使用DOMParser解析HTML
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // 提取图片URL - 优先使用og:image(Open Graph协议)
    let imageUrl = ''
    const ogImage = doc.querySelector('meta[property="og:image"]')
    if (ogImage) {
      imageUrl = ogImage.getAttribute('content') || ''
    }

    // 如果og:image没有,尝试从summary-pic中提取
    if (!imageUrl) {
      const summaryPic = doc.querySelector('.summary-pic img')
      if (summaryPic) {
        imageUrl = summaryPic.getAttribute('src') || ''
      }
    }

    // 提取描述 - 使用meta description
    let description = ''
    const descMeta = doc.querySelector('meta[name="description"]')
    if (descMeta) {
      description = descMeta.getAttribute('content') || ''
    }

    // 如果meta description不够详细,尝试提取lemma-summary
    if (!description || description.length < 20) {
      const summary = doc.querySelector('.lemma-summary')
      if (summary) {
        description = summary.textContent || ''
      }
    }

    // 清理描述文本
    description = description.replace(/\\s+/g, ' ').trim()
    if (description.length > 300) {
      description = description.substring(0, 300) + '...'
    }

    const result = { imageUrl, description }
    // 存入缓存
    baikeCache[name] = result
    return result
  } catch (e) {
    if (e.name === 'TimeoutError') {
      console.warn(`百度百科请求超时: ${name}`)
    } else {
      console.warn(`获取百度百科数据失败: ${name}`, e.message)
    }
    return null
  }
}

// 批量获取百度百科数据（控制并发数）
export async function fetchBaikeDataBatch(names, concurrency = 5) {
  const results = []
  const queue = [...names]

  async function worker() {
    while (queue.length > 0) {
      const name = queue.shift()
      const data = await fetchBaikeData(name)
      results.push({ name, data })
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, names.length) }, () => worker())
  await Promise.all(workers)

  return results
}

// 清除缓存
export function clearBaikeCache() {
  Object.keys(baikeCache).forEach(key => delete baikeCache[key])
}