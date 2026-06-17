const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

const OXYGEN_THRESHOLD = 12;
const MOTOR_STOP_THRESHOLD = 5;

let storage = {
  devices: [],
  sensorData: {}
};

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      storage = JSON.parse(raw);
      return;
    } catch (e) {
      console.warn('读取数据文件失败，使用默认数据', e.message);
    }
  }
  initMockData();
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(storage, null, 2), 'utf-8');
  } catch (e) {
    console.warn('保存数据失败', e.message);
  }
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

  saveData();
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

function addSensorData(deviceId, oxygen, motor_speed, temperature, timestamp) {
  if (!storage.sensorData[deviceId]) {
    storage.sensorData[deviceId] = [];
  }
  const record = {
    id: (storage.sensorData[deviceId].slice(-1)[0]?.id || 0) + 1,
    device_id: deviceId,
    oxygen,
    motor_speed,
    temperature,
    timestamp
  };
  storage.sensorData[deviceId].push(record);
  if (storage.sensorData[deviceId].length > 200) {
    storage.sensorData[deviceId] = storage.sensorData[deviceId].slice(-200);
  }
  saveData();
  return record;
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

loadData();

module.exports = {
  getAllDevices,
  getDeviceById,
  getLatestSensorData,
  getSensorHistory,
  addSensorData,
  getDeviceStatus,
  OXYGEN_THRESHOLD,
  MOTOR_STOP_THRESHOLD
};
