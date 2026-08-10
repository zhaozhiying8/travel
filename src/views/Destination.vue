<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../store/trip'
import { ElMessage } from 'element-plus'
import AmapKeyTip from '../components/AmapKeyTip.vue'
import PlaceSearch from '../components/PlaceSearch.vue'
import { hasAmapKey } from '../config'
import { popularCities } from '../utils/cities'
import { getAttractionImage } from '../utils/format'
import { getCityFallbackImage } from '../utils/cityImages'
import { fetchCityAttractions, searchAttractionsByKeyword } from '../services/attractionService'

// 移动端检测
const isMobile = ref(window.innerWidth < 768)
function handleResize() {
  isMobile.value = window.innerWidth < 768
}
onMounted(() => {
  window.addEventListener('resize', handleResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

const router = useRouter()
const trip = useTripStore()

const destination = ref(trip.destination)
const loading = ref(false)
const attractions = ref([])
const activeTab = ref('all')
const loadError = ref('')
const retryCount = ref(0)
const cityBannerImg = ref('')

// 加载城市头图（优先使用保底图片，确保显示）
function loadCityBanner() {
  const name = destination.value?.city || destination.value?.name || ''
  // 如果城市名为空（景点搜索模式），使用景点名称作为城市头图的查询
  if (!name) {
    cityBannerImg.value = ''
    return
  }
  // 检查是否是热门城市，只有热门城市才有保底图片
  const isPopularCity = popularCities.some(c => c.name === name)
  if (isPopularCity) {
    cityBannerImg.value = getCityFallbackImage(name)
  } else {
    // 非热门城市（景点搜索模式），不显示城市头图
    cityBannerImg.value = ''
  }
}

// 景点搜索
const searchKeyword = ref('')
const searchResults = ref([])
const isSearching = ref(false)
const searchLoading = ref(false)
const showSearchDropdown = ref(false)

// 景点分类选项
const categoryTabs = [
  { value: 'all', label: '全部', icon: '🎯' },
  { value: 'nature', label: '自然风光', icon: '🏔️' },
  { value: 'culture', label: '历史文化', icon: '🏛️' },
  { value: 'modern', label: '现代地标', icon: '🏙️' },
  { value: 'food', label: '美食休闲', icon: '🍜' }
]

// 获取地址摘要（约10个字，用于卡片显示）
function getAddrDesc(attr) {
  const rawAddr = attr.address || attr.adname || ''
  const addr = typeof rawAddr === 'string' ? rawAddr : String(rawAddr || '')
  if (!addr) return ''
  // 去除省份/城市前缀（卡片空间有限）
  let short = addr.replace(/^[^市省县区]+[市省县区]/, '').trim()
  // 如果前缀去掉后太短或为空，用原地址
  if (short.length < 3) short = addr
  // 截取约10个字
  if (short.length > 10) short = short.substring(0, 10) + '…'
  return short
}

// 将高德类型编码转为简短描述（20字以内）
function getAttrDesc(attr) {
  const type = attr.type || ''
  const name = attr.name || ''
  
  // 如果没有类型信息，返回空
  if (!type) return ''
  
  // 定义类型映射关系
  const typeMap = {
    '风景名胜': '景区',
    '红色景区': '红色景点',
    '世界遗产': '世界遗产',
    '国家级景点': '国家级景区',
    '风景名胜区': '景区',
    '公园广场': '公园广场',
    '城市广场': '城市广场',
    '博物馆': '博物馆',
    '美术馆': '美术馆',
    '科技馆': '科技馆',
    '图书馆': '图书馆',
    '纪念馆': '纪念馆',
    '遗址': '遗址',
    '故居': '故居',
    '寺庙道观': '寺庙',
    '教堂': '教堂',
    '清真寺': '清真寺',
    '古城': '古城',
    '古镇': '古镇',
    '民俗村': '民俗村',
    '园林': '园林',
    '书院': '书院',
    '塔': '古塔',
    '楼': '名楼',
    '阁': '阁',
    '石窟': '石窟',
    '陵园': '陵园',
    '陵墓': '陵墓',
    '祠堂': '祠堂',
    '海滨': '海滨',
    '温泉': '温泉',
    '湖泊': '湖泊',
    '山岳': '山岳',
    '瀑布': '瀑布',
    '草原': '草原',
    '森林': '森林',
    '湿地': '湿地',
    '峡谷': '峡谷',
    '岛屿': '岛屿',
    '沙滩': '沙滩',
    '游乐园': '游乐园',
    '主题乐园': '主题乐园',
    '动物园': '动物园',
    '植物园': '植物园',
    '水族馆': '水族馆',
    '剧场': '剧场',
    '剧院': '剧院',
    '体育场': '体育场',
    '体育馆': '体育馆',
    '大学城': '大学城',
    '大学': '大学',
    '特色商业街': '商业街',
    '步行街': '步行街',
    '小吃街': '美食街',
    '美食街': '美食街',
    '夜市': '夜市',
    '酒吧街': '酒吧街',
    '茶馆': '茶馆',
    '咖啡馆': '咖啡馆',
    '餐厅': '餐厅',
    '美食': '美食',
    '现代建筑': '现代建筑',
    '电视塔': '电视塔',
    '大桥': '大桥',
    '中心': '中心',
    '公园': '公园',
    '广场': '广场'
  }
  
  // 从类型字符串中提取关键描述
  const parts = type.split('|').flatMap(p => p.split(';'))
  const uniqueParts = [...new Set(parts.filter(p => p && p !== '风景名胜' && p !== '科教文化服务' && p !== '体育休闲服务' && p !== '购物服务' && p !== '餐饮服务' && p !== '交通设施服务' && p !== '住宿服务'))]
  
  // 转换为简短描述
  const descParts = []
  for (const part of uniqueParts) {
    if (typeMap[part]) {
      descParts.push(typeMap[part])
    } else if (part.length <= 4) {
      descParts.push(part)
    }
    if (descParts.length >= 2) break
  }
  
  // 如果没有匹配到，尝试从原始类型中提取
  if (descParts.length === 0) {
    // 简单处理：取第一段最后一个非空值
    const firstPart = parts.find(p => p && p.length <= 6)
    if (firstPart) return firstPart
    return ''
  }
  
  // 拼接描述，控制在20字以内
  let desc = descParts.join('·')
  if (desc.length > 20) {
    desc = desc.substring(0, 18) + '...'
  }
  return desc
}

// 根据景点类型分类
function categorizeAttraction(attr) {
  const type = (attr.type || '') + ' ' + (attr.deep_info?.introduction || '')
  const name = attr.name || ''
  const natureWords = ['山', '湖', '海', '公园', '森林', '湿地', '峡谷', '瀑布', '自然', '雪山', '草原', '岛', '沙滩', '温泉', '石林', '溶洞', '溪', '潭', '泉', '自然风光', '风景名胜']
  const cultureWords = ['博物馆', '故宫', '长城', '寺', '庙', '遗址', '古城', '故居', '陵', '祠堂', '石窟', '塔', '楼', '阁', '书院', '文庙', '会馆', '旧址', '纪念馆', '历史文化', '人文景观']
  const modernWords = ['广场', '体育场', '剧院', '乐园', '科技馆', '美术馆', '图书馆', '大学', '天文台', '电视塔', '大桥', '现代建筑', '中心']
  const foodWords = ['美食', '小吃', '火锅', '餐厅', '美食街', '步行街', '商业街', '老街', '夜市', '酒吧', '咖啡', '茶馆']

  if (foodWords.some(w => type.includes(w) || name.includes(w))) return 'food'
  if (cultureWords.some(w => type.includes(w) || name.includes(w))) return 'culture'
  if (modernWords.some(w => type.includes(w) || name.includes(w))) return 'modern'
  if (natureWords.some(w => type.includes(w) || name.includes(w))) return 'nature'
  return 'all'
}

// 筛选后的景点列表
const filteredAttractions = computed(() => {
  if (activeTab.value === 'all') return attractions.value
  return attractions.value.filter(a => categorizeAttraction(a) === activeTab.value)
})

// 当前目的地城市名
const cityName = computed(() => destination.value?.city || destination.value?.name || '')

// 检查当前目的地是否为热门城市（用于区分城市模式和景点搜索模式）
const isPopularCityMode = computed(() => {
  const name = destination.value?.city || destination.value?.name || ''
  return popularCities.some(c => c.name === name)
})

// 从用户输入中提取真实城市名（处理「邯郸站/邯郸机场/邯郸东火车站」等交通枢纽输入）
function extractCityName(input) {
  if (!input) return ''
  // 去掉交通枢纽后缀，只保留前面的城市/区域部分
  return input
    .replace(/(火车|高铁|动车|汽车|客运|长途)?站(北|南|东|西)?$/i, '')
    .replace(/(火车|高铁|动车)?站$/i, '')
    .replace(/(国际|国内)?机场(|T1|T2|T3|1号|2号|3号)?航站楼$/i, '')
    .replace(/(北|南|东|西)?(机场|火车站|高铁站|汽车站|客运站)$/i, '')
    .replace(/(北|南|东|西)站?$/i, match => match.length <= 2 ? '' : match.slice(0, -1))
    .trim()
}

// 判断关键词是否像城市名（含"市""省""县""区"等后缀，或看起来像行政区划）
function looksLikeCityName(name) {
  if (!name) return false
  // 1. 包含行政区划后缀
  if (/(市|省|县|区|自治州|自治县|特别行政区|盟|旗)$/.test(name)) return true
  // 2. 交通枢纽后缀：邯郸站 / 邯郸机场 / 邯郸东站 / 邯郸东火车站 → 视为城市意图
  if (/(站|机场|火车站|高铁站|汽车站|客运站|航站楼)$/.test(name)) {
    const city = extractCityName(name)
    // 提取出的部分像城市名就认可
    if (city && (city.length >= 2 && city.length <= 4)) return true
  }
  // 3. 名称长度在2-4字之间（大多数城市名长度），且不含明显的景点关键词
  if (name.length >= 2 && name.length <= 4) {
    const attractionKeywords = ['景区', '景点', '公园', '花园', '园林', '名胜', '博物馆', '展览馆', '美术馆', '科技馆', '纪念馆', '图书馆', '动物园', '植物园', '水族馆', '海洋馆', '温泉', '度假区', '度假村', '寺庙', '教堂', '清真寺', '道观', '佛寺', '陵园', '遗址', '乐园', '古镇', '古城', '瀑布', '峡谷', '山峰', '海岛', '海滨']
    if (!attractionKeywords.some(k => name.includes(k))) {
      return true
    }
  }
  return false
}

// 获取应该用于「城市模式」搜索的城市名（优先从交通枢纽词提取，否则用原始关键词）
function getCityForSearch(rawKeyword) {
  if (!rawKeyword) return ''
  if (/(站|机场|火车站|高铁站|汽车站|客运站|航站楼)$/.test(rawKeyword)) {
    const extracted = extractCityName(rawKeyword)
    if (extracted && extracted.length >= 2) return extracted
  }
  return rawKeyword
}

// 加载热门景点(从高德API获取真实数据)
async function loadAttractions() {
  if (!destination.value) return
  if (!hasAmapKey) {
    loadError.value = '请先配置高德地图Key以获取真实景点数据'
    return
  }
  
  const keyword = destination.value?.name || ''
  // 检查：如果是热门城市模式，或关键词看起来像城市名，则按"城市内搜索景点"处理
  const shouldSearchAsCity = isPopularCityMode.value || looksLikeCityName(keyword)
  // 提取真实城市名（邯郸站→邯郸、邯郸东火车站→邯郸东）
  const cityKeyword = getCityForSearch(keyword)
  
  if (shouldSearchAsCity) {
    // 城市模式：在该城市范围内搜索所有景点（一次性加载）
    loading.value = true
    loadError.value = ''
    attractions.value = []
    try {
      const result = await fetchCityAttractions(cityKeyword)
      attractions.value = result.map(a => ({ ...a, city: a.city || a.adname || cityKeyword }))
      // 如果结果太少，补充全国搜索
      if (attractions.value.length < 5) {
        const extraPois = await searchAttractionsByKeyword('全国', keyword)
        const existingNames = new Set(attractions.value.map(p => p.name))
        for (const p of extraPois) {
          if (!existingNames.has(p.name)) {
            attractions.value.push({ ...p, city: p.city || p.adname || cityKeyword })
            existingNames.add(p.name)
          }
        }
      }
      if (attractions.value.length === 0) {
        loadError.value = `高德地图未返回「${cityKeyword}」的景点数据，请确认城市名是否正确`
      }
    } catch (e) {
      loadError.value = e.message || '加载景点数据失败'
      attractions.value = []
    } finally {
      loading.value = false
    }
    return
  }
  
  // 真正的景点搜索模式（关键词像具体景点名）：直接搜索输入的关键词
  loading.value = true
  loadError.value = ''
  try {
    // 先尝试用"全国"范围搜索
    let pois = await searchAttractionsByKeyword('全国', keyword)
    // 如果结果太少，尝试用关键词本身作为城市名搜索（可能是小地名/区县）
    if (pois.length < 3) {
      const altPois = await searchAttractionsByKeyword(keyword, keyword)
      // 合并去重
      const existingNames = new Set(pois.map(p => p.name))
      for (const p of altPois) {
        if (!existingNames.has(p.name)) {
          pois.push(p)
          existingNames.add(p.name)
        }
      }
    }
    attractions.value = pois
    // 自动显示搜索结果
    searchKeyword.value = keyword
    searchResults.value = pois
    isSearching.value = pois.length > 0
    showSearchDropdown.value = pois.length > 0
    if (pois.length === 0) {
      loadError.value = `未找到「${keyword}」的相关景点，请尝试其他关键词`
    }
  } catch (e) {
    loadError.value = e.message || '搜索景点失败'
    attractions.value = []
  } finally {
    loading.value = false
  }
}

// 重试加载
function retryLoad() {
  retryCount.value++
  // 清除缓存，强制刷新
  localStorage.removeItem('travel_attractions_cache')
  loadAttractions()
}

// 搜索请求ID（防止过期请求覆盖新状态）
let searchRequestId = 0

// 清空搜索
function clearSearch() {
  searchKeyword.value = ''
  searchResults.value = []
  isSearching.value = false
  showSearchDropdown.value = false
  searchRequestId++  // 取消进行中的搜索请求
}

// 合并搜索：处理 PlaceSearch 的景点搜索事件
async function onSearchAttraction({ keyword, mode }) {
  const myRequestId = ++searchRequestId
  if (!keyword) {
    searchKeyword.value = ''
    searchResults.value = []
    isSearching.value = false
    showSearchDropdown.value = false
    return
  }
  
  // 如果关键词看起来像城市名，就把它设置为目的地（切换到城市模式搜索该城市内的景点）
  if (looksLikeCityName(keyword)) {
    // 先判断是否是热门城市
    const found = popularCities.find(c => c.name === keyword || c.name.includes(keyword))
    if (found) {
      destination.value = { name: found.name, lng: found.lng, lat: found.lat, city: found.name, address: found.desc }
    } else {
      // 非热门城市，直接设置为 destination（loadAttractions 会按城市模式处理）
      destination.value = { name: keyword, lng: '', lat: '', city: keyword, address: keyword }
    }
    // 清除搜索状态，让城市模式展示结果
    clearSearch()
    return
  }
  
  searchKeyword.value = keyword
  searchLoading.value = true
  try {
    if (hasAmapKey) {
      // 热门城市内搜索用城市名，否则全国搜索
      const searchScope = isPopularCityMode.value ? cityName.value : (cityName.value || '全国')
      const pois = await searchAttractionsByKeyword(searchScope, keyword)
      // 防止过期请求覆盖新状态
      if (myRequestId !== searchRequestId) return
      // 确保每个搜索结果景点都有city字段：优先使用poi的adname，其次用搜索范围城市，最后用当前城市
      searchResults.value = pois.map(p => ({
        ...p,
        city: p.city || p.adname || (isPopularCityMode.value ? cityName.value : '')
      }))
      isSearching.value = pois.length > 0
      showSearchDropdown.value = pois.length > 0
    } else {
      if (myRequestId !== searchRequestId) return
      searchResults.value = []
      isSearching.value = false
      showSearchDropdown.value = false
    }
  } catch {
    if (myRequestId !== searchRequestId) return
    searchResults.value = []
    isSearching.value = false
    showSearchDropdown.value = false
  } finally {
    if (myRequestId === searchRequestId) {
      searchLoading.value = false
    }
  }
}

// 展示的景点列表
const displayAttractions = computed(() => {
  if (isSearching.value) return searchResults.value
  return filteredAttractions.value
})

// 是否显示城市头图（搜索时隐藏）
const showCityBanner = computed(() => {
  return !isSearching.value && isPopularCityMode.value && cityBannerImg.value
})

watch(destination, () => {
  if (destination.value) {
    trip.setTrip({ destination: destination.value })
    // 切换城市时清除之前的景点搜索
    clearSearch()
    loadAttractions()
    loadCityBanner()
  }
}, { deep: true })

onMounted(() => {
  if (destination.value) {
    loadAttractions()
    loadCityBanner()
  }
})

// 获取景点图片URL
function getImageUrl(attr) {
  return getAttractionImage(attr)
}

// 图片加载错误处理
const imgErrors = ref({})
const imgRetryCount = ref({})
function handleImageError(name) {
  imgErrors.value[name] = true
  // 重试次数+1
  imgRetryCount.value[name] = (imgRetryCount.value[name] || 0) + 1
}

// 重新加载图片
function retryImage(attr) {
  const name = attr.name
  imgErrors.value[name] = false
  // 强制刷新图片URL（添加时间戳参数）
  const url = getImageUrl(attr)
  if (url) {
    return url + (url.includes('?') ? '&' : '?') + 't=' + Date.now()
  }
  return url
}

// 获取景点图片URL（带重试机制）
function getImageUrlWithRetry(attr) {
  const url = getImageUrl(attr)
  if (url && imgErrors.value[attr.name] && imgRetryCount.value[attr.name] <= 2) {
    // 重试：添加时间戳参数
    return url + (url.includes('?') ? '&' : '?') + 'retry=' + imgRetryCount.value[attr.name]
  }
  return url
}

// 查看景点详情
function goToDetail(attr) {
  trip.selectAttraction({ ...attr, city: cityName.value })
  router.push({ path: '/attraction', query: { name: attr.name } })
}

// 选中景点 -> 进入地图导航
function goToMap(attr) {
  trip.selectAttraction({ ...attr, city: cityName.value })
  router.push('/map')
}

// 选中景点 -> 查看附近酒店美食
function goToNearby(attr) {
  trip.selectAttraction({ ...attr, city: cityName.value })
  router.push('/nearby')
}

// 加入行程 - 弹出日期选择对话框
const showAddDateDialog = ref(false)
const pendingAttraction = ref(null)
const addDateForm = ref({
  startDate: '',
  endDate: ''
})

function addToItinerary(attr) {
  pendingAttraction.value = attr
  addDateForm.value = {
    startDate: trip.startDate || '',
    endDate: trip.endDate || trip.startDate || ''
  }
  showAddDateDialog.value = true
}

function confirmAddToItinerary() {
  if (!addDateForm.value.startDate) {
    ElMessage.warning('请选择开始日期')
    return
  }
  if (!addDateForm.value.endDate) {
    ElMessage.warning('请选择结束日期')
    return
  }
  if (new Date(addDateForm.value.endDate) < new Date(addDateForm.value.startDate)) {
    ElMessage.warning('结束日期不能早于开始日期')
    return
  }
  if (!pendingAttraction.value) return
  const attr = pendingAttraction.value

  // 如果当前行程没有设置出发地，自动设置为当前定位的城市
  if (!trip.origin) {
    if (trip.currentLocation && trip.currentLocation.city) {
      // 使用当前定位的城市作为出发地
      trip.setTrip({
        origin: {
          name: trip.currentLocation.city,
          lng: trip.currentLocation.lng,
          lat: trip.currentLocation.lat,
          city: trip.currentLocation.city
        }
      })
    } else if (cityName.value) {
      // 备选：使用当前浏览的城市
      trip.setTrip({
        origin: {
          name: cityName.value,
          lng: destination.value?.lng,
          lat: destination.value?.lat,
          city: cityName.value
        }
      })
    }
  }

  trip.addPlan({
    title: attr.name,
    type: 'attraction',
    destination: cityName.value,
    attraction: { ...attr, city: cityName.value },
    startDate: addDateForm.value.startDate,
    endDate: addDateForm.value.endDate,
    date: addDateForm.value.startDate,
    note: attr.deep_info?.introduction || attr.address || ''
  })
  ElMessage.success(`已将「${attr.name}」加入行程 (${addDateForm.value.startDate} ~ ${addDateForm.value.endDate})`)
  showAddDateDialog.value = false
  pendingAttraction.value = null
}

// 收藏
function toggleFav(attr) {
  trip.toggleFavorite({ ...attr, city: cityName.value })
  ElMessage.success(trip.isFavorite(attr.name) ? `已收藏「${attr.name}」` : `已取消收藏`)
}

function setDestination(city) {
  const item = popularCities.find(c => c.name === city)
  if (item) {
    destination.value = { name: item.name, lng: item.lng, lat: item.lat, city: item.name, address: item.desc }
  }
}
</script>

<template>
  <div class="page">
    <AmapKeyTip />

    <!-- 目的地选择条 -->
    <div class="dest-bar card">
      <div class="dest-search">
        <PlaceSearch 
          v-model="destination" 
          label="目的地" 
          placeholder="输入城市名，搜索景点直接输入景点名称"
          @search-attraction="onSearchAttraction"
        />
      </div>
      <div v-if="!destination" class="dest-quick">
        <span>热门目的地:</span>
        <a v-for="c in ['北京','上海','杭州','成都','西安','厦门','丽江','三亚']" :key="c" @click="setDestination(c)">{{ c }}</a>
      </div>
    </div>

    <!-- 搜索模式 -->
    <template v-if="isSearching">
      <div class="search-indicator-banner">
        <div class="sib-content">
          <span class="sib-icon">🔍</span>
          <div class="sib-text">
            <h1>搜索景点：{{ searchKeyword }}</h1>
            <p v-if="searchLoading">正在搜索中...</p>
            <p v-else-if="searchResults.length">找到 {{ searchResults.length }} 个匹配「{{ searchKeyword }}」的景点</p>
            <p v-else>未找到匹配「{{ searchKeyword }}」的景点</p>
          </div>
          <button class="sib-clear" @click="clearSearch">✕ 清除搜索</button>
        </div>
      </div>

      <div class="section-head">
        <h2>🔍 搜索结果</h2>
        <span class="count">共 {{ displayAttractions.length }} 个景点</span>
      </div>

      <div v-if="searchLoading" class="loading-box">
        <span class="spinner"></span>
        正在搜索相关景点...
      </div>

      <div v-else-if="!hasAmapKey" class="empty-tip">
        <div class="icon">🗺️</div>
        <p>请先配置高德地图Key以获取真实景点数据</p>
      </div>

      <div v-else-if="displayAttractions.length" class="attr-grid">
        <div v-for="(attr, i) in displayAttractions" :key="i" class="attr-card" @click="goToDetail(attr)">
          <div class="attr-img-wrap">
            <img 
              v-if="getImageUrlWithRetry(attr) && !imgErrors[attr.name]" 
              :src="getImageUrlWithRetry(attr)" 
              :alt="attr.name" 
              loading="lazy" 
              @error="handleImageError(attr.name)"
            />
            <div v-else class="img-placeholder">
              <span class="ph-icon">🏛️</span>
              <span class="ph-text">{{ attr.name }}</span>
            </div>
            <button
              v-if="imgErrors[attr.name] && imgRetryCount[attr.name] <= 2 && getImageUrl(attr)"
              class="retry-img-btn"
              @click.stop="() => { imgErrors[attr.name] = false }"
            >🔄</button>
            <button
              class="fav-btn"
              :class="{ active: trip.isFavorite(attr.name) }"
              @click.stop="toggleFav(attr)"
            >{{ trip.isFavorite(attr.name) ? '❤️' : '🤍' }}</button>
            <div class="rating-tag" :class="{ 'no-rating': !(attr.biz_ext?.rating > 0) && !(attr.deep_info?.rating > 0) }">
              {{ (attr.biz_ext?.rating > 0 || attr.deep_info?.rating > 0) ? '⭐ ' + (attr.biz_ext?.rating || attr.deep_info?.rating) : '暂无评分' }}
            </div>
          </div>
          <div class="attr-body">
            <h3 class="attr-name">{{ attr.name }}</h3>
            <div class="attr-meta">
              <span v-if="getAttrDesc(attr)" class="attr-type-tag">{{ getAttrDesc(attr) }}</span>
              <span v-if="getAddrDesc(attr)" class="attr-addr">📍 {{ getAddrDesc(attr) }}</span>
            </div>
            <div class="attr-actions" @click.stop>
              <button class="act-btn primary" @click="goToMap(attr)">🗺️ 导航</button>
              <button class="act-btn" @click="goToNearby(attr)">🏨 附近</button>
              <button class="act-btn add" @click="addToItinerary(attr)">＋ 行程</button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-tip">
        <div class="icon">🔍</div>
        <p>未找到匹配「{{ searchKeyword }}」的景点</p>
        <p class="sub">试试其他关键词，如「故宫」「西湖」</p>
      </div>
    </template>

    <!-- 无目的地且无搜索 -->
    <div v-else-if="!destination" class="empty-tip">
      <div class="icon">📍</div>
      <p>请先选择一个目的地，查看热门景点</p>
    </div>

    <!-- 有目的地（非搜索模式） -->
    <template v-else>
      <!-- 目的地 banner -->
      <div v-if="showCityBanner" class="dest-banner">
        <img :src="cityBannerImg" :alt="cityName" class="banner-img" @error="cityBannerImg = ''" />
        <div class="banner-mask">
          <h1 class="banner-title">{{ cityName }}</h1>
          <p class="banner-desc">{{ destination.address || '探索这座城市的精彩景点' }}</p>
        </div>
      </div>

      <!-- 热门景点分类筛选 -->
      <div class="category-tabs">
        <button
          v-for="tab in categoryTabs"
          :key="tab.value"
          class="cat-tab"
          :class="{ active: activeTab === tab.value }"
          @click="activeTab = tab.value"
        >
          <span class="cat-icon">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
          <span v-if="tab.value === 'all'" class="cat-count">({{ attractions.length }})</span>
          <span v-else class="cat-count">({{ attractions.filter(a => categorizeAttraction(a) === tab.value).length }})</span>
        </button>
      </div>

      <!-- 景点标题 -->
      <div class="section-head">
        <h2>
          <template v-if="!isPopularCityMode">🎯 「{{ destination.name }}」相关景点</template>
          <template v-else>🎯 {{ cityName }} 热门景点</template>
        </h2>
        <div class="section-head-right">
          <span class="count">共 {{ displayAttractions.length }} 个景点</span>
          <button 
            class="refresh-btn" 
            @click="retryLoad" 
            :disabled="loading"
            title="强制刷新景点数据"
          >
            🔄{{ loading ? ' 刷新中...' : ' 刷新' }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="loading-box">
        <span class="spinner"></span>
        正在搜索相关景点...
      </div>

      <!-- 无Key提示 -->
      <div v-else-if="!hasAmapKey" class="empty-tip">
        <div class="icon">🗺️</div>
        <p>请先配置高德地图Key以获取真实景点数据</p>
        <p class="sub">参考顶部提示申请Key并填入 .env 文件</p>
      </div>

      <!-- 加载错误 -->
      <div v-else-if="loadError && !attractions.length" class="empty-tip">
        <div class="icon">⚠️</div>
        <p>{{ loadError }}</p>
        <p class="sub">可尝试<a @click="retryLoad" class="retry-link">重新加载</a>或换个城市</p>
      </div>

      <!-- 景点网格 -->
      <div v-else-if="displayAttractions.length" class="attr-grid">
        <div v-for="(attr, i) in displayAttractions" :key="i" class="attr-card" @click="goToDetail(attr)">
          <div class="attr-img-wrap">
            <img 
              v-if="getImageUrlWithRetry(attr) && !imgErrors[attr.name]" 
              :src="getImageUrlWithRetry(attr)" 
              :alt="attr.name" 
              loading="lazy" 
              @error="handleImageError(attr.name)"
            />
            <div v-if="!getImageUrl(attr) || (imgErrors[attr.name] && imgRetryCount[attr.name] > 2)" class="img-placeholder">
              <span class="ph-icon">🏛️</span>
              <span class="ph-text">{{ attr.name }}</span>
            </div>
            <button
              v-if="imgErrors[attr.name] && imgRetryCount[attr.name] <= 2 && getImageUrl(attr)"
              class="retry-img-btn"
              @click.stop="() => { imgErrors[attr.name] = false }"
            >🔄</button>
            <button
              class="fav-btn"
              :class="{ active: trip.isFavorite(attr.name) }"
              @click.stop="toggleFav(attr)"
            >{{ trip.isFavorite(attr.name) ? '❤️' : '🤍' }}</button>
            <div class="rating-tag" :class="{ 'no-rating': !(attr.biz_ext?.rating > 0) && !(attr.deep_info?.rating > 0) }">
              {{ (attr.biz_ext?.rating > 0 || attr.deep_info?.rating > 0) ? '⭐ ' + (attr.biz_ext?.rating || attr.deep_info?.rating) : '暂无评分' }}
            </div>
          </div>
          <div class="attr-body">
            <h3 class="attr-name">{{ attr.name }}</h3>
            <div class="attr-meta">
              <span v-if="getAttrDesc(attr)" class="attr-type-tag">{{ getAttrDesc(attr) }}</span>
              <span v-if="getAddrDesc(attr)" class="attr-addr">📍 {{ getAddrDesc(attr) }}</span>
            </div>
            <div class="attr-actions" @click.stop>
              <button class="act-btn primary" @click="goToMap(attr)">🗺️ 导航</button>
              <button class="act-btn" @click="goToNearby(attr)">🏨 附近</button>
              <button class="act-btn add" @click="addToItinerary(attr)">＋ 行程</button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-tip">
        <div class="icon">🔍</div>
        <p>暂未找到该城市的景点，换个目的地试试</p>
      </div>
    </template>

    <!-- 添加到行程 - 日期选择对话框 -->
    <el-dialog
      v-model="showAddDateDialog"
      :title="pendingAttraction ? `添加「${pendingAttraction.name}」到行程` : '添加到行程'"
      width="380px"
      :close-on-click-modal="false"
      class="mobile-dialog"
      :top="'5vh'"
    >
      <div class="add-date-dialog">
        <div class="dialog-tip">请选择该景点在行程中的日期</div>
        <el-form :label-width="isMobile ? '70px' : '90px'" label-position="left">
          <el-form-item label="开始日期" required>
            <el-date-picker v-model="addDateForm.startDate" type="date" placeholder="选择开始日期" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
          <el-form-item label="结束日期" required>
            <el-date-picker v-model="addDateForm.endDate" type="date" placeholder="选择结束日期" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
          <div class="dialog-preview" v-if="addDateForm.startDate">
            <span v-if="addDateForm.endDate && addDateForm.startDate !== addDateForm.endDate">
              📅 {{ addDateForm.startDate }} ~ {{ addDateForm.endDate }}（共 {{ Math.max(1, Math.round((new Date(addDateForm.endDate) - new Date(addDateForm.startDate)) / 86400000) + 1) }} 天）
            </span>
            <span v-else>📅 {{ addDateForm.startDate }}（单日行程）</span>
          </div>
        </el-form>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <button class="btn-ghost" @click="showAddDateDialog = false; pendingAttraction = null">取消</button>
          <button class="btn-primary" @click="confirmAddToItinerary">确认添加</button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dest-bar {
  padding: 16px;
  margin-bottom: 16px;
  display: flex;
  gap: 16px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.dest-search { flex: 1; min-width: 240px; }
.dest-quick {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--text-light);
  flex-wrap: wrap;
}
.dest-quick a {
  color: var(--primary);
  cursor: pointer;
  padding: 3px 8px;
  background: #fff3ee;
  border-radius: 4px;
}
.dest-quick a:hover { background: var(--primary); color: #fff; }

/* 搜索指示横幅 */
.search-indicator-banner {
  padding: 24px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  color: #fff;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
}
.sib-content {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.sib-icon { font-size: 36px; }
.sib-text { flex: 1; min-width: 200px; }
.sib-text h1 {
  font-size: 24px;
  font-weight: 800;
  margin: 0 0 6px 0;
}
.sib-text p {
  font-size: 14px;
  opacity: 0.9;
  margin: 0;
}
.sib-clear {
  padding: 8px 16px;
  border: 2px solid rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.15);
  color: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
  flex-shrink: 0;
}
.sib-clear:hover {
  background: rgba(255,255,255,0.3);
  border-color: #fff;
}

.dest-banner {
  position: relative;
  height: 220px;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 24px;
}
.banner-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.banner-gradient {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #ff6b35 100%);
}
.banner-mask {
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 30%, rgba(0,0,0,0.7));
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 24px;
  color: #fff;
}
.banner-title { font-size: 36px; font-weight: 800; text-shadow: 0 2px 8px rgba(0,0,0,0.5); }
.banner-desc { font-size: 14px; opacity: 0.9; margin-top: 4px; }

.category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.cat-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
  transition: all 0.15s;
  flex-shrink: 0;
}
.cat-tab:hover { border-color: var(--primary); color: var(--primary); }
.cat-tab.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.cat-icon { font-size: 16px; }
.cat-count { font-size: 12px; opacity: 0.8; }

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.section-head h2 { font-size: 22px; font-weight: 800; }
.section-head-right {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.count { font-size: 13px; color: var(--text-light); }
.refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 12px;
  border: 1px solid #e3e6ef;
  background: #fff;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text);
  transition: all 0.2s;
  aspect-ratio: auto;
  min-width: auto;
  min-height: auto;
}
.refresh-btn:hover:not(:disabled) {
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary);
}
.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-box {
  text-align: center;
  padding: 60px;
  color: var(--text-light);
}
.loading-more {
  text-align: center;
  padding: 16px;
  color: var(--text-light);
  font-size: 14px;
}
.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid #ddd;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
}
.spinner.small {
  width: 14px;
  height: 14px;
  border-width: 1.5px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.attr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
}
.attr-card {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow);
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  cursor: pointer;
}
.attr-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.attr-img-wrap {
  position: relative;
  height: 180px;
  overflow: hidden;
  background: #f0f0f0;
}
.attr-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s;
}
.attr-card:hover .attr-img-wrap img { transform: scale(1.06); }
.img-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea22, #ff6b3522);
  gap: 8px;
}
.img-placeholder .ph-icon { font-size: 48px; opacity: 0.6; }
.img-placeholder .ph-text { font-size: 14px; color: var(--text-light); max-width: 80%; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 图片重试按钮 */
.retry-img-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  min-width: 40px;
  height: 40px;
  min-height: 40px;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  cursor: pointer;
  font-size: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
  line-height: 1;
}
.retry-img-btn:hover {
  transform: translate(-50%, -50%) scale(1.1);
  background: #fff;
}
.fav-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background: rgba(255,255,255,0.9);
  border: none;
  cursor: pointer;
  font-size: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
  backdrop-filter: blur(4px);
}
.fav-btn.active { background: #fff; }
.rating-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0,0,0,0.6);
  color: #ffd700;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.rating-tag.no-rating {
  color: #ccc;
  font-weight: 400;
}
.attr-body { padding: 14px; flex: 1; display: flex; flex-direction: column; }
.attr-name { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
.attr-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-light);
  line-height: 1.5;
}
.attr-type-tag {
  background: #fff3ee;
  color: var(--primary);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  flex-shrink: 0;
}
.attr-addr {
  color: #666;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.attr-actions { display: flex; gap: 8px; }
.act-btn {
  flex: 1;
  padding: 8px 0;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
  transition: all 0.15s;
}
.act-btn:hover { border-color: var(--primary); color: var(--primary); }
.act-btn.primary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.act-btn.primary:hover { background: var(--primary-dark); }
.act-btn.add {
  background: #fff3ee;
  color: var(--primary);
  border-color: #ffd5c2;
}

.empty-tip { text-align: center; padding: 60px 20px; color: var(--text-light); }
.empty-tip .icon { font-size: 56px; margin-bottom: 12px; }
.empty-tip .sub { font-size: 13px; margin-top: 8px; }
.retry-link { color: var(--primary); cursor: pointer; text-decoration: underline; }

@media (max-width: 640px) {
  .dest-bar { padding: 12px; gap: 12px; }
  .dest-search { min-width: 100%; }
  .dest-banner { height: 160px; margin-bottom: 16px; border-radius: 12px; }
  .banner-mask { padding: 16px; }
  .banner-title { font-size: 24px; }
  .banner-desc { font-size: 13px; }
  .search-indicator-banner { padding: 16px; border-radius: 12px; margin-bottom: 12px; }
  .sib-content { flex-direction: column; align-items: flex-start; gap: 10px; }
  .sib-icon { font-size: 28px; }
  .sib-text h1 { font-size: 18px; }
  .sib-text p { font-size: 13px; }
  .sib-clear { align-self: stretch; text-align: center; }
  .category-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding-bottom: 4px;
    margin-bottom: 12px;
  }
  .category-tabs::-webkit-scrollbar { display: none; }
  .cat-tab { padding: 8px 14px; font-size: 13px; white-space: nowrap; }
  .section-head h2 { font-size: 18px; }
  .attr-grid { grid-template-columns: 1fr; gap: 14px; }
  .attr-img-wrap { height: 160px; }
  .attr-name { font-size: 16px; }
  .attr-actions { flex-wrap: wrap; }
  .act-btn { flex: 1 1 calc(50% - 4px); padding: 10px 0; font-size: 14px; min-height: 44px; }
}
@media (max-width: 768px) {
  .dest-banner { height: 180px; }
  .banner-title { font-size: 30px; }
  .attr-grid { grid-template-columns: 1fr; }
}

/* 添加到行程对话框 */
.add-date-dialog { padding: 8px 0; }
.dialog-tip {
  color: var(--text-light, #909399);
  font-size: 13px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: var(--bg-soft, #f5f7fa);
  border-radius: 8px;
}
.dialog-preview {
  margin-top: 8px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #ff6b3520, #ff8f5e20);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--primary, #ff6b35);
  text-align: center;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

/* 弹窗移动端适配 */
:deep(.mobile-dialog) {
  .el-dialog {
    width: 92% !important;
    max-width: 380px;
    margin: 5vh auto !important;
  }
  .el-dialog__header {
    padding: 14px 16px;
    .el-dialog__title {
      font-size: 16px;
    }
  }
  .el-dialog__body {
    padding: 12px 16px;
  }
  .el-dialog__footer {
    padding: 10px 16px 16px;
  }
}

@media (max-width: 640px) {
  :deep(.mobile-dialog) {
    .el-dialog {
      width: 92% !important;
      margin: 3vh auto !important;
    }
    .el-dialog__header {
      padding: 12px 14px;
      .el-dialog__title {
        font-size: 15px;
      }
    }
    .el-dialog__body {
      padding: 10px 14px;
    }
    .el-dialog__footer {
      padding: 8px 14px 14px;
    }
    .el-dialog__footer .dialog-footer {
      justify-content: center;
      button {
        flex: 1;
        padding: 10px 16px;
        font-size: 14px;
      }
    }
  }
  .add-date-dialog {
    padding: 0;
  }
  .dialog-tip {
    font-size: 12px;
    padding: 6px 10px;
    margin-bottom: 12px;
  }
  .dialog-preview {
    font-size: 13px;
    padding: 8px 10px;
  }
}
</style>