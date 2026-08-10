import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/Home.vue') },
  { path: '/destination', name: 'destination', component: () => import('../views/Destination.vue') },
  { path: '/map', name: 'map', component: () => import('../views/MapView.vue') },
  { path: '/nearby', name: 'nearby', component: () => import('../views/Nearby.vue') },
  { path: '/itinerary', name: 'itinerary', component: () => import('../views/Itinerary.vue') },
  { path: '/attraction', name: 'attraction', component: () => import('../views/AttractionDetail.vue') }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
