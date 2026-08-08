<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed } from 'vue'
import { useTripStore } from '../store/trip'
import AmapKeyTip from '../components/AmapKeyTip.vue'
import { loadAmap, getCurrentPosition, planRoutes } from '../utils/amap'
import { hasAmapKey } from '../config'
import { travelModes, popularCities } from '../utils/cities'
import { formatDistance, formatTime } from '../utils/format'
import { ElMessage } from 'element-plus'

const trip = useTripStore()

const mapEl = ref(null)
let AMap = null
let map = null
let originMarker = null
let destMarker = null
let routeLayer = null
let markers = []

const loadingMap = ref(true)
const locating = ref(false)
const planning = ref(false)
const errorMsg = ref('')

// 起点(优先使用定位,其次使用首页选择的出发地)与终点(选中的景点)
const origin = ref(trip.currentLocation || trip.origin || null)
const destination = ref(trip.selectedAttraction || null)

const routeResults = ref([])      // 各出行方式结果
const activeMode = ref('driving') // 当前选中方式

// 起点终点是否就绪
const ready = computed(() => origin.value && destination.value &&
  origin.value.lng && destination.value.lng)

// 初始化地图
async function initMap() {
  if (!hasAmapKey) {
    loadingMap.value = false
    errorMsg.value = '未配置高德地图 Key'
    return
  }
  try {
    AMap = await loadAmap()
    const center = destination.value
      ? [destination.value.lng, destination.value.lat]
      : (origin.value ? [origin.value.lng, origin.value.lat] : [116.397428, 39.90923])
    map = new AMap.Map(mapEl.value, {
      zoom: 13,
      center,
      viewMode: '2D'
    })
    loadingMap.value = false
    // 如果没有起点,尝试使用终点所在城市作为默认起点
    if (!origin.value && destination.value) {
      const city = destination.value.city || ''
      const cityInfo = popularCities.find(c => c.name === city)
      if (cityInfo) {
        origin.value = {
          name: `${city}市中心`,
          lng: cityInfo.lng,
          lat: cityInfo.lat,
          address: cityInfo.desc,
          city: city
        }
      }
    }
    // 绘制已有起点终点
    drawMarkers()
    // 如果没有起点,尝试定位;如果有起点,直接规划
    if (!origin.value) {
      locateMe()
    } else if (ready.value) {
      // 使用出发地作为起点,自动规划
      doPlan()
    }
  } catch (e) {
    loadingMap.value = false
    errorMsg.value = e.message || '地图加载失败'
  }
}

// 定位当前位置,失败时回退到首页选择的出发地
async function locateMe() {
  locating.value = true
  try {
    const pos = await getCurrentPosition()
    origin.value = {
      name: '当前位置',
      lng: pos.lng,
      lat: pos.lat,
      address: pos.address,
      city: pos.city
    }
    trip.setCurrentLocation(origin.value)
    drawMarkers()
    if (destination.value) doPlan()
    ElMessage.success('定位成功')
  } catch (e) {
    // 定位失败时,尝试使用首页选择的出发地
    if (trip.origin) {
      origin.value = trip.origin
      drawMarkers()
      if (destination.value) doPlan()
      ElMessage.warning('定位失败,已使用出发地')
    } else {
      ElMessage.error('定位失败: ' + (e.message || '请选择起点'))
    }
  } finally {
    locating.value = false
  }
}

// 绘制起点终点标记
function drawMarkers() {
  if (!map) return
  // 清除旧标记
  if (originMarker) { map.remove(originMarker); originMarker = null }
  if (destMarker) { map.remove(destMarker); destMarker = null }

  if (origin.value) {
    originMarker = new AMap.Marker({
      position: [origin.value.lng, origin.value.lat],
      content: '<div style="background:#1976d2;color:#fff;padding:4px 8px;border-radius:16px;font-size:12px;white-space:nowrap;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">📍 起点</div>',
      offset: new AMap.Pixel(-25, -15)
    })
    map.add(originMarker)
  }
  if (destination.value) {
    destMarker = new AMap.Marker({
      position: [destination.value.lng, destination.value.lat],
      content: '<div style="background:#ff6b35;color:#fff;padding:4px 8px;border-radius:16px;font-size:12px;white-space:nowrap;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">🏁 ' + (destination.value.name || '终点') + '</div>',
      offset: new AMap.Pixel(-25, -15)
    })
    map.add(destMarker)
    map.setCenter([destination.value.lng, destination.value.lat])
  }
  if (origin.value && destination.value) {
    map.setFitView([originMarker, destMarker], false, [60, 60, 60, 60])
  }
}

// 规划所有出行方式路线
async function doPlan() {
  if (!ready.value) return
  planning.value = true
  routeResults.value = []
  clearRoute()
  try {
    const results = await planRoutes(
      [origin.value.lng, origin.value.lat],
      [destination.value.lng, destination.value.lat]
    )
    routeResults.value = results
    // 默认显示第一个可用方案
    const first = results.find(r => !r.error)
    if (first) selectMode(first.mode)
  } catch (e) {
    ElMessage.error('路线规划失败: ' + (e.message || ''))
  } finally {
    planning.value = false
  }
}

// 选中某种出行方式,在地图上绘制
function selectMode(mode) {
  activeMode.value = mode
  const r = routeResults.value.find(x => x.mode === mode)
  if (!r || r.error) return
  drawRoute(r)
}

// 绘制路线
function drawRoute(route) {
  if (!map) return
  clearRoute()
  if (!route.steps || !route.steps.length) return

  // 路线颜色
  const colorMap = {
    driving: '#1976d2',
    taxi: '#ff9800',
    walking: '#4caf50',
    bicycle: '#9c27b0',
    ebike: '#00bcd4'
  }
  const color = colorMap[route.mode] || '#1976d2'

  // 收集所有路径点
  const path = []
  route.steps.forEach(step => {
    if (step.path && step.path.length) {
      step.path.forEach(p => path.push([p.lng, p.lat]))
    }
  })
  if (!path.length) return

  routeLayer = new AMap.Polyline({
    path,
    strokeColor: color,
    strokeWeight: 6,
    strokeOpacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round'
  })
  map.add(routeLayer)
  map.setFitView([routeLayer, originMarker, destMarker].filter(Boolean), false, [60, 60, 60, 60])
}

function clearRoute() {
  if (routeLayer) { map.remove(routeLayer); routeLayer = null }
}

// 切换为打车导航(打开高德导航)
function openNavigation() {
  if (!destination.value) return
  const dest = destination.value
  // 高德地图 URI 调起导航
  const url = `https://uri.amap.com/navigation?to=${dest.lng},${dest.lat},${encodeURIComponent(dest.name)}&mode=car&src=travel-planner`
  window.open(url, '_blank')
}

onMounted(() => {
  initMap()
})

onBeforeUnmount(() => {
  if (map) { map.destroy(); map = null }
})
</script>

<template>
  <div class="map-view">
    <AmapKeyTip />
    <div class="map-layout">
      <!-- 左侧控制面板 -->
      <div class="control-panel card">
        <h2 class="panel-title">🗺️ 路线导航</h2>

        <!-- 起点终点信息 -->
        <div class="endpoint">
          <div class="ep-item">
            <span class="ep-dot origin"></span>
            <div class="ep-info">
              <span class="ep-label">起点</span>
              <span class="ep-name">{{ origin ? origin.name : '未定位' }}</span>
              <span v-if="origin" class="ep-addr">{{ origin.address || `${origin.lng.toFixed(4)}, ${origin.lat.toFixed(4)}` }}</span>
            </div>
          </div>
          <div class="ep-line"></div>
          <div class="ep-item">
            <span class="ep-dot dest"></span>
            <div class="ep-info">
              <span class="ep-label">终点</span>
              <span class="ep-name">{{ destination ? destination.name : '未选择景点' }}</span>
              <span v-if="destination" class="ep-addr">{{ destination.address || destination.desc || '' }}</span>
            </div>
          </div>
        </div>

        <div class="panel-actions">
          <button class="btn-primary" :disabled="locating" @click="locateMe">
            {{ locating ? '定位中...' : '📍 定位当前位置' }}
          </button>
          <button class="btn-plan" :disabled="!ready || planning" @click="doPlan">
            {{ planning ? '规划中...' : '🔄 重新规划' }}
          </button>
        </div>

        <!-- 出行方式结果 -->
        <div v-if="routeResults.length" class="modes">
          <h3 class="modes-title">出行方式</h3>
          <div
            v-for="r in routeResults"
            :key="r.mode"
            class="mode-item"
            :class="{ active: activeMode === r.mode, error: r.error }"
            @click="!r.error && selectMode(r.mode)"
          >
            <span class="mode-icon">{{ r.icon }}</span>
            <div class="mode-info">
              <span class="mode-name">{{ r.name }}</span>
              <span v-if="!r.error" class="mode-detail">
                {{ formatDistance(r.distance) }} · {{ formatTime(r.time) }}
                <span v-if="r.cost" class="mode-cost">≈¥{{ r.cost }}</span>
              </span>
              <span v-else class="mode-detail">
                暂不可达
                <span v-if="r.errorMsg" class="mode-error">({{ r.errorMsg }})</span>
              </span>
            </div>
          </div>
        </div>

        <div v-else-if="planning" class="modes-loading">
          <span class="spinner"></span> 正在计算各出行方式...
        </div>

        <div v-else-if="ready" class="modes-empty">
          点击「重新规划」查看路线
        </div>

        <div v-else class="modes-empty">
          请先定位起点并选择景点
        </div>

        <button v-if="ready" class="btn-nav" @click="openNavigation">
          🧭 打开高德导航
        </button>
      </div>

      <!-- 右侧地图 -->
      <div class="map-container">
        <div ref="mapEl" class="map-box"></div>
        <div v-if="loadingMap" class="map-loading">
          <span class="spinner big"></span>
          <p>地图加载中...</p>
        </div>
        <div v-if="!hasAmapKey" class="map-placeholder">
          <div class="ph-icon">🗺️</div>
          <p>配置高德地图 Key 后显示地图</p>
          <p class="ph-sub">参考顶部提示申请 Key 并填入 .env</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-view { padding: 16px; max-width: 1400px; margin: 0 auto; }
.map-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
  height: calc(100vh - 200px);
  min-height: 520px;
}
.control-panel {
  padding: 20px;
  overflow-y: auto;
}
.panel-title { font-size: 18px; font-weight: 800; margin-bottom: 16px; }

.endpoint {
  background: #f9fafb;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 14px;
}
.ep-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.ep-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
  border: 2px solid #fff;
  box-shadow: 0 0 0 2px currentColor;
}
.ep-dot.origin { background: #1976d2; color: #1976d2; }
.ep-dot.dest { background: #ff6b35; color: #ff6b35; }
.ep-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.ep-label { font-size: 11px; color: var(--text-light); }
.ep-name { font-size: 14px; font-weight: 600; word-break: break-all; }
.ep-addr { font-size: 12px; color: var(--text-light); word-break: break-all; }
.ep-line {
  width: 2px;
  height: 20px;
  background: #d0d3d8;
  margin-left: 5px;
  margin: 4px 0 4px 5px;
}

.panel-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}
.btn-primary { flex: 1; }
.btn-plan {
  flex: 1;
  background: #fff;
  border: 1px solid var(--primary);
  color: var(--primary);
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  font-size: 14px;
}
.btn-plan:hover:not(:disabled) { background: #fff3ee; }
.btn-plan:disabled, .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.modes-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; color: var(--text); }
.mode-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.mode-item:hover:not(.error) { border-color: var(--primary); background: #fff7f3; }
.mode-item.active {
  border-color: var(--primary);
  background: linear-gradient(135deg, #fff3ee, #ffe8dc);
  box-shadow: 0 2px 8px rgba(255,107,53,0.2);
}
.mode-item.error { opacity: 0.5; cursor: not-allowed; }
.mode-icon { font-size: 26px; }
.mode-info { display: flex; flex-direction: column; flex: 1; }
.mode-name { font-size: 14px; font-weight: 600; }
.mode-detail { font-size: 12px; color: var(--text-light); }
.mode-cost { color: #ff6b35; font-weight: 600; margin-left: 6px; }
.mode-error { color: #f44336; font-size: 11px; margin-left: 4px; }

.modes-loading, .modes-empty {
  text-align: center;
  padding: 30px 16px;
  color: var(--text-light);
  font-size: 13px;
}
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #ddd;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}
.spinner.big { width: 32px; height: 32px; border-width: 3px; }
@keyframes spin { to { transform: rotate(360deg); } }

.btn-nav {
  width: 100%;
  margin-top: 14px;
  padding: 12px;
  background: #4caf50;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
}
.btn-nav:hover { background: #43a047; }

.map-container {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow);
  background: #e8eaed;
}
.map-box { width: 100%; height: 100%; }
.map-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #e8eaed;
  color: var(--text-light);
  gap: 12px;
}
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
.ph-icon { font-size: 64px; }
.ph-sub { font-size: 12px; opacity: 0.7; }

@media (max-width: 900px) {
  .map-layout {
    grid-template-columns: 1fr;
    height: auto;
    min-height: unset;
  }
  .control-panel {
    order: 2;
    max-height: 45vh;
    overflow-y: auto;
  }
  .map-container {
    order: 1;
    height: 45vh;
    min-height: 320px;
    position: sticky;
    top: 64px;
    z-index: 10;
  }
  .panel-actions { flex-wrap: wrap; }
  .btn-primary, .btn-plan { flex: 1 1 calc(50% - 4px); min-height: 44px; }
}
@media (max-width: 640px) {
  .map-view { padding: 10px; }
  .control-panel { padding: 14px; }
  .panel-title { font-size: 16px; margin-bottom: 12px; }
  .endpoint { padding: 12px; }
  .ep-item { gap: 8px; }
  .ep-name { font-size: 13px; }
  .mode-item { padding: 10px; gap: 10px; }
  .mode-icon { font-size: 22px; }
  .mode-name { font-size: 13px; }
  .btn-nav { padding: 12px; font-size: 14px; min-height: 44px; }
  .map-container { height: 40vh; min-height: 280px; top: 60px; }
}
</style>
