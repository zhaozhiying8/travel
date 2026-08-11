<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../store/trip'
import PlaceSearch from '../components/PlaceSearch.vue'
import AmapKeyTip from '../components/AmapKeyTip.vue'
import { popularCities } from '../utils/cities'
import { hasAmapKey } from '../config'
import { getAllCityImages } from '../utils/cityImages'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const trip = useTripStore()

// 城市图片（通过getAllCityImages保证每个城市都有图片）
const cityImages = ref({})
const cityImgLoading = ref(true)
const cityImgErrors = ref({})

// 加载城市图片（所有城市都有保底图片，确保100%显示）
async function loadCityImages() {
  cityImgLoading.value = true
  try {
    cityImages.value = await getAllCityImages()
  } catch (e) {
    console.warn('加载城市图片失败:', e)
  }
  cityImgLoading.value = false
}

onMounted(() => {
  loadCityImages()
})

const origin = ref(trip.origin)
const destination = ref(trip.destination)
const dateRange = ref([trip.startDate, trip.endDate])
const travelers = ref(trip.travelers)

// 校验是否可开始规划
const canStart = computed(() => origin.value && destination.value && dateRange.value && dateRange.value[0])

// 禁用过去日期
function disabledDate(date) {
  return date.getTime() < Date.now() - 86400000
}

function startPlanning() {
  if (!origin.value) return ElMessage.warning('请选择出发地')
  if (!destination.value) return ElMessage.warning('请选择目的地')
  if (!dateRange.value || !dateRange.value[0]) return ElMessage.warning('请选择出行日期')
  if (origin.value.name === destination.value.name) return ElMessage.warning('出发地与目的地不能相同')

  // 如果已有行程，询问用户创建新行程还是替换当前行程
  if (trip.trips.length > 0) {
    ElMessageBox.confirm(
      `已有 ${trip.trips.length} 个行程，如何处理？`,
      '行程规划',
      {
        confirmButtonText: '创建新行程',
        cancelButtonText: '替换当前行程',
        type: 'warning'
      }
    ).then(() => {
      // 用户选择创建新行程
      trip.addTrip({
        origin: origin.value,
        destination: destination.value,
        startDate: dateRange.value[0],
        endDate: dateRange.value[1],
        travelers: travelers.value
      })
      ElMessage.success(`已创建新行程: ${destination.value.name}`)
      router.push('/destination')
    }).catch(() => {
      // 用户选择替换当前行程
      doStartPlanning()
    })
  } else {
    doStartPlanning()
  }
}

// 执行开始规划（创建或更新行程）
function doStartPlanning() {
  if (trip.trips.length === 0 || !trip.activeTripId) {
    // 没有行程时创建新行程（用户明确点击开始规划）
    trip.createTrip({
      origin: origin.value,
      destination: destination.value,
      startDate: dateRange.value[0],
      endDate: dateRange.value[1],
      travelers: travelers.value
    })
  } else {
    // 已有行程则替换当前行程
    trip.setTrip({
      origin: origin.value,
      destination: destination.value,
      startDate: dateRange.value[0],
      endDate: dateRange.value[1],
      travelers: travelers.value
    })
  }
  ElMessage.success(`已设置前往 ${destination.value.name} 的行程`)
  router.push('/destination')
}

// 快速选择热门目的地
function pickDestination(city) {
  const destData = { name: city.name, lng: city.lng, lat: city.lat, city: city.name, address: city.desc }
  destination.value = destData
}

// 用出发地作为定位
function useMyLocation() {
  if (!navigator.geolocation) return ElMessage.warning('浏览器不支持定位')
  ElMessage.info('正在获取定位...')
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const lng = pos.coords.longitude
      const lat = pos.coords.latitude

      // 先设置一个临时的出发地
      origin.value = {
        name: '当前位置',
        lng,
        lat,
        city: '',
        address: '当前定位位置'
      }

      // 尝试通过高德逆地理编码获取城市名
      try {
        const response = await fetch(
          `https://restapi.amap.com/v3/geocode/regeo?location=${lng},${lat}&key=${import.meta.env.VITE_AMAP_REST_KEY}&extensions=base`
        )
        const data = await response.json()
        if (data.regeocode) {
          const city = data.regeocode.address_component.city || data.regeocode.address_component.province || ''
          const address = data.regeocode.formatted_address || ''

          // 更新出发地信息
          origin.value = {
            name: city || '当前位置',
            lng,
            lat,
            city,
            address
          }

          // 保存当前定位到store，用于后续行程添加
          trip.setCurrentLocation({
            lng,
            lat,
            city,
            address
          })

          ElMessage.success(`已定位: ${city || address}`)
        }
      } catch (e) {
        // 逆地理编码失败，保持默认
        trip.setCurrentLocation({ lng, lat, city: '', address: '当前定位位置' })
        ElMessage.success('已定位当前位置')
      }
    },
    () => ElMessage.error('定位失败,请手动选择出发地')
  )
}
</script>

<template>
  <div class="home">
    <!-- Hero 区 -->
    <section class="hero">
      <div class="hero-bg"></div>
      <div class="hero-content">
        <h1 class="hero-title">规划你的下一段旅程</h1>
        <p class="hero-sub">选择出发地与目的地,智能规划景点、路线、住宿与美食</p>

        <div class="plan-card">
          <AmapKeyTip />
          <div class="plan-grid">
            <PlaceSearch v-model="origin" label="出发地" placeholder="从哪里出发?" :showSearchBtn="false" />
            <PlaceSearch v-model="destination" label="目的地" placeholder="要去哪里?" :showSearchBtn="false" />
          </div>

          <div class="plan-row">
            <div class="plan-field">
              <label class="ps-label">出行日期</label>
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="出发日期"
                end-placeholder="返回日期"
                :disabled-date="disabledDate"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </div>
            <div class="plan-field travelers">
              <label class="ps-label">出行人数</label>
              <el-input-number v-model="travelers" :min="1" :max="20" />
            </div>
          </div>

          <div class="plan-actions">
            <button class="btn-locate" @click="useMyLocation">📍 定位我的位置</button>
            <button class="btn-primary btn-start" :disabled="!canStart" @click="startPlanning">
              开始规划行程 →
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 热门目的地 -->
    <section class="page">
      <h2 class="section-title">🔥 热门目的地</h2>
      <p class="section-desc">点击城市快速设为目的地</p>
      <div class="city-grid">
        <div
          v-for="city in popularCities"
          :key="city.name"
          class="city-card"
          @click="pickDestination(city); $router.push('/destination')"
        >
          <div class="city-img-wrap">
            <!-- 加载中显示骨架动画 -->
            <div v-if="cityImgLoading && !cityImages[city.name]" class="city-img-skeleton"></div>
            <img v-else-if="cityImages[city.name] && !cityImgErrors[city.name]" :src="cityImages[city.name]" :alt="city.name" class="city-img" @error="cityImgErrors[city.name] = true" />
            <div v-else class="city-img-bg" :style="{ background: 'linear-gradient(135deg, ' + ['#667eea','#ff6b35','#43a047','#e53935','#7b1fa2','#00897b','#fb8c00','#5c6bc0','#8d6e63','#00acc1','#6d4c41','#c2185b','#3949ab','#2e7d32','#e65100','#4a148c','#006064','#bf360c'][popularCities.indexOf(city) % 18] + ', ' + ['#764ba2','#f093fb','#4facfe','#f093fb','#ffecd2','#fcb69f','#a18cd1','#fbc2eb','#a6c1ee','#fbc2eb','#d4fc79','#96e6a1','#84fab0','#8fd3f4','#a6c1ee','#d4fc79','#84fab0','#fccb90'][popularCities.indexOf(city) % 18] + ')' }"></div>
            <div class="city-name">{{ city.name }}</div>
          </div>
          <div class="city-desc">{{ city.desc }}</div>
        </div>
      </div>
    </section>

    <!-- 平台能力 -->
    <section class="page">
      <h2 class="section-title">✨ 平台能力</h2>
      <div class="feature-grid">
        <div class="feature-card">
          <div class="f-icon">🗺️</div>
          <h3>智能地图导航</h3>
          <p>驾车、打车、步行、自行车、电动车五种出行方式,实时距离与时间</p>
        </div>
        <div class="feature-card">
          <div class="f-icon">📍</div>
          <h3>热门景点推荐</h3>
          <p>目的地城市精选景点,配宣传图片,一键加入行程</p>
        </div>
        <div class="feature-card">
          <div class="f-icon">🏨</div>
          <h3>周边酒店美食</h3>
          <p>景点附近酒店价格与距离一目了然,美食推荐贴心相伴</p>
        </div>
        <div class="feature-card">
          <div class="f-icon">📋</div>
          <h3>行程规划管理</h3>
          <p>按天编排景点,自动生成行程单,收藏喜爱的景点</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  min-height: 520px;
  display: flex;
  align-items: center;
  overflow: visible;
}
.hero-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #667eea 0%, #ff6b35 100%);
  opacity: 0.95;
}
.hero-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #667eea66, #ff6b3566);
}
.hero-content {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
}
.hero-title {
  font-size: clamp(26px, 5vw, 38px);
  color: #fff;
  font-weight: 800;
  text-shadow: 0 2px 10px rgba(0,0,0,0.3);
  margin-bottom: 12px;
}
.hero-sub {
  font-size: clamp(13px, 2.5vw, 16px);
  color: rgba(255,255,255,0.95);
  margin-bottom: 28px;
  text-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.plan-card {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
}
.plan-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
.plan-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  margin-bottom: 20px;
  align-items: end;
}
.plan-field .ps-label {
  display: block;
  font-size: 13px;
  color: var(--text-light);
  margin-bottom: 6px;
  font-weight: 600;
}
.plan-actions {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  flex-wrap: wrap;
}
.btn-locate {
  background: #f5f7fa;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}
.btn-locate:hover { border-color: var(--primary); color: var(--primary); }
.btn-start { flex: 1; min-width: 200px; font-size: 16px; padding: 12px 24px; }

.section-title {
  font-size: 24px;
  font-weight: 800;
  margin-bottom: 4px;
}
.section-desc {
  color: var(--text-light);
  font-size: 14px;
  margin-bottom: 20px;
}
.city-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.city-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.city-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.city-img-wrap {
  position: relative;
  height: 140px;
  overflow: hidden;
}
.city-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s;
}
.city-img-bg {
  width: 100%;
  height: 100%;
  transition: transform 0.4s;
}
.city-img-skeleton {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}
@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.city-card:hover .city-img,
.city-card:hover .city-img-bg { transform: scale(1.08); }
.city-name {
  position: absolute;
  left: 0; bottom: 0;
  width: 100%;
  padding: 18px 14px 10px;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(transparent, rgba(0,0,0,0.7));
}
.city-desc {
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text-light);
}
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.feature-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow);
  text-align: center;
}
.f-icon { font-size: 40px; margin-bottom: 12px; }
.feature-card h3 { font-size: 17px; margin-bottom: 8px; }
.feature-card p { font-size: 13px; color: var(--text-light); line-height: 1.6; }

@media (max-width: 640px) {
  .hero { min-height: auto; padding: 20px 0; }
  .hero-content { padding: 24px 16px; }
  .plan-card { padding: 16px; border-radius: 12px; }
  .plan-grid, .plan-row { grid-template-columns: 1fr; gap: 12px; }
  .plan-actions { flex-direction: column; }
  .btn-locate, .btn-start { width: 100%; min-width: unset; }
  .city-grid { grid-template-columns: 1fr; gap: 12px; }
  .city-img-wrap { height: 160px; }
  .section-title { font-size: 20px; }
  .feature-grid { grid-template-columns: 1fr; gap: 12px; }
  .feature-card { padding: 20px 16px; }
  .f-icon { font-size: 32px; }
}
@media (max-width: 768px) {
  .plan-card { padding: 20px; }
  .city-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  .feature-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
}
</style>
