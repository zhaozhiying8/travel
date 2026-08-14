<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTripStore } from '../store/trip'
import { fetchBaikeData } from '../services/baikeService'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const trip = useTripStore()

const loading = ref(true)
const detail = ref(null)
const baikeImages = ref([])
const baikeTicket = ref('')
const baikeOpenTime = ref('')
const activeImgIndex = ref(0)
const imgErrors = ref({})
let carouselTimer = null

// 行程选择对话框
const showTripDialog = ref(false)
const selectedTripId = ref(null)

// 当前景点（从trip store获取）
const attraction = computed(() => {
  const stored = trip.selectedAttraction
  if (stored) return stored
  // 如果没有store数据，从收藏/行程中找
  const name = route.query.name
  if (name) {
    const fav = trip.favorites.find(f => f.name === name)
    if (fav) return fav
    const plan = trip.plans.find(p => p.attraction?.name === name)
    if (plan) return plan.attraction
  }
  return null
})

const cityName = computed(() => attraction.value?.city || '')

// 收集所有图片（REST API + 百度百科）
const allImages = computed(() => {
  const imgs = []
  // 先加 REST API 返回的 images
  if (attraction.value?.images) {
    for (const img of attraction.value.images) {
      if (img?.url) imgs.push({ url: img.url, title: img.title || attraction.value.name })
    }
  }
  // 再加百度百科图片
  for (const img of baikeImages.value) {
    if (!imgs.find(i => i.url === img.url)) {
      imgs.push(img)
    }
  }
  // 保底：如果一张图都没有
  if (imgs.length === 0 && attraction.value) {
    imgs.push({ url: '', title: attraction.value.name })
  }
  return imgs.slice(0, 8)
})

// 主图
const mainImage = computed(() => {
  return allImages.value[activeImgIndex.value] || allImages.value[0] || null
})

// 介绍文本（优先 deep_info.introduction，否则用百度百科 description）
const introduction = computed(() => {
  const fullText = attraction.value?.deep_info?.introduction || detail.value?.description || ''
  if (!fullText) return ''
  const text = fullText.replace(/\s+/g, ' ').trim()
  if (text.length <= 30) return text
  return text.substring(0, 30) + '...'
})

// 介绍是否可用
const hasIntroduction = computed(() => {
  return !!(attraction.value?.deep_info?.introduction || detail.value?.description)
})

// 营业时间（优先高德数据，备选百度百科）
const openTime = computed(() => {
  const rawTime = attraction.value?.deep_info?.opentime || ''
  let result = ''
  if (Array.isArray(rawTime)) {
    if (rawTime.length > 0) {
      result = typeof rawTime[0] === 'string' ? rawTime[0] : JSON.stringify(rawTime)
    }
  } else {
    result = String(rawTime)
  }
  if (!result && baikeOpenTime.value) {
    result = baikeOpenTime.value
  }
  return result
})

// 完整地址：省 + 市 + 区县 + 详细地址
const address = computed(() => {
  const a = attraction.value
  if (!a) return ''
  const parts = []
  // 省（直辖市时省名可能与市名相同，需要去重）
  if (a.pname) parts.push(a.pname)
  // 市（避免与省重复，如 北京市/北京市）
  if (a.cityname && a.cityname !== a.pname) parts.push(a.cityname)
  // 区/县（避免与市重复，如 东莞市/东莞市）
  if (a.adname && a.adname !== a.cityname) parts.push(a.adname)
  // 详细街道地址
  if (a.address) parts.push(a.address)
  // 去重（按顺序保留首次出现）
  const seen = new Set()
  const result = []
  for (const p of parts) {
    const key = String(p).replace(/[市区省县]$/, '')
    if (!key) continue
    if (!seen.has(key)) {
      seen.add(key)
      result.push(p)
    }
  }
  return result.join('')
})

// 评分（无评分时显示暂无评分）
const rating = computed(() => {
  const rawRating = attraction.value?.biz_ext?.rating || attraction.value?.deep_info?.rating || ''
  if (!rawRating || rawRating === '' || rawRating === '0' || rawRating === '0.0') {
    return ''
  }
  return String(rawRating)
})

// 评分显示文本
const ratingText = computed(() => {
  return rating.value || '暂无评分'
})

// 是否有图片
const hasImage = computed(() => allImages.value.length > 0 && allImages.value[0].url)

// 初始化：加载更多图片和详情
async function loadDetail() {
  if (!attraction.value) {
    loading.value = false
    return
  }

  // 从百度百科补充数据（图片、门票、营业时间）
  const currentImages = attraction.value?.images || []
  if (currentImages.length < 8 || !baikeTicket.value || !baikeOpenTime.value) {
    try {
      const baikeData = await fetchBaikeData(attraction.value.name)
      if (baikeData) {
        // 补充图片
        if (baikeData.images && baikeData.images.length > 0) {
          baikeImages.value = baikeData.images
        }
        // 补充介绍
        if (!attraction.value?.deep_info?.introduction && baikeData.description) {
          detail.value = { description: baikeData.description }
        }
        // 补充门票价格（高德数据为空时使用）
        if (baikeData.ticketPrice) {
          baikeTicket.value = baikeData.ticketPrice
        }
        // 补充营业时间（高德数据为空时使用）
        if (baikeData.openTime) {
          baikeOpenTime.value = baikeData.openTime
        }
      }
    } catch (e) {
      console.warn('加载百度百科详情失败:', e)
    }
  }

  loading.value = false
}

onMounted(async () => {
  await loadDetail()
  startCarousel()
})

onUnmounted(() => {
  stopCarousel()
})

// 图片加载完成后启动轮播
watch(allImages, (imgs) => {
  if (imgs.length > 0) {
    startCarousel()
  }
}, { immediate: true })

// 图片切换
function selectImage(index) {
  activeImgIndex.value = index
  restartCarousel()
}

// 上一张
function prevImage() {
  if (allImages.value.length <= 1) return
  activeImgIndex.value = (activeImgIndex.value - 1 + allImages.value.length) % allImages.value.length
  restartCarousel()
}

// 下一张
function nextImage() {
  if (allImages.value.length <= 1) return
  activeImgIndex.value = (activeImgIndex.value + 1) % allImages.value.length
  restartCarousel()
}

// 启动自动轮播
function startCarousel() {
  stopCarousel()
  if (allImages.value.length > 1) {
    carouselTimer = setInterval(() => {
      activeImgIndex.value = (activeImgIndex.value + 1) % allImages.value.length
    }, 3500)
  }
}

// 停止轮播
function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
}

// 重新启动轮播
function restartCarousel() {
  startCarousel()
}

// 鼠标悬停暂停
function onGalleryHover() {
  stopCarousel()
}

function onGalleryLeave() {
  startCarousel()
}

// 图片加载错误
function handleImgError(url) {
  imgErrors.value[url] = true
}

// 导航
function goToMap() {
  if (attraction.value) {
    trip.selectAttraction({ ...attraction.value, city: cityName.value })
    router.push('/map')
  }
}

// 附近
function goToNearby() {
  if (attraction.value) {
    trip.selectAttraction({ ...attraction.value, city: cityName.value })
    router.push('/nearby')
  }
}

// 加入行程
function addToItinerary() {
  if (attraction.value) {
    const today = new Date().toISOString().split('T')[0]
    const city = cityName.value
    
    // 如果有多个行程，显示选择对话框
    if (trip.trips.length > 1) {
      selectedTripId.value = trip.activeTripId
      showTripDialog.value = true
      return
    }
    
    // 添加行程（trip.js中的addPlan会自动处理日期连续性）
    const result = trip.addPlan({
      title: attraction.value.name,
      type: 'attraction',
      destination: city,
      attraction: { ...attraction.value, city: city },
      startDate: today,
      endDate: today,
      note: introduction.value
    })
    
    if (result.success) {
      ElMessage.success(`已将「${attraction.value.name}」加入行程`)
    } else if (result.reason === 'duplicate') {
      ElMessage.warning('该行程已存在，请勿重复添加')
    }
  }
}

// 确认选择行程
function confirmAddToTrip() {
  showTripDialog.value = false
  const targetTrip = trip.trips.find(t => t.id === selectedTripId.value)
  if (!targetTrip) return
  
  // 切换到目标行程
  trip.setActiveTrip(selectedTripId.value)
  
  const today = new Date().toISOString().split('T')[0]
  const city = cityName.value
  
  // 添加行程（trip.js中的addPlan会自动处理日期连续性）
  const result = trip.addPlan({
    title: attraction.value.name,
    type: 'attraction',
    destination: city,
    attraction: { ...attraction.value, city: city },
    startDate: today,
    endDate: today,
    note: introduction.value
  })
  
  if (result.success) {
    ElMessage.success(`已将「${attraction.value.name}」加入行程`)
  } else if (result.reason === 'duplicate') {
    ElMessage.warning('该行程已存在，请勿重复添加')
  }
}

// 收藏/取消收藏
function toggleFav() {
  if (attraction.value) {
    trip.toggleFavorite({ ...attraction.value, city: cityName.value })
    ElMessage.success(trip.isFavorite(attraction.value.name) ? '已取消收藏' : '已收藏')
  }
}

// 打开高德导航
function openAmapNavigation() {
  if (attraction.value) {
    const lng = attraction.value.lng
    const lat = attraction.value.lat
    if (lng && lat) {
      window.open(`https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(attraction.value.name)}&mode=car`, '_blank')
    } else {
      ElMessage.warning('该景点暂无坐标信息')
    }
  }
}
</script>

<template>
  <div class="detail-page">
    <!-- 返回按钮 -->
    <div class="top-bar">
      <button class="back-btn" @click="router.back()">← 返回</button>
      <button
        class="fav-toggle"
        :class="{ active: attraction && trip.isFavorite(attraction.name) }"
        @click="toggleFav"
      >
        {{ attraction && trip.isFavorite(attraction.name) ? '❤️' : '🤍' }}
      </button>
    </div>

    <div v-if="loading" class="loading-box">
      <span class="spinner"></span>
      加载中...
    </div>

    <div v-else-if="!attraction" class="empty-box">
      <div class="icon">🗺️</div>
      <p>未找到景点信息</p>
      <button class="back-btn" @click="router.back()">返回</button>
    </div>

    <template v-else>
      <!-- 图片展示区 - 轮播图 -->
      <div class="gallery" @mouseenter="onGalleryHover" @mouseleave="onGalleryLeave">
        <div class="carousel-wrap">
          <!-- 滑动容器 -->
          <div 
            class="carousel-track"
            :style="{ transform: `translateX(-${activeImgIndex * 100}%)` }"
          >
            <div 
              v-for="(img, i) in allImages" 
              :key="i" 
              class="carousel-slide"
            >
              <img
                v-if="img.url && !imgErrors[img.url]"
                :src="img.url"
                :alt="attraction.name"
                @error="handleImgError(img.url)"
              />
              <div v-else class="img-placeholder-lg">
                <span class="ph-icon-lg">🏛️</span>
                <span class="ph-text-lg">{{ attraction.name }}</span>
              </div>
            </div>
          </div>

          <!-- 评分标签 -->
          <div class="rating-big">{{ rating ? '⭐ ' + rating : ratingText }}</div>

          <!-- 左右箭头 -->
          <button 
            v-if="allImages.length > 1" 
            class="carousel-arrow prev"
            @click="prevImage"
          >‹</button>
          <button 
            v-if="allImages.length > 1" 
            class="carousel-arrow next"
            @click="nextImage"
          >›</button>

          <!-- 指示点 -->
          <div v-if="allImages.length > 1" class="carousel-dots">
            <span 
              v-for="(img, i) in allImages" 
              :key="i" 
              class="dot"
              :class="{ active: i === activeImgIndex }"
              @click="selectImage(i)"
            ></span>
          </div>

          <!-- 图片计数 -->
          <div v-if="allImages.length > 1" class="carousel-count">
            {{ activeImgIndex + 1 }} / {{ allImages.length }}
          </div>
        </div>

        <!-- 缩略图 -->
        <div v-if="allImages.length > 1" class="thumbs">
          <div
            v-for="(img, i) in allImages"
            :key="i"
            class="thumb"
            :class="{ active: i === activeImgIndex }"
            @click="selectImage(i)"
          >
            <img
              v-if="img.url && !imgErrors[img.url]"
              :src="img.url"
              :alt="''"
              @error="handleImgError(img.url)"
            />
            <div v-else class="thumb-placeholder">🏛️</div>
          </div>
        </div>
      </div>

      <!-- 景点信息 -->
      <div class="info-section">
        <h1 class="attr-title">{{ attraction.name }}</h1>
        <div class="attr-tags">
          <span v-if="attraction.type" class="attr-type-tag">{{ attraction.type }}</span>
          <span v-if="cityName" class="attr-city-tag">📍 {{ cityName }}</span>
        </div>

        <!-- 关键信息卡片 -->
        <div class="info-cards">
          <div v-if="address || cityName" class="info-card">
            <div class="info-icon">📍</div>
            <div class="info-content">
              <div class="info-label">具体位置</div>
              <div class="info-value">{{ address || cityName }}</div>
            </div>
            <button 
              v-if="attraction.lng && attraction.lat" 
              class="info-action"
              @click="goToMap"
            >导航</button>
          </div>

          <div v-if="openTime" class="info-card">
            <div class="info-icon">🕐</div>
            <div class="info-content">
              <div class="info-label">营业时间</div>
              <div class="info-value">{{ openTime }}</div>
            </div>
          </div>
        </div>

        <!-- 详细介绍 -->
        <div class="intro-section">
          <h2>📖 景点介绍</h2>
          <p class="intro-text">{{ hasIntroduction ? introduction : '暂无介绍信息' }}</p>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-bar">
        <button class="action-btn primary" @click="goToMap">
          <span class="btn-icon">🗺️</span>
          <span>导航</span>
        </button>
        <button class="action-btn" @click="goToNearby">
          <span class="btn-icon">🏨</span>
          <span>附近</span>
        </button>
        <button class="action-btn" @click="addToItinerary">
          <span class="btn-icon">📋</span>
          <span>加入行程</span>
        </button>
        <button class="action-btn" @click="openAmapNavigation">
          <span class="btn-icon">🧭</span>
          <span>高德导航</span>
        </button>
      </div>
    </template>
  </div>

  <!-- 行程选择对话框 -->
  <el-dialog
    v-model="showTripDialog"
    title="选择要加入的行程"
    width="90%"
    max-width="360px"
    :close-on-click-modal="false"
    align-center
  >
    <div style="margin-bottom:12px;color:#666;font-size:13px;">
      请选择要将「{{ attraction?.name || '该景点' }}」加入到哪个行程：
    </div>
    <div class="trip-select-list">
      <div
        v-for="t in trip.trips"
        :key="t.id"
        class="trip-select-item"
        :class="{ active: selectedTripId === t.id }"
        @click="selectedTripId = t.id"
      >
        <input
          type="radio"
          :value="t.id"
          v-model="selectedTripId"
          style="margin-right:8px;"
        />
        <div class="trip-info">
          <div class="trip-name">
            {{ t.destination?.city || t.destination?.name || '我的行程' }}
            <span v-if="t.id === trip.activeTripId" class="trip-active-tag">(当前行程)</span>
          </div>
          <div class="trip-date">
            {{ t.startDate ? `${t.startDate} ~ ${t.endDate || t.startDate}` : '无日期' }}
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <button class="btn-cancel" @click="showTripDialog = false">取消</button>
        <button class="btn-confirm" @click="confirmAddToTrip">加入行程</button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.detail-page {
  min-height: 100vh;
  background: #f5f7fa;
  padding-bottom: 80px;
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #eee;
}

.back-btn {
  background: none;
  border: none;
  font-size: 15px;
  color: #333;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 6px;
}
.back-btn:hover { background: #f0f0f0; }

.fav-toggle {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  transition: transform 0.2s;
}
.fav-toggle.active { transform: scale(1.2); }

.loading-box, .empty-box {
  text-align: center;
  padding: 80px 20px;
  color: #999;
}
.loading-box .spinner {
  display: inline-block;
  width: 24px;
  height: 24px;
  border: 3px solid #eee;
  border-top-color: #ff6b35;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-box .icon { font-size: 64px; margin-bottom: 12px; }

.gallery {
  background: #fff;
}

.carousel-wrap {
  position: relative;
  width: 100%;
  height: 260px;
  overflow: hidden;
  background: #f0f2f5;
}

.carousel-track {
  display: flex;
  width: 100%;
  height: 100%;
  transition: transform 0.5s ease;
}

.carousel-slide {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #667eea33, #ff6b3533);
  display: flex;
  align-items: center;
  justify-content: center;
}

.carousel-slide img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}

.img-placeholder-lg {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea22, #ff6b3522);
  gap: 12px;
}
.ph-icon-lg { font-size: 64px; opacity: 0.6; }
.ph-text-lg { font-size: 15px; color: #666; }

.rating-big {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(0,0,0,0.65);
  color: #ffd700;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 700;
  z-index: 5;
}

.carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background: rgba(0,0,0,0.45);
  color: #fff;
  border: none;
  font-size: 24px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
  z-index: 5;
  transition: background 0.2s;
}
.carousel-arrow:hover { background: rgba(0,0,0,0.7); }
.carousel-arrow.prev { left: 12px; }
.carousel-arrow.next { right: 12px; }

.carousel-dots {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  z-index: 5;
}
.carousel-dots .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.2s;
}
.carousel-dots .dot.active {
  background: #fff;
  width: 20px;
  border-radius: 4px;
}

.carousel-count {
  position: absolute;
  bottom: 12px;
  right: 16px;
  background: rgba(0,0,0,0.5);
  color: #fff;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  z-index: 5;
}

.thumbs {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.thumbs::-webkit-scrollbar { display: none; }

.thumb {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s;
  background: #f0f0f0;
}
.thumb.active { border-color: #ff6b35; }
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  font-size: 20px;
}

.info-section {
  padding: 20px 16px;
}

.attr-title {
  font-size: 26px;
  font-weight: 800;
  margin-bottom: 8px;
  color: #222;
}

.attr-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.attr-type-tag {
  background: #f0f0f0;
  color: #666;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.attr-city-tag {
  background: #fff3ee;
  color: #ff6b35;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
}

.info-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.info-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.info-action {
  flex-shrink: 0;
  padding: 6px 16px;
  background: #ff6b35;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
.info-action:hover { background: #e55a2b; }

.info-icon {
  font-size: 22px;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border-radius: 8px;
}

.info-content {
  flex: 1;
  min-width: 0;
}

.info-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 2px;
}

.info-value {
  font-size: 14px;
  color: #333;
  line-height: 1.5;
  word-break: break-all;
}
.info-value.free { color: #4caf50; font-weight: 600; }

.intro-section {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.intro-section h2 {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
  color: #333;
}

.intro-text {
  font-size: 14px;
  color: #555;
  line-height: 1.8;
  white-space: pre-wrap;
}

.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(255,255,255,0.97);
  backdrop-filter: blur(8px);
  border-top: 1px solid #eee;
  z-index: 100;
}

.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px 4px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  cursor: pointer;
  font-size: 12px;
  color: #555;
  transition: all 0.15s;
  min-height: 52px;
}
.action-btn:hover { border-color: #ff6b35; color: #ff6b35; }
.action-btn.primary {
  background: #ff6b35;
  color: #fff;
  border-color: #ff6b35;
}
.action-btn.primary:hover { background: #e55a2b; border-color: #e55a2b; }

.btn-icon { font-size: 18px; }

@media (max-width: 640px) {
  .carousel-wrap { height: 220px; }
  .attr-title { font-size: 22px; }
  .info-card { padding: 12px; }
  .action-btn { font-size: 11px; padding: 8px 2px; min-height: 48px; }
  .btn-icon { font-size: 16px; }
  .carousel-arrow { width: 32px; height: 32px; font-size: 20px; }
  .thumbs { padding: 10px 12px; }
  .thumb { width: 50px; height: 50px; }
}

/* 行程选择对话框样式 */
.trip-select-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.trip-select-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.trip-select-item.active {
  border-color: #ff6b35;
  background: #fff9f5;
}

.trip-info {
  flex: 1;
  min-width: 0;
}

.trip-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.trip-active-tag {
  color: #ff6b35;
  font-size: 12px;
  font-weight: 500;
}

.trip-date {
  font-size: 12px;
  color: #999;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
}

.btn-cancel:hover {
  background: #f5f5f5;
}

.btn-confirm {
  background: #ff6b35;
  border: none;
  border-radius: 6px;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 14px;
  color: #fff;
}

.btn-confirm:hover {
  background: #e55a2b;
}
</style>
