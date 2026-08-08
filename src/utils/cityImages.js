import { AMAP_REST_KEY } from '../config'

// 每个城市的标志性图片URL（从高德API实时获取的标志性景点图片）
// 这些图片是城市最具代表性的地标景点照片
const CITY_IMAGE_MAP = {
  '北京': 'https://store.is.autonavi.com/showpic/17a36a737908810a310387c7d53e878a',
  '上海': 'https://store.is.autonavi.com/showpic/b9c402b7d34ea98654cc915e567761dd',
  '杭州': 'https://store.is.autonavi.com/showpic/e2bda1f3737e11d428a2869726275953',
  '成都': 'https://store.is.autonavi.com/showpic/a053c92a40b8a3591e3c24fd3d9bc40a',
  '西安': 'https://store.is.autonavi.com/showpic/5d751d269b840f620b9f2deb768698a8',
  '重庆': 'https://store.is.autonavi.com/showpic/ba42dbbf1e38e41ba65a84f3d021b96b',
  '厦门': 'https://aos-comment.amap.com/B0FFGIJ31G/comment/2f52a9ad493523e5613dfe6ef614d47e_2048_2048_80.jpg',
  '丽江': 'https://store.is.autonavi.com/showpic/79301b10705b92ec03da88565b18e0f5',
  '三亚': 'https://aos-cdn-image.amap.com/sns/ugccomment/a8a27a93-ae69-4bd2-97cf-5f92f4a07119.jpg',
  '青岛': 'https://store.is.autonavi.com/showpic/43c52933c1769faa59b8ace73c85844d',
  '大理': 'https://store.is.autonavi.com/showpic/6f58f6d8603c8ef98b2b0754c8d3c01a',
  '苏州': 'https://store.is.autonavi.com/showpic/aced2ad6e6cebff9f83132f53195b0a5',
  '南京': 'https://store.is.autonavi.com/showpic/8fd02cf1c04a8a5a91e32a5354d7a023',
  '长沙': 'https://store.is.autonavi.com/showpic/8b5a978d09a096780000003447300678?type=pic',
  '昆明': 'https://store.is.autonavi.com/showpic/6598448af0604a9b337201c78a73054c',
  '拉萨': 'https://store.is.autonavi.com/showpic/abc43f4373ca7c3cd59e884283c31051',
  '哈尔滨': 'https://store.is.autonavi.com/showpic/7594ae446ea6e08ccb919c416146c547',
  '广州': 'https://store.is.autonavi.com/showpic/d5b56df50d024cbd33e4e1a16f77d419'
}

// 各城市的地标高德搜索词（用于API搜索）
const CITY_LANDMARK_KEYWORDS = {
  '北京': '天安门',
  '上海': '外滩',
  '杭州': '西湖',
  '成都': '宽窄巷子',
  '西安': '西安钟楼',
  '重庆': '洪崖洞',
  '厦门': '鼓浪屿',
  '丽江': '丽江古城',
  '三亚': '亚龙湾',
  '青岛': '青岛栈桥',
  '大理': '大理古城',
  '苏州': '苏州园林',
  '南京': '夫子庙秦淮河',
  '长沙': '橘子洲',
  '昆明': '滇池',
  '拉萨': '布达拉宫',
  '哈尔滨': '中央大街',
  '广州': '广州塔'
}

// 所有城市名称列表
const ALL_CITY_NAMES = Object.keys(CITY_IMAGE_MAP)

/**
 * 获取单个城市的图片（高德API搜索 + 硬编码保底）
 * @param {string} cityName 城市名
 * @returns {Promise<string>} 图片URL
 */
export async function getCityImage(cityName) {
  // 先看是否有硬编码的保底图片
  const fallback = CITY_IMAGE_MAP[cityName]
  if (!AMAP_REST_KEY) {
    return fallback || ''
  }

  // 尝试用地标高德API搜索（更可能返回带图片的POI）
  const landmark = CITY_LANDMARK_KEYWORDS[cityName] || cityName
  const keywords = [`${cityName}${landmark}`, `${cityName}景点`, landmark]

  for (const kw of keywords) {
    try {
      const url = `https://restapi.amap.com/v3/place/text?key=${AMAP_REST_KEY}&keywords=${encodeURIComponent(kw)}&city=${encodeURIComponent(cityName)}&offset=5&page=1&extensions=all`
      const res = await fetch(url)
      const data = await res.json()
      if (data.status === '1' && data.pois && data.pois.length > 0) {
        for (const poi of data.pois) {
          if (poi.photos && poi.photos.length > 0) {
            let imgUrl = poi.photos[0].url
            if (imgUrl && imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl
            if (imgUrl && imgUrl.startsWith('http://')) imgUrl = imgUrl.replace('http://', 'https://')
            return imgUrl
          }
        }
      }
    } catch {
      // 继续尝试
    }
  }

  // 所有API搜索失败，使用保底图片
  return fallback || ''
}

/**
 * 批量获取所有城市的图片
 * @returns {Promise<Object>} {城市名: 图片URL}
 */
export async function getAllCityImages() {
  const cacheKey = 'travel_home_city_pics'
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const data = JSON.parse(cached)
      if (Date.now() - data.time < 24 * 60 * 60 * 1000) {
        // 使用缓存，但补充可能缺失的城市
        const images = { ...CITY_IMAGE_MAP, ...(data.images || {}) }
        // 检查是否有缺失的城市，补充硬编码图片
        for (const name of ALL_CITY_NAMES) {
          if (!images[name]) {
            images[name] = CITY_IMAGE_MAP[name]
          }
        }
        return images
      }
    }
  } catch { /* ignore */ }

  // 并发获取所有城市图片（限制并发数）
  const concurrency = 6
  const images = { ...CITY_IMAGE_MAP } // 用硬编码图片作为初始保底

  for (let i = 0; i < ALL_CITY_NAMES.length; i += concurrency) {
    const batch = ALL_CITY_NAMES.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(async (name) => {
      const url = await getCityImage(name)
      return { name, url }
    }))
    for (const r of batchResults) {
      if (r.url) images[r.name] = r.url
    }
  }

  // 确保所有城市都有图片（硬编码保底）
  for (const name of ALL_CITY_NAMES) {
    if (!images[name]) {
      images[name] = CITY_IMAGE_MAP[name]
    }
  }

  // 缓存
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ images, time: Date.now() }))
  } catch { /* ignore */ }

  return images
}

/**
 * 获取单个城市的保底图片（不调API，直接返回硬编码URL）
 * @param {string} cityName 城市名
 * @returns {string} 图片URL
 */
export function getCityFallbackImage(cityName) {
  return CITY_IMAGE_MAP[cityName] || ''
}

export { ALL_CITY_NAMES, CITY_LANDMARK_KEYWORDS }
