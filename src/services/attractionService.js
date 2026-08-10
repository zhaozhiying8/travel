// 景点数据服务 - 通过高德地图API获取真实景点数据，缓存到localStorage
import { searchAttractions } from '../utils/amap'
import { hasAmapKey, ATTRACTION_CACHE_KEY, ATTRACTION_CACHE_DURATION } from '../config'
import { fetchBaikeData } from './baikeService'

// 景点类型：110000=风景名胜, 110100=公园广场, 140100-140300=科教文化(博物馆/展览馆/图书馆/科技馆等)
// 注意：140000 大类下很多子类型(如140400学校/140500培训机构/140800娱乐)不是景点，需要精确匹配
const ATTRACTION_TYPE_PREFIXES = [
  '110000', // 风景名胜
  '110100', // 公园广场
  '140100', // 博物馆
  '140200', // 展览馆/美术馆
  '140300', // 图书馆
  '140402', // 科技馆
  '140403', // 纪念馆
  '140404', // 文化馆
  '140405', // 少年宫/文化宫
]

// API搜索时使用的景点类型（更宽泛，用于搜索召回）
const ATTRACTION_SEARCH_TYPES = ['110000', '110100', '140000']

// 景点名称关键词（名称中包含这些关键词，即使类型不明确也保留）
const ATTRACTION_NAME_KEYWORDS = [
  '景区', '景点', '公园', '花园', '园林', '名胜', '风景区',
  '博物馆', '展览馆', '美术馆', '科技馆', '纪念馆', '图书馆', '文化馆',
  '动物园', '植物园', '水族馆', '海洋馆', '极地馆', '海底世界', '海洋公园',
  '温泉', '度假区', '度假村', '寺庙', '教堂', '清真寺', '道观', '佛寺',
  '烈士陵园', '陵园', '纪念堂', '名胜古迹', '古迹', '遗址',
  '国家公园', '森林公园', '地质公园', '自然保护区',
  '游乐园', '主题乐园', '乐园', '游乐场',
  '塔', '阁', '楼', '亭', '台', '石窟', '石刻',
  '瀑布', '温泉', '湖泊', '山峰', '山谷', '峡谷',
  '大桥', '古城', '古镇', '古村', '遗址',
  '海滨', '海滩', '海岛',
  '滑雪场', '滑草场', '水上乐园', '生态园',
  '野生动物园', '动物世界',
  '海水浴场', '海滨浴场',
  '观光', '游览', '旅游景点',
  '牧场', '地质',
  '夜游', '游船', '观景',
  '历史街区', '文化街区', '特色街区', '老街', '古街',
  '灯光秀', '喷泉',
]

// 更精确的排除类型（二级分类，更可靠）
const EXCLUDED_SUB_TYPE_PREFIXES = [
  '0101', '0102', // 加油站/充电站
  '0201', '0202', '0203', '0204', '0205', '0206', '0207', '0208', '0209', // 各类购物
  '0301', '0302', '0303', '0304', '0305', '0306', '0307', '0308', '0309', // 生活服务
  '0401', '0402', '0403', '0404', '0405', // 体育休闲
  '0501', '0502', '0503', '0504', // 医疗
  '0601', '0602', '0603', '0604', // 住宿
  '0701', '0702', '0703', '0704', '0705', '0706', // 餐饮
  '0801', '0802', '0803', '0804', '0805', // 交通
  '0901', '0902', '0903', '0904', // 金融
  '1001', '1002', '1003', '1004', '1005', '1006', // 公司企业
  '1201', '1202', '1203', '1204', '1205', // 政府机关
  '1301', '1302', // 教育培训
  '1303', '1304', // 科研机构
  '1405', '1406', '1407', '1408', // 文化娱乐(电影院/KTV/娱乐城)
  '1501', '1502', '1503', // 室内娱乐
  '1601', '1602', // 体育场馆
  '1901', // 其他
]

// 名称中包含这些关键词的POI直接排除（更全面）
const EXCLUDED_KEYWORDS = [
  // 住宿类
  '酒店', '宾馆', '旅馆', '客栈', '民宿', '公寓', '大厦', '大楼', '招待所',
  // 餐饮类
  '餐厅', '饭店', '餐馆', '小吃', '美食', '火锅', '烧烤', '咖啡', '茶馆', '奶茶',
  '快餐', '汉堡', '披萨', '甜品', '蛋糕', '面包', '冷饮', '酒吧', '酒廊', '饭庄',
  '食府', '酒楼', '酒家', '小吃店', '大排档', '美食街', '美食城',
  // 交通类
  '加油站', '充电站', '充电', '停车场', '停车', '公交站', '地铁站', '汽车站', '火车站',
  '机场', '航站楼', '轮渡', '客运站', '长途', '高铁站', '轻轨', '地铁',
  '交通枢纽', '客运中心', '运输', '物流', '快递公司', '快递',
  '站', // 火车站、汽车站等（注意：会过滤"半坡站"等景点，权衡后保留）
  // 医疗类
  '医院', '诊所', '药店', '医疗', '保健', '护理', '体检', '卫生院', '门诊部',
  '卫生站', '保健院', '疗养院', '整形', '齿科', '眼科', '妇科', '男科',
  // 商业/购物类
  '商场', '超市', '商店', '购物', '购物中心', 'ATM', '邮局',
  '百货', '商厦', '商城', '大卖场', '专卖店', '连锁店', '便利店',
  // 金融类
  '银行', '保险', '证券', '基金', '股票', '期货', '投资', '信托',
  // 生活服务类
  '美容', '美发', '理发', '健身', '健身房', '洗浴', '汗蒸', 'SPA', '按摩', '足疗', '会所',
  '美甲', '美容美发', '养生', '理疗', '推拿', '采耳',
  // 教育类
  '学校', '大学', '幼儿园', '托儿所', '培训', '驾校', '小学', '中学', '高中',
  '学院', '校园', '教学楼', '实验楼', '附属中学', '附属小学',
  // 公司企业类
  '公司', '企业', '事务所', '工作室', '门市部', '经销部', '办事处', '营业厅', '厂房', '仓库',
  '集团', '有限公司', '股份', '分公司', '子公司', '研发中心', '工厂',
  // 摄影写真类
  '婚纱', '摄影', '写真', '影楼', '儿童摄影', '婚庆', '家政', '照相馆', '摄影工作室',
  // 房产类
  '售楼处', '房产中介', '房产', '住宅', '小区', '别墅', '物业', '楼盘', '花园', '家园',
  // 政府/公共服务类
  '政府', '法院', '检察院', '公安局', '派出所', '交警队', '大队', '中队', '分局', '总局',
  '委员会', '办公室', '办公厅', '服务中心', '行政服务',
  '消防站', '消防队', '救援站', '防灾', '避难所',
  // 休闲娱乐类（排除非景点娱乐场所，保留主题乐园等景点）
  'KTV', 'ktv', '歌厅', '舞厅', '夜总会', '娱乐城',
  '台球厅', '保龄球', '健身房', '瑜伽', '健身中心', '体育中心',
  // 汽车服务类
  '4S店', '汽车维修', '洗车', '汽车美容', '汽车装饰', '汽车改装', '汽配', '汽车城',
  // 其他
  '宠物医院', '宠物美容', '宠物', '动物医院',
  '维修', '售后服务', '售后', '客服中心', '客服', '热线',
  '旗舰店', '形象店', '门店', '体验店',
  '货运', '配送', '仓储',
  // 海洋运动/会所类（排除非景点POI）
  '尾波冲浪', '冲浪基地', '游艇会', '帆船俱乐部', '帆船出海',
  '海钓', '钓鱼俱乐部', '潜水俱乐部',
]

// 检查名称中是否包含排除关键词
function hasExcludedKeyword(name) {
  if (!name) return false
  return EXCLUDED_KEYWORDS.some(kw => name.includes(kw))
}

// 检查名称中是否包含景点关键词
function hasAttractionKeyword(name) {
  if (!name) return false
  return ATTRACTION_NAME_KEYWORDS.some(kw => name.includes(kw))
}

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

// 合并、去重、排序 POI 结果（支持多个列表）
function mergeAndSortPoiLists(...lists) {
  const seen = new Set()
  const merged = []
  for (const list of lists) {
    if (!list) continue
    for (const p of list) {
      if (!p || !p.name || seen.has(p.name)) continue
      seen.add(p.name)
      if (!isAttractionType(p)) continue
      merged.push(p)
    }
  }
  // 按热度排序
  merged.sort((a, b) => getPoiPopularity(b) - getPoiPopularity(a))
  return merged
}

// 带重试的搜索（高德偶尔限流，自动重试一次）
async function searchWithRetry(city, keyword, types, pageSize, maxPages, retries = 1) {
  try {
    const result = await searchAttractions(city, keyword, types, pageSize, maxPages)
    // 如果返回0条，且是通用关键词，再重试一次（可能限流）
    if (result.length === 0 && retries > 0) {
      await new Promise(r => setTimeout(r, 500))
      return searchWithRetry(city, keyword, types, pageSize, maxPages, retries - 1)
    }
    return result
  } catch (e) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 500))
      return searchWithRetry(city, keyword, types, pageSize, maxPages, retries - 1)
    }
    return []
  }
}

// 获取指定城市的热门景点(从高德API获取真实数据) - 一次性加载全部
export async function fetchCityAttractions(city, forceRefresh = false) {
  if (!hasAmapKey) {
    throw new Error('未配置高德地图Key，请先配置高德地图Key后再使用')
  }

  // 检查缓存
  if (!forceRefresh) {
    const cache = getCache()
    if (cache[city] && cache[city].data) {
      const cacheAge = Date.now() - cache[city].time
      if (cacheAge < ATTRACTION_CACHE_DURATION) {
        return cache[city].data
      }
    }
  }

  // 策略1: 用"景点"关键词 + 风景名胜类型搜索（3页×50条 = 150条）
  let firstBatch = await searchWithRetry(city, '景点', ATTRACTION_SEARCH_TYPES, 50, 3)

  // 并行执行所有补充策略（3页×50条，保证最多结果）
  const [r2, r3, r4] = await Promise.allSettled([
    searchWithRetry(city, '旅游景区', ATTRACTION_SEARCH_TYPES, 50, 3),
    searchWithRetry(city, '', ATTRACTION_SEARCH_TYPES, 50, 3),
    searchWithRetry(city, '景点', [], 50, 3),
  ])

  const pois2 = r2.status === 'fulfilled' ? r2.value : []
  const pois3 = r3.status === 'fulfilled' ? r3.value : []
  const pois4 = r4.status === 'fulfilled' ? r4.value : []

  // 策略5: 预设热门景点名称（并行获取）
  let pois5 = []
  const nameList = CITY_ATTRACTION_NAMES[city] || ''
  if (nameList) {
    const names = nameList.split(',').map(n => n.trim()).filter(Boolean)
    const batchPromises = []
    for (let i = 0; i < names.length; i += 5) {
      const batch = names.slice(i, i + 5).join(',')
      batchPromises.push(searchWithRetry(city, batch, ATTRACTION_SEARCH_TYPES, 50, 3))
    }
    const batchResults = await Promise.allSettled(batchPromises)
    pois5 = batchResults
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
  }

  // 合并所有结果（去重、过滤、排序）
  const attractions = mergeAndSortPoiLists(firstBatch, pois2, pois3, pois4, pois5)

  // 从百度百科补充图片（等待完成，一次性返回完整数据）
  await enrichAttractionsWithImages(attractions)

  // 缓存数据
  if (attractions.length > 0) {
    setCache(city, attractions)
  }

  return attractions
}

// 异步补充百度百科图片（不阻塞主流程）
function enrichAttractionsWithImagesAsync(attractions, onProgress) {
  // 不阻塞主流程，在后台补充图片
  setTimeout(async () => {
    try {
      await enrichAttractionsWithImages(attractions)
      // 如果有回调，通知UI更新（图片已补充）
      if (onProgress) {
        onProgress([...attractions], false)
      }
    } catch (e) {
      console.warn('图片补充失败:', e)
    }
  }, 500)
}

// 景点类型关键词（匹配高德POI中文类型）
// STRICT: 命中即确定是景点（如"博物馆""动物园"）
const ATTRACTION_TYPE_STRICT_KEYWORDS = [
  '风景名胜', '景区', '博物馆', '展览馆', '美术馆', '科技馆',
  '纪念馆', '图书馆', '文化馆', '动物园', '植物园', '水族馆',
  '海底世界', '海洋馆', '极地馆', '游乐场', '主题乐园',
  '温泉', '度假区', '度假村', '疗养',
  '宗教寺庙', '教堂', '清真寺', '烈士陵园', '陵园', '纪念堂',
  '名胜古迹', '古迹', '遗址', '国家公园', '森林公园', '地质公园',
  '游乐园', '儿童乐园', '亲子乐园',
  '海洋公园', '自然保护区', '观光', '游船', '夜游',
  '历史文化', '文化街区', '特色街区', '历史街区',
  '商业街', // 清河坊等历史文化商业街是景点
]

// GENERIC: 通用类型，需结合名称进一步判断（如"公园""景点"等）
// 注意：不要加太通用的词，只有确定是景点的通用类型才加入
const ATTRACTION_TYPE_GENERIC_KEYWORDS = [
  '公园广场', '公园',
  '游乐园', '乐园', '游乐场',
  '休闲场所·游乐场', // 游乐场是景点
  '景点', '旅游景点', // 太泛化，需要名称配合
  '动物园', '植物园', // 这些在严格和通用中都有
  '水族馆', '海洋馆',
  '娱乐场所·旅游景点', // 如Do都城等亲子场所
]

// 弱景点名称关键词（单独出现不足以判断为景点）
const WEAK_ATTRACTION_NAME_KEYWORDS = ['广场', '景点', '旅游景点', '地质', '牧场', '楼']

// 非景点类型关键词（匹配高德POI中文类型 - 仅用于类型字段中的分类描述）
const EXCLUDED_TYPE_KEYWORDS = [
  // 住宿
  '住宿服务', '宾馆酒店', '招待所',
  // 餐饮
  '餐饮服务', '快餐厅', '咖啡厅', '酒吧',
  // 交通 - 明确排除交通设施和道路附属
  '交通设施', '交通地名', '道路附属设施', '商务住宅',
  // 医疗
  '医疗保健', '体检',
  // 商业/购物
  '购物服务', '商场', '超市', '百货', '商厦', '购物中心', '商业街', '批发市场',
  '便利店', '家电卖场', '数码卖场',
  // 金融
  '金融保险', '银行',
  // 生活服务
  '生活服务', '美容美发', '洗浴', '汗蒸', 'SPA',
  '运动场所', '健身中心', '体育场馆', '体育馆',
  // 科教文化（非景点）
  '科教文化服务', '学校', '培训中心', '培训机构',
  '科研机构', '研究所',
  // 文化娱乐（非景点）
  '休闲娱乐服务', '电影院', '影剧院', 'KTV', '歌厅', '舞厅', '夜总会', '娱乐城', '网吧',
  '休闲场所', // 休闲场所多为体育/俱乐部类，不是景点
  // 公司企业
  '公司企业', '公司', '企业', '工厂', '厂房', '仓库', '集团',
  // 政府
  '政府机关', '政府', '公安局', '派出所', '法院', '检察院', '消防队', '消防站',
  // 房产/住宅
  '住宅小区', '住宅区', '商住两用楼宇',
  // 汽车服务
  '汽车服务', '4S店',
  // 其他非景点 - 自然地名/普通地名不算景点
  '自然地名', '普通地名', '地名',
  '市中心', '城市中心',
  '楼宇', // 楼宇不是景点
  '立交桥', '出口', '出入口', // 交通设施
  '渔场', '养殖场', // 生产设施
  '楼盘', '售楼处',
  '城市广场', // 城市广场一般不是旅游景点（除非单独有名）
]

// 检查POI类型是否为景点（支持中文类型和数字类型两种格式）
function isAttractionType(poi) {
  const name = poi.name || ''
  const type = poi.type || ''

  // 无type字段：完全依赖名称关键词判断
  if (!type) {
    if (hasExcludedKeyword(name)) return false
    if (hasAttractionKeyword(name)) return true
    return true // 默认保留
  }

  // 判断是否为中文类型格式: "住宿服务;住宿服务相关;住宿服务相关"
  const hasChineseType = /[\u4e00-\u9fa5]/.test(type)
  
  if (hasChineseType) {
    // 分割类型部分 - 同时支持分号和圆点分割
    const typeParts = type.split(/[;·]/).map(s => s.trim()).filter(Boolean)
    
    // 1. 命中明确排除类型且名称无强景点关键词 → 直接排除
    const excludedHit = typeParts.some(part => 
      EXCLUDED_TYPE_KEYWORDS.some(kw => part.includes(kw))
    )
    if (excludedHit) {
      // 即便类型被排除，如名称有强景点关键词仍保留
      const hasStrongName = ATTRACTION_NAME_KEYWORDS.some(kw => 
        !WEAK_ATTRACTION_NAME_KEYWORDS.includes(kw) && name.includes(kw)
      )
      if (hasStrongName && !hasExcludedKeyword(name)) return true
      return false
    }
    
    // 2. 命中严格景点类型 → 直接保留（除非名称有排除关键词）
    const strictHit = typeParts.some(part => 
      ATTRACTION_TYPE_STRICT_KEYWORDS.some(kw => part.includes(kw))
    )
    if (strictHit) {
      if (hasExcludedKeyword(name)) return false
      return true
    }
    
    // 3. 命中通用景点类型 → 需结合名称判断
    const genericHit = typeParts.some(part => 
      ATTRACTION_TYPE_GENERIC_KEYWORDS.some(kw => part.includes(kw))
    )
    if (genericHit) {
      // 名称含排除关键词 → 排除
      if (hasExcludedKeyword(name)) return false
      // 名称含强景点关键词 → 保留（排除弱关键词）
      const hasStrongAttractionName = ATTRACTION_NAME_KEYWORDS.some(kw => 
        !WEAK_ATTRACTION_NAME_KEYWORDS.includes(kw) && name.includes(kw)
      )
      if (hasStrongAttractionName) return true
      // 名称只有弱关键词 → 排除
      return false
    }
    
    // 4. 类型不明确：需要有强景点名称关键词才保留
    if (hasExcludedKeyword(name)) return false
    const hasStrongName = ATTRACTION_NAME_KEYWORDS.some(kw => 
      !WEAK_ATTRACTION_NAME_KEYWORDS.includes(kw) && name.includes(kw)
    )
    if (hasStrongName) return true
    // 只有弱关键词或无关键词 → 默认排除
    return false
  } else {
    // 数字类型：原逻辑
    // 1. 精确景点类型 → 保留
    if (ATTRACTION_TYPE_PREFIXES.some(prefix => type.startsWith(prefix))) {
      if (hasExcludedKeyword(name)) return false
      return true
    }
    
    // 2. 精确排除的子类型 → 排除
    if (EXCLUDED_SUB_TYPE_PREFIXES.some(prefix => type.startsWith(prefix))) {
      return false
    }
    
    // 3. 名称含排除关键词 → 排除
    if (hasExcludedKeyword(name)) return false
    
    // 4. 名称含景点关键词 → 保留
    if (hasAttractionKeyword(name)) return true
    
    // 5. 明确排除的大类
    if (type.startsWith('01') || type.startsWith('02') || type.startsWith('03') ||
        type.startsWith('04') || type.startsWith('05') || type.startsWith('06') ||
        type.startsWith('07') || type.startsWith('08') || type.startsWith('09') ||
        type.startsWith('10') || type.startsWith('12') || type.startsWith('15') ||
        type.startsWith('16') || type.startsWith('19')) {
      return false
    }
    
    // 6. 文化娱乐大类(140000)
    if (type.startsWith('14')) {
      return !hasExcludedKeyword(name)
    }
    
    // 7. 科教文化大类(130000)
    if (type.startsWith('13')) {
      return !hasExcludedKeyword(name)
    }
    
    // 8. 其他
    return !hasExcludedKeyword(name)
  }
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
    attractionPois = await searchAttractions(searchCity, trimmedKeyword, ATTRACTION_SEARCH_TYPES, 50, 3)
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
      // 策略1结果也要通过isAttractionType过滤
      resultMap.set(p.name, { ...p, _isAttraction: isAttractionType(p), _fromStrategy1: true })
    }
  }
  for (const p of allPois) {
    if (!resultMap.has(p.name)) {
      resultMap.set(p.name, { ...p, _isAttraction: isAttractionType(p), _fromStrategy1: false })
    }
  }

  // 转换为数组
  const merged = Array.from(resultMap.values())

  // DEBUG: 打印所有POI的type信息
  if (merged.length > 0) {
    const typeStats = {}
    merged.forEach(p => {
      const t = p.type || 'NO_TYPE'
      if (!typeStats[t]) typeStats[t] = []
      if (typeStats[t].length < 3) typeStats[t].push(p.name)
    })
    console.log('[DEBUG] POI类型统计:', Object.keys(typeStats).map(t => `${t}(${t.startsWith('11')||t.startsWith('1401')||t.startsWith('1402')||t.startsWith('1403')||t.startsWith('1404')?'景点':'其他'}): ${typeStats[t].join(', ')}`).join(' | '))
  }

  // 严格过滤：只保留景点类型的POI
  const filtered = merged.filter(p => {
    const result = isAttractionType(p)
    if (!result) {
      console.log('[DEBUG] 过滤掉:', p.name, 'type:', p.type, '原因:', 
        EXCLUDED_KEYWORDS.some(kw => p.name.includes(kw)) ? '关键词' :
        (p.type && EXCLUDED_SUB_TYPE_PREFIXES.some(prefix => p.type.startsWith(prefix))) ? '子类型' : '其他')
    }
    return result
  })

  // 排序: 按热度排序
  filtered.sort((a, b) => {
    const scoreA = getPoiPopularity(a)
    const scoreB = getPoiPopularity(b)
    return scoreB - scoreA
  })

  // 移除临时标记字段
  const finalPois = filtered.map(({ _isAttraction, ...rest }) => rest)

  // 从百度百科补充图片
  const enrichedPois = await enrichAttractionsWithImages(finalPois)

  return enrichedPois
}

// 清除缓存
export function clearAttractionsCache() {
  localStorage.removeItem(ATTRACTION_CACHE_KEY)
}