<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../store/trip'
import AmapKeyTip from '../components/AmapKeyTip.vue'
import { loadAmap, searchNearby } from '../utils/amap'
import { hasAmapKey } from '../config'
import { formatDistance, haversine, getAttractionImage } from '../utils/format'
import { ElMessage } from 'element-plus'

const router = useRouter()
const trip = useTripStore()

const attraction = ref(trip.selectedAttraction)
// 当前景点所属城市(用于匹配本地图片)
const cityName = computed(() => attraction.value?.city || trip.destination?.city || trip.destination?.name || '')
const activeTab = ref('hotel') // hotel / food
const loading = ref(false)
const hotels = ref([])
const foods = ref([])
const selectedItem = ref(null)

const mapEl = ref(null)
let AMap = null
let map = null
let attractionMarker = null
let itemMarkers = []

// 当前列表(根据 tab)
const list = computed(() => activeTab.value === 'hotel' ? hotels.value : foods.value)

// 加载附近酒店与美食
async function loadNearby() {
  if (!attraction.value) return
  loading.value = true
  hotels.value = []
  foods.value = []
  try {
    if (hasAmapKey) {
      const [hotelPois, foodPois] = await Promise.all([
        searchNearby(attraction.value.lng, attraction.value.lat, '100000', 5000, 30).catch(() => []),
        searchNearby(attraction.value.lng, attraction.value.lat, '050000', 5000, 30).catch(() => [])
      ])
      hotels.value = hotelPois.map(p => formatPoi(p, 'hotel'))
      foods.value = foodPois.map(p => formatPoi(p, 'food'))
    } else {
      // 无 key: 生成模拟数据(距离按经纬度偏移估算)
      hotels.value = mockData('hotel')
      foods.value = mockData('food')
    }
    drawMarkers()
  } catch (e) {
    ElMessage.error('加载失败: ' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

// 格式化 POI 结果
function formatPoi(p, type) {
  const dist = p.distance != null ? p.distance :
    haversine(attraction.value.lng, attraction.value.lat, p.location.lng, p.location.lat)
  const item = {
    name: p.name,
    lng: p.location.lng,
    lat: p.location.lat,
    address: p.address || '',
    tel: p.tel || '',
    distance: dist,
    type: p.type || '',
    rating: p.biz_ext && p.biz_ext.rating ? p.biz_ext.rating : '',
    price: type === 'hotel' ? (p.biz_ext && p.biz_ext.cost ? p.biz_ext.cost : '') : ''
  }
  return item
}

// 无 key 时的模拟数据
function mockData(type) {
  const baseLng = attraction.value.lng
  const baseLat = attraction.value.lat
  const names = type === 'hotel'
    ? ['全季酒店', '如家酒店', '汉庭酒店', '锦江之星', '亚朵酒店', '希尔顿欢朋', '维也纳酒店', '7天连锁']
    : ['老街火锅', '川菜馆', '本地特色小吃', '粤菜餐厅', '日料寿司', '西餐厅', '面馆', '烧烤大排档']
  return names.map((n, i) => {
    const offsetLng = (Math.random() - 0.5) * 0.05
    const offsetLat = (Math.random() - 0.5) * 0.05
    const lng = baseLng + offsetLng
    const lat = baseLat + offsetLat
    const dist = haversine(baseLng, baseLat, lng, lat)
    return {
      name: n,
      lng, lat,
      address: attraction.value.city ? `${attraction.value.city}某路${i + 1}号` : `附近${i + 1}号`,
      tel: '010-12345678',
      distance: dist,
      type: type === 'hotel' ? '住宿服务' : '餐饮服务',
      rating: (3.5 + Math.random() * 1.5).toFixed(1),
      price: type === 'hotel' ? String(Math.round(150 + Math.random() * 600)) : ''
    }
  }).sort((a, b) => a.distance - b.distance)
}

// 初始化地图
async function initMap() {
  if (!hasAmapKey || !attraction.value) return
  try {
    AMap = await loadAmap()
    map = new AMap.Map(mapEl.value, {
      zoom: 14,
      center: [attraction.value.lng, attraction.value.lat],
      viewMode: '2D'
    })
    drawMarkers()
  } catch (e) {
    console.error(e)
  }
}

// 绘制景点 + 列表标记
function drawMarkers() {
  if (!map || !attraction.value) return
  // 清除旧标记
  if (attractionMarker) { map.remove(attractionMarker); attractionMarker = null }
  itemMarkers.forEach(m => map.remove(m))
  itemMarkers = []

  // 景点标记
  attractionMarker = new AMap.Marker({
    position: [attraction.value.lng, attraction.value.lat],
    content: '<div style="background:#ff6b35;color:#fff;padding:4px 10px;border-radius:16px;font-size:12px;white-space:nowrap;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">🎯 ' + attraction.value.name + '</div>',
    offset: new AMap.Pixel(-30, -15)
  })
  map.add(attractionMarker)

  // 列表项标记
  list.value.forEach((item, i) => {
    const color = activeTab.value === 'hotel' ? '#1976d2' : '#ff9800'
    const icon = activeTab.value === 'hotel' ? '🏨' : '🍜'
    const marker = new AMap.Marker({
      position: [item.lng, item.lat],
      content: `<div style="background:${color};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.3)">${i + 1}</div>`,
      offset: new AMap.Pixel(-13, -13)
    })
    marker.on('click', () => {
      selectedItem.value = item
      selectedItem.value._icon = icon
    })
    map.add(marker)
    itemMarkers.push(marker)
  })
  if (itemMarkers.length) {
    map.setFitView([attractionMarker, ...itemMarkers], false, [60, 60, 60, 60])
  }
}

// 切换 tab 重新绘制标记
watch(activeTab, () => {
  selectedItem.value = null
  drawMarkers()
})

// 选中列表项 -> 地图聚焦
function selectItem(item) {
  selectedItem.value = item
  if (map) {
    map.setZoomAndCenter(15, [item.lng, item.lat])
  }
}

// 去导航
function goToNav(item) {
  trip.selectAttraction({
    name: item.name,
    lng: item.lng,
    lat: item.lat,
    address: item.address,
    desc: item.type
  })
  router.push('/map')
}

onMounted(() => {
  if (attraction.value) {
    initMap()
    loadNearby()
  }
})

onBeforeUnmount(() => {
  if (map) { map.destroy(); map = null }
})
</script>

<template>
  <div class="page">
    <AmapKeyTip />

    <div v-if="!attraction" class="empty-tip">
      <div class="icon">📍</div>
      <p>请先在「目的地」页面选择一个景点</p>
      <button class="btn-primary" @click="$router.push('/destination')">去选择景点</button>
    </div>

    <template v-else>
      <!-- 景点信息条 -->
      <div class="attr-banner card">
        <img :src="getAttractionImage(attraction) || ''" :alt="attraction.name" @error="$event.target.style.display='none'" />
        <div class="banner-info">
          <h1>{{ attraction.name }}</h1>
          <p>{{ attraction.address || attraction.desc || '查看该景点附近的酒店与美食' }}</p>
        </div>
      </div>

      <div class="nearby-layout">
        <!-- 左侧列表 -->
        <div class="list-panel">
          <div class="tab-bar">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'hotel' }"
              @click="activeTab = 'hotel'"
            >🏨 附近酒店 <small>({{ hotels.length }})</small></button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'food' }"
              @click="activeTab = 'food'"
            >🍜 附近美食 <small>({{ foods.length }})</small></button>
          </div>

          <div v-if="loading" class="loading-box">
            <span class="spinner"></span> 正在搜索附近{{ activeTab === 'hotel' ? '酒店' : '美食' }}...
          </div>

          <div v-else-if="list.length" class="item-list">
            <div
              v-for="(item, i) in list"
              :key="i"
              class="item-card"
              :class="{ active: selectedItem === item }"
              @click="selectItem(item)"
            >
              <div class="item-num" :class="activeTab">{{ i + 1 }}</div>
              <div class="item-content">
                <div class="item-head">
                  <span class="item-name">{{ item.name }}</span>
                  <span v-if="item.rating" class="item-rating">⭐ {{ item.rating }}</span>
                </div>
                <div class="item-meta">
                  <span v-if="activeTab === 'hotel' && item.price" class="item-price">
                    ¥<b>{{ item.price }}</b>/晚
                  </span>
                  <span class="item-dist">📍 距景点 {{ formatDistance(item.distance) }}</span>
                </div>
                <div class="item-addr">{{ item.address }}{{ item.tel ? ' · ' + item.tel : '' }}</div>
                <div class="item-ops">
                  <button class="op-btn" @click.stop="goToNav(item)">🗺️ 导航到此</button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="empty-tip small">
            <div class="icon">🔍</div>
            <p>暂无附近{{ activeTab === 'hotel' ? '酒店' : '美食' }}数据</p>
          </div>
        </div>

        <!-- 右侧地图 -->
        <div class="map-container">
          <div ref="mapEl" class="map-box"></div>
          <div v-if="!hasAmapKey" class="map-placeholder">
            <div class="ph-icon">🗺️</div>
            <p>配置高德地图 Key 后显示地图与真实数据</p>
            <p class="ph-sub">当前展示为模拟数据</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.attr-banner {
  display: flex;
  height: 140px;
  margin-bottom: 16px;
  overflow: hidden;
}
.attr-banner img { width: 240px; height: 100%; object-fit: cover; flex-shrink: 0; }
.banner-info { padding: 24px; display: flex; flex-direction: column; justify-content: center; }
.banner-info h1 { font-size: 26px; font-weight: 800; margin-bottom: 8px; }
.banner-info p { color: var(--text-light); font-size: 14px; }

.nearby-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  height: 600px;
}
.list-panel {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 14px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
}
.tab-btn {
  flex: 1;
  padding: 14px;
  background: #fff;
  border: none;
  cursor: pointer;
  font-size: 15px;
  color: var(--text-light);
  border-bottom: 3px solid transparent;
  transition: all 0.15s;
}
.tab-btn small { font-size: 12px; opacity: 0.7; }
.tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 700;
  background: #fff7f3;
}

.item-list { flex: 1; overflow-y: auto; padding: 12px; }
.item-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;
}
.item-card:hover { background: #f9fafb; }
.item-card.active { background: #fff3ee; border-color: #ffd5c2; }
.item-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.item-num.hotel { background: #1976d2; }
.item-num.food { background: #ff9800; }
.item-content { flex: 1; min-width: 0; }
.item-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.item-name { font-size: 15px; font-weight: 600; word-break: break-all; }
.item-rating { font-size: 12px; color: #faad14; flex-shrink: 0; }
.item-meta {
  display: flex;
  gap: 12px;
  margin: 6px 0;
  font-size: 13px;
  flex-wrap: wrap;
}
.item-price { color: var(--primary); }
.item-price b { font-size: 18px; font-weight: 800; }
.item-dist { color: var(--text-light); }
.item-addr { font-size: 12px; color: var(--text-light); word-break: break-all; }
.item-ops { margin-top: 8px; }
.op-btn {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text);
}
.op-btn:hover { border-color: var(--primary); color: var(--primary); }

.loading-box {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-light);
  font-size: 14px;
}
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #ddd;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-tip.small { padding: 40px 20px; }
.empty-tip.small .icon { font-size: 36px; }

.map-container {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow);
  background: #e8eaed;
}
.map-box { width: 100%; height: 100%; }
.map-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8eaed, #d5d8dc);
  color: var(--text-light);
  text-align: center;
  gap: 8px;
}
.ph-icon { font-size: 56px; }
.ph-sub { font-size: 12px; opacity: 0.7; }

@media (max-width: 900px) {
  .nearby-layout { grid-template-columns: 1fr; height: auto; }
  .map-container {
    height: 40vh;
    min-height: 300px;
    position: sticky;
    top: 64px;
    z-index: 10;
  }
  .attr-banner { flex-direction: column; height: auto; }
  .attr-banner img { width: 100%; height: 160px; }
}
@media (max-width: 640px) {
  .attr-banner { margin-bottom: 12px; }
  .attr-banner img { height: 140px; }
  .banner-info { padding: 16px; }
  .banner-info h1 { font-size: 20px; }
  .banner-info p { font-size: 13px; }
  .tab-btn { padding: 12px 8px; font-size: 14px; }
  .tab-btn small { font-size: 11px; }
  .item-list { padding: 10px; }
  .item-card { padding: 10px; gap: 10px; }
  .item-num { width: 24px; height: 24px; font-size: 12px; }
  .item-name { font-size: 14px; }
  .item-meta { font-size: 12px; gap: 8px; }
  .item-price b { font-size: 16px; }
  .op-btn { padding: 6px 12px; font-size: 13px; min-height: 36px; }
  .map-container { height: 35vh; min-height: 260px; top: 60px; }
}
</style>
