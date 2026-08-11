import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 行程与全局状态管理
export const useTripStore = defineStore('trip', () => {
  // 行程列表（支持多个行程）
  const trips = ref(loadTrips())
  const activeTripId = ref(trips.value[0]?.id || null)

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
  const plans = ref(loadPlans())

  // 收藏的景点
  const favorites = ref(loadFavorites())

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
    saveTrips()
    return newTrip
  }

  // 设置行程（仅更新当前行程，不会自动创建新行程）
  function setTrip({ origin: o, destination: d, startDate: s, endDate: e, travelers: t }) {
    // 更新当前活动行程（如果没有行程则不做任何处理，需要手动创建）
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
    // 删除该行程的所有计划
    plans.value = plans.value.filter(p => p.tripId !== tripId)
    // 删除行程
    trips.value = trips.value.filter(t => t.id !== tripId)
    // 如果删除的是当前活动行程，切换到第一个或设为null
    if (activeTripId.value === tripId) {
      activeTripId.value = trips.value[0]?.id || null
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
      case 'origin':
        trip.origin = null
        break
      case 'destination':
        trip.destination = null
        break
      case 'startDate':
        trip.startDate = null
        break
      case 'endDate':
        trip.endDate = null
        break
      case 'travelers':
        trip.travelers = 2
        break
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

  // 添加行程规划（如果没有行程，自动创建一个）
  function addPlan(plan) {
    // 如果没有活动行程，自动创建一个新行程
    if (!activeTripId.value || trips.value.length === 0) {
      const newTrip = createTrip({
        origin: plan.origin || null,
        destination: plan.destination ? { name: plan.destination, city: plan.destination } : null,
        startDate: plan.startDate || plan.date || null,
        endDate: plan.endDate || plan.startDate || plan.date || null,
        travelers: 2
      })
      plan.tripId = newTrip.id
    } else {
      plan.tripId = activeTripId.value
    }
    plan.id = Date.now()
    plan.createdAt = new Date().toISOString()
    plans.value.unshift(plan)
    
    // 自动更新行程的日期范围
    updateTripDateRange(plan)
    
    savePlans()
  }

  // 更新行程的日期范围
  function updateTripDateRange(plan) {
    const idx = trips.value.findIndex(t => t.id === activeTripId.value)
    if (idx === -1) return
    
    const trip = trips.value[idx]
    const planStartDate = plan.startDate || plan.date
    const planEndDate = plan.endDate || planStartDate
    
    if (!planStartDate) return
    
    // 更新开始日期（取最早的日期）
    if (!trip.startDate || planStartDate < trip.startDate) {
      trip.startDate = planStartDate
    }
    
    // 更新结束日期（取最晚的日期）
    if (!trip.endDate || planEndDate > trip.endDate) {
      trip.endDate = planEndDate
    }
    
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
    if (idx > -1) {
      favorites.value.splice(idx, 1)
    } else {
      favorites.value.push(attr)
    }
    saveFavorites()
  }

  function isFavorite(name) {
    return favorites.value.some(f => f.name === name)
  }

  // 本地存储
  function saveTrips() {
    localStorage.setItem('travel_trips', JSON.stringify(trips.value))
  }
  function loadTrips() {
    try {
      return JSON.parse(localStorage.getItem('travel_trips') || '[]')
    } catch { return [] }
  }
  function savePlans() {
    localStorage.setItem('travel_plans', JSON.stringify(plans.value))
  }
  function loadPlans() {
    try {
      return JSON.parse(localStorage.getItem('travel_plans') || '[]')
    } catch { return [] }
  }
  function saveFavorites() {
    localStorage.setItem('travel_favorites', JSON.stringify(favorites.value))
  }
  function loadFavorites() {
    try {
      return JSON.parse(localStorage.getItem('travel_favorites') || '[]')
    } catch { return [] }
  }

  return {
    // 行程列表
    trips, activeTripId, activeTrip,
    origin, destination, startDate, endDate, travelers,
    currentLocation, selectedAttraction, plans, favorites,
    tripDays, planCount, isTripReady,
    setTrip, addTrip, createTrip, setActiveTrip, deleteTrip, clearField,
    setCurrentLocation, selectAttraction,
    addPlan, removePlan, updatePlan,
    toggleFavorite, isFavorite,
    getPlansByTrip
  }
})
