<template>
  <div class="map-page">
    <aside class="side-panel">
      <div class="panel-title">
        <span>📍</span>
        <h3>设备列表</h3>
        <span class="device-count">({{ devices.length }})</span>
      </div>
      <div class="filter-bar">
        <button :class="['filter-btn', { active: filter === 'all' }]" @click="filter = 'all'">全部</button>
        <button :class="['filter-btn', { active: filter === 'normal' }]" @click="filter = 'normal'">
          <span class="dot green"></span>正常
        </button>
        <button :class="['filter-btn', { active: filter === 'warning' }]" @click="filter = 'warning'">
          <span class="dot yellow"></span>告警
        </button>
      </div>
      <div class="device-list">
        <div v-for="d in filteredDevices" :key="d.id"
             class="device-card"
             :class="{ warning: d.alert, active: selectedId === d.id }"
             @click="selectDevice(d)">
          <div class="card-header">
            <span class="status-indicator" :class="d.status"></span>
            <span class="device-name">{{ d.name }}</span>
          </div>
          <div class="card-community">{{ d.community }}</div>
          <div class="card-metrics">
            <span :class="{ danger: d.lowOxygen }">O₂ {{ d.latest?.oxygen }}%</span>
            <span :class="{ danger: d.motorStopped }">⚙️ {{ d.latest?.motor_speed }} RPM</span>
            <span>🌡️ {{ d.latest?.temperature }}°C</span>
          </div>
          <div v-if="d.alert" class="card-alert">
            <span v-if="d.lowOxygen">含氧量低</span>
            <span v-if="d.lowOxygen && d.motorStopped"> / </span>
            <span v-if="d.motorStopped">电机停转</span>
          </div>
        </div>
      </div>
    </aside>

    <div class="map-container" ref="mapContainer"></div>

    <DeviceDetail :visible="detailVisible" :device-id="selectedId" @close="detailVisible = false" />

    <div class="legend-panel">
      <h4>图例说明</h4>
      <div class="legend-item">
        <span class="legend-marker green"></span>
        <span>设备运行正常</span>
      </div>
      <div class="legend-item">
        <span class="legend-marker yellow"></span>
        <span>设备异常告警</span>
      </div>
    </div>
  </div>
</template>

<script setup>import { ref, onMounted, onBeforeUnmount, computed, inject } from 'vue';
import L from 'leaflet';
import { getDevices } from '../api';
import DeviceDetail from '../components/DeviceDetail.vue';
const emit = defineEmits(['update-stats']);
const updateStats = inject('updateStats');
const mapContainer = ref(null);
const devices = ref([]);
const filter = ref('all');
const selectedId = ref(null);
const detailVisible = ref(false);
let map = null;
let markers = {};
let refreshTimer = null;
const filteredDevices = computed(() => {
 if (filter.value === 'all')
 return devices.value;
 return devices.value.filter(d => d.status === filter.value);
});
const createCustomIcon = (isWarning) => {
 const color = isWarning ? '#f59e0b' : '#10b981';
 const pulseColor = isWarning ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.35)';
 return L.divIcon({
 className: 'custom-marker',
 html: `
 <div class="marker-wrapper" style="--marker-color: ${color}; --pulse-color: ${pulseColor}">
 <div class="marker-pulse"></div>
 <div class="marker-pin">
 <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
 <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
 </svg>
 </div>
 </div>
 `,
 iconSize: [36, 46],
 iconAnchor: [18, 46],
 popupAnchor: [0, -42]
 });
};
const initMap = () => {
 map = L.map(mapContainer.value, {
 zoomControl: true,
 attributionControl: true
 }).setView([39.93, 116.40], 12);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
 attribution: '&copy; OpenStreetMap contributors',
 maxZoom: 19
 }).addTo(map);
};
const renderMarkers = () => {
 Object.values(markers).forEach(m => map.removeLayer(m));
 markers = {};
 devices.value.forEach(d => {
 const icon = createCustomIcon(d.alert);
 const marker = L.marker([d.lat, d.lng], { icon }).addTo(map);
 const statusText = d.alert
 ? `<span style="color:#f59e0b;font-weight:600">⚠️ 异常告警</span>`
 : `<span style="color:#10b981;font-weight:600">✓ 运行正常</span>`;
 const warnings = [];
 if (d.lowOxygen)
 warnings.push(`含氧量过低: ${d.latest?.oxygen}%`);
 if (d.motorStopped)
 warnings.push(`搅拌机停转`);
 const warningHtml = warnings.length
 ? `<div style="margin-top:8px;padding:8px;background:#fffbeb;border-radius:4px;color:#92400e;font-size:12px">${warnings.join('<br>')}</div>`
 : '';
 marker.bindPopup(`
 <div style="min-width:200px;padding:4px">
 <div style="font-size:15px;font-weight:600;color:#1f2937;margin-bottom:4px">${d.name}</div>
 <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${d.community}</div>
 <div style="font-size:11px;color:#9ca3af;margin-bottom:8px">${d.address}</div>
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
 <div>💨 含氧量: <strong>${d.latest?.oxygen}%</strong></div>
 <div>⚙️ 转速: <strong>${d.latest?.motor_speed} RPM</strong></div>
 <div>🌡️ 温度: <strong>${d.latest?.temperature}°C</strong></div>
 <div>${statusText}</div>
 </div>
 ${warningHtml}
 <div style="margin-top:10px;text-align:right">
 <button onclick="window.__selectDevice__('${d.id}')" style="background:#1a73e8;color:white;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px">查看详情 →</button>
 </div>
 </div>
 `, { maxWidth: 300 });
 marker.on('click', () => {
 selectedId.value = d.id;
 });
 markers[d.id] = marker;
 });
 window.__selectDevice__ = (id) => {
 selectedId.value = id;
 detailVisible.value = true;
 };
};
const fetchDevices = async () => {
 try {
 const res = await getDevices();
 devices.value = res.data;
 const stats = {
 total: devices.value.length,
 normal: devices.value.filter(d => d.status === 'normal').length,
 warning: devices.value.filter(d => d.status === 'warning').length
 };
 updateStats(stats);
 emit('update-stats', stats);
 if (map)
 renderMarkers();
 }
 catch (e) {
 console.error('获取设备列表失败', e);
 }
};
const selectDevice = (d) => {
 selectedId.value = d.id;
 detailVisible.value = true;
 if (map && markers[d.id]) {
 map.flyTo([d.lat, d.lng], 15, { duration: 0.6 });
 markers[d.id].openPopup();
 }
};
onMounted(async () => {
 initMap();
 await fetchDevices();
 refreshTimer = setInterval(fetchDevices, 30000);
});
onBeforeUnmount(() => {
 if (refreshTimer)
 clearInterval(refreshTimer);
 if (map)
 map.remove();
 delete window.__selectDevice__;
});
</script>

<style scoped>
.map-page {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
}

.side-panel {
  width: 320px;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  z-index: 10;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px;
  border-bottom: 1px solid #f3f4f6;
}

.panel-title h3 {
  margin: 0;
  font-size: 16px;
  color: #1f2937;
  font-weight: 600;
}

.device-count {
  color: #6b7280;
  font-size: 13px;
}

.filter-bar {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid #f3f4f6;
}

.filter-btn {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 6px;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: all 0.15s;
}

.filter-btn:hover {
  background: #f9fafb;
}

.filter-btn.active {
  background: #eff6ff;
  border-color: #1a73e8;
  color: #1a73e8;
  font-weight: 500;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.dot.green {
  background: #10b981;
}

.dot.yellow {
  background: #f59e0b;
}

.device-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.device-card {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;
}

.device-card:hover {
  border-color: #1a73e8;
  box-shadow: 0 2px 8px rgba(26, 115, 232, 0.1);
}

.device-card.active {
  border-color: #1a73e8;
  background: #eff6ff;
}

.device-card.warning {
  border-color: #fbbf24;
  background: linear-gradient(135deg, #fffbeb 0%, #fff 100%);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
}

.status-indicator.warning {
  background: #f59e0b;
  animation: blink 1.2s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.device-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.card-community {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}

.card-metrics {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: #4b5563;
  flex-wrap: wrap;
}

.card-metrics .danger {
  color: #dc2626;
  font-weight: 600;
}

.card-alert {
  margin-top: 8px;
  padding: 5px 8px;
  background: #fef3c7;
  border-radius: 4px;
  font-size: 11px;
  color: #92400e;
  font-weight: 500;
}

.map-container {
  flex: 1;
  height: 100%;
}

.legend-panel {
  position: absolute;
  bottom: 24px;
  right: 24px;
  background: #fff;
  padding: 14px 18px;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 500;
}

.legend-panel h4 {
  margin: 0 0 10px 0;
  font-size: 13px;
  color: #374151;
  font-weight: 600;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #4b5563;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-marker {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
}

.legend-marker.green {
  background: #10b981;
}

.legend-marker.yellow {
  background: #f59e0b;
}

:deep(.leaflet-container) {
  font-family: inherit;
  background: #e8eef4;
}

:deep(.leaflet-popup-content-wrapper) {
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

:deep(.leaflet-popup-content) {
  margin: 14px 16px;
}

:deep(.leaflet-popup-tip) {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
</style>

<style>
.custom-marker {
  background: transparent !important;
  border: none !important;
}

.marker-wrapper {
  position: relative;
  width: 36px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.marker-pulse {
  position: absolute;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--pulse-color);
  top: 2px;
  left: 0;
  animation: markerPulse 2s ease-out infinite;
}

@keyframes markerPulse {
  0% {
    transform: scale(0.6);
    opacity: 1;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}

.marker-pin {
  position: relative;
  width: 36px;
  height: 44px;
  background: var(--marker-color);
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
  border: 2px solid #fff;
}

.marker-pin svg {
  transform: rotate(45deg);
}
</style>
