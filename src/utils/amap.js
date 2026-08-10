import AMapLoader from '@amap/amap-jsapi-loader'
import { AMAP_KEY, AMAP_REST_KEY, AMAP_SECURITY_CODE } from '../config'

let amapPromise = null

// 设置高德安全密钥(必须在 load 之前设置)
function setupSecurity() {
  if (AMAP_SECURITY_CODE) {
    window._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY_CODE
    }
  }
}

// 加载高德 JS API(单例,避免重复加载)
export function loadAmap() {
  if (!AMAP_KEY) {
    return Promise.reject(new Error('NO_AMAP_KEY'))
  }
  if (!amapPromise) {
    setupSecurity()
    amapPromise = AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: [
        'AMap.Geolocation',      // 定位
        'AMap.PlaceSearch',       // POI 搜索
        'AMap.AutoComplete',      // 输入提示
        'AMap.Driving',           // 驾车路线
        'AMap.Walking',           // 步行路线
        'AMap.Riding',            // 骑行路线(自行车/电动车)
        'AMap.Transfer',          // 公交路线
        'AMap.Geocoder',          // 地理编码
        'AMap.CitySearch',        // 城市查询
        'AMap.MarkerClusterer'    // 点聚合
      ]
    })
  }
  return amapPromise
}

// 获取当前定位
export function getCurrentPosition() {
  return loadAmap().then(AMap => {
    return new Promise((resolve, reject) => {
      const geo = new AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 10000,
        GeoLocationFirst: true
      })
      geo.getCurrentPosition((status, result) => {
        if (status === 'complete') {
          resolve({
            lng: result.position.lng,
            lat: result.position.lat,
            address: result.formattedAddress || '',
            city: result.addressComponent && result.addressComponent.city
          })
        } else {
          reject(new Error(result.message || '定位失败'))
        }
      })
    })
  })
}

// 关键字搜索 POI
export function searchPlace(keyword, city = '', type = '') {
  return loadAmap().then(AMap => {
    return new Promise((resolve, reject) => {
      const placeSearch = new AMap.PlaceSearch({
        city: city || '全国',
        type,
        pageSize: 20,
        pageIndex: 1,
        extensions: 'all'
      })
      placeSearch.search(keyword, (status, result) => {
        if (status === 'complete' && result.poiList) {
          resolve(result.poiList.pois || [])
        } else {
          reject(new Error(result.info || '搜索失败'))
        }
      })
    })
  })
}

// 通过REST API(Web服务接口)直接搜索景点
// 使用AMAP_REST_KEY(Web服务类型Key)，如果与JS API Key相同则不生效
export async function searchAttractions(city, keyword = '景点', types = ['110000'], pageSize = 30, maxPages = 2) {
  // 先尝试REST API方式(需要Web服务类型Key)
  if (AMAP_REST_KEY) {
    try {
      const allResults = []
      const pageSizeActual = Math.min(pageSize, 50) // 高德API最大50
      
      for (let page = 1; page <= maxPages; page++) {
        // 构建URL参数
        const params = new URLSearchParams()
        params.set('key', AMAP_REST_KEY)
        // keywords 不能为空，至少给一个空字符串或默认值
        params.set('keywords', keyword || '')
        if (city) {
          params.set('city', city)
          // 强制限制在指定城市范围内搜索，不扩散
          params.set('citylimit', 'true')
        }
        params.set('offset', String(pageSizeActual))
        params.set('page', String(page))
        params.set('extensions', 'all')
        // 重要：只有当types有值时才添加（避免与keywords冲突导致无结果）
        // 根据项目经验：types与keywords同时存在可能冲突，当keywords为空时加types效果更好
        if (types && types.length > 0) {
          if (!keyword) {
            // 无关键词时，用types精确过滤
            params.set('types', types.join('|'))
          } else {
            // 有关键词时，如果是通配类关键词(景点/景区)也加types增强；精确关键词则不加避免冲突
            const genericKeywords = ['景点', '景区', '旅游景区', '旅游景点', '']
            if (genericKeywords.includes(keyword)) {
              params.set('types', types.join('|'))
            }
          }
        }
        const url = `https://restapi.amap.com/v3/place/text?${params.toString()}`
        const res = await fetch(url, { method: 'GET' })
        const data = await res.json()
        
        if (data.status === '1' && data.pois && data.pois.length > 0) {
          const mappedPois = data.pois.map(p => {
            // 提取门票价格 - 从多个可能的字段中获取
            let ticketPrice = ''
            const bizExt = p.biz_ext || {}
            const deepInfo = p.deep_info || {}
            
            // 尝试从各种字段获取门票价格
            if (bizExt.ticket_price) {
              ticketPrice = typeof bizExt.ticket_price === 'string' ? bizExt.ticket_price : JSON.stringify(bizExt.ticket_price)
            } else if (deepInfo.ticket_price) {
              ticketPrice = typeof deepInfo.ticket_price === 'string' ? deepInfo.ticket_price : JSON.stringify(deepInfo.ticket_price)
            } else if (bizExt.cost) {
              ticketPrice = String(bizExt.cost)
            } else if (bizExt.price) {
              ticketPrice = String(bizExt.price)
            }
            
            // 提取营业时间
            let openTime = ''
            if (bizExt.opentime2) {
              openTime = bizExt.opentime2
            } else if (bizExt.open_time) {
              openTime = bizExt.open_time
            } else if (deepInfo.opentime_week) {
              openTime = deepInfo.opentime_week
            } else if (deepInfo.opentime) {
              openTime = deepInfo.opentime
            }
            
            // 提取图片 - 从多个字段获取
            const images = []
            if (p.photos && p.photos.length > 0) {
              for (const img of p.photos) {
                if (img.url) images.push({ url: img.url, title: img.title || '' })
              }
            }
            // 从image字段获取
            if (p.images && Array.isArray(p.images)) {
              for (const img of p.images) {
                if (img.url && !images.find(i => i.url === img.url)) {
                  images.push({ url: img.url, title: img.title || '' })
                }
              }
            }
            // 从deep_info.photos获取
            if (deepInfo.photos && Array.isArray(deepInfo.photos)) {
              for (const img of deepInfo.photos) {
                const url = img.url || (img.href ? img.href : '')
                if (url && !images.find(i => i.url === url)) {
                  images.push({ url, title: img.title || '' })
                }
              }
            }
            
            return {
              name: p.name,
              lng: p.location ? p.location.split(',')[0] : '',
              lat: p.location ? p.location.split(',')[1] : '',
              address: p.address || '',
              tel: p.tel || '',
              type: p.type || '',
              pname: p.pname || '',
              cityname: p.cityname || '',
              adname: p.adname || '',
              images,
              deep_info: {
                introduction: deepInfo.introduction || bizExt.introduction || '',
                opentime: openTime,
                ticket_price: ticketPrice,
                rating: bizExt.rating || deepInfo.rating || '',
                recommend: p.recommend || ''
              },
              biz_ext: {
                rating: bizExt.rating || '',
                cost: bizExt.cost || ticketPrice || ''
              },
              id: p.id || ''
            }
          })
          allResults.push(...mappedPois)
          
          // 如果当前页数量不足，说明没有更多结果
          if (data.pois.length < pageSizeActual) break
        } else {
          // 没有更多结果或出错
          if (page === 1) {
            // 第一页就失败，打印错误
            if (data.info === 'USERKEY_PLAT_NOMATCH') {
              console.warn('REST API失败: Key类型不匹配，请配置Web服务类型Key到VITE_AMAP_REST_KEY')
            } else if (data.info !== 'OK') {
              console.warn(`REST API搜索失败: ${data.info}`)
            }
          }
          break
        }
      }
      
      if (allResults.length > 0) {
        return allResults
      }
    } catch (e) {
      console.warn('REST API请求异常:', e.message)
    }
  }

  // 备选: 使用JS API的PlaceSearch
  return searchAttractionsByJSAPI(city, keyword, types, pageSize)
}

// JS API PlaceSearch方式(备选)
function searchAttractionsByJSAPI(city, keyword = '景点', types = ['110000'], pageSize = 30) {
  return loadAmap().then(AMap => {
    return new Promise((resolve, reject) => {
      const placeSearch = new AMap.PlaceSearch({
        city: city,
        type: types.join(';'),
        pageSize,
        pageIndex: 1,
        extensions: 'all'
      })
      placeSearch.search(keyword, (status, result) => {
        if (status === 'complete' && result && result.poiList && result.poiList.pois && result.poiList.pois.length > 0) {
          const pois = result.poiList.pois.map(p => {
            // 提取门票价格
            let ticketPrice = ''
            const bizExt = p.biz_ext || {}
            const deepInfo = p.deep_info || {}
            
            if (bizExt.ticket_price) {
              ticketPrice = typeof bizExt.ticket_price === 'string' ? bizExt.ticket_price : JSON.stringify(bizExt.ticket_price)
            } else if (deepInfo.ticket_price) {
              ticketPrice = typeof deepInfo.ticket_price === 'string' ? deepInfo.ticket_price : JSON.stringify(deepInfo.ticket_price)
            } else if (bizExt.cost) {
              ticketPrice = String(bizExt.cost)
            }
            
            // 提取图片
            const images = []
            if (p.photos && p.photos.length > 0) {
              for (const img of p.photos) {
                if (img.url) images.push({ url: img.url, title: img.title || '' })
              }
            }
            if (p.deep_info && p.deep_info.photos && Array.isArray(p.deep_info.photos)) {
              for (const img of p.deep_info.photos) {
                if (img.url && !images.find(i => i.url === img.url)) {
                  images.push({ url: img.url, title: img.title || '' })
                }
              }
            }
            
            return {
              name: p.name,
              lng: p.location.lng,
              lat: p.location.lat,
              address: p.address || '',
              tel: p.tel || '',
              type: p.type || '',
              pname: p.pname || '',
              cityname: p.cityname || '',
              adname: p.adname || '',
              images,
              deep_info: {
                introduction: p.deep_info?.introduction || bizExt.introduction || '',
                opentime: p.deep_info?.opentime_week || p.deep_info?.opentime || bizExt.opentime2 || bizExt.open_time || '',
                ticket_price: ticketPrice,
                rating: bizExt.rating || p.deep_info?.rating || '',
                recommend: p.recommend || ''
              },
              biz_ext: {
                rating: bizExt.rating || '',
                cost: bizExt.cost || ticketPrice || ''
              },
              id: p.id || ''
            }
          })
          resolve(pois)
        } else {
          // 完整的错误信息
          const errMsg = result ? (result.info || '搜索失败') : '搜索无结果'
          console.warn(`JS API PlaceSearch失败: status=${status}, info=${errMsg}, count=${result?.poiList?.pois?.length || 0}`)
          reject(new Error(errMsg))
        }
      })
    })
  })
}

// 周边搜索(在某坐标附近搜索指定类型 POI)
export function searchNearby(lng, lat, type, radius = 3000, pageSize = 20) {
  return loadAmap().then(AMap => {
    return new Promise((resolve, reject) => {
      const placeSearch = new AMap.PlaceSearch({
        type,
        pageSize,
        pageIndex: 1,
        extensions: 'all',
        sortrule: 'distance'
      })
      placeSearch.searchNearBy('', [lng, lat], radius, (status, result) => {
        if (status === 'complete' && result.poiList) {
          resolve(result.poiList.pois || [])
        } else {
          reject(new Error(result.info || '周边搜索失败'))
        }
      })
    })
  })
}

// 路线规划:返回各种出行方式的距离与时间
export function planRoutes(origin, destination) {
  // origin/destination: [lng, lat]
  return loadAmap().then(AMap => {
    const tasks = []

    // 驾车
    tasks.push(new Promise(resolve => {
      const driving = new AMap.Driving({ policy: AMap.DrivingPolicy.LEAST_TIME })
      driving.search(origin, destination, (status, result) => {
        if (status === 'complete' && result && result.routes && result.routes[0]) {
          const r = result.routes[0]
          resolve({ mode: 'driving', name: '驾车', icon: '🚗', distance: r.distance, time: r.time, steps: r.steps || [] })
        } else {
          resolve({ mode: 'driving', name: '驾车', icon: '🚗', distance: null, time: null, error: true, errorMsg: (result && result.info) || status || '路线规划失败' })
        }
      })
    }))

    // 步行
    tasks.push(new Promise(resolve => {
      const walking = new AMap.Walking({})
      walking.search(origin, destination, (status, result) => {
        if (status === 'complete' && result && result.routes && result.routes[0]) {
          const r = result.routes[0]
          resolve({ mode: 'walking', name: '步行', icon: '🚶', distance: r.distance, time: r.time, steps: r.steps || [] })
        } else {
          resolve({ mode: 'walking', name: '步行', icon: '🚶', distance: null, time: null, error: true, errorMsg: (result && result.info) || status || '路线规划失败' })
        }
      })
    }))

    // 骑行(自行车)
    tasks.push(new Promise(resolve => {
      const riding = new AMap.Riding({})
      riding.search(origin, destination, (status, result) => {
        if (status === 'complete' && result && result.routes && result.routes[0]) {
          const r = result.routes[0]
          resolve({ mode: 'bicycle', name: '自行车', icon: '🚲', distance: r.distance, time: r.time, steps: r.steps || [] })
        } else {
          resolve({ mode: 'bicycle', name: '自行车', icon: '🚲', distance: null, time: null, error: true, errorMsg: (result && result.info) || status || '路线规划失败' })
        }
      })
    }))

    // 电动车(骑行近似,速度按电动车换算)
    tasks.push(new Promise(resolve => {
      const riding = new AMap.Riding({})
      riding.search(origin, destination, (status, result) => {
        if (status === 'complete' && result && result.routes && result.routes[0]) {
          const r = result.routes[0]
          // 电动车均速约 25km/h,自行车的距离换算为电动车时间
          const eBikeTime = Math.round((r.distance / 1000) / 25 * 3600)
          resolve({ mode: 'ebike', name: '电动车', icon: '🛵', distance: r.distance, time: eBikeTime, steps: r.steps || [] })
        } else {
          resolve({ mode: 'ebike', name: '电动车', icon: '🛵', distance: null, time: null, error: true, errorMsg: (result && result.info) || status || '路线规划失败' })
        }
      })
    }))

    // 打车(按驾车距离,时间略增考虑市区拥堵)
    tasks.push(new Promise(resolve => {
      const driving = new AMap.Driving({ policy: AMap.DrivingPolicy.LEAST_TIME })
      driving.search(origin, destination, (status, result) => {
        if (status === 'complete' && result && result.routes && result.routes[0]) {
          const r = result.routes[0]
          // 打车估算费用: 起步价13 + 每公里2.5
          const cost = Math.round(13 + (r.distance / 1000) * 2.5)
          resolve({ mode: 'taxi', name: '打车', icon: '🚕', distance: r.distance, time: Math.round(r.time * 1.15), cost, steps: r.steps || [] })
        } else {
          resolve({ mode: 'taxi', name: '打车', icon: '🚕', distance: null, time: null, error: true, errorMsg: (result && result.info) || status || '路线规划失败' })
        }
      })
    }))

    return Promise.all(tasks)
  })
}

// 地理编码:经纬度 -> 地址
export function getAddress(lng, lat) {
  return loadAmap().then(AMap => {
    return new Promise((resolve, reject) => {
      const geocoder = new AMap.Geocoder()
      geocoder.getAddress([lng, lat], (status, result) => {
        if (status === 'complete' && result.info === 'OK') {
          resolve(result.regeocode.formattedAddress)
        } else {
          reject(new Error('解析地址失败'))
        }
      })
    })
  })
}

// 城市/地点输入提示
export function getInputTips(keyword, city = '') {
  return loadAmap().then(AMap => {
    return new Promise((resolve) => {
      const auto = new AMap.AutoComplete({ city: city || '全国' })
      auto.search(keyword, (status, result) => {
        if (status === 'complete' && result.tips) {
          resolve(result.tips.filter(t => t.location))
        } else {
          resolve([])
        }
      })
    })
  })
}
