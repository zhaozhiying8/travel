import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ===== store 外部的工具函数（避免变量提升问题） =====

// 判断行程是否有效：有行程项，或通过首页"开始规划"明确创建的（有目的地+日期）
function isValidTrip(tripItem, allPlans) {
  if (!tripItem) return false
  const hasPlans = allPlans.some(p => p.tripId === tripItem.id)
  if (hasPlans) return true
  // 明确创建的行程：有目的地、并且有开始或结束日期
  const hasPlanning = tripItem.destination && (tripItem.startDate || tripItem.endDate)
  return !!hasPlanning
}

// 加载时清理无效的旧行程（旧逻辑在目的地搜索城市时创建的空行程）
function cleanupInvalidTrips(loadedTrips, loadedPlans) {
  const validTrips = loadedTrips.filter(t => isValidTrip(t, loadedPlans))
  if (validTrips.length !== loadedTrips.length) {
    const validIds = new Set(validTrips.map(t => t.id))
    const filteredPlans = loadedPlans.filter(p => validIds.has(p.tripId))
    localStorage.setItem('travel_trips', JSON.stringify(validTrips))
    localStorage.setItem('travel_plans', JSON.stringify(filteredPlans))
  }
  return validTrips
}

function loadActiveTripId() {
  try { return JSON.parse(localStorage.getItem('travel_activeTripId') || 'null') }
  catch { return null }
}
function saveActiveTripId(id) {
  localStorage.setItem('travel_activeTripId', JSON.stringify(id))
}
function findValidActiveTripId(validTrips) {
  // 优先使用保存的 activeTripId（如果它仍然有效）
  const savedId = loadActiveTripId()
  if (savedId && validTrips.some(t => t.id === savedId)) {
    return savedId
  }
  return validTrips[0]?.id || null
}

function loadTripsRaw() {
  try { return JSON.parse(localStorage.getItem('travel_trips') || '[]') }
  catch { return [] }
}
function loadPlansRaw() {
  try { return JSON.parse(localStorage.getItem('travel_plans') || '[]') }
  catch { return [] }
}
function loadFavoritesRaw() {
  try { return JSON.parse(localStorage.getItem('travel_favorites') || '[]') }
  catch { return [] }
}

// ===== 行程与全局状态管理 =====
export const useTripStore = defineStore('trip', () => {
  // 初始化时加载原始数据并清理无效行程
  const _rawPlans = loadPlansRaw()
  const _rawTrips = loadTripsRaw()
  const validTrips = cleanupInvalidTrips(_rawTrips, _rawPlans)
  const validTripIds = new Set(validTrips.map(t => t.id))
  // 只保留有效行程的 plans
  const validPlans = validTripIds.size ? _rawPlans.filter(p => validTripIds.has(p.tripId)) : _rawPlans
  if (validPlans.length !== _rawPlans.length) {
    localStorage.setItem('travel_plans', JSON.stringify(validPlans))
  }

  // 行程列表（支持多个行程）
  const trips = ref(validTrips)
  const activeTripId = ref(findValidActiveTripId(validTrips))

  // 当前行程（兼容旧代码，指向当前选中行程的字段）
  const origin = computed(() => activeTrip.value?.origin || null)
  const destination = computed(() => activeTrip.value?.destination || null)
  const startDate = computed(() => activeTrip.value?.startDate || null)
  const endDate = computed(() => activeTrip.value?.endDate || null)
  const travelers = computed(() => activeTrip.value?.travelers || 2)

  // 当前选中行程
  const activeTrip = computed(() => trips.value.find(t => t.id === activeTripId.value))

  // 当前定位
  const currentLocation = ref(null) // { lng, lat, address, city }

  // 当前选中的景点(用于地图导航/附近搜索)
  const selectedAttraction = ref(null) // { name, lng, lat, address, ... }

  // 行程规划列表(持久化) - 关联到当前行程
  const plans = ref(validPlans)

  // 收藏的景点
  const favorites = ref(loadFavoritesRaw())

  // 计算行程天数
  const tripDays = computed(() => {
    if (!startDate.value || !endDate.value) return 0
    const diff = new Date(endDate.value) - new Date(startDate.value)
    return Math.max(1, Math.round(diff / 86400000) + 1)
  })

  const planCount = computed(() => plans.value.filter(p => p.tripId === activeTripId.value).length)

  // 行程是否已设置
  const isTripReady = computed(() => origin.value && destination.value && startDate.value)

  // 获取指定行程的所有计划
  function getPlansByTrip(tripId) {
    return plans.value.filter(p => p.tripId === tripId)
  }

  // 设置当前活动行程
  function setActiveTrip(tripId) {
    activeTripId.value = tripId
    saveActiveTripId(tripId)
  }

  // 创建新行程
  function createTrip({ origin: o, destination: d, startDate: s, endDate: e, travelers: t }) {
    const newTrip = {
      id: Date.now(),
      origin: o,
      destination: d,
      startDate: s,
      endDate: e,
      travelers: t || 2,
      createdAt: new Date().toISOString()
    }
    trips.value.unshift(newTrip)
    activeTripId.value = newTrip.id
    saveActiveTripId(newTrip.id)
    saveTrips()
    return newTrip
  }

  // 设置行程（仅更新当前行程，不会自动创建新行程）
  function setTrip({ origin: o, destination: d, startDate: s, endDate: e, travelers: t }) {
    const idx = trips.value.findIndex(t => t.id === activeTripId.value)
    if (idx > -1) {
      const trip = trips.value[idx]
      if (o) trip.origin = o
      if (d) trip.destination = d
      if (s) trip.startDate = s
      if (e) trip.endDate = e
      if (t) trip.travelers = t
      trips.value[idx] = { ...trip }
      saveTrips()
    }
  }

  // 添加行程到当前活动行程
  function addTrip({ origin: o, destination: d, startDate: s, endDate: e, travelers: t }) {
    return createTrip({ origin: o, destination: d, startDate: s, endDate: e, travelers: t })
  }

  // 删除行程
  function deleteTrip(tripId) {
    plans.value = plans.value.filter(p => p.tripId !== tripId)
    trips.value = trips.value.filter(t => t.id !== tripId)
    if (activeTripId.value === tripId) {
      activeTripId.value = trips.value[0]?.id || null
      saveActiveTripId(activeTripId.value)
    }
    saveTrips()
    savePlans()
  }

  // 清除单个字段
  function clearField(field) {
    const idx = trips.value.findIndex(t => t.id === activeTripId.value)
    if (idx === -1) return
    const trip = trips.value[idx]
    switch (field) {
      case 'origin': trip.origin = null; break
      case 'destination': trip.destination = null; break
      case 'startDate': trip.startDate = null; break
      case 'endDate': trip.endDate = null; break
      case 'travelers': trip.travelers = 2; break
    }
    trips.value[idx] = { ...trip }
    saveTrips()
  }

  function setCurrentLocation(loc) {
    currentLocation.value = loc
  }

  function selectAttraction(attr) {
    selectedAttraction.value = attr
  }

  // 检查行程是否重复（同一trip内景点名称+开始日期+结束日期相同视为重复）
  // excludePlanId: 编辑时排除自身
  function isPlanDuplicate(tripId, title, startDate, endDate, excludePlanId = null) {
    const s = startDate || ''
    const e = endDate || s
    const name = (title || '').trim()
    return plans.value.some(p => {
      if (p.tripId !== tripId) return false
      if (excludePlanId && p.id === excludePlanId) return false
      const pS = p.startDate || p.date || ''
      const pE = p.endDate || pS
      return (p.title || '').trim() === name && pS === s && pE === e
    })
  }

  // 检查日期是否与现有行程连续
  function isDateContinuous(trip, planStartDate, planEndDate) {
    if (!planStartDate) return true
    
    // 获取行程下所有已有的行程项
    const tripPlans = plans.value.filter(p => p.tripId === trip.id)
    if (tripPlans.length === 0) return true  // 行程为空，直接添加
    
    const newStart = new Date(planStartDate)
    const newEnd = planEndDate ? new Date(planEndDate) : newStart
    
    const daysThreshold = 3  // 日期间隙阈值：3天
    
    // 检查新行程项与每个已有行程项的日期间隙
    for (const existingPlan of tripPlans) {
      const existStart = new Date(existingPlan.startDate || existingPlan.date || '')
      const existEnd = new Date(existingPlan.endDate || existStart)
      
      // 计算间隙（正数表示有间隙，负数表示重叠）
      const gapBefore = Math.ceil((existStart - newEnd) / (1000 * 60 * 60 * 24))
      const gapAfter = Math.ceil((newStart - existEnd) / (1000 * 60 * 60 * 24))
      
      // 如果日期重叠（有交集），算连续
      if (gapBefore <= 0 && gapAfter <= 0) return true
      
      // 如果新行程项在已有行程项之后，检查间隙
      if (gapAfter > 0 && gapAfter <= daysThreshold) return true
      
      // 如果新行程项在已有行程项之前，检查间隙
      if (gapBefore > 0 && gapBefore <= daysThreshold) return true
    }
    
    return false  // 与所有行程项的间隙都超过阈值
  }

  // 添加行程规划（如果没有行程，自动创建一个）
  // 返回值: { success: boolean, reason?: 'duplicate' }
  function addPlan(plan) {
    const planStartDate = plan.startDate || plan.date || ''
    const planEndDate = plan.endDate || planStartDate
    
    // 检查日期是否与现有行程连续
    if (activeTripId.value && trips.value.length > 0) {
      const currentTrip = trips.value.find(t => t.id === activeTripId.value)
      if (currentTrip && planStartDate && !isDateContinuous(currentTrip, planStartDate, planEndDate)) {
        // 日期不连续，创建新行程
        const newTrip = createTrip({
          origin: plan.origin || currentTrip.origin || null,
          destination: plan.destination ? { name: plan.destination, city: plan.destination } : currentTrip.destination,
          startDate: planStartDate,
          endDate: planEndDate,
          travelers: plan.travelers || currentTrip.travelers || 2
        })
        plan.tripId = newTrip.id
        return addPlanToTrip(plan)
      }
    }
    
    // 没有行程或日期连续，使用原逻辑
    if (!activeTripId.value || trips.value.length === 0) {
      const newTrip = createTrip({
        origin: plan.origin || null,
        destination: plan.destination ? { name: plan.destination, city: plan.destination } : null,
        startDate: planStartDate || null,
        endDate: planEndDate || planStartDate || null,
        travelers: 2
      })
      plan.tripId = newTrip.id
    } else {
      plan.tripId = activeTripId.value
    }
    
    return addPlanToTrip(plan)
  }
  
  // 添加行程项到指定行程
  function addPlanToTrip(plan) {
    const s = plan.startDate || plan.date || ''
    const e = plan.endDate || s
    if (isPlanDuplicate(plan.tripId, plan.title, s, e)) {
      return { success: false, reason: 'duplicate' }
    }

    plan.id = Date.now()
    plan.createdAt = new Date().toISOString()
    plans.value.unshift(plan)

    // 更新对应行程的日期范围
    updateTripDateRange(plan, plan.tripId)
    savePlans()
    return { success: true }
  }

  // 更新行程的日期范围
  function updateTripDateRange(plan, tripId = null) {
    const targetTripId = tripId || activeTripId.value
    const idx = trips.value.findIndex(t => t.id === targetTripId)
    if (idx === -1) return
    const trip = trips.value[idx]
    const planStartDate = plan.startDate || plan.date
    const planEndDate = plan.endDate || planStartDate
    if (!planStartDate) return
    if (!trip.startDate || planStartDate < trip.startDate) trip.startDate = planStartDate
    if (!trip.endDate || planEndDate > trip.endDate) trip.endDate = planEndDate
    trips.value[idx] = { ...trip }
    saveTrips()
  }

  function removePlan(id) {
    plans.value = plans.value.filter(p => p.id !== id)
    savePlans()
  }

  function updatePlan(id, data) {
    const idx = plans.value.findIndex(p => p.id === id)
    if (idx > -1) {
      plans.value[idx] = { ...plans.value[idx], ...data }
      savePlans()
    }
  }

  // 收藏景点
  function toggleFavorite(attr) {
    const idx = favorites.value.findIndex(f => f.name === attr.name)
    if (idx > -1) favorites.value.splice(idx, 1)
    else favorites.value.push(attr)
    saveFavorites()
  }

  function isFavorite(name) {
    return favorites.value.some(f => f.name === name)
  }

  // 本地存储
  function saveTrips() { localStorage.setItem('travel_trips', JSON.stringify(trips.value)) }
  function savePlans() { localStorage.setItem('travel_plans', JSON.stringify(plans.value)) }
  function saveFavorites() { localStorage.setItem('travel_favorites', JSON.stringify(favorites.value)) }

  return {
    // 行程列表
    trips, activeTripId, activeTrip,
    origin, destination, startDate, endDate, travelers,
    currentLocation, selectedAttraction, plans, favorites,
    tripDays, planCount, isTripReady,
    setTrip, addTrip, createTrip, setActiveTrip, deleteTrip, clearField,
    setCurrentLocation, selectAttraction,
    addPlan, removePlan, updatePlan, isPlanDuplicate,
    toggleFavorite, isFavorite,
    getPlansByTrip
  }
})
