<script setup>
import { useRouter } from 'vue-router'
import { useTripStore } from '../store/trip'

const router = useRouter()
const trip = useTripStore()

// 顶部导航菜单
const menus = [
  { path: '/', label: '首页', icon: '🏠' },
  { path: '/destination', label: '目的地', icon: '📍' },
  { path: '/map', label: '地图导航', icon: '🗺️' },
  { path: '/nearby', label: '附近', icon: '🏨' },
  { path: '/itinerary', label: '我的行程', icon: '📋' }
]

function go(path) {
  router.push(path)
}
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <div class="logo" @click="go('/')">
        <span class="logo-icon">🧳</span>
        <span class="logo-text">悠游 <small>旅游规划平台</small></span>
      </div>
      <nav class="nav">
        <a
          v-for="m in menus"
          :key="m.path"
          class="nav-item"
          :class="{ active: $route.path === m.path }"
          @click="go(m.path)"
        >
          <span class="nav-icon">{{ m.icon }}</span>
          <span>{{ m.label }}</span>
          <span v-if="m.path === '/itinerary' && trip.planCount" class="badge">{{ trip.planCount }}</span>
        </a>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  background: #fff;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.06);
  position: sticky;
  top: 0;
  z-index: 100;
}
.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.logo-icon { font-size: 28px; }
.logo-text {
  font-size: 20px;
  font-weight: 800;
  color: var(--primary);
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.logo-text small {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-light);
}
.nav {
  display: flex;
  gap: 4px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
  transition: all 0.15s;
  position: relative;
}
.nav-item:hover { background: #fff3ee; color: var(--primary); }
.nav-item.active { background: var(--primary); color: #fff; }
.nav-icon { font-size: 16px; }
.badge {
  background: #ff4d4f;
  color: #fff;
  font-size: 11px;
  border-radius: 10px;
  padding: 1px 6px;
  margin-left: 2px;
}
@media (max-width: 640px) {
  .header-inner { padding: 0 12px; height: 56px; }
  .logo-icon { font-size: 24px; }
  .logo-text { font-size: 16px; }
  .nav { gap: 2px; }
  .nav-item { padding: 8px 10px; min-height: 44px; min-width: 44px; justify-content: center; }
  .nav-item span:not(.nav-icon):not(.badge) { display: none; }
  .logo-text small { display: none; }
  .badge { font-size: 10px; padding: 1px 5px; }
}
@media (max-width: 768px) {
  .nav-item { padding: 8px 10px; }
  .logo-text { font-size: 18px; }
}
</style>
