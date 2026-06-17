const express = require('express');
const cors = require('cors');
const {
  getAllDevices,
  getDeviceById,
  getSensorHistory,
  addSensorData,
  getDeviceStatus,
  OXYGEN_THRESHOLD,
  MOTOR_STOP_THRESHOLD
} = require('./database');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post('/api/device/data', (req, res) => {
  const { device_id, oxygen, motor_speed, temperature } = req.body;

  if (!device_id || oxygen === undefined || motor_speed === undefined || temperature === undefined) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const device = getDeviceById(device_id);
  if (!device) {
    return res.status(404).json({ error: '设备不存在' });
  }

  const timestamp = Date.now();
  addSensorData(device_id, oxygen, motor_speed, temperature, timestamp);

  const lowOxygen = oxygen < OXYGEN_THRESHOLD;
  const motorStopped = motor_speed < MOTOR_STOP_THRESHOLD;

  res.json({
    success: true,
    timestamp,
    alert: lowOxygen || motorStopped,
    warnings: {
      lowOxygen,
      motorStopped
    }
  });
});

app.get('/api/devices', (req, res) => {
  const devices = getAllDevices();
  const result = devices.map(d => {
    const statusInfo = getDeviceStatus(d);
    return { ...d, ...statusInfo };
  });
  res.json(result);
});

app.get('/api/devices/:id', (req, res) => {
  const device = getDeviceById(req.params.id);
  if (!device) {
    return res.status(404).json({ error: '设备不存在' });
  }

  const statusInfo = getDeviceStatus(device);
  const history = getSensorHistory(req.params.id, 50);

  res.json({
    ...device,
    ...statusInfo,
    history,
    thresholds: {
      oxygen_min: OXYGEN_THRESHOLD,
      motor_stop: MOTOR_STOP_THRESHOLD
    }
  });
});

app.get('/api/devices/:id/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const history = getSensorHistory(req.params.id, limit);
  res.json(history);
});

app.listen(PORT, () => {
  console.log(`降解机管理系统后端已启动: http://localhost:${PORT}`);
  console.log(`API 接口:`);
  console.log(`  POST /api/device/data  - 上报传感器数据`);
  console.log(`  GET  /api/devices       - 获取设备列表`);
  console.log(`  GET  /api/devices/:id   - 获取设备详情`);
});
