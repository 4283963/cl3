<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-content">
        <div class="logo">
          <span class="logo-icon">♻️</span>
          <h1>智能厨余垃圾降解机运维管理系统</h1>
        </div>
        <div class="header-stats">
          <span class="stat-item">
            <span class="stat-label">设备总数</span>
            <span class="stat-value">{{ stats.total }}</span>
          </span>
          <span class="stat-item stat-normal">
            <span class="stat-label">运行正常</span>
            <span class="stat-value">{{ stats.normal }}</span>
          </span>
          <span class="stat-item stat-warning">
            <span class="stat-label">异常告警</span>
            <span class="stat-value">{{ stats.warning }}</span>
          </span>
        </div>
      </div>
    </header>
    <main class="app-main">
      <router-view v-slot="{ Component }">
        <component :is="Component" @update-stats="updateStats" />
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { ref, provide } from 'vue'

const stats = ref({
  total: 0,
  normal: 0,
  warning: 0
})

const updateStats = (newStats) => {
  stats.value = newStats
}

provide('updateStats', updateStats)
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.app-header {
  background: linear-gradient(135deg, #1a73e8 0%, #1557b0 100%);
  color: white;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  max-width: 100%;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 28px;
}

.logo h1 {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.header-stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 16px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
}

.stat-label {
  font-size: 11px;
  opacity: 0.85;
  margin-bottom: 2px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
}

.stat-normal .stat-value {
  color: #4ade80;
}

.stat-warning .stat-value {
  color: #fbbf24;
}

.app-main {
  flex: 1;
  overflow: hidden;
}
</style>
