import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 行程与全局状态管理
export const useTripStore = defineStore('trip', () => {
  // 出行信息
  const origin = ref(null)       // 出发地 { name, lng, lat }
  const destination = ref(null)  // 目的地 { name, lng, lat, city }
  const startDate = ref(null)    // 出发日期
  const endDate = ref(null)      // 返回日期
  const travelers = ref(2)       // 出行人数

  // 当前定位
  const currentLocation = ref(null) // { lng, lat, address, city }

  // 当前选中的景点(用于地图导航/附近搜索)
  const selectedAttraction = ref(null) // { name, lng, lat, address, ... }

  // 行程规划列表(持久化)
  const plans = ref(loadPlans())

  // 收藏的景点
  const favorites = ref(loadFavorites())

  // 计算行程天数
  const tripDays = computed(() => {
    if (!startDate.value || !endDate.value) return 0
    const diff = new Date(endDate.value) - new Date(startDate.value)
    return Math.max(1, Math.round(diff / 86400000) + 1)
  })

  const planCount = computed(() => plans.value.length)

  // 行程是否已设置
  const isTripReady = computed(() => origin.value && destination.value && startDate.value)

  function setTrip({ origin: o, destination: d, startDate: s, endDate: e, travelers: t }) {
    if (o) origin.value = o
    if (d) destination.value = d
    if (s) startDate.value = s
    if (e) endDate.value = e
    if (t) travelers.value = t
  }

  function setCurrentLocation(loc) {
    currentLocation.value = loc
  }

  function selectAttraction(attr) {
    selectedAttraction.value = attr
  }

  // 添加行程规划
  function addPlan(plan) {
    plan.id = Date.now()
    plan.createdAt = new Date().toISOString()
    plans.value.unshift(plan)
    savePlans()
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
    origin, destination, startDate, endDate, travelers,
    currentLocation, selectedAttraction, plans, favorites,
    tripDays, planCount, isTripReady,
    setTrip, setCurrentLocation, selectAttraction,
    addPlan, removePlan, updatePlan,
    toggleFavorite, isFavorite
  }
})
