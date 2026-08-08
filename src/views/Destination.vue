<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../store/trip'
import AmapKeyTip from '../components/AmapKeyTip.vue'
import PlaceSearch from '../components/PlaceSearch.vue'
import { hasAmapKey } from '../config'
import { popularCities } from '../utils/cities'
import { getAttractionImage } from '../utils/format'
import { getCityFallbackImage } from '../utils/cityImages'
import { fetchCityAttractions, searchAttractionsByKeyword } from '../services/attractionService'
import { ElMessage } from 'element-plus'

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

// 加载热门景点(从高德API获取真实数据)
async function loadAttractions() {
  if (!destination.value) return
  if (!hasAmapKey) {
    loadError.value = '请先配置高德地图Key以获取真实景点数据'
    return
  }
  
  // 检查是否为景点搜索模式（非热门城市）
  if (!isPopularCityMode.value) {
    // 景点搜索模式：直接搜索输入的关键词
    loading.value = true
    loadError.value = ''
    try {
      const keyword = destination.value?.name || ''
      // 先尝试用"全国"范围搜索
      let pois = await searchAttractionsByKeyword('全国', keyword)
      // 如果结果太少，尝试用关键词本身作为城市名搜索
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
    return
  }
  
  // 热门城市模式：加载城市热门景点
  loading.value = true
  loadError.value = ''
  try {
    attractions.value = await fetchCityAttractions(cityName.value)
    if (attractions.value.length === 0) {
      loadError.value = `高德地图未返回「${cityName.value}」的景点数据，请确认城市名是否正确`
    }
  } catch (e) {
    loadError.value = e.message || '加载景点数据失败'
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
  searchKeyword.value = keyword
  searchLoading.value = true
  try {
    if (hasAmapKey) {
      // 热门城市内搜索用城市名，否则全国搜索
      const searchScope = isPopularCityMode.value ? cityName.value : (cityName.value || '全国')
      const pois = await searchAttractionsByKeyword(searchScope, keyword)
      // 防止过期请求覆盖新状态
      if (myRequestId !== searchRequestId) return
      searchResults.value = pois
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

// 加入行程
function addToItinerary(attr) {
  trip.addPlan({
    title: attr.name,
    type: 'attraction',
    destination: cityName.value,
    attraction: { ...attr, city: cityName.value },
    date: trip.startDate || '',
    note: attr.deep_info?.introduction || attr.address || ''
  })
  ElMessage.success(`已将「${attr.name}」加入行程`)
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
        正在从高德地图搜索景点...
      </div>

      <div v-else-if="!hasAmapKey" class="empty-tip">
        <div class="icon">🗺️</div>
        <p>请先配置高德地图Key以获取真实景点数据</p>
      </div>

      <div v-else-if="displayAttractions.length" class="attr-grid">
        <div v-for="(attr, i) in displayAttractions" :key="i" class="attr-card">
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
              @click="() => { imgErrors[attr.name] = false }"
            >🔄</button>
            <button
              class="fav-btn"
              :class="{ active: trip.isFavorite(attr.name) }"
              @click="toggleFav(attr)"
            >{{ trip.isFavorite(attr.name) ? '❤️' : '🤍' }}</button>
            <div v-if="attr.biz_ext?.rating || attr.deep_info?.rating" class="rating-tag">⭐ {{ attr.biz_ext?.rating || attr.deep_info?.rating }}</div>
          </div>
          <div class="attr-body">
            <h3 class="attr-name">{{ attr.name }}</h3>
            <p v-if="attr.deep_info?.introduction" class="attr-desc">{{ attr.deep_info.introduction }}</p>
            <p v-else class="attr-desc">{{ attr.type || attr.address || '暂无介绍' }}</p>
            <div class="attr-meta">
              <span v-if="attr.deep_info?.ticket_price" class="meta-item ticket" title="门票">🎫 {{ attr.deep_info.ticket_price }}</span>
              <span v-if="attr.deep_info?.opentime" class="meta-item time" title="开放时间">🕐 {{ attr.deep_info.opentime }}</span>
              <span v-if="attr.address" class="meta-item addr" title="地址">📍 {{ attr.address }}</span>
            </div>
            <div class="attr-actions">
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
        <span class="count">共 {{ displayAttractions.length }} 个景点</span>
      </div>

      <div v-if="loading" class="loading-box">
        <span class="spinner"></span>
        正在从高德地图获取真实景点数据...
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
        <div v-for="(attr, i) in displayAttractions" :key="i" class="attr-card">
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
              @click="() => { imgErrors[attr.name] = false }"
            >🔄</button>
            <button
              class="fav-btn"
              :class="{ active: trip.isFavorite(attr.name) }"
              @click="toggleFav(attr)"
            >{{ trip.isFavorite(attr.name) ? '❤️' : '🤍' }}</button>
            <div v-if="attr.biz_ext?.rating || attr.deep_info?.rating" class="rating-tag">⭐ {{ attr.biz_ext?.rating || attr.deep_info?.rating }}</div>
          </div>
          <div class="attr-body">
            <h3 class="attr-name">{{ attr.name }}</h3>
            <p v-if="attr.deep_info?.introduction" class="attr-desc">{{ attr.deep_info.introduction }}</p>
            <p v-else class="attr-desc">{{ attr.type || attr.address || '暂无介绍' }}</p>
            <div class="attr-meta">
              <span v-if="attr.deep_info?.ticket_price" class="meta-item ticket" title="门票">🎫 {{ attr.deep_info.ticket_price }}</span>
              <span v-if="attr.deep_info?.opentime" class="meta-item time" title="开放时间">🕐 {{ attr.deep_info.opentime }}</span>
              <span v-if="attr.address" class="meta-item addr" title="地址">📍 {{ attr.address }}</span>
            </div>
            <div class="attr-actions">
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
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}
.section-head h2 { font-size: 22px; font-weight: 800; }
.count { font-size: 13px; color: var(--text-light); }

.loading-box {
  text-align: center;
  padding: 60px;
  color: var(--text-light);
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
  height: 40px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
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
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.9);
  border: none;
  cursor: pointer;
  font-size: 18px;
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
.attr-body { padding: 14px; flex: 1; display: flex; flex-direction: column; }
.attr-name { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
.attr-desc {
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.5;
  margin-bottom: 8px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.attr-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.meta-item {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  background: #f5f7fa;
  color: var(--text-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.meta-item.ticket { background: #fff3ee; color: var(--primary); }
.meta-item.time { background: #e8f5e9; color: #2e7d32; }
.meta-item.addr { background: #e3f2fd; color: #1565c0; max-width: 100%; }
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
  .attr-meta { flex-direction: column; gap: 4px; }
  .meta-item { max-width: 100%; white-space: normal; }
  .attr-actions { flex-wrap: wrap; }
  .act-btn { flex: 1 1 calc(50% - 4px); padding: 10px 0; font-size: 14px; min-height: 44px; }
}
@media (max-width: 768px) {
  .dest-banner { height: 180px; }
  .banner-title { font-size: 30px; }
  .attr-grid { grid-template-columns: 1fr; }
}
</style>