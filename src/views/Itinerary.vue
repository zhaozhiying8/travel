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
        <button class="ov-del-card-btn" @click.stop="clearAllTrip" title="删除这个行程">🗑️</button>
        <div class="ov-left">
          <h2 class="ov-title">📋 {{ tripItem.destination?.city || tripItem.destination?.name || '我的行程' }}</h2>
          <div class="ov-info">
            <div class="ov-item">
              <span class="ov-label">出发地</span>
              <span class="ov-value">{{ tripItem.origin?.name || '-' }}</span>
            </div>
            <span class="ov-arrow">→</span>
            <div class="ov-item">
              <span class="ov-label">目的地</span>
              <span class="ov-value">{{ tripItem.destination?.city || tripItem.destination?.name || '-' }}</span>
            </div>
            <div class="ov-item">
              <span class="ov-label">日期</span>
              <span class="ov-value">
                <template v-if="getTripDateRange(tripItem).start">
                  {{ formatDate(getTripDateRange(tripItem).start) }} ~ {{ formatDate(getTripDateRange(tripItem).end) }}
                </template>
                <template v-else>-</template>
              </span>
            </div>
            <div class="ov-item">
              <span class="ov-label">天数</span>
              <span class="ov-value">{{ calculateTripDays(tripItem) }} 天</span>
            </div>
            <div class="ov-item">
              <span class="ov-label">人数</span>
              <span class="ov-value">{{ tripItem.travelers }} 人</span>
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
        <div v-if="tripItem.id === trip.activeTripId" class="trip-active-badge">✓ 当前行程</div>
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
    <el-dialog v-model="showAdd" title="添加行程项" width="380px" class="mobile-dialog" :top="'5vh'">
      <el-form :model="addForm" :rules="formRules" ref="addFormRef" :label-width="isMobile ? '70px' : '90px'">
        <el-form-item label="景点名称" prop="title">
          <el-input v-model="addForm.title" placeholder="请输入景点名称" @input="autoFillCity(addForm, addForm.type)" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="addForm.type" style="width:100%" @change="autoFillCity(addForm, addForm.type)">
            <el-option v-for="t in typeOptions" :key="t.value" :label="`${t.icon} ${t.label}`" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始日期" prop="startDate">
          <el-date-picker v-model="addForm.startDate" type="date" placeholder="选择开始日期" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="结束日期" prop="endDate">
          <el-date-picker v-model="addForm.endDate" type="date" placeholder="选择结束日期" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="所在城市" prop="city">
          <el-input v-model="addForm.city" placeholder="如:北京" />
        </el-form-item>
        <!-- <el-form-item label="详细地址">
          <el-input v-model="addForm.address" placeholder="可选,如:西湖区龙井路1号" />
        </el-form-item> -->
        <el-form-item label="备注">
          <el-input v-model="addForm.note" type="textarea" :rows="2" placeholder="可选备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <button class="btn-ghost" @click="showAdd = false; resetAddForm()">取消</button>
          <button class="btn-primary" style="margin-left:8px" @click="handleAdd">添加</button>
        </div>
      </template>
    </el-dialog>

    <!-- 编辑行程对话框 -->
    <el-dialog v-model="showEdit" title="编辑行程项" width="380px" class="mobile-dialog" :top="'5vh'">
      <el-form :model="editForm" :rules="formRules" ref="editFormRef" :label-width="isMobile ? '70px' : '90px'">
        <el-form-item label="景点名称" prop="title">
          <el-input v-model="editForm.title" placeholder="请输入景点名称" @input="autoFillCity(editForm, editForm.type)" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="editForm.type" style="width:100%" @change="autoFillCity(editForm, editForm.type)">
            <el-option v-for="t in typeOptions" :key="t.value" :label="`${t.icon} ${t.label}`" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始日期" prop="startDate">
          <el-date-picker v-model="editForm.startDate" type="date" placeholder="选择开始日期" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="结束日期" prop="endDate">
          <el-date-picker v-model="editForm.endDate" type="date" placeholder="选择结束日期" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="所在城市" prop="city">
          <el-input v-model="editForm.city" placeholder="如:北京" />
        </el-form-item>
        <!-- <el-form-item label="详细地址">
          <el-input v-model="editForm.address" placeholder="可选,如:西湖区龙井路1号" />
        </el-form-item> -->
        <el-form-item label="备注">
          <el-input v-model="editForm.note" type="textarea" :rows="2" placeholder="可选备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <button class="btn-ghost" @click="showEdit = false; resetEditForm()">取消</button>
          <button class="btn-primary" style="margin-left:8px" @click="handleEdit">保存</button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.overview {
  padding: 24px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.ov-title { font-size: 22px; font-weight: 800; margin-bottom: 14px; }
.ov-info { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.ov-item { display: flex; flex-direction: column; }
.ov-label { font-size: 11px; color: var(--text-light); }
.ov-value { font-size: 15px; font-weight: 600; }
.ov-arrow { color: var(--text-light); font-size: 18px; }

/* 行程卡片删除按钮 */
.overview { position: relative; }
.ov-del-card-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  border: 1px solid #ffccc7;
  background: #fff;
  color: #ff4d4f;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0.7;
  transition: all 0.2s;
}
.ov-del-card-btn:hover {
  background: #ff4d4f;
  color: #fff;
  opacity: 1;
  transform: scale(1.05);
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
  position: relative;
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

/* 当前行程标记 */
.trip-active-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: var(--primary);
  color: #fff;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 500;
}

/* 空卡片样式 */
.ov-empty-card {
  justify-content: center;
  align-items: center;
  text-align: center;
  min-height: 120px;
}
.ov-empty { color: var(--text-light); }
.ov-empty-icon { font-size: 32px; margin-bottom: 8px; }
.ov-empty a { color: var(--primary); cursor: pointer; }
.ov-stats { display: flex; gap: 20px; }
.stat { text-align: center; }
.stat-num { font-size: 28px; font-weight: 800; color: var(--primary); }
.stat-label { font-size: 12px; color: var(--text-light); }

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

.plans { display: flex; flex-direction: column; gap: 16px; }
.day-group { overflow: hidden; }
.day-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: linear-gradient(90deg, #fff3ee, #fff);
  border-bottom: 1px solid var(--border);
}
.day-badge { font-size: 18px; }
.day-date { font-size: 16px; font-weight: 700; }
.day-count { margin-left: auto; font-size: 13px; color: var(--text-light); }

.day-items { padding: 8px 20px; }
.plan-item {
  display: flex;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px dashed var(--border);
}
.plan-item:last-child { border-bottom: none; }
.plan-thumb {
  width: 80px;
  height: 80px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
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
  width: 70px;
  flex-shrink: 0;
  gap: 4px;
}
.date-line {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  white-space: nowrap;
}
.date-line.single {
  font-size: 14px;
}
.date-arrow {
  font-size: 12px;
  color: var(--text-light);
}
.type-icon { font-size: 24px; margin-top: 6px; }
.plan-body { flex: 1; min-width: 0; }
.plan-title { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
.plan-meta { display: flex; gap: 12px; font-size: 12px; color: var(--text-light); margin-bottom: 6px; }
.meta-type { background: #f0f2f5; padding: 1px 8px; border-radius: 4px; }
.plan-note { font-size: 13px; color: var(--text-light); margin-bottom: 8px; }
.plan-ops { display: flex; gap: 8px; }
.op-btn {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text);
}
.op-btn:hover { border-color: var(--primary); color: var(--primary); }
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
  .overview { flex-direction: column; align-items: flex-start; padding: 16px; gap: 16px; }
  .ov-title { font-size: 18px; margin-bottom: 10px; }
  .ov-info { flex-direction: column; align-items: flex-start; gap: 10px; }
  .ov-arrow { display: none; }
  .ov-del-card-btn {
    top: 10px;
    right: 10px;
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    opacity: 1;
  }
  .trip-active-badge {
    top: 10px;
    left: 10px;
    font-size: 10px;
    padding: 2px 8px;
  }
  .ov-stats { width: 100%; justify-content: space-around; }
  .stat-num { font-size: 24px; }
  .actions { gap: 8px; }
  .actions .btn-primary,
  .actions .btn-ghost,
  .actions .btn-danger {
    flex: 1 1 calc(50% - 4px);
    padding: 10px 12px;
    font-size: 13px;
    text-align: center;
    min-height: 44px;
  }
  .day-head { padding: 12px 16px; }
  .day-date { font-size: 14px; }
  .day-items { padding: 8px 16px; }
  .plan-item { flex-wrap: wrap; gap: 10px; padding: 12px 0; }
  .plan-thumb { width: 60px; height: 60px; }
  .plan-date-col { width: 55px; }
  .date-line { font-size: 12px; }
  .date-line.single { font-size: 13px; }
  .type-icon { font-size: 20px; margin-top: 4px; }
  .plan-title { font-size: 15px; }
  .plan-meta { font-size: 11px; }
  .plan-ops { flex-wrap: wrap; gap: 6px; }
  .op-btn { padding: 6px 10px; font-size: 13px; min-height: 36px; flex: 1; text-align: center; }
  .fav-grid { grid-template-columns: 1fr; gap: 12px; }
  .fav-card img { height: 110px; }
  .fav-ops { flex-wrap: wrap; }
  .fav-ops .op-btn { flex: 1; text-align: center; min-height: 36px; }
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
        min-height: 44px;
      }
    }
    .el-form-item {
      margin-bottom: 14px;
    }
    .el-form-item__label {
      font-size: 13px;
    }
  }
}
</style>
