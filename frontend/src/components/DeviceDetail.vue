<template>
  <div v-if="visible" class="detail-overlay" @click.self="handleClose">
    <div class="detail-panel" :class="panelClass">
      <div class="panel-header">
        <div class="header-left">
          <span class="status-dot" :class="device?.status"></span>
          <h3>{{ device?.name }}</h3>
          <span class="device-id">{{ device?.id }}</span>
        </div>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <div v-else-if="device" class="panel-body">
        <div v-if="device.diagnosis" class="health-card" :class="device.diagnosis.level">
          <div class="health-status-row">
            <span class="health-emoji">{{ healthEmoji }}</span>
            <div class="health-text">
              <div class="health-title">{{ device.diagnosis.title }}</div>
              <div class="health-message">{{ device.diagnosis.message }}</div>
            </div>
          </div>
          <div v-if="device.diagnosis.level !== 'healthy' && device.diagnosis.tools" class="health-tools">
            <span class="tools-label">🔧 师傅带齐工具：</span>
            <span class="tools-text">{{ device.diagnosis.tools }}</span>
          </div>
          <div v-if="device.diagnosis.level !== 'healthy' && device.diagnosis.consecutive" class="health-consecutive">
            <span class="consecutive-tag" :class="{ active: device.diagnosis.consecutive.lowOxygen >= device.diagnosis.consecutive.threshold }">
              含氧量连续异常 <strong>{{ device.diagnosis.consecutive.lowOxygen }}</strong> 次
            </span>
            <span class="consecutive-tag" :class="{ active: device.diagnosis.consecutive.motorStopped >= device.diagnosis.consecutive.threshold }">
              转速连续异常 <strong>{{ device.diagnosis.consecutive.motorStopped }}</strong> 次
            </span>
            <span class="consecutive-hint">连续 {{ device.diagnosis.consecutive.threshold }} 次以上升级为严重</span>
          </div>
        </div>

        <div class="info-section">
          <h4>基本信息</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">所属小区</span>
              <span class="info-value">{{ device.community }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">安装地址</span>
              <span class="info-value">{{ device.address }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">安装日期</span>
              <span class="info-value">{{ device.install_date }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">设备状态</span>
              <span class="info-value" :class="device.status">
                {{ device.status === 'normal' ? '运行正常' : device.status === 'warning' ? '异常告警' : '未知' }}
              </span>
            </div>
          </div>
        </div>

        <div class="info-section">
          <h4>实时运维参数</h4>
          <div class="metrics-grid">
            <div class="metric-card" :class="{ danger: device.lowOxygen }">
              <div class="metric-icon oxygen">💨</div>
              <div class="metric-info">
                <span class="metric-label">含氧量</span>
                <span class="metric-value">{{ device.latest?.oxygen }}<small>%</small></span>
                <span class="metric-threshold">阈值: {{ device.thresholds?.oxygen_min }}%</span>
              </div>
            </div>
            <div class="metric-card" :class="{ danger: device.motorStopped }">
              <div class="metric-icon motor">⚙️</div>
              <div class="metric-info">
                <span class="metric-label">搅拌机转速</span>
                <span class="metric-value">{{ device.latest?.motor_speed }}<small>RPM</small></span>
                <span class="metric-threshold">停转阈值: {{ device.thresholds?.motor_stop }} RPM</span>
              </div>
            </div>
            <div class="metric-card">
              <div class="metric-icon temp">🌡️</div>
              <div class="metric-info">
                <span class="metric-label">仓内温度</span>
                <span class="metric-value">{{ device.latest?.temperature }}<small>°C</small></span>
                <span class="metric-threshold">正常范围: 40~70°C</span>
              </div>
            </div>
            <div class="metric-card">
              <div class="metric-icon time">🕐</div>
              <div class="metric-info">
                <span class="metric-label">数据更新时间</span>
                <span class="metric-value time-value">{{ formatTime(device.latest?.timestamp) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="info-section">
          <h4>历史数据（最近10条）</h4>
          <div class="history-table-wrap">
            <table class="history-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>含氧量(%)</th>
                  <th>转速(RPM)</th>
                  <th>温度(°C)</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in device.history?.slice(0, 10)" :key="idx"
                    :class="{ warning: isWarning(item) }">
                  <td>{{ formatTime(item.timestamp) }}</td>
                  <td :class="{ danger: item.oxygen < (device.thresholds?.oxygen_min || 12) }">{{ item.oxygen }}</td>
                  <td :class="{ danger: item.motor_speed < (device.thresholds?.motor_stop || 5) }">{{ item.motor_speed }}</td>
                  <td>{{ item.temperature }}</td>
                  <td>
                    <span v-if="isWarning(item)" class="badge warning">异常</span>
                    <span v-else class="badge normal">正常</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { getDeviceDetail } from '../api'

const props = defineProps({
  visible: Boolean,
  deviceId: String
})

const emit = defineEmits(['close'])

const device = ref(null)
const loading = ref(false)

const healthEmoji = computed(() => {
  const level = device.value?.diagnosis?.level
  if (level === 'healthy') return '✅'
  if (level === 'severe') return '🔴'
  if (level === 'minor') return '🟡'
  return '⚪'
})

const panelClass = computed(() => {
  const level = device.value?.diagnosis?.level
  if (level === 'healthy') return 'healthy'
  if (level === 'severe') return 'severe'
  if (level === 'minor') return 'warning'
  return ''
})

const fetchDetail = async (id) => {
  if (!id) return
  loading.value = true
  try {
    const res = await getDeviceDetail(id)
    device.value = res.data
  } catch (e) {
    console.error('获取设备详情失败', e)
  } finally {
    loading.value = false
  }
}

watch(() => [props.visible, props.deviceId], ([v, id]) => {
  if (v && id) {
    fetchDetail(id)
  }
}, { immediate: true })

const handleClose = () => {
  emit('close')
}

const formatTime = (ts) => {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

const isWarning = (item) => {
  return item.oxygen < (device.value?.thresholds?.oxygen_min || 12) ||
         item.motor_speed < (device.value?.thresholds?.motor_stop || 5)
}
</script>

<style scoped>
.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 2000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.detail-panel {
  width: 520px;
  max-width: 90vw;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  animation: slideIn 0.25s ease;
  border-left: 4px solid #e5e7eb;
}

.detail-panel.healthy {
  border-left-color: #10b981;
}

.detail-panel.warning {
  border-left-color: #f59e0b;
}

.detail-panel.severe {
  border-left-color: #ef4444;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
}

.status-dot.warning {
  background: #f59e0b;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.15);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.15); }
  50% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.08); }
}

.header-left h3 {
  font-size: 18px;
  color: #1f2937;
  margin: 0;
}

.device-id {
  font-size: 12px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 4px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #1f2937;
}

.loading {
  padding: 60px;
  text-align: center;
  color: #6b7280;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.health-card {
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.health-card.healthy {
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border: 2px solid #10b981;
}

.health-card.minor {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 2px solid #f59e0b;
}

.health-card.severe {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  border: 2px solid #ef4444;
}

.health-status-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.health-emoji {
  font-size: 36px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}

.health-text {
  flex: 1;
  min-width: 0;
}

.health-title {
  font-size: 22px;
  font-weight: 800;
  line-height: 1.3;
  margin-bottom: 6px;
}

.health-card.healthy .health-title {
  color: #065f46;
}

.health-card.minor .health-title {
  color: #92400e;
}

.health-card.severe .health-title {
  color: #991b1b;
}

.health-message {
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

.health-card.healthy .health-message {
  color: #047857;
}

.health-card.minor .health-message {
  color: #78350f;
}

.health-card.severe .health-message {
  color: #7f1d1d;
}

.health-tools {
  margin-top: 14px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.65);
  border-radius: 8px;
  border: 1px dashed rgba(0, 0, 0, 0.1);
}

.tools-label {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  display: block;
  margin-bottom: 3px;
}

.tools-text {
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}

.health-consecutive {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.consecutive-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.5);
  color: #6b7280;
  border: 1px solid #e5e7eb;
}

.consecutive-tag.active {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
  font-weight: 600;
}

.consecutive-tag strong {
  font-size: 14px;
}

.consecutive-hint {
  font-size: 11px;
  color: #9ca3af;
}

.info-section {
  margin-bottom: 24px;
}

.info-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 12px 0;
  padding-left: 10px;
  border-left: 3px solid #1a73e8;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 6px;
}

.info-label {
  font-size: 12px;
  color: #6b7280;
}

.info-value {
  font-size: 13px;
  color: #1f2937;
  font-weight: 500;
}

.info-value.warning {
  color: #f59e0b;
}

.info-value.normal {
  color: #10b981;
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  transition: all 0.2s;
}

.metric-card.danger {
  background: #fffbeb;
  border-color: #fbbf24;
}

.metric-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}

.metric-icon.oxygen {
  background: #dbeafe;
}

.metric-icon.motor {
  background: #e0e7ff;
}

.metric-icon.temp {
  background: #fee2e2;
}

.metric-icon.time {
  background: #d1fae5;
}

.metric-card.danger .metric-icon {
  background: #fde68a;
}

.metric-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-label {
  font-size: 12px;
  color: #6b7280;
}

.metric-value {
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
}

.metric-value small {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  margin-left: 2px;
}

.metric-value.time-value {
  font-size: 16px;
}

.metric-card.danger .metric-value {
  color: #d97706;
}

.metric-threshold {
  font-size: 11px;
  color: #9ca3af;
}

.history-table-wrap {
  overflow-x: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.history-table thead {
  background: #f9fafb;
}

.history-table th,
.history-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #f3f4f6;
}

.history-table th {
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}

.history-table tr:last-child td {
  border-bottom: none;
}

.history-table tr.warning td {
  background: #fffbeb;
}

.history-table td.danger {
  color: #dc2626;
  font-weight: 600;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.badge.normal {
  background: #d1fae5;
  color: #065f46;
}

.badge.warning {
  background: #fde68a;
  color: #92400e;
}
</style>
