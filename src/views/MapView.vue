<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
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

// ===== 手动搜索起点/终点相关状态 =====
let placeSearch = null
const editingWhich = ref(null) // 'origin' | 'dest' | null
const searchQuery = ref('')
const searchCandidates = ref([])
const searchLoading = ref(false)
// 防抖定时器
let searchTimer = null

// 打开某个端点的编辑
function openEditor(which) {
  editingWhich.value = which
  searchQuery.value = (which === 'origin' ? origin.value?.name : destination.value?.name) || ''
  searchCandidates.value = []
  // 初始加载附近的热门POI（给用户一些选项）
  setTimeout(() => doSearch(''), 50)
}
function closeEditor() {
  editingWhich.value = null
  searchCandidates.value = []
  searchQuery.value = ''
}

// 执行POI搜索
async function doSearch(keyword) {
  if (!AMap && !placeSearch) return
  searchLoading.value = true
  try {
    if (!placeSearch) {
      placeSearch = new AMap.PlaceSearch({
        pageSize: 8,
        pageIndex: 1,
        extensions: 'base',
        // 如果有终点或起点，优先在所在城市搜
        city: (destination.value?.city || origin.value?.city || '全国')
      })
    }
    // 更新所在城市
    if (placeSearch.setCity) {
      placeSearch.setCity(destination.value?.city || origin.value?.city || '全国')
    }
    const status = await new Promise(resolve => {
      placeSearch.search(keyword || '景点', (status, result) => {
        if (status === 'complete' && result?.poiList?.pois?.length) {
          searchCandidates.value = result.poiList.pois.map(p => ({
            name: p.name,
            address: p.address,
            lng: p.location?.lng,
            lat: p.location?.lat,
            city: p.cityname || '',
            adname: p.adname || '',
            type: p.type || ''
          })).filter(p => p.lng && p.lat)
        } else {
          searchCandidates.value = []
        }
        resolve(status)
      })
    })
    return status
  } catch (e) {
    console.warn('POI搜索失败:', e)
    searchCandidates.value = []
  } finally {
    searchLoading.value = false
  }
}

// 输入变化时防抖搜索
function onQueryInput(e) {
  const v = e.target?.value ?? searchQuery.value
  searchQuery.value = v
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => doSearch(v), 250)
}

// 选中候选后回填
function selectCandidate(p) {
  const target = {
    name: p.name,
    address: [p.city, p.adname, p.address].filter(Boolean).join(''),
    lng: p.lng,
    lat: p.lat,
    city: p.city
  }
  if (editingWhich.value === 'origin') {
    origin.value = target
    trip.setCurrentLocation(target)
  } else {
    destination.value = target
    trip.selectAttraction(target)
  }
  closeEditor()
  drawMarkers()
  if (origin.value && destination.value) {
    doPlan()
  }
}

// 交换起点和终点
function swapEndpoints() {
  const tmp = origin.value
  origin.value = destination.value
  destination.value = tmp
  drawMarkers()
  if (origin.value && destination.value) doPlan()
}

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

// 编辑模式切换时触发地图 resize，确保地图渲染正确
watch(editingWhich, async () => {
  await nextTick()
  if (map) {
    setTimeout(() => map?.resize(), 100)
  }
})

onBeforeUnmount(() => {
  if (map) { map.destroy(); map = null }
})
</script>

<template>
  <div class="map-view" :class="{ editing: editingWhich }">
    <AmapKeyTip />
    <div class="map-layout">
      <!-- 左侧控制面板 -->
      <div class="control-panel card">
        <h2 class="panel-title">🗺️ 路线导航</h2>

        <!-- 起点终点信息（支持手动输入搜索） -->
        <div class="endpoint">
          <!-- 起点 -->
          <div class="ep-item" :class="{ editing: editingWhich === 'origin' }" @click="editingWhich !== 'origin' && openEditor('origin')">
            <span class="ep-dot origin"></span>
            <div class="ep-info">
              <span class="ep-label">起点</span>
              <!-- 显示模式 -->
              <div v-if="editingWhich !== 'origin'" class="ep-display">
                <span class="ep-name">{{ origin ? origin.name : '点击设置起点' }}</span>
                <span v-if="origin" class="ep-addr">{{ origin.address || `${origin.lng.toFixed(4)}, ${origin.lat.toFixed(4)}` }}</span>
                <span class="ep-edit-hint">✎ 点击修改</span>
              </div>
              <!-- 编辑模式 -->
              <div v-else class="ep-editor" @click.stop>
                <input
                  class="ep-input"
                  type="text"
                  v-model="searchQuery"
                  @input="onQueryInput"
                  :placeholder="editingWhich === 'origin' ? '输入起点地址或名称...' : '输入终点地址或名称...'"
                  autofocus
                />
                <!-- 候选列表 -->
                <div v-if="searchCandidates.length || searchLoading" class="ep-candidates">
                  <div v-if="searchLoading" class="cand-loading">
                    <span class="spinner small"></span> 搜索中...
                  </div>
                  <div
                    v-for="(c, i) in searchCandidates"
                    :key="i"
                    class="cand-item"
                    @click="selectCandidate(c)"
                  >
                    <div class="cand-name">{{ c.name }}</div>
                    <div class="cand-addr">{{ c.city }}{{ c.adname }} · {{ c.address }}</div>
                  </div>
                  <div v-if="!searchLoading && searchCandidates.length === 0" class="cand-empty">
                    未找到匹配地点
                  </div>
                </div>
                <div class="ep-editor-actions">
                  <button class="btn-link cancel" @click.stop="closeEditor">取消</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 交换按钮 -->
          <div class="ep-swap-wrap">
            <button class="ep-swap" @click.stop="swapEndpoints" title="交换起点和终点">
              ⇅
            </button>
          </div>

          <!-- 终点 -->
          <div class="ep-item" :class="{ editing: editingWhich === 'dest' }" @click="editingWhich !== 'dest' && openEditor('dest')">
            <span class="ep-dot dest"></span>
            <div class="ep-info">
              <span class="ep-label">终点</span>
              <div v-if="editingWhich !== 'dest'" class="ep-display">
                <span class="ep-name">{{ destination ? destination.name : '点击设置终点' }}</span>
                <span v-if="destination" class="ep-addr">{{ destination.address || destination.desc || '' }}</span>
                <span class="ep-edit-hint">✎ 点击修改</span>
              </div>
              <div v-else class="ep-editor" @click.stop>
                <input
                  class="ep-input"
                  type="text"
                  v-model="searchQuery"
                  @input="onQueryInput"
                  :placeholder="editingWhich === 'origin' ? '输入起点地址或名称...' : '输入终点地址或名称...'"
                  autofocus
                />
                <div v-if="searchCandidates.length || searchLoading" class="ep-candidates">
                  <div v-if="searchLoading" class="cand-loading">
                    <span class="spinner small"></span> 搜索中...
                  </div>
                  <div
                    v-for="(c, i) in searchCandidates"
                    :key="i"
                    class="cand-item"
                    @click="selectCandidate(c)"
                  >
                    <div class="cand-name">{{ c.name }}</div>
                    <div class="cand-addr">{{ c.city }}{{ c.adname }} · {{ c.address }}</div>
                  </div>
                  <div v-if="!searchLoading && searchCandidates.length === 0" class="cand-empty">
                    未找到匹配地点
                  </div>
                </div>
                <div class="ep-editor-actions">
                  <button class="btn-link cancel" @click.stop="closeEditor">取消</button>
                </div>
              </div>
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
  position: relative;
  padding: 6px 8px;
  margin: 0 -8px;
  border-radius: 8px;
  transition: background 0.15s;
  cursor: pointer;
}
.ep-item:hover {
  background: #eef0f5;
}
.ep-item.editing {
  cursor: default;
  background: transparent;
}
.ep-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
  border: 2px solid #fff;
  box-shadow: 0 0 0 2px currentColor;
  z-index: 1;
}
.ep-dot.origin { background: #1976d2; color: #1976d2; }
.ep-dot.dest { background: #ff6b35; color: #ff6b35; }
.ep-info { display: flex; flex-direction: column; flex: 1; min-width: 0; position: relative; }
.ep-label { font-size: 11px; color: var(--text-light); }
.ep-name { font-size: 14px; font-weight: 600; word-break: break-all; }
.ep-addr { font-size: 12px; color: var(--text-light); word-break: break-all; }

/* 可点击展示 */
.ep-display {
  padding: 0;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}
.ep-edit-hint {
  position: absolute;
  right: 6px;
  top: 6px;
  font-size: 11px;
  color: var(--text-light);
  opacity: 0;
  transition: opacity 0.2s;
}
.ep-display:hover .ep-edit-hint { opacity: 1; }

/* 交换按钮 */
.ep-swap-wrap {
  display: flex;
  justify-content: center;
  margin: 2px 0 2px 18px;
  position: relative;
  z-index: 2;
}
.ep-swap {
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  aspect-ratio: 1 / 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #d0d3d8;
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.2s;
}
.ep-swap:hover {
  transform: rotate(180deg);
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary);
}

/* 编辑态 */
.ep-editor {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ep-input {
  width: 100%;
  padding: 8px 10px;
  border: 1.5px solid var(--primary);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  background: #fff;
  box-sizing: border-box;
}
.ep-input:focus { box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.15); }
.ep-candidates {
  background: #fff;
  border: 1px solid #e3e6ef;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  max-height: 260px;
  overflow-y: auto;
  z-index: 10;
}

@media (max-width: 640px) {
  .ep-candidates {
    max-height: 40vh;
  }
  .cand-item {
    padding: 8px 10px;
  }
}
.cand-loading, .cand-empty {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-light);
  text-align: center;
}
.cand-item {
  padding: 9px 12px;
  border-bottom: 1px solid #f1f3f7;
  cursor: pointer;
  transition: background 0.15s;
}
.cand-item:last-child { border-bottom: none; }
.cand-item:hover { background: #fff5ef; }
.cand-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
.cand-addr { font-size: 12px; color: var(--text-light); word-break: break-all; }
.ep-editor-actions {
  display: flex;
  justify-content: flex-end;
}
.btn-link {
  background: none;
  border: none;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--text-light);
}
.btn-link:hover { background: #eef0f5; color: var(--text); }

/* spinner小尺寸（通用） */
.spinner.small {
  width: 14px; height: 14px;
  border-width: 1.5px;
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
    overflow-y: auto;
  }
  .map-container {
    order: 1;
    height: 40vh;
    min-height: 280px;
    position: sticky;
    top: 64px;
    z-index: 10;
  }
  .panel-actions { flex-wrap: wrap; }
  .btn-primary, .btn-plan { flex: 1 1 calc(50% - 4px); min-height: 44px; }

  /* 编辑模式：键盘弹出时缩小地图，给控制面板更多空间 */
  .map-view.editing .map-container {
    height: 25vh;
    min-height: 160px;
    position: static;
    top: 0;
  }
  .map-view.editing .control-panel {
    max-height: none;
    flex: 1;
  }
  .map-view.editing .map-layout {
    gap: 8px;
  }
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
  .map-container { height: 35vh; min-height: 240px; top: 60px; }

  /* 编辑模式：进一步缩小地图 */
  .map-view.editing .map-container {
    height: 22vh;
    min-height: 140px;
  }
}
</style>
