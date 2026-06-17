import { createRouter, createWebHistory } from 'vue-router'
import DeviceMap from '../views/DeviceMap.vue'

const routes = [
  {
    path: '/',
    redirect: '/map'
  },
  {
    path: '/map',
    name: 'DeviceMap',
    component: DeviceMap
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
