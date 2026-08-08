// 景点数据服务 - 通过高德地图API获取真实景点数据，缓存到localStorage
import { searchAttractions } from '../utils/amap'
import { hasAmapKey, ATTRACTION_CACHE_KEY, ATTRACTION_CACHE_DURATION } from '../config'
import { fetchBaikeData } from './baikeService'

// 高德地图POI类型: 110000=风景名胜, 110100=公园广场
const ATTRACTION_TYPES = ['110000', '110100']

// 各城市热门景点名称列表(用于辅助搜索,确保覆盖热门景点)
const CITY_ATTRACTION_NAMES = {
  '北京': '故宫博物院,长城,颐和园,天坛公园,鸟巢,南锣鼓巷,雍和宫,圆明园,北海公园,恭王府,天安门广场,香山公园,景山公园,798艺术区,王府井,国家博物馆,雁栖湖,水立方,奥林匹克公园,什刹海',
  '上海': '外滩,东方明珠,迪士尼乐园,豫园,南京路步行街,田子坊,上海科技馆,野生动物园,海昌海洋公园,朱家角古镇,上海博物馆,新天地,武康路,上海中心大厦,静安寺,自然博物馆,世纪公园,七宝古镇,上海马戏城,东方绿舟',
  '杭州': '西湖,灵隐寺,千岛湖,宋城,西溪湿地,河坊街,湘湖,龙井村,九溪烟树,宝石山,杭州乐园,野生动物世界,白塔公园,运河历史街区,茅家埠,雷峰塔,断桥,苏堤,六和塔,杭州植物园',
  '成都': '大熊猫繁育研究基地,宽窄巷子,武侯祠,锦里,都江堰,春熙路,青城山,西岭雪山,人民公园,文殊院,杜甫草堂,金沙遗址博物馆,黄龙溪古镇,洛带古镇,平乐古镇,望江楼公园,大慈寺,成都博物馆,四川博物院,青羊宫',
  '西安': '秦始皇兵马俑,大雁塔,西安城墙,回民街,华清宫,大唐不夜城,陕西历史博物馆,钟楼,鼓楼,小雁塔,西安博物院,大明宫国家遗址公园,曲江池,大唐芙蓉园,华山,半坡博物馆,青龙寺,汉阳陵,骊山,西安碑林博物馆',
  '重庆': '洪崖洞,磁器口古镇,长江索道,解放碑,武隆天生三桥,李子坝轻轨站,酉阳桃花源,仙女山,金佛山,白帝城,丰都鬼城,四面山,鹅岭公园,南山一棵树,朝天门,重庆动物园,湖广会馆,山城步道,罗汉寺,重庆科技馆',
  '厦门': '鼓浪屿,南普陀寺,曾厝垵,环岛路,厦门大学,中山路步行街,万石植物园,胡里山炮台,集美学村,五缘湾湿地公园,厦门科技馆,同安影视城,海沧大桥,园博苑,厦门园林植物园,白鹭洲公园,观音山,日月谷温泉,天竺山森林公园,大嶝岛',
  '丽江': '丽江古城,玉龙雪山,蓝月谷,束河古镇,拉市海,木府,泸沽湖,虎跳峡,黑龙潭公园,观音峡,文笔山,里格岛,草海,走婚桥,扎美寺,老君山,玉水寨,东巴谷,白沙古镇,听花谷',
  '三亚': '亚龙湾,天涯海角,蜈支洲岛,南山文化旅游区,大东海,呀诺达雨林,大小洞天,三亚湾,鹿回头风景区,亚龙湾热带天堂森林公园,三亚千古情,海棠湾,后海村,凤凰岭,西岛,槟榔谷,分界洲岛,南田温泉,亚龙湾海滩,第一市场',
  '青岛': '栈桥,八大关,崂山,金沙滩,五四广场,青岛啤酒博物馆,奥帆中心,极地海洋世界,信号山公园,小鱼山,青岛海底世界,中山公园,海军博物馆,青岛电视塔,石老人海水浴场,唐岛湾,即墨古城,青岛山,青岛动物园,小青岛',
  '大理': '洱海,大理古城,苍山,双廊古镇,崇圣寺三塔,喜洲古镇,沙溪古镇,巍山古城,蝴蝶泉,天龙八部影视城,南诏风情岛,小普陀,罗荃半岛,张家花园,感通寺,鸡足山,洱源西湖,剑川石宝山,大理博物馆,龙龛码头',
  '苏州': '拙政园,虎丘,周庄古镇,留园,平江路,寒山寺,网师园,狮子林,沧浪亭,苏州博物馆,山塘街,金鸡湖,同里古镇,木渎古镇,苏州乐园,苏州中心,盘门,枫桥景区,怡园,东吴塔',
  '南京': '中山陵,夫子庙秦淮河,明孝陵,玄武湖,总统府,南京博物院,牛首山,汤山温泉,紫金山天文台,甘家大院,瞻园,莫愁湖公园,红山森林动物园,栖霞山,南京长江大桥,老门东,清凉山公园,燕子矶公园,南京大屠杀纪念馆,灵谷寺',
  '长沙': '橘子洲,岳麓山,太平街,湖南省博物馆,世界之窗,火宫殿,岳麓书院,爱晚亭,天心阁,开福寺,梅溪湖,松雅湖,靖港古镇,铜官窑古镇,黑麋峰,大围山,长沙海底世界,长沙生态动物园,长沙国金中心,湘江欢乐城',
  '昆明': '滇池,石林风景区,翠湖公园,云南民族村,金殿,西山龙门,大观楼,西山森林公园,黑龙潭公园,圆通山,安宁温泉,云南大学,官渡古镇,东川红土地,九乡风景区,轿子雪山,云南野生动物园,斗南花市,澄江化石地,金马碧鸡坊',
  '拉萨': '布达拉宫,大昭寺,八廓街,纳木错,羊卓雍措,罗布林卡,色拉寺,哲蚌寺,甘丹寺,桑耶寺,雅鲁藏布大峡谷,拉姆拉措,小昭寺,扎基寺,楚布寺,药王山,拉萨河,西藏博物馆,色拉乌孜,米拉山口',
  '哈尔滨': '冰雪大世界,中央大街,圣索菲亚教堂,太阳岛风景区,松花江,伏尔加庄园,龙塔,帽儿山,亚布力滑雪场,东北虎林园,哈尔滨极地馆,哈尔滨大剧院,黑龙江省博物馆,兆麟公园,哈尔滨文化公园,阿城金源文化旅游区,哈尔滨游乐园,哈尔滨植物园,哈尔滨文庙,冰灯游园会',
  '广州': '广州塔,陈家祠,沙面岛,白云山,长隆野生动物世界,北京路步行街,长隆欢乐世界,百万葵园,白水寨,岭南印象园,从化温泉,越秀公园,广州动物园,广州博物馆,中山纪念堂,华南植物园,广州海洋馆,广州艺术博物院,海心沙,黄埔古港'
}

// 缓存操作
function getCache() {
  try {
    const raw = localStorage.getItem(ATTRACTION_CACHE_KEY)
    if (!raw) return {}
    const cache = JSON.parse(raw)
    // 清理过期数据
    const now = Date.now()
    for (const key in cache) {
      if (now - cache[key].time > ATTRACTION_CACHE_DURATION) {
        delete cache[key]
      }
    }
    return cache
  } catch { return {} }
}

function setCache(city, data) {
  try {
    const cache = getCache()
    cache[city] = { data, time: Date.now() }
    localStorage.setItem(ATTRACTION_CACHE_KEY, JSON.stringify(cache))
  } catch { /* localStorage满时不处理 */ }
}

// 检查景点是否有图片
function hasImage(attr) {
  if (!attr) return false
  // 检查 images 数组
  if (attr.images && attr.images.length > 0 && attr.images[0].url) return true
  // 检查 photos 数组
  if (attr.photos && attr.photos.length > 0 && (attr.photos[0].url || attr.photos[0])) return true
  // 检查单图字段
  if (attr.image || attr.img || attr.pic) return true
  return false
}

// 从百度百科补充景点图片
async function enrichAttractionsWithImages(attractions, concurrency = 5) {
  if (!attractions || attractions.length === 0) return attractions

  // 找出没有图片的景点
  const needImage = attractions.filter(a => !hasImage(a))
  if (needImage.length === 0) return attractions

  // 并发获取百度百科图片
  const queue = [...needImage]
  const workers = Array.from({ length: Math.min(concurrency, needImage.length) }, async () => {
    while (queue.length > 0) {
      const attr = queue.shift()
      try {
        const baikeData = await fetchBaikeData(attr.name)
        if (baikeData && baikeData.imageUrl) {
          // 将百度百科图片添加到景点数据
          if (!attr.images) attr.images = []
          attr.images.push({ url: baikeData.imageUrl, title: attr.name })
          // 如果没有描述，也补充描述
          if (!attr.deep_info && baikeData.description) {
            attr.deep_info = { introduction: baikeData.description }
          } else if (attr.deep_info && !attr.deep_info.introduction && baikeData.description) {
            attr.deep_info.introduction = baikeData.description
          }
        }
      } catch (e) {
        // 忽略单个景点的图片获取失败
      }
    }
  })

  await Promise.all(workers)
  return attractions
}

// 获取指定城市的热门景点(从高德API获取真实数据)
export async function fetchCityAttractions(city, forceRefresh = false) {
  if (!hasAmapKey) {
    throw new Error('未配置高德地图Key，请先配置高德地图Key后再使用')
  }

  // 检查缓存
  if (!forceRefresh) {
    const cache = getCache()
    if (cache[city] && cache[city].data) {
      return cache[city].data
    }
  }

  // 策略1: 用"景点"关键词 + 风景名胜类型搜索
  let pois = []
  try {
    pois = await searchAttractions(city, '景点', ATTRACTION_TYPES, 30)
  } catch (e) {
    console.warn(`高德搜索「${city}」景点失败:`, e)
  }

  // 策略2: 如果结果不足10个,用城市热门景点名称列表逐个搜索补充
  const nameList = CITY_ATTRACTION_NAMES[city] || ''
  if (pois.length < 10 && nameList) {
    const names = nameList.split(',').map(n => n.trim()).filter(Boolean)
    // 分批搜索,每批5个关键词
    for (let i = 0; i < names.length && pois.length < 20; i += 5) {
      const batch = names.slice(i, i + 5).join(',')
      try {
        const batchPois = await searchAttractions(city, batch, ATTRACTION_TYPES, 20)
        // 合并去重
        const existingNames = new Set(pois.map(p => p.name))
        for (const p of batchPois) {
          if (!existingNames.has(p.name)) {
            pois.push(p)
            existingNames.add(p.name)
          }
        }
      } catch (e) {
        console.warn(`高德搜索「${city}」批次失败:`, e)
      }
    }
  }

  // 数据清洗:去重(按名称)、过滤无效数据
  const seen = new Set()
  const attractions = pois
    .filter(p => {
      if (!p.name || seen.has(p.name)) return false
      seen.add(p.name)
      return true
    })
    .slice(0, 20)

  // 从百度百科补充图片
  await enrichAttractionsWithImages(attractions)

  // 缓存数据
  if (attractions.length > 0) {
    setCache(city, attractions)
  }

  return attractions
}

// 判断是否为景点类型（用于排序优先）
const ATTRACTION_TYPE_PREFIXES = ['110000', '110100']
function isAttractionType(poi) {
  if (!poi.type) return false
  return ATTRACTION_TYPE_PREFIXES.some(prefix => poi.type.startsWith(prefix))
}

// 获取热度/评分值（用于排序）
function getPoiPopularity(poi) {
  // 获取评分
  const rating = poi.biz_ext?.rating || poi.deep_info?.rating || ''
  const ratingNum = parseFloat(rating)
  if (!isNaN(ratingNum) && ratingNum > 0) return ratingNum
  
  // 有门票、开放时间等信息说明更热门
  let score = 0
  if (poi.deep_info?.ticket_price) score += 2
  if (poi.deep_info?.opentime) score += 1
  if (poi.images && poi.images.length > 0) score += 1
  return score
}

// 搜索景点(支持任意关键词搜索,从高德API获取实时数据)
// city 参数可以是城市名，也可以是 '全国' 表示全国范围搜索
export async function searchAttractionsByKeyword(city, keyword) {
  if (!hasAmapKey) {
    throw new Error('未配置高德地图Key')
  }
  if (!keyword || !keyword.trim()) return []

  const searchCity = (city === '全国' || !city) ? '' : city
  const trimmedKeyword = keyword.trim()

  // 策略1: 先用景点类型搜索（获取景点结果，最多3页×50=150条）
  let attractionPois = []
  try {
    attractionPois = await searchAttractions(searchCity, trimmedKeyword, ATTRACTION_TYPES, 50, 3)
  } catch (e) {
    // 景点类型搜索失败
  }

  // 策略2: 全类型搜索（获取所有相关 POI，最多3页×50=150条）
  let allPois = []
  try {
    allPois = await searchAttractions(searchCity, trimmedKeyword, [], 50, 3)
  } catch (e) {
    // 全类型搜索失败
  }

  // 合并去重
  const resultMap = new Map()
  for (const p of attractionPois) {
    if (!resultMap.has(p.name)) {
      resultMap.set(p.name, { ...p, _isAttraction: true })
    }
  }
  for (const p of allPois) {
    if (!resultMap.has(p.name)) {
      resultMap.set(p.name, { ...p, _isAttraction: isAttractionType(p) })
    }
  }

  // 转换为数组并排序
  const merged = Array.from(resultMap.values())

  // 排序: 景点优先，然后按热度排序
  merged.sort((a, b) => {
    // 景点优先
    if (a._isAttraction !== b._isAttraction) {
      return a._isAttraction ? -1 : 1
    }
    // 同类型按热度排序
    const scoreA = getPoiPopularity(a)
    const scoreB = getPoiPopularity(b)
    return scoreB - scoreA
  })

  // 移除临时标记字段
  const finalPois = merged.map(({ _isAttraction, ...rest }) => rest)

  // 从百度百科补充图片
  const enrichedPois = await enrichAttractionsWithImages(finalPois)

  return enrichedPois
}

// 清除缓存
export function clearAttractionsCache() {
  localStorage.removeItem(ATTRACTION_CACHE_KEY)
}