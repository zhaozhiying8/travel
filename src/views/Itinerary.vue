<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../store/trip'
import { formatDate, getAttractionImage } from '../utils/format'
import { loadAmap } from '../utils/amap'
import { searchAttractionsByKeyword } from '../services/attractionService'
import { ElMessage, ElMessageBox } from 'element-plus'

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

const showAdd = ref(false)
const addFormRef = ref(null)
const editFormRef = ref(null)
const addForm = ref({
  title: '',
  type: 'attraction',
  startDate: '',
  endDate: '',
  city: '',
  address: '',
  note: ''
})

// 重置添加表单（保留类型字段）
function resetAddForm() {
  const currentType = addForm.value.type
  addForm.value = {
    title: '',
    type: currentType || 'attraction',
    startDate: '',
    endDate: '',
    city: '',
    address: '',
    note: ''
  }
  addFormRef.value?.clearValidate()
}

// 打开添加对话框
function openAddDialog() {
  resetAddForm()
  showAdd.value = true
}

// 新建行程（创建一个空的新行程）
function createNewTrip() {
  trip.createTrip({
    origin: null,
    destination: null,
    startDate: null,
    endDate: null,
    travelers: 2
  })
  ElMessage.success('已创建新行程，请添加景点')
}

// 必填校验规则
const formRules = {
  title: [
    { required: true, message: '请输入行程标题', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择类型', trigger: 'change' }
  ],
  startDate: [
    { required: true, message: '请选择开始日期', trigger: 'change' }
  ],
  endDate: [
    { required: true, message: '请选择结束日期', trigger: 'change' },
    {
      validator: (rule, value, callback) => {
        const start = addFormRef.value?.modelValue?.startDate || addForm.value.startDate
        const end = value
        if (start && end && new Date(end) < new Date(start)) {
          callback(new Error('结束日期不能早于开始日期'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ],
  city: [
    { required: true, message: '请输入所在城市', trigger: 'blur' }
  ]
}

// 编辑行程项
const showEdit = ref(false)
const editingPlan = ref(null)
const editForm = ref({
  title: '',
  type: 'attraction',
  startDate: '',
  endDate: '',
  city: '',
  address: '',
  note: ''
})

// 重置编辑表单（保留类型字段）
function resetEditForm() {
  const currentType = editForm.value.type
  editForm.value = {
    title: '',
    type: currentType || 'attraction',
    startDate: '',
    endDate: '',
    city: '',
    address: '',
    note: ''
  }
  editFormRef.value?.clearValidate()
}

function openEdit(plan) {
  editingPlan.value = plan
  editForm.value = {
    title: plan.title,
    type: plan.type,
    startDate: plan.startDate || plan.date || '',
    endDate: plan.endDate || plan.startDate || plan.date || '',
    city: plan.destination || plan.city || '',
    address: plan.address || plan.attraction?.address || '',
    note: plan.note || ''
  }
  showEdit.value = true
}

// 类型选项
const typeOptions = [
  { value: 'attraction', label: '景点', icon: '🎯' },
  { value: 'hotel', label: '住宿', icon: '🏨' },
  { value: 'food', label: '美食', icon: '🍜' },
  { value: 'transport', label: '交通', icon: '🚗' },
  { value: 'other', label: '其他', icon: '📌' }
]

// 按日期分组行程（仅显示当前活动行程的计划）
const groupedPlans = computed(() => {
  const groups = {}
  const currentPlans = trip.plans.filter(p => p.tripId === trip.activeTripId)
  currentPlans.forEach(p => {
    const key = p.startDate || p.date || '未安排日期'
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  })
  // 按日期排序
  return Object.keys(groups).sort().map(key => ({
    date: key,
    items: groups[key].sort((a, b) => (a.startDate || a.date || '').localeCompare(b.startDate || b.date || ''))
  }))
})

// 已安排日期数
const plannedDays = computed(() => groupedPlans.value.filter(g => g.date !== '未安排日期').length)

// 行程概览
const hasTrip = computed(() => trip.trips.length > 0)

// 计算单个行程的天数（基于开始和结束日期，或从行程项中计算）
function calculateTripDays(tripItem) {
  // 优先使用行程本身的日期
  if (tripItem.startDate && tripItem.endDate) {
    const start = new Date(tripItem.startDate)
    const end = new Date(tripItem.endDate)
    const diff = end - start
    return Math.max(1, Math.round(diff / 86400000) + 1)
  }
  
  // 如果行程没有日期，从行程项中计算
  const plans = trip.plans.filter(p => p.tripId === tripItem.id)
  if (plans.length === 0) return 0
  
  let minDate = null
  let maxDate = null
  
  plans.forEach(p => {
    const sd = p.startDate || p.date
    const ed = p.endDate || sd
    if (sd) {
      if (!minDate || sd < minDate) minDate = sd
      if (!maxDate || ed > maxDate) maxDate = ed
    }
  })
  
  if (!minDate || !maxDate) return 1
  
  const start = new Date(minDate)
  const end = new Date(maxDate)
  const diff = end - start
  return Math.max(1, Math.round(diff / 86400000) + 1)
}

// 计算单个行程的统计
function getTripStats(tripItem) {
  const plans = trip.plans.filter(p => p.tripId === tripItem.id)
  // 已安排天：行程项实际覆盖的天数
  const planDates = new Set()
  plans.forEach(p => {
    const sd = p.startDate || p.date || ''
    const ed = p.endDate || sd
    if (sd) {
      planDates.add(sd.slice(0, 10))
      // 如果有结束日期且不同于开始日期，计算中间天数
      if (ed && ed !== sd) {
        let cur = new Date(sd)
        const end = new Date(ed)
        while (cur < end) {
          cur.setDate(cur.getDate() + 1)
          planDates.add(cur.toISOString().slice(0, 10))
        }
      }
    }
  })
  return {
    planCount: plans.length,
    plannedDays: planDates.size,
    favoritesCount: trip.favorites.length
  }
}

// 删除整个行程
function clearAllTrip() {
  if (trip.trips.length <= 1) {
    ElMessageBox.confirm('确定删除整个行程吗？这将清除所有行程信息。', '删除行程', { 
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消'
    })
      .then(() => {
        trip.deleteTrip(trip.activeTripId)
        ElMessage.success('行程已删除')
      })
      .catch(() => {})
  } else {
    ElMessageBox.confirm('确定删除这个行程吗？', '删除行程', { 
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消'
    })
      .then(() => {
        trip.deleteTrip(trip.activeTripId)
        ElMessage.success('行程已删除')
      })
      .catch(() => {})
  }
}

// 切换活动行程
function switchTrip(tripId) {
  trip.setActiveTrip(tripId)
}

function typeIcon(type) {
  return typeOptions.find(t => t.value === type)?.icon || '📌'
}

function typeLabel(type) {
  return typeOptions.find(t => t.value === type)?.label || '其他'
}

// 根据名称和城市查找景点（用于获取图片等信息）
async function lookupAttraction(name, city) {
  if (!name) return null
  try {
    // 优先用指定城市搜索，否则用全国搜索
    const searchCity = city || '全国'
    const results = await searchAttractionsByKeyword(searchCity, name)
    // 精确匹配名称
    const exact = results.find(r => r.name === name)
    if (exact) return exact
    // 模糊匹配（包含关系）
    const fuzzy = results.find(r => r.name && (r.name.includes(name) || name.includes(r.name)))
    return fuzzy || null
  } catch (e) {
    console.warn('查找景点失败:', e)
    return null
  }
}

// 自动补全城市：输入景点名称后自动查询所在城市
let cityLookupTimer = null
function autoFillCity(form, type) {
  if (type !== 'attraction') return
  const name = form.title?.trim()
  if (!name || name.length < 2) return
  
  if (cityLookupTimer) clearTimeout(cityLookupTimer)
  cityLookupTimer = setTimeout(async () => {
    const attraction = await lookupAttraction(name, form.city)
    if (attraction) {
      // 从 cityname 或 adname 或 address 中提取城市名
      const city = attraction.cityname || attraction.adname || extractCityFromAddress(attraction.address)
      if (city) {
        form.city = city
      }
      // 如果有地址信息也一并填入
      if (attraction.address) {
        form.address = attraction.address
      }
    }
  }, 500)
}

// 从地址字符串中提取城市名
function extractCityFromAddress(address) {
  if (!address) return ''
  // 尝试提取"XX市"、"XX省"、"XX区"等
  const match = address.match(/([\u4e00-\u9fa5]+?(市|省|自治区|特别行政区|自治州))/)
  if (match) return match[1]
  // 如果没有明显城市标识，返回地址前2-4个字
  if (address.length >= 2) return address.substring(0, 4)
  return address
}

// 添加自定义行程项
async function handleAdd() {
  if (!addFormRef.value) return
  try {
    await addFormRef.value.validate()
  } catch {
    ElMessage.warning('请完善必填信息')
    return
  }
  if (new Date(addForm.value.endDate) < new Date(addForm.value.startDate)) {
    ElMessage.warning('结束日期不能早于开始日期')
    return
  }

  // 查找景点信息（仅景点类型）
  let attractionData = null
  if (addForm.value.type === 'attraction') {
    attractionData = await lookupAttraction(addForm.value.title, addForm.value.city)
    if (!attractionData) {
      ElMessage.error(`未找到「${addForm.value.title}」的景点信息，请检查景点名称是否正确`)
      return
    }
    // 如果城市为空，自动从景点数据中获取
    if (!addForm.value.city) {
      addForm.value.city = attractionData.cityname || attractionData.adname || extractCityFromAddress(attractionData.address)
    }
  }

  const result = trip.addPlan({
    title: addForm.value.title,
    type: addForm.value.type,
    startDate: addForm.value.startDate,
    endDate: addForm.value.endDate,
    date: addForm.value.startDate,
    destination: addForm.value.city,
    address: addForm.value.address || attractionData?.address || '',
    attraction: attractionData,
    note: addForm.value.note
  })
  if (result.success === false && result.reason === 'duplicate') {
    ElMessage.warning(`「${addForm.value.title}」该日期的行程已存在，请勿重复添加`)
    return
  }
  ElMessage.success('已添加到行程')
  showAdd.value = false
  resetAddForm()
}

// 编辑保存
async function handleEdit() {
  if (!editingPlan.value || !editFormRef.value) return
  try {
    await editFormRef.value.validate()
  } catch {
    ElMessage.warning('请完善必填信息')
    return
  }
  if (new Date(editForm.value.endDate) < new Date(editForm.value.startDate)) {
    ElMessage.warning('结束日期不能早于开始日期')
    return
  }

  // 查找景点信息（仅景点类型，且名称或城市有变更时）
  let attractionData = editingPlan.value.attraction
  if (editForm.value.type === 'attraction') {
    const nameChanged = editForm.value.title !== editingPlan.value.attraction?.name
    const cityChanged = editForm.value.city !== (editingPlan.value.destination || editingPlan.value.attraction?.city)
    if (nameChanged || cityChanged || !attractionData) {
      const newLookup = await lookupAttraction(editForm.value.title, editForm.value.city)
      if (!newLookup) {
        ElMessage.error(`未找到「${editForm.value.title}」的景点信息，请检查景点名称是否正确`)
        return
      }
      attractionData = newLookup
      // 如果城市为空，自动从景点数据中获取
      if (!editForm.value.city) {
        editForm.value.city = newLookup.cityname || newLookup.adname || extractCityFromAddress(newLookup.address)
      }
    }
  }

  // 编辑时重复校验：排除当前编辑项自身
  if (trip.isPlanDuplicate(
    editingPlan.value.tripId,
    editForm.value.title,
    editForm.value.startDate,
    editForm.value.endDate,
    editingPlan.value.id
  )) {
    ElMessage.warning(`「${editForm.value.title}」该日期的行程已存在，请勿重复添加`)
    return
  }

  trip.updatePlan(editingPlan.value.id, {
    title: editForm.value.title,
    type: editForm.value.type,
    startDate: editForm.value.startDate,
    endDate: editForm.value.endDate,
    date: editForm.value.startDate,
    destination: editForm.value.city,
    address: editForm.value.address || attractionData?.address || '',
    attraction: attractionData,
    note: editForm.value.note
  })
  ElMessage.success('已更新')
  showEdit.value = false
  editingPlan.value = null
  resetEditForm()
}

// 从收藏列表直接添加到行程
function addFavToTrip(fav) {
  const date = trip.startDate || ''
  const result = trip.addPlan({
    title: fav.name,
    type: 'attraction',
    attraction: fav,
    destination: fav.city || '',
    startDate: date,
    endDate: date,
    date: date,
    note: fav.desc
  })
  if (result.success === false && result.reason === 'duplicate') {
    ElMessage.warning(`「${fav.name}」该日期的行程已存在，请勿重复添加`)
    return
  }
  ElMessage.success('已加入行程')
}

// 删除
function removePlan(id, name) {
  ElMessageBox.confirm(`确定删除「${name}」吗?`, '提示', { type: 'warning' })
    .then(() => {
      trip.removePlan(id)
      ElMessage.success('已删除')
    })
    .catch(() => {})
}

// 去导航（支持从景点或手动添加的地址）
async function goToNav(plan) {
  const coord = getPlanCoord(plan)
  if (!coord) {
    // 如果没有坐标但有地址，尝试解析
    if (plan.address || plan.destination) {
      try {
        const lnglat = await geocodeAddress(plan.destination || '', plan.address || plan.title)
        if (lnglat) {
          navigateWithCoord(plan, lnglat)
          return
        }
      } catch (e) { /* 继续报错 */ }
    }
    ElMessage.info('该项没有位置信息,无法导航')
    return
  }
  navigateWithCoord(plan, coord)
}

// 去附近
async function goNearby(plan) {
  const coord = getPlanCoord(plan)
  if (!coord) {
    if (plan.address || plan.destination) {
      try {
        const lnglat = await geocodeAddress(plan.destination || '', plan.address || plan.title)
        if (lnglat) {
          nearbyWithCoord(plan, lnglat)
          return
        }
      } catch (e) { /* 继续报错 */ }
    }
    ElMessage.info('该项没有位置信息')
    return
  }
  nearbyWithCoord(plan, coord)
}

// 从行程项获取坐标
function getPlanCoord(plan) {
  if (plan.attraction?.lng && plan.attraction?.lat) return plan.attraction
  if (plan.lng && plan.lat) return { lng: plan.lng, lat: plan.lat, name: plan.title, address: plan.address }
  return null
}

// 用坐标导航
function navigateWithCoord(plan, coord) {
  const target = {
    name: plan.attraction?.name || plan.title,
    address: plan.address || plan.destination || plan.attraction?.address || '',
    lng: coord.lng,
    lat: coord.lat,
    city: plan.destination || plan.attraction?.city || ''
  }
  trip.selectAttraction(target)
  router.push('/map')
}

// 用坐标查附近
function nearbyWithCoord(plan, coord) {
  const target = {
    name: plan.attraction?.name || plan.title,
    address: plan.address || plan.destination || plan.attraction?.address || '',
    lng: coord.lng,
    lat: coord.lat,
    city: plan.destination || plan.attraction?.city || ''
  }
  trip.selectAttraction(target)
  router.push('/nearby')
}

// 高德地理编码：地址 → 经纬度
let geocoder = null
async function geocodeAddress(city, address) {
  if (!address) return null
  try {
    const AMap = await loadAmap()
    return new Promise((resolve) => {
      if (!geocoder) {
        geocoder = new AMap.Geocoder({
          city: city || '全国'
        })
      }
      const fullAddress = [city, address].filter(Boolean).join('')
      geocoder.getLocation(fullAddress, (status, result) => {
        if (status === 'complete' && result?.geocodes?.length) {
          const g = result.geocodes[0]
          resolve({ lng: g.location.lng, lat: g.location.lat })
        } else {
          resolve(null)
        }
      })
    })
  } catch (e) {
    console.warn('地理编码失败:', e)
    return null
  }
}

// 清空行程
function clearAll() {
  ElMessageBox.confirm('确定清空所有行程吗?此操作不可恢复', '清空行程', { type: 'warning' })
    .then(() => {
      trip.plans.forEach(p => trip.removePlan(p.id))
      ElMessage.success('已清空')
    })
    .catch(() => {})
}

// 打印行程单
function printItinerary() {
  window.print()
}

// 分享行程
function shareItinerary() {
  if (!trip.planCount) return ElMessage.warning('还没有行程可分享')
  
  // 生成行程文本
  let text = `🧳 我的旅行计划\n`
  text += `━━━━━━━━━━━━\n`
  if (trip.destination) {
    text += `🏷️ 目的地：${trip.destination.city || trip.destination.name}\n`
  }
  if (trip.startDate && trip.endDate) {
    text += `📅 日期：${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)}（${trip.tripDays}天）\n`
  }
  if (trip.travelers) {
    text += `👥 人数：${trip.travelers}人\n`
  }
  text += `\n📋 行程安排：\n`
  
  groupedPlans.value.forEach(group => {
    text += `\n📅 ${group.date === '未安排日期' ? '未安排日期' : group.date}（${group.items.length}项）\n`
    group.items.forEach((item, idx) => {
      const dateRange = item.startDate && item.endDate && item.startDate !== item.endDate
        ? `${item.startDate.slice(5)}→${item.endDate.slice(5)}`
        : (item.startDate || item.date || '')
      text += `  ${idx + 1}. ${dateRange ? '📅' + dateRange + ' ' : ''}${item.title}（${typeLabel(item.type)}）\n`
      if (item.note) text += `     📝 ${item.note}\n`
    })
  })
  
  text += `\n——来自「悠游」旅游规划平台——`
  
  // 尝试使用 Web Share API
  if (navigator.share) {
    navigator.share({
      title: '我的旅行计划',
      text: text
    }).catch(() => {
      // 用户取消或失败，回退到复制
      copyToClipboard(text)
    })
  } else {
    // 回退到复制到剪贴板
    copyToClipboard(text)
  }
}

// 复制到剪贴板
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      ElMessage.success('行程已复制到剪贴板，可粘贴分享给朋友')
    }).catch(() => {
      fallbackCopy(text)
    })
  } else {
    fallbackCopy(text)
  }
}

// 兼容旧浏览器的复制方式
function fallbackCopy(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
    ElMessage.success('行程已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
  document.body.removeChild(textarea)
}

// 日期格式化友好
function friendlyDate(date) {
  if (date === '未安排日期') return date
  const d = new Date(date)
  const week = ['日','一','二','三','四','五','六'][d.getDay()]
  return `${formatDate(date)} 周${week}`
}

// 获取行程的显示日期（优先使用行程本身的日期，否则从行程项计算）
function getTripDateRange(tripItem) {
  if (tripItem.startDate && tripItem.endDate) {
    return { start: tripItem.startDate, end: tripItem.endDate }
  }
  
  // 从行程项中计算
  const plans = trip.plans.filter(p => p.tripId === tripItem.id)
  if (plans.length === 0) return { start: null, end: null }
  
  let minDate = null
  let maxDate = null
  
  plans.forEach(p => {
    const sd = p.startDate || p.date
    const ed = p.endDate || sd
    if (sd) {
      if (!minDate || sd < minDate) minDate = sd
      if (!maxDate || ed > maxDate) maxDate = ed
    }
  })
  
  return { start: minDate, end: maxDate || minDate }
}
</script>

<template>
  <div class="page">
    <!-- 行程列表 -->
    <div class="trips-list" v-if="hasTrip">
      <div
        v-for="tripItem in trip.trips"
        :key="tripItem.id"
        class="overview card trip-card"
        :class="{ active: tripItem.id === trip.activeTripId }"
        @click="switchTrip(tripItem.id)"
      >
        <div class="ov-header">
          <div class="ov-title-wrap">
            <h2 class="ov-title">📋 {{ tripItem.destination?.city || tripItem.destination?.name || '我的行程' }}</h2>
            <span v-if="tripItem.id === trip.activeTripId" class="trip-active-badge">当前行程</span>
          </div>
          <button class="ov-del-card-btn" @click.stop="clearAllTrip" title="删除这个行程">🗑️</button>
        </div>
        <div class="ov-body">
          <div class="ov-info-list">
            <div class="ov-info-row">
              <span class="info-label">出发地</span>
              <span class="info-value">{{ tripItem.origin?.name || '-' }}</span>
              <span class="info-sep">→</span>
              <span class="info-label">目的地</span>
              <span class="info-value">{{ tripItem.destination?.city || tripItem.destination?.name || '-' }}</span>
            </div>
            <div class="ov-info-row">
              <span class="info-label">日期</span>
              <span class="info-value">
                <template v-if="getTripDateRange(tripItem).start">
                  {{ formatDate(getTripDateRange(tripItem).start) }} ~ {{ formatDate(getTripDateRange(tripItem).end) }}
                </template>
                <template v-else>-</template>
              </span>
            </div>
            <div class="ov-info-row ov-info-inline">
              <div class="info-chip">
                <span class="chip-label">天数</span>
                <span class="chip-value">{{ calculateTripDays(tripItem) }} 天</span>
              </div>
              <div class="info-chip">
                <span class="chip-label">人数</span>
                <span class="chip-value">{{ tripItem.travelers }} 人</span>
              </div>
            </div>
          </div>
          <div class="ov-stats">
            <div class="stat">
              <div class="stat-num">{{ getTripStats(tripItem).planCount }}</div>
              <div class="stat-label">行程项</div>
            </div>
            <div class="stat">
              <div class="stat-num">{{ getTripStats(tripItem).plannedDays }}</div>
              <div class="stat-label">已安排天</div>
            </div>
            <div class="stat">
              <div class="stat-num">{{ trip.favorites.length }}</div>
              <div class="stat-label">收藏景点</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 行程概览（无行程时） -->
    <div class="overview card ov-empty-card" v-else>
      <div class="ov-empty">
        <div class="ov-empty-icon">🗺️</div>
        还未设置行程,去
        <a @click="$router.push('/')">首页</a>
        开始规划吧
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <button class="btn-primary" @click="openAddDialog">＋ 添加行程项</button>
      <button class="btn-ghost" @click="createNewTrip">🆕 新建行程</button>
      <button class="btn-ghost" @click="$router.push('/destination')">🎯 去选景点</button>
      <button class="btn-ghost" :disabled="!trip.planCount" @click="shareItinerary">📤 分享行程</button>
      <button class="btn-ghost" :disabled="!trip.planCount" @click="printItinerary">🖨️ 打印行程单</button>
      <button class="btn-danger" :disabled="!trip.planCount" @click="clearAll">🗑️ 清空</button>
    </div>

    <!-- 行程列表(按日分组) -->
    <div v-if="trip.planCount" class="plans">
      <div v-for="group in groupedPlans" :key="group.date" class="day-group card">
        <div class="day-head">
          <span class="day-badge">📅</span>
          <span class="day-date">{{ friendlyDate(group.date) }}</span>
          <span class="day-count">{{ group.items.length }} 项安排</span>
        </div>
        <div class="day-items">
          <div v-for="plan in group.items" :key="plan.id" class="plan-item">
            <!-- 有景点图就显示图片，没有就显示类型占位 -->
            <div class="plan-thumb">
              <template v-if="plan.attraction">
                <img :src="getAttractionImage(plan.attraction) || ''" :alt="plan.title" loading="lazy" @error="$event.target.style.display='none'" />
              </template>
              <template v-else>
                <div class="plan-thumb-placeholder" :class="'type-' + plan.type">
                  <span class="ph-icon">{{ typeIcon(plan.type) }}</span>
                  <span class="ph-label">{{ typeLabel(plan.type) }}</span>
                </div>
              </template>
            </div>
            <div class="plan-date-col">
              <template v-if="plan.startDate && plan.endDate && plan.startDate !== plan.endDate">
                <span class="date-line">{{ plan.startDate.slice(5) }}</span>
                <span class="date-arrow">→</span>
                <span class="date-line">{{ plan.endDate.slice(5) }}</span>
              </template>
              <template v-else>
                <span class="date-line single">{{ (plan.startDate || plan.date || '').slice(5) || '--:--' }}</span>
              </template>
              <span class="type-icon">{{ typeIcon(plan.type) }}</span>
            </div>
            <div class="plan-body">
              <div class="plan-title">{{ plan.title }}</div>
              <div class="plan-meta">
                <span class="meta-type">{{ typeLabel(plan.type) }}</span>
                <span v-if="plan.destination" class="meta-dest">📍 {{ plan.destination }}</span>
                <span v-if="plan.attraction && plan.attraction.address" class="meta-dest">📍 {{ plan.attraction.address }}</span>
                <span v-if="!plan.attraction && plan.address" class="meta-dest">📍 {{ plan.address }}</span>
              </div>
              <div v-if="plan.note" class="plan-note">备注：{{ plan.note }}</div>
              <div class="plan-ops">
                <button
                  v-if="(plan.attraction && plan.attraction.lng) || plan.address || plan.destination"
                  class="op-btn"
                  @click="goToNav(plan)"
                >🗺️ 导航</button>
                <button
                  v-if="(plan.attraction && plan.attraction.lng) || plan.address || plan.destination"
                  class="op-btn"
                  @click="goNearby(plan)"
                >🏨 附近</button>
                <button class="op-btn" @click="openEdit(plan)">✏️ 编辑</button>
                <button class="op-btn danger" @click="removePlan(plan.id, plan.title)">🗑️ 删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-tip card">
      <div class="icon">📝</div>
      <p>还没有行程安排</p>
      <p class="sub">从「目的地」添加景点,或点击上方「添加行程项」手动创建</p>
      <button class="btn-primary" @click="$router.push('/destination')">去浏览景点</button>
    </div>

    <!-- 收藏的景点 -->
    <div v-if="trip.favorites.length" class="favorites">
      <h2 class="section-title">❤️ 我的收藏</h2>
      <div class="fav-grid">
        <div v-for="(fav, i) in trip.favorites" :key="i" class="fav-card card">
          <img :src="getAttractionImage(fav) || ''" :alt="fav.name" loading="lazy" @error="$event.target.style.display='none'" />
          <div class="fav-body">
            <div class="fav-name">{{ fav.name }}</div>
            <div class="fav-desc">{{ fav.desc }}</div>
            <div class="fav-ops">
              <button class="op-btn" @click="trip.selectAttraction(fav); $router.push('/map')">导航</button>
              <button class="op-btn" @click="trip.selectAttraction(fav); $router.push('/nearby')">附近</button>
              <button class="op-btn" @click="addFavToTrip(fav)">＋行程</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加行程对话框 -->
    <el-dialog
      v-model="showAdd"
      width="460px"
      custom-class="plan-dialog-mobile"
      class="mobile-dialog plan-dialog"
      :top="'4vh'"
      align-center
      append-to-body
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="dialog-header">
          <div class="dialog-title-wrap">
            <span class="dialog-title-icon">📋</span>
            <span class="dialog-title-text">添加行程项</span>
          </div>
          <div class="dialog-subtitle">填写以下信息创建新的行程安排</div>
        </div>
      </template>
      <el-form
        :model="addForm"
        :rules="formRules"
        ref="addFormRef"
        label-position="right"
        label-width="90px"
        class="plan-form"
      >
        <div class="form-section">
          <el-form-item label="景点名称" prop="title">
            <el-input 
              v-model="addForm.title" 
              placeholder="请输入景点名称" 
              @input="autoFillCity(addForm, addForm.type)"
              class="form-input"
            />
          </el-form-item>
          <el-form-item label="类型" prop="type">
            <el-select v-model="addForm.type" style="width:100%" @change="autoFillCity(addForm, addForm.type)" class="form-select">
              <el-option v-for="t in typeOptions" :key="t.value" :label="`${t.icon}  ${t.label}`" :value="t.value" />
            </el-select>
          </el-form-item>
        </div>
        
        <div class="form-divider">
          <span class="divider-icon">📅</span>
          <span class="divider-text">日期安排</span>
        </div>
        
        <div class="form-section form-date-section">
          <el-form-item label="开始日期" prop="startDate">
            <el-date-picker 
              v-model="addForm.startDate" 
              type="date" 
              placeholder="选择开始日期" 
              value-format="YYYY-MM-DD" 
              style="width:100%"
              class="form-date"
            />
          </el-form-item>
          <el-form-item label="结束日期" prop="endDate">
            <el-date-picker 
              v-model="addForm.endDate" 
              type="date" 
              placeholder="选择结束日期" 
              value-format="YYYY-MM-DD" 
              style="width:100%"
              class="form-date"
            />
          </el-form-item>
        </div>
        
        <div class="form-section">
          <el-form-item label="所在城市" prop="city">
            <el-input v-model="addForm.city" placeholder="如：北京市" class="form-input" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input 
              v-model="addForm.note" 
              type="textarea" 
              :rows="2" 
              placeholder="添加备注信息（可选）" 
              class="form-textarea"
              resize="none"
            />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <div class="dialog-footer plan-footer" :class="{ 'mobile-footer': isMobile }">
          <button class="btn-outline" @click="showAdd = false; resetAddForm()">
            <span class="btn-text">取消</span>
          </button>
          <button class="btn-primary-plan" @click="handleAdd">
            <span class="btn-icon">✓</span>
            <span class="btn-text">确认添加</span>
          </button>
        </div>
      </template>
    </el-dialog>

    <!-- 编辑行程对话框 -->
    <el-dialog
      v-model="showEdit"
      width="460px"
      custom-class="plan-dialog-mobile"
      class="mobile-dialog plan-dialog"
      :top="'4vh'"
      align-center
      append-to-body
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="dialog-header">
          <div class="dialog-title-wrap">
            <span class="dialog-title-icon">✏️</span>
            <span class="dialog-title-text">编辑行程项</span>
          </div>
          <div class="dialog-subtitle">修改行程项的详细信息</div>
        </div>
      </template>
      <el-form
        :model="editForm"
        :rules="formRules"
        ref="editFormRef"
        label-position="right"
        label-width="90px"
        class="plan-form"
      >
        <div class="form-section">
          <el-form-item label="景点名称" prop="title">
            <el-input 
              v-model="editForm.title" 
              placeholder="请输入景点名称" 
              @input="autoFillCity(editForm, editForm.type)"
              class="form-input"
            />
          </el-form-item>
          <el-form-item label="类型" prop="type">
            <el-select v-model="editForm.type" style="width:100%" @change="autoFillCity(editForm, editForm.type)" class="form-select">
              <el-option v-for="t in typeOptions" :key="t.value" :label="`${t.icon}  ${t.label}`" :value="t.value" />
            </el-select>
          </el-form-item>
        </div>
        
        <div class="form-divider">
          <span class="divider-icon">📅</span>
          <span class="divider-text">日期安排</span>
        </div>
        
        <div class="form-section form-date-section">
          <el-form-item label="开始日期" prop="startDate">
            <el-date-picker 
              v-model="editForm.startDate" 
              type="date" 
              placeholder="选择开始日期" 
              value-format="YYYY-MM-DD" 
              style="width:100%"
              class="form-date"
            />
          </el-form-item>
          <el-form-item label="结束日期" prop="endDate">
            <el-date-picker 
              v-model="editForm.endDate" 
              type="date" 
              placeholder="选择结束日期" 
              value-format="YYYY-MM-DD" 
              style="width:100%"
              class="form-date"
            />
          </el-form-item>
        </div>
        
        <div class="form-section">
          <el-form-item label="所在城市" prop="city">
            <el-input v-model="editForm.city" placeholder="如：北京市" class="form-input" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input 
              v-model="editForm.note" 
              type="textarea" 
              :rows="2" 
              placeholder="添加备注信息（可选）" 
              class="form-textarea"
              resize="none"
            />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <div class="dialog-footer plan-footer" :class="{ 'mobile-footer': isMobile }">
          <button class="btn-outline" @click="showEdit = false; resetEditForm()">
            <span class="btn-text">取消</span>
          </button>
          <button class="btn-primary-plan" @click="handleEdit">
            <span class="btn-icon">✓</span>
            <span class="btn-text">保存修改</span>
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 行程卡片基础布局 */
.overview {
  padding: 14px 16px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

/* 头部：标题 + 删除按钮 */
.ov-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ov-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.ov-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 当前行程标记 */
.trip-active-badge {
  background: linear-gradient(135deg, #ff6b35, #ff8c42);
  color: #fff;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 10px;
  font-weight: 500;
  flex-shrink: 0;
  white-space: nowrap;
}

/* 删除按钮 */
.ov-del-card-btn {
  width: 26px;
  height: 26px;
  min-width: 26px;
  min-height: 26px;
  border: 1px solid #ffccc7;
  background: #fff;
  color: #ff4d4f;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0.5;
  transition: all 0.2s;
  flex-shrink: 0;
}
.ov-del-card-btn:hover {
  background: #ff4d4f;
  color: #fff;
  opacity: 1;
  transform: scale(1.05);
}

/* 主体：信息 + 统计 */
.ov-body {
  display: flex;
  gap: 14px;
}

/* 信息列表 */
.ov-info-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.ov-info-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 14px;
  line-height: 1.5;
}

.info-label {
  color: var(--text-light);
  font-size: 12px;
  flex-shrink: 0;
}

.info-value {
  color: var(--text);
  font-weight: 600;
  font-size: 14px;
}

.info-sep {
  color: var(--text-light);
  margin: 0 2px;
  font-size: 12px;
}

.ov-info-inline {
  gap: 8px;
}

.info-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f7f8fa;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 12px;
}

.chip-label {
  color: var(--text-light);
}

.chip-value {
  color: var(--text);
  font-weight: 600;
}

/* 统计数据 */
.ov-stats {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}

.stat {
  text-align: center;
  min-width: 52px;
}

.stat-num {
  font-size: 24px;
  font-weight: 800;
  color: var(--primary);
  line-height: 1;
}

.stat-label {
  font-size: 12px;
  color: var(--text-light);
  margin-top: 2px;
}

/* 行程列表容器 */
.trips-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

/* 行程卡片 */
.trip-card {
  cursor: pointer;
  transition: all 0.2s ease;
}
.trip-card:hover {
  border-color: var(--primary);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.1);
}
.trip-card.active {
  border-color: var(--primary);
  background: linear-gradient(135deg, #fff5f0, #fff);
  box-shadow: 0 4px 16px rgba(255, 107, 53, 0.15);
}

/* 空卡片样式 */
.ov-empty-card {
  justify-content: center;
  align-items: center;
  text-align: center;
  min-height: 100px;
}
.ov-empty { color: var(--text-light); }
.ov-empty-icon { font-size: 28px; margin-bottom: 6px; }
.ov-empty a { color: var(--primary); cursor: pointer; }

.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.btn-ghost {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
}
.btn-ghost:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger {
  background: #fff;
  border: 1px solid #ffccc7;
  color: #ff4d4f;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  font-size: 14px;
}
.btn-danger:hover:not(:disabled) { background: #fff1f0; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.plans { display: flex; flex-direction: column; gap: 14px; }
.day-group { overflow: hidden; }
.day-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  background: linear-gradient(90deg, #fff3ee, #fff);
  border-bottom: 1px solid var(--border);
}
.day-badge { font-size: 16px; }
.day-date { font-size: 15px; font-weight: 700; }
.day-count { margin-left: auto; font-size: 12px; color: var(--text-light); }

.day-items { padding: 4px 16px; }
.plan-item {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px dashed var(--border);
  align-items: flex-start;
}
.plan-item:last-child { border-bottom: none; }
.plan-thumb {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}
.plan-thumb img { width: 100%; height: 100%; object-fit: cover; }

/* 占位图：按类型显示不同颜色背景 + 大图标 */
.plan-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #fff;
  font-size: 11px;
  text-align: center;
  padding: 4px;
}
.plan-thumb-placeholder .ph-icon { font-size: 28px; line-height: 1; }
.plan-thumb-placeholder .ph-label { font-size: 11px; opacity: 0.95; }

.plan-thumb-placeholder.type-attraction {
  background: linear-gradient(135deg, #ff6b35, #ff8f5e);
}
.plan-thumb-placeholder.type-hotel {
  background: linear-gradient(135deg, #667eea, #764ba2);
}
.plan-thumb-placeholder.type-food {
  background: linear-gradient(135deg, #f093fb, #f5576c);
}
.plan-thumb-placeholder.type-transport {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
}
.plan-thumb-placeholder.type-other {
  background: linear-gradient(135deg, #43e97b, #38f9d7);
}
.plan-date-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 60px;
  flex-shrink: 0;
  gap: 3px;
  padding-top: 4px;
}
.date-line {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  white-space: nowrap;
}
.date-line.single {
  font-size: 13px;
}
.date-arrow {
  font-size: 11px;
  color: var(--text-light);
}
.type-icon { font-size: 20px; margin-top: 4px; }
.plan-body { flex: 1; min-width: 0; }
.plan-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.plan-meta { display: flex; gap: 10px; font-size: 12px; color: var(--text-light); margin-bottom: 4px; flex-wrap: wrap; }
.meta-type { background: #f0f2f5; padding: 1px 6px; border-radius: 4px; }
.plan-note { font-size: 12px; color: var(--text-light); margin-bottom: 6px; line-height: 1.4; }
.plan-ops { display: flex; gap: 6px; flex-wrap: wrap; }
.op-btn {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text);
  transition: all 0.15s;
}
.op-btn:hover { border-color: var(--primary); color: var(--primary); background: #fff8f5; }
.op-btn.danger { border-color: #ffccc7; color: #ff4d4f; }
.op-btn.danger:hover { background: #fff1f0; }

.empty-tip { padding: 60px 20px; }
.empty-tip .icon { font-size: 56px; margin-bottom: 12px; }
.empty-tip .sub { font-size: 13px; color: var(--text-light); margin: 8px 0 16px; }

.favorites { margin-top: 32px; }
.section-title { font-size: 20px; font-weight: 800; margin-bottom: 16px; }
.fav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.fav-card { overflow: hidden; }
.fav-card img { width: 100%; height: 130px; object-fit: cover; }
.fav-body { padding: 12px; }
.fav-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.fav-desc { font-size: 12px; color: var(--text-light); margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fav-ops { display: flex; gap: 6px; }

@media print {
  .app-header, .app-footer, .actions, .plan-ops, .fav-ops { display: none !important; }
  .overview, .day-group { box-shadow: none !important; border: 1px solid #ddd !important; }
}
@media (max-width: 640px) {
  .overview { padding: 12px 14px; gap: 8px; }
  .ov-title { font-size: 17px; }
  .ov-title-wrap { gap: 6px; }
  .trip-active-badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; }
  .ov-del-card-btn { width: 24px; height: 24px; min-width: 24px; min-height: 24px; font-size: 11px; }
  .ov-body { flex-direction: column; gap: 8px; }
  .ov-info-list { gap: 5px; }
  .ov-info-row { font-size: 13px; line-height: 1.4; }
  .info-label { font-size: 11px; }
  .info-value { font-size: 13px; }
  .info-sep { font-size: 11px; }
  .info-chip { font-size: 11px; padding: 2px 8px; }
  .ov-stats { 
    width: 100%; 
    justify-content: space-around; 
    padding-left: 0; 
    border-left: none;
    border-top: 1px solid var(--border);
    padding-top: 8px;
    gap: 8px;
  }
  .stat { min-width: 0; flex: 1; }
  .stat-num { font-size: 22px; }
  .stat-label { font-size: 11px; }
  .actions { gap: 6px; margin-bottom: 12px; }
  .actions .btn-primary,
  .actions .btn-ghost,
  .actions .btn-danger {
    flex: 1 1 calc(50% - 3px);
    padding: 8px 10px;
    font-size: 12px;
    text-align: center;
    min-height: 40px;
  }
  .day-head { padding: 8px 12px; }
  .day-date { font-size: 13px; }
  .day-count { font-size: 11px; }
  .day-items { padding: 2px 12px; }
  .plan-item { flex-wrap: wrap; gap: 8px; padding: 10px 0; }
  .plan-thumb { width: 50px; height: 50px; }
  .plan-date-col { width: 44px; }
  .date-line { font-size: 11px; }
  .date-line.single { font-size: 12px; }
  .type-icon { font-size: 16px; margin-top: 2px; }
  .plan-title { font-size: 13px; margin-bottom: 3px; }
  .plan-meta { font-size: 10px; gap: 5px; margin-bottom: 3px; }
  .plan-note { font-size: 10px; margin-bottom: 4px; line-height: 1.3; }
  .plan-ops { flex-wrap: wrap; gap: 4px; }
  .op-btn { padding: 4px 6px; font-size: 11px; min-height: 28px; flex: 1; text-align: center; border-radius: 4px; }
  .fav-grid { grid-template-columns: 1fr; gap: 10px; }
  .fav-card img { height: 90px; }
  .fav-ops { flex-wrap: wrap; }
  .fav-ops .op-btn { flex: 1; text-align: center; min-height: 30px; }
}
@media (max-width: 768px) {
  .actions .btn-primary,
  .actions .btn-ghost,
  .actions .btn-danger {
    padding: 10px 14px;
    font-size: 13px;
  }
  .fav-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
}

/* 弹窗底部按钮布局 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.dialog-footer.mobile-footer {
  flex-direction: column-reverse;
  align-items: stretch;
  gap: 10px;
}
.dialog-footer.mobile-footer .btn-ghost,
.dialog-footer.mobile-footer .btn-primary {
  width: 100%;
  margin-left: 0 !important;
  min-height: 44px;
  font-size: 15px;
}

/* ============================================
   添加/编辑行程弹窗 - 全新布局样式
   (桌面端样式，移动端通过全局 <style> 控制)
   ============================================ */

/* 弹窗头部 */
.dialog-header {
  padding: 8px 12px 4px;
  background: linear-gradient(135deg, #fff8f3 0%, #ffffff 100%);
  border-bottom: 1px solid #f5f0eb;
}
.dialog-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 0;
}
.dialog-title-icon {
  font-size: 14px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #ff6b35, #ff8c42);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(255, 107, 53, 0.2);
}
.dialog-title-text {
  font-size: 14px;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1.1;
}
.dialog-subtitle {
  font-size: 10px;
  color: #999;
  padding-left: 34px;
  line-height: 1.1;
}

/* 表单主体 */
.plan-form {
  padding-top: 2px;
}
.form-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* 表单分割线 */
.form-divider {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0 1px;
  padding: 1px 0;
}
.divider-icon {
  font-size: 12px;
  opacity: 0.85;
}
.divider-text {
  font-size: 10px;
  font-weight: 600;
  color: #ff6b35;
  letter-spacing: 0.5px;
}
.form-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, #ffe4d4, transparent);
  margin-left: 4px;
}

/* 表单标签 */
:deep(.plan-form .el-form-item) {
  margin-bottom: 2px !important;
}
:deep(.plan-form .el-form-item__label) {
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #333 !important;
  padding-bottom: 0 !important;
  line-height: 1.1 !important;
}

/* 必填星号 */
:deep(.plan-form .el-form-item__label .el-form-item__required-asterisk) {
  color: #ff4d4f;
  margin-right: 2px;
}

/* 输入框 */
:deep(.plan-form .el-input__wrapper) {
  border-radius: 8px !important;
  border: 1.5px solid #e8e8e8 !important;
  background: #fafafa !important;
  padding: 2px 8px !important;
  min-height: 30px !important;
  box-shadow: none !important;
  transition: all 0.2s ease;
}
:deep(.plan-form .el-input__wrapper:hover) {
  border-color: #ffbb99 !important;
  background: #fff !important;
}
:deep(.plan-form .el-input__wrapper.is-focus) {
  border-color: #ff6b35 !important;
  background: #fff !important;
  box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1) !important;
}
:deep(.plan-form .el-input__inner) {
  font-size: 12px !important;
  color: #333 !important;
}
:deep(.plan-form .el-input__inner::placeholder) {
  color: #bbb !important;
}

/* 下拉选择 */
:deep(.plan-form .el-select .el-input__wrapper) {
  min-height: 30px !important;
}
:deep(.plan-form .form-select .el-select__wrapper) {
  border-radius: 8px !important;
}

/* 日期选择器 */
:deep(.plan-form .form-date .el-input__wrapper) {
  min-height: 30px !important;
}
:deep(.plan-form .el-date-editor .el-input__prefix) {
  color: #ff6b35 !important;
}

/* 文本域 */
:deep(.plan-form .form-textarea .el-textarea__inner) {
  border-radius: 8px !important;
  border: 1.5px solid #e8e8e8 !important;
  background: #fafafa !important;
  padding: 4px 8px !important;
  font-size: 12px !important;
  color: #333 !important;
  font-family: inherit !important;
  box-shadow: none !important;
  transition: all 0.2s ease;
}
:deep(.plan-form .form-textarea .el-textarea__inner:hover) {
  border-color: #ffbb99 !important;
  background: #fff !important;
}
:deep(.plan-form .form-textarea .el-textarea__inner:focus) {
  border-color: #ff6b35 !important;
  background: #fff !important;
  box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1) !important;
  outline: none !important;
}
:deep(.plan-form .form-textarea .el-textarea__inner::placeholder) {
  color: #bbb !important;
}

/* 日期表单区域 - 每个日期单独占一行 */
.form-date-section {
  margin-bottom: 0;
}

/* 底部按钮区域 */
.plan-footer {
  display: flex;
  gap: 6px;
  width: 100%;
  justify-content: stretch;
  padding-top: 2px;
}
.plan-footer.mobile-footer {
  flex-direction: column-reverse;
  gap: 4px;
}

/* 取消按钮 */
.btn-outline {
  flex: 1;
  min-height: 32px;
  border: 1.5px solid #e0e0e0;
  background: #fff;
  border-radius: 8px;
  color: #666;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.btn-outline:hover {
  border-color: #bbb;
  background: #f9f9f9;
  color: #333;
}

/* 主按钮 */
.btn-primary-plan {
  flex: 1.3;
  min-height: 32px;
  border: none;
  background: linear-gradient(135deg, #ff6b35, #ff8c42);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-shadow: 0 3px 10px rgba(255, 107, 53, 0.25);
  transition: all 0.2s ease;
}
.btn-primary-plan:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(255, 107, 53, 0.35);
}
.btn-primary-plan:active {
  transform: translateY(0);
}
.btn-primary-plan .btn-icon {
  font-size: 14px;
  font-weight: 700;
}
</style>

<style>
/* ============================================
   Element Plus Dialog 全局样式 - 移动端强制适配
   ============================================ */

/* ============================================
   1. 关闭按钮样式
   ============================================ */
.plan-dialog-mobile .el-dialog__headerbtn {
  top: 12px !important;
  right: 12px !important;
  width: 28px !important;
  height: 28px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(0, 0, 0, 0.05) !important;
  border-radius: 50% !important;
  z-index: 10 !important;
}
.plan-dialog-mobile .el-dialog__headerbtn:hover {
  background: rgba(0, 0, 0, 0.1) !important;
}
.plan-dialog-mobile .el-dialog__close {
  font-size: 14px !important;
  color: #999 !important;
}

/* ============================================
   2. 基础对话框样式 (桌面端 + 移动端通用)
   ============================================ */
.plan-dialog-mobile {
  width: 90% !important;
  max-width: 400px !important;
  border-radius: 14px !important;
  overflow: hidden !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15) !important;
}

/* ============================================
   3. 移动端强制适配 (max-width: 640px)
   
   Element Plus Dialog DOM 结构:
   body
     .el-overlay (遮罩层)
       .el-overlay-dialog (容器, position: fixed)
         .el-dialog (实际对话框) ← custom-class 应用在这里
           .el-dialog__header
           .el-dialog__body
           .el-dialog__footer
   ============================================ */
@media (max-width: 640px) {
  /* ========= 对话框外层容器 - 全屏覆盖并居中 ========= */
  body .el-overlay-dialog {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 8px !important;
    overflow: hidden !important;
  }
  
  /* ========= 实际对话框主体 - Flex布局 + 限制高度 ========= */
  body .plan-dialog-mobile {
    width: 100% !important;
    max-width: 380px !important;
    
    /* 关键：设置固定最大高度，以确保不超出屏幕 */
    max-height: 86vh !important;
    height: 86vh !important;
    
    margin: 0 !important;
    padding: 0 !important;
    
    display: flex !important;
    flex-direction: column !important;
    
    overflow: hidden !important;
    
    border-radius: 16px !important;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15) !important;
  }
  
  /* ========= Header - 固定在顶部，不参与滚动 ========= */
  body .plan-dialog-mobile .el-dialog__header {
    flex: 0 0 auto !important;     /* 固定高度，不伸缩 */
    padding: 0 !important;
    margin: 0 !important;
    border-bottom: none !important;
    overflow: hidden !important;
    max-height: 25% !important;
  }
  
  /* ========= Body - 中间内容区域，超出则滚动 ========= */
  body .plan-dialog-mobile .el-dialog__body {
    flex: 1 1 auto !important;
    overflow-y: scroll !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    
    padding: 0 10px 1px !important;
    margin: 0 !important;
    
    max-height: 60% !important;
    min-height: 50px !important;
    
    box-sizing: border-box !important;
  }
  
  /* ========= Footer - 固定在底部，不参与滚动 ========= */
  body .plan-dialog-mobile .el-dialog__footer {
    flex: 0 0 auto !important;
    padding: 3px 10px 6px !important;
    border-top: 1px solid #f0f0f0 !important;
    background: #fff !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    max-height: 18% !important;
    overflow: hidden !important;
  }
  
  /* ========= 弹窗内部元素样式 ========= */
  
  /* 头部 */
  body .plan-dialog-mobile .dialog-header {
    padding: 4px 10px 2px !important;
  }
  body .plan-dialog-mobile .dialog-title-icon {
    width: 22px !important;
    height: 22px !important;
    font-size: 11px !important;
    border-radius: 5px !important;
  }
  body .plan-dialog-mobile .dialog-title-text {
    font-size: 12px !important;
  }
  body .plan-dialog-mobile .dialog-subtitle {
    font-size: 9px !important;
    padding-left: 28px !important;
  }
  
  /* 表单 */
  body .plan-dialog-mobile .plan-form {
    padding-top: 1px !important;
  }
  body .plan-dialog-mobile .plan-form .el-form-item {
    margin-bottom: 2px !important;
  }
  body .plan-dialog-mobile .plan-form .el-form-item__label {
    font-size: 11px !important;
    padding-bottom: 0 !important;
    line-height: 1 !important;
  }
  body .plan-dialog-mobile .plan-form .el-input__wrapper {
    min-height: 26px !important;
    padding: 0 6px !important;
    border-radius: 6px !important;
  }
  body .plan-dialog-mobile .plan-form .el-input__inner {
    font-size: 12px !important;
    line-height: 1 !important;
  }
  body .plan-dialog-mobile .plan-form .el-select .el-input__wrapper {
    min-height: 26px !important;
  }
  body .plan-dialog-mobile .plan-form .el-date-editor .el-input__wrapper {
    min-height: 26px !important;
  }
  
  /* 分割线 */
  body .plan-dialog-mobile .form-divider {
    margin: 1px 0 !important;
    padding: 0 !important;
  }
  body .plan-dialog-mobile .divider-icon {
    font-size: 10px !important;
  }
  body .plan-dialog-mobile .divider-text {
    font-size: 10px !important;
  }
  
  /* 移动端表单布局：标签在上方，避免空间不足 */
  body .plan-dialog-mobile .plan-form .el-form-item {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    margin-bottom: 2px !important;
  }
  body .plan-dialog-mobile .plan-form .el-form-item__label {
    width: 100% !important;
    text-align: left !important;
    padding-bottom: 0 !important;
    margin-bottom: 0 !important;
    font-size: 11px !important;
    line-height: 1 !important;
    justify-content: flex-start !important;
  }
  body .plan-dialog-mobile .plan-form .el-form-item__content {
    width: 100% !important;
    margin-left: 0 !important;
  }
  
  /* 文本域 */
  body .plan-dialog-mobile .el-textarea__inner {
    min-height: 26px !important;
    max-height: 38px !important;
    font-size: 12px !important;
    padding: 3px 6px !important;
    border-radius: 6px !important;
    line-height: 1 !important;
  }
  
  /* 底部按钮 - 垂直排列 */
  body .plan-dialog-mobile .plan-footer {
    flex-direction: column-reverse !important;
    gap: 3px !important;
  }
  body .plan-dialog-mobile .plan-footer .btn-outline,
  body .plan-dialog-mobile .plan-footer .btn-primary-plan {
    width: 100% !important;
    min-height: 30px !important;
    font-size: 12px !important;
    border-radius: 8px !important;
  }
  body .plan-dialog-mobile .plan-footer .btn-outline {
    min-height: 28px !important;
  }
}

/* ============================================
   4. 小屏手机额外适配 (max-width: 380px)
   ============================================ */
@media (max-width: 380px) {
  body .plan-dialog-mobile {
    max-width: calc(100vw - 12px) !important;
    max-height: calc(100vh - 10px) !important;
  }
  
  body .plan-dialog-mobile .dialog-title-text {
    font-size: 11px !important;
  }
  body .plan-dialog-mobile .dialog-subtitle {
    font-size: 8px !important;
  }
  body .plan-dialog-mobile .dialog-header {
    padding: 4px 8px 2px !important;
  }
  body .plan-dialog-mobile .dialog-title-icon {
    width: 20px !important;
    height: 20px !important;
    font-size: 10px !important;
  }
  
  body .plan-dialog-mobile .plan-form .el-input__wrapper {
    min-height: 24px !important;
    padding: 0 4px !important;
  }
  body .plan-dialog-mobile .plan-form .el-select .el-input__wrapper,
  body .plan-dialog-mobile .plan-form .el-date-editor .el-input__wrapper {
    min-height: 24px !important;
    padding: 0 4px !important;
  }
  body .plan-dialog-mobile .plan-form .el-form-item {
    margin-bottom: 2px !important;
  }
  body .plan-dialog-mobile .plan-form .el-textarea__inner {
    min-height: 24px !important;
    max-height: 36px !important;
  }
  
  body .plan-dialog-mobile .plan-footer .btn-outline,
  body .plan-dialog-mobile .plan-footer .btn-primary-plan {
    min-height: 28px !important;
    font-size: 12px !important;
  }
  body .plan-dialog-mobile .plan-footer .btn-outline {
    min-height: 26px !important;
  }
  body .plan-dialog-mobile .el-dialog__footer {
    padding: 2px 8px 4px !important;
  }
  body .plan-dialog-mobile .el-dialog__body {
    padding: 0 8px 1px !important;
  }
}
</style>
