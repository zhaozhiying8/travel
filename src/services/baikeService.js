// 百度百科数据服务 - 通过抓取百度百科页面获取景点图片和介绍
// 所有请求通过 Vite proxy 代理到 baike.baidu.com 以解决跨域问题

// 缓存已获取的百度百科数据，避免重复请求
const baikeCache = {}

// 知名景点硬编码数据（当无法从网络获取时使用）
const FAMOUS_SPOTS_DATA = {
  '故宫博物院': { ticket: '60元旺季/40元淡季', openTime: '08:30-17:00（旺季）/08:30-16:30（淡季），周一闭馆' },
  '天安门广场': { ticket: '免费', openTime: '全天开放（升旗时间根据日出日落调整）' },
  '天安门': { ticket: '15元', openTime: '08:30-17:00' },
  '天坛公园': { ticket: '34元联票/15元祈年殿', openTime: '06:00-22:00（景点08:00-17:30）' },
  '颐和园': { ticket: '60元联票/30元门票', openTime: '08:00-17:00（旺季）/08:30-17:00（淡季）' },
  '长城': { ticket: '40元旺季/35元淡季', openTime: '07:30-17:30（旺季）/08:00-17:00（淡季）' },
  '八达岭长城': { ticket: '40元旺季/35元淡季', openTime: '07:30-17:30（旺季）/08:00-17:00（淡季）' },
  '慕田峪长城': { ticket: '45元', openTime: '07:30-17:30' },
  '故宫': { ticket: '60元旺季/40元淡季', openTime: '08:30-17:00（旺季）/08:30-16:30（淡季），周一闭馆' },
  '颐和园公园': { ticket: '60元联票/30元门票', openTime: '08:00-17:00' },
  '天坛': { ticket: '34元联票/15元祈年殿', openTime: '06:00-22:00' },
  '北海公园': { ticket: '10元/20元联票', openTime: '06:30-21:00' },
  '景山公园': { ticket: '2元', openTime: '06:30-21:00' },
  '中山公园': { ticket: '10元/5元', openTime: '06:30-21:00' },
  '国家博物馆': { ticket: '免费（需预约）', openTime: '09:00-17:00（周一闭馆）' },
  '中国国家博物馆': { ticket: '免费（需预约）', openTime: '09:00-17:00（周一闭馆）' },
  '首都博物馆': { ticket: '免费（需预约）', openTime: '09:00-17:00（周一闭馆）' },
  '军事博物馆': { ticket: '免费（需预约）', openTime: '08:30-17:30（周一闭馆）' },
  '科技馆': { ticket: '30元/20元', openTime: '09:00-16:30（周一闭馆）' },
  '中国科技馆': { ticket: '30元/20元', openTime: '09:00-16:30（周一闭馆）' },
  '自然博物馆': { ticket: '免费（需预约）', openTime: '09:00-17:00（周一闭馆）' },
  '国家自然博物馆': { ticket: '免费（需预约）', openTime: '09:00-17:00（周一闭馆）' },
  '上海博物馆': { ticket: '免费（需预约）', openTime: '09:30-17:00（周一闭馆）' },
  '东方明珠': { ticket: '160元联票/120元门票', openTime: '08:00-21:30' },
  '外滩': { ticket: '免费', openTime: '全天开放' },
  '豫园': { ticket: '40元旺季/30元淡季', openTime: '08:30-17:00' },
  '杭州西湖': { ticket: '免费', openTime: '全天开放' },
  '西湖': { ticket: '免费', openTime: '全天开放' },
  '灵隐寺': { ticket: '45元飞来峰+30元灵隐寺', openTime: '07:00-18:00' },
  '千岛湖': { ticket: '150元', openTime: '08:00-17:00' },
  '乌镇': { ticket: '100元东栅/120元西栅', openTime: '07:20-17:30（东栅）/09:00-22:00（西栅）' },
  '成都大熊猫基地': { ticket: '58元', openTime: '07:30-18:00' },
  '大熊猫繁育研究基地': { ticket: '58元', openTime: '07:30-18:00' },
  '宽窄巷子': { ticket: '免费', openTime: '全天开放' },
  '锦里古街': { ticket: '免费', openTime: '全天开放' },
  '武侯祠': { ticket: '50元', openTime: '08:00-18:30' },
  '杜甫草堂': { ticket: '50元', openTime: '09:00-18:00' },
  '兵马俑': { ticket: '120元', openTime: '08:30-18:00（旺季）/08:30-17:30（淡季）' },
  '秦始皇兵马俑博物馆': { ticket: '120元', openTime: '08:30-18:00' },
  '大雁塔': { ticket: '50元/30元', openTime: '08:00-17:30', description: '大雁塔位于陕西省西安市，是唐代佛教建筑艺术的杰作，也是现存最早、规模最大的唐代四方楼阁式砖塔。' },
  '大唐不夜城': { ticket: '免费', openTime: '全天开放', description: '大唐不夜城是西安大雁塔下的一条盛唐主题步行街，夜景璀璨夺目，是西安网红打卡地。' },
  '大慈恩寺': { ticket: '50元', openTime: '08:00-17:30', description: '大慈恩寺是唐代玄奘法师译经和藏经之所，也是大雁塔的所在地。' },
  '厦门鼓浪屿': { ticket: '免费（船票35元往返）', openTime: '全天开放' },
  '厦门大学': { ticket: '免费（需预约）', openTime: '08:00-17:30' },
  '南普陀寺': { ticket: '免费', openTime: '08:00-17:30' },
  '丽江古城': { ticket: '免费', openTime: '全天开放' },
  '玉龙雪山': { ticket: '130元+200元索道', openTime: '08:00-17:00' },
  '大理古城': { ticket: '免费', openTime: '全天开放' },
  '洱海': { ticket: '免费', openTime: '全天开放' },
  '三亚亚龙湾': { ticket: '免费', openTime: '全天开放' },
  '天涯海角': { ticket: '68元', openTime: '07:30-18:00' },
  '南山寺': { ticket: '129元', openTime: '08:00-17:30' },
  '黄山': { ticket: '190元旺季/150元淡季', openTime: '07:00-17:00' },
  '泰山': { ticket: '115元旺季/100元淡季', openTime: '全天开放（索道06:00-18:00）' },
  '峨眉山': { ticket: '160元旺季/110元淡季', openTime: '全天开放' },
  '九寨沟': { ticket: '190元旺季/80元淡季', openTime: '07:00-17:00' },
  '张家界': { ticket: '228元（通票）', openTime: '07:00-18:00' },
  '张家界国家森林公园': { ticket: '228元（通票）', openTime: '07:00-18:00' },
  '桂林漓江': { ticket: '215元起（游船）', openTime: '08:00-17:30' }
}

// 从硬编码数据获取景点信息
function getFamousSpotData(name) {
  // 精确匹配
  if (FAMOUS_SPOTS_DATA[name]) {
    return FAMOUS_SPOTS_DATA[name]
  }
  // 模糊匹配 - 检查是否包含关键字
  for (const key in FAMOUS_SPOTS_DATA) {
    if (name.includes(key) || key.includes(name)) {
      return FAMOUS_SPOTS_DATA[key]
    }
  }
  return null
}

// 获取百度百科数据（图片URL + 描述 + 多图）
export async function fetchBaikeData(name) {
  // 检查缓存
  if (baikeCache[name]) return baikeCache[name]

  // 先检查硬编码数据
  const famousData = getFamousSpotData(name)

  try {
    // 代理地址:
    // - 开发环境 (Vite): /baike-proxy/* 由 vite.config.js proxy 转发到 baike.baidu.com
    // - Cloudflare Pages 生产环境: /api/baike-proxy?path=* 由 Pages Function 处理
    // - Vercel 生产环境: /baike-proxy/* 由 vercel.json rewrites 重写到 /api/baike-proxy?path=*
    const isCfProd = typeof window !== 'undefined' && window.location.hostname.endsWith('.pages.dev')
    const base = isCfProd ? '/api/baike-proxy' : '/baike-proxy'
    
    // 尝试多种URL格式
    const urls = [
      `${base}/item/${encodeURIComponent(name)}`,           // PC版
      `${base}/item/${encodeURIComponent(name)}/1`,        // PC版带参数
    ]
    
    let response = null
    for (const url of urls) {
      try {
        response = await fetch(url, { 
          signal: AbortSignal.timeout(10000),  // 增加超时到10秒
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        })
        if (response.ok) break
      } catch (e) {
        console.warn(`百度百科请求失败 (${url}):`, e.message)
      }
    }
    
    if (!response || !response.ok) {
      console.warn(`百度百科所有URL均失败: ${name}`)
      // 使用硬编码数据作为备选
      if (famousData) {
        const result = { 
          imageUrl: '', 
          description: famousData.description || '', 
          images: [], 
          ticketPrice: famousData.ticket, 
          openTime: famousData.openTime 
        }
        baikeCache[name] = result
        return result
      }
      return null
    }
    const html = await response.text()

    // 使用DOMParser解析HTML
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // 提取主图URL - 优先使用og:image(Open Graph协议)
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
    if (description.length > 500) {
      description = description.substring(0, 500) + '...'
    }

    // 提取多图（景区图片集）- 最多8张
    const images = []
    
    // 从img元素提取URL的辅助函数
    function getImgUrl(imgEl) {
      // 尝试多种属性获取图片URL
      const attrs = ['src', 'data-src', 'data-original', 'data-url', 'data-lazy-src', 'data-image']
      for (const attr of attrs) {
        const val = imgEl.getAttribute(attr)
        if (val && val.startsWith('http')) return val
      }
      // 处理相对路径
      const src = imgEl.getAttribute('src') || ''
      if (src && src.startsWith('//')) return 'https:' + src
      return ''
    }
    
    // 判断是否为高质量图片的辅助函数
    function isHighQualityImg(imgEl, url) {
      if (!url) return false
      // 排除小图标、logo等
      if (url.includes('logo') || url.includes('icon') || url.includes('avatar') || url.includes('small')) return false
      if (url.includes('thumb') && !url.includes('large')) return false
      // 检查尺寸属性
      const width = imgEl.getAttribute('width')
      const height = imgEl.getAttribute('height')
      if (width && parseInt(width) < 100) return false
      if (height && parseInt(height) < 100) return false
      return true
    }
    
    // 1. 添加主图
    if (imageUrl) {
      images.push({ url: imageUrl, title: name })
    }

    // 2. 从景区图片集相关区域提取（优先大图）
    const gallerySelectors = [
      '.lemma-picture img',
      '.gallery-image img', 
      '[class*="gallery"] img',
      '[class*="picture"] img',
      '[class*="album"] img',
      '[class*="slideshow"] img',
      '[class*="carousel"] img',
      '[class*="image-list"] img',
      '.summary-pic img',
      '.header-info img',
      '.lemmaWgt-lemmaSummary img'
    ]
    
    for (const selector of gallerySelectors) {
      if (images.length >= 8) break
      const imgs = doc.querySelectorAll(selector)
      for (const img of imgs) {
        if (images.length >= 8) break
        const url = getImgUrl(img)
        if (url && isHighQualityImg(img, url) && !images.find(i => i.url === url)) {
          images.push({ url, title: name })
        }
      }
    }

    // 3. 从所有img标签中提取高质量图片（兜底）
    if (images.length < 8) {
      // 按优先级排序：有大尺寸标记的优先
      const allImgs = Array.from(doc.querySelectorAll('img'))
      
      // 过滤并排序
      const candidateImgs = allImgs
        .map(img => {
          const url = getImgUrl(img)
          if (!url || !isHighQualityImg(img, url)) return null
          // 计算图片"质量分"
          let score = 0
          // URL包含large/original/hd等关键词加分
          if (url.includes('large') || url.includes('original') || url.includes('hd')) score += 3
          if (url.includes('pic') || url.includes('photo')) score += 2
          // 有width/height属性加分
          if (img.getAttribute('width')) score += 1
          if (img.getAttribute('height')) score += 1
          // 在lemma-picture等重要区域加分
          const parent = img.parentElement
          if (parent && parent.closest('.lemma-picture, .gallery-image, [class*="gallery"]')) score += 2
          return { img, url, score }
        })
        .filter(item => item && !images.find(i => i.url === item.url))
        .sort((a, b) => b.score - a.score)
      
      // 提取前8张
      for (const item of candidateImgs) {
        if (images.length >= 8) break
        images.push({ url: item.url, title: name })
      }
    }

    // 确保URL使用HTTPS
    for (const img of images) {
      if (img.url.startsWith('//')) {
        img.url = 'https:' + img.url
      }
    }

    // 提取门票价格信息
    let ticketPrice = ''
    // 尝试从infoBox中提取
    const infoBox = doc.querySelector('.basic-info') || doc.querySelector('.lemma-info') || doc.querySelector('[class*="infoBox"]')
    if (infoBox) {
      const infoText = infoBox.textContent || ''
      // 匹配门票价格模式
      const ticketPatterns = [
        /门票[：:]\s*([^\n]+)/,
        /票价[：:]\s*([^\n]+)/,
        /价格[：:]\s*([^\n]+)/,
        /[¥￥]\s*(\d+[^ \n]*)/
      ]
      for (const pattern of ticketPatterns) {
        const match = infoText.match(pattern)
        if (match && match[1]) {
          ticketPrice = match[1].trim()
          break
        }
      }
    }
    
    // 如果infoBox没找到，尝试从全文搜索
    if (!ticketPrice) {
      const fullText = doc.body?.textContent || ''
      const ticketRegex = /(?:门票|票价)[：:]\s*([^\n，,。]+)/
      const match = fullText.match(ticketRegex)
      if (match && match[1]) {
        ticketPrice = match[1].trim()
      }
    }
    
    // 清理门票价格
    if (ticketPrice) {
      // 限制长度
      if (ticketPrice.length > 50) ticketPrice = ticketPrice.substring(0, 50)
      // 如果包含"免费"或"免"，标记为免费
      if (ticketPrice.includes('免费') || ticketPrice.includes('免票')) {
        ticketPrice = '免费'
      }
    }

    // 提取营业时间
    let openTime = ''
    if (infoBox) {
      const infoText = infoBox.textContent || ''
      const timePatterns = [
        /开放时间[：:]\s*([^\n]+)/,
        /营业时间[：:]\s*([^\n]+)/,
        /开园时间[：:]\s*([^\n]+)/
      ]
      for (const pattern of timePatterns) {
        const match = infoText.match(pattern)
        if (match && match[1]) {
          openTime = match[1].trim()
          break
        }
      }
    }
    
    // 如果infoBox没找到，尝试从全文搜索
    if (!openTime) {
      const fullText = doc.body?.textContent || ''
      const timeRegex = /(?:开放时间|营业时间)[：:]\s*([^\n，,。]+)/
      const match = fullText.match(timeRegex)
      if (match && match[1]) {
        openTime = match[1].trim()
      }
    }
    
    // 清理营业时间
    if (openTime) {
      if (openTime.length > 100) openTime = openTime.substring(0, 100) + '...'
    }

    const result = { imageUrl, description, images, ticketPrice, openTime }
    // 存入缓存
    baikeCache[name] = result
    return result
  } catch (e) {
    if (e.name === 'TimeoutError') {
      console.warn(`百度百科请求超时: ${name}`)
    } else {
      console.warn(`获取百度百科数据失败: ${name}`, e.message)
    }
    // 使用硬编码数据作为备选
    if (famousData) {
      const result = { 
        imageUrl: '', 
        description: famousData.description || '', 
        images: [], 
        ticketPrice: famousData.ticket, 
        openTime: famousData.openTime 
      }
      baikeCache[name] = result
      return result
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