const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

const OXYGEN_THRESHOLD = 12;
const MOTOR_STOP_THRESHOLD = 5;

const MAX_RECORDS_PER_DEVICE = 2000;
const TOTAL_RECORDS_HARD_LIMIT = 20000;
const SAVE_DEBOUNCE_MS = 800;

let storage = {
  devices: [],
  sensorData: {}
};

let saveTimer = null;
let dirty = false;

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      storage = JSON.parse(raw);
      if (!storage.devices) storage.devices = [];
      if (!storage.sensorData) storage.sensorData = {};
      return;
    } catch (e) {
      console.warn('[DB] 读取数据文件失败，使用默认数据:', e.message);
    }
  }
  initMockData();
}

function saveDataImmediate() {
  if (!dirty) return;
  try {
    const serialized = JSON.stringify(storage);
    fs.writeFileSync(DATA_FILE, serialized, 'utf-8');
    dirty = false;
  } catch (e) {
    console.error('[DB] 持久化失败:', e.message);
  }
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveDataImmediate();
  }, SAVE_DEBOUNCE_MS);
}

function initMockData() {
  storage.devices = [
    { id: 'DEV001', name: '降解机-A1', community: '阳光花园小区', address: '北京市朝阳区阳光花园1号楼北侧', lat: 39.9289, lng: 116.4472, install_date: '2025-03-15', status: 'online' },
    { id: 'DEV002', name: '降解机-A2', community: '阳光花园小区', address: '北京市朝阳区阳光花园5号楼南侧', lat: 39.9275, lng: 116.4498, install_date: '2025-03-20', status: 'online' },
    { id: 'DEV003', name: '降解机-B1', community: '翠湖苑社区', address: '北京市海淀区翠湖苑东区中心广场', lat: 39.9588, lng: 116.3376, install_date: '2025-04-01', status: 'online' },
    { id: 'DEV004', name: '降解机-B2', community: '翠湖苑社区', address: '北京市海淀区翠湖苑西区3号岗亭旁', lat: 39.9572, lng: 116.3348, install_date: '2025-04-05', status: 'online' },
    { id: 'DEV005', name: '降解机-C1', community: '金色家园', address: '北京市丰台区金色家园二期东门', lat: 39.8756, lng: 116.3867, install_date: '2025-05-10', status: 'online' },
    { id: 'DEV006', name: '降解机-D1', community: '新华里社区', address: '北京市西城区新华里8号楼前', lat: 39.9389, lng: 116.3622, install_date: '2025-05-18', status: 'online' },
  ];

  storage.sensorData = {};
  const now = Date.now();

  storage.devices.forEach((d, idx) => {
    const list = [];
    for (let i = 0; i < 10; i++) {
      const ts = now - (9 - i) * 60000;
      let oxygen = 18 + Math.random() * 6;
      let motorSpeed = 50 + Math.random() * 30;
      let temperature = 45 + Math.random() * 20;

      if (idx === 1) oxygen = 8 + Math.random() * 3;
      if (idx === 3) motorSpeed = 0;

      list.push({
        id: i + 1,
        device_id: d.id,
        oxygen: parseFloat(oxygen.toFixed(2)),
        motor_speed: parseFloat(motorSpeed.toFixed(1)),
        temperature: parseFloat(temperature.toFixed(2)),
        timestamp: ts
      });
    }
    storage.sensorData[d.id] = list;
  });

  dirty = true;
  saveDataImmediate();
}

function getAllDevices() {
  return storage.devices;
}

function getDeviceById(id) {
  return storage.devices.find(d => d.id === id);
}

function getLatestSensorData(deviceId) {
  const list = storage.sensorData[deviceId] || [];
  return list.length ? list[list.length - 1] : null;
}

function getSensorHistory(deviceId, limit = 50) {
  const list = storage.sensorData[deviceId] || [];
  return list.slice(-limit).reverse();
}

function enforceCapacity() {
  let totalCount = 0;
  for (const id in storage.sensorData) {
    if (storage.sensorData[id].length > MAX_RECORDS_PER_DEVICE) {
      storage.sensorData[id] = storage.sensorData[id].slice(-MAX_RECORDS_PER_DEVICE);
    }
    totalCount += storage.sensorData[id].length;
  }
  if (totalCount > TOTAL_RECORDS_HARD_LIMIT) {
    console.warn(`[DB] 总记录数 ${totalCount} 超过硬上限 ${TOTAL_RECORDS_HARD_LIMIT}，将全局裁剪`);
    for (const id in storage.sensorData) {
      const keep = Math.floor(MAX_RECORDS_PER_DEVICE * 0.7);
      storage.sensorData[id] = storage.sensorData[id].slice(-keep);
    }
  }
}

function addSensorData(deviceId, oxygen, motor_speed, temperature, timestamp) {
  if (!storage.sensorData[deviceId]) {
    storage.sensorData[deviceId] = [];
  }
  const list = storage.sensorData[deviceId];
  const nextId = list.length ? list[list.length - 1].id + 1 : 1;
  const record = {
    id: nextId,
    device_id: deviceId,
    oxygen,
    motor_speed,
    temperature,
    timestamp
  };
  list.push(record);
  if (list.length > MAX_RECORDS_PER_DEVICE) {
    storage.sensorData[deviceId] = list.slice(-MAX_RECORDS_PER_DEVICE);
  }
  scheduleSave();
  return record;
}

function addSensorDataBatch(deviceId, records) {
  if (!records || !records.length) return { inserted: 0, skipped: 0 };

  if (!storage.sensorData[deviceId]) {
    storage.sensorData[deviceId] = [];
  }
  const list = storage.sensorData[deviceId];
  let nextId = list.length ? list[list.length - 1].id + 1 : 1;
  let inserted = 0;
  let skipped = 0;

  for (const r of records) {
    if (!r || typeof r.oxygen !== 'number' || typeof r.motor_speed !== 'number' ||
        typeof r.temperature !== 'number' || typeof r.timestamp !== 'number') {
      skipped++;
      continue;
    }
    list.push({
      id: nextId++,
      device_id: deviceId,
      oxygen: r.oxygen,
      motor_speed: r.motor_speed,
      temperature: r.temperature,
      timestamp: r.timestamp
    });
    inserted++;
  }

  if (list.length > MAX_RECORDS_PER_DEVICE) {
    storage.sensorData[deviceId] = list.slice(-MAX_RECORDS_PER_DEVICE);
  }

  enforceCapacity();
  scheduleSave();
  return { inserted, skipped };
}

function addMultiDeviceBatch(batchItems) {
  let totalInserted = 0;
  let totalSkipped = 0;
  const perDeviceResults = {};

  for (const item of batchItems) {
    if (!item || !item.device_id || !Array.isArray(item.records)) {
      continue;
    }
    const result = addSensorDataBatch(item.device_id, item.records);
    perDeviceResults[item.device_id] = result;
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
  }

  return { totalInserted, totalSkipped, perDevice: perDeviceResults };
}

function getDeviceStatus(device) {
  const latest = getLatestSensorData(device.id);
  if (!latest) return { status: 'unknown', alert: false };

  const lowOxygen = latest.oxygen < OXYGEN_THRESHOLD;
  const motorStopped = latest.motor_speed < MOTOR_STOP_THRESHOLD;
  const alert = lowOxygen || motorStopped;

  return {
    status: alert ? 'warning' : 'normal',
    alert,
    lowOxygen,
    motorStopped,
    latest
  };
}

function flushSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveDataImmediate();
}

process.on('SIGTERM', flushSync);
process.on('SIGINT', () => { flushSync(); process.exit(0); });

loadData();

module.exports = {
  getAllDevices,
  getDeviceById,
  getLatestSensorData,
  getSensorHistory,
  addSensorData,
  addSensorDataBatch,
  addMultiDeviceBatch,
  getDeviceStatus,
  flushSync,
  OXYGEN_THRESHOLD,
  MOTOR_STOP_THRESHOLD,
  MAX_RECORDS_PER_DEVICE,
  TOTAL_RECORDS_HARD_LIMIT
};
