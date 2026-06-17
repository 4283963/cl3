<template>
  <div v-if="visible" class="detail-overlay" @click.self="handleClose">
    <div class="detail-panel" :class="{ warning: device?.alert }">
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
        <div class="alert-banner" v-if="device.alert">
          <span class="alert-icon">⚠️</span>
          <div class="alert-content">
            <strong>设备异常告警</strong>
            <ul>
              <li v-if="device.lowOxygen" class="alert-item">含氧量过低 ({{ device.latest?.oxygen }}% &lt; {{ device.thresholds?.oxygen_min }}%)</li>
              <li v-if="device.motorStopped" class="alert-item">搅拌机已停转 (转速 {{ device.latest?.motor_speed }} RPM)</li>
            </ul>
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
import { ref, watch } from 'vue'
import { getDeviceDetail } from '../api'

const props = defineProps({
  visible: Boolean,
  deviceId: String
})

const emit = defineEmits(['close'])

const device = ref(null)
const loading = ref(false)

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
  border-left: 4px solid #10b981;
}

.detail-panel.warning {
  border-left-color: #f59e0b;
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

.alert-banner {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #fbbf24;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 20px;
  display: flex;
  gap: 12px;
}

.alert-icon {
  font-size: 24px;
}

.alert-content strong {
  color: #92400e;
  display: block;
  margin-bottom: 6px;
}

.alert-content ul {
  margin: 0;
  padding-left: 18px;
}

.alert-item {
  color: #78350f;
  font-size: 13px;
  line-height: 1.6;
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
