// 距离/时间/价格格式化工具

// 距离(米) -> 友好显示
export function formatDistance(meters) {
  if (meters == null) return '-'
  if (meters < 1000) return `${Math.round(meters)} 米`
  return `${(meters / 1000).toFixed(1)} 公里`
}

// 时间(秒) -> 友好显示
export function formatTime(seconds) {
  if (seconds == null) return '-'
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

// 价格
export function formatPrice(yuan) {
  if (yuan == null || yuan === '') return '暂无'
  return `¥${yuan}`
}

// 日期 yyyy-mm-dd
export function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 获取景点图片URL（优先使用在线图片，否则返回空）
export function getAttractionImage(attr) {
  if (!attr) return ''
  
  // 优先使用 images 数组（来自高德API或百度百科补充）
  if (attr.images && Array.isArray(attr.images) && attr.images.length > 0) {
    const firstImg = attr.images[0]
    let url = ''
    if (typeof firstImg === 'string') {
      url = firstImg
    } else if (firstImg && firstImg.url) {
      url = firstImg.url
    }
    if (url) {
      const normalized = normalizeImageUrl(url)
      if (normalized) return normalized
    }
  }
  
  // 其次使用 photos 数组（高德 REST API 格式）
  if (attr.photos && Array.isArray(attr.photos) && attr.photos.length > 0) {
    const firstImg = attr.photos[0]
    let url = ''
    if (typeof firstImg === 'string') {
      url = firstImg
    } else if (firstImg && firstImg.url) {
      url = firstImg.url
    }
    if (url) {
      const normalized = normalizeImageUrl(url)
      if (normalized) return normalized
    }
  }
  
  // 检查 biz_ext 中的图片
  if (attr.biz_ext && attr.biz_ext.photos && attr.biz_ext.photos.length > 0) {
    const firstImg = attr.biz_ext.photos[0]
    let url = ''
    if (typeof firstImg === 'string') {
      url = firstImg
    } else if (firstImg && firstImg.url) {
      url = firstImg.url
    }
    if (url) {
      const normalized = normalizeImageUrl(url)
      if (normalized) return normalized
    }
  }
  
  // 最后检查单张图片字段
  if (attr.image || attr.img || attr.pic) {
    let url = attr.image || attr.img || attr.pic
    if (url && typeof url === 'string') {
      const normalized = normalizeImageUrl(url)
      if (normalized) return normalized
    }
  }
  
  return ''
}

// 标准化图片URL
function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return ''
  
  // 去除可能的空白字符
  url = url.trim()
  
  // 处理协议相对URL (//xxx)
  if (url.startsWith('//')) {
    url = 'https:' + url
  }
  
  // 确保使用HTTPS
  if (url.startsWith('http://')) {
    url = 'https://' + url.substring(7)
  }
  
  // 百度百科图片需要特殊处理 - 添加 Referrer 相关处理
  // 百度图片域名
  const baikeDomains = ['baike.baidu.com', 'bkimg.cdn.bcebos.com', 'img.cdn.bcebos.com']
  const isBaikeImg = baikeDomains.some(d => url.includes(d))
  
  // 如果是百度百科图片，需要添加时间戳或其他参数防止防盗链
  if (isBaikeImg && !url.includes('?')) {
    // 百度百科图片通常不需要特殊处理，直接返回
  }
  
  return url
}

// haversine 公式计算两点距离(米)
export function haversine(lng1, lat1, lng2, lat2) {
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}