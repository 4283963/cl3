const express = require('express');
const cors = require('cors');
const {
  getAllDevices,
  getDeviceById,
  getSensorHistory,
  addSensorData,
  addSensorDataBatch,
  addMultiDeviceBatch,
  getDeviceStatus,
  generateDiagnosis,
  OXYGEN_THRESHOLD,
  MOTOR_STOP_THRESHOLD,
  MAX_RECORDS_PER_DEVICE
} = require('./database');

const app = express();
const PORT = 3000;

const REQUEST_BODY_LIMIT = '2mb';
const MAX_BATCH_RECORDS_PER_REQUEST = 500;
const MAX_BATCH_DEVICES_PER_REQUEST = 50;

const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 300;
const rateBuckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.resetAt > RATE_LIMIT_WINDOW_MS) {
      rateBuckets.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW_MS * 2).unref();

function rateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.resetAt > RATE_LIMIT_WINDOW_MS) {
    bucket = { count: 0, resetAt: now };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    res.setHeader('Retry-After', Math.ceil((RATE_LIMIT_WINDOW_MS - (now - bucket.resetAt)) / 1000));
    return res.status(429).json({
      error: '请求过于频繁，请稍后重试',
      code: 'RATE_LIMITED'
    });
  }
  res.setHeader('X-RateLimit-Remaining', RATE_LIMIT_MAX_REQUESTS - bucket.count);
  next();
}

app.use(cors());
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: `请求体超过最大限制 ${REQUEST_BODY_LIMIT}`,
      code: 'PAYLOAD_TOO_LARGE'
    });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'JSON 格式错误',
      code: 'INVALID_JSON'
    });
  }
  next(err);
});

function isValidSensorValue(val) {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);
}

function validateSingleRecord(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    errors.push('请求体必须是 JSON 对象');
    return errors;
  }
  if (typeof body.device_id !== 'string' || !body.device_id.trim()) {
    errors.push('device_id 必须是非空字符串');
  }
  if (!isValidSensorValue(body.oxygen)) {
    errors.push('oxygen 必须是有效数字');
  } else if (body.oxygen < 0 || body.oxygen > 100) {
    errors.push('oxygen 必须在 0~100 范围内');
  }
  if (!isValidSensorValue(body.motor_speed)) {
    errors.push('motor_speed 必须是有效数字');
  } else if (body.motor_speed < 0 || body.motor_speed > 10000) {
    errors.push('motor_speed 必须在 0~10000 范围内');
  }
  if (!isValidSensorValue(body.temperature)) {
    errors.push('temperature 必须是有效数字');
  } else if (body.temperature < -50 || body.temperature > 300) {
    errors.push('temperature 必须在 -50~300 范围内');
  }
  return errors;
}

function detectAlerts(oxygen, motor_speed) {
  const lowOxygen = oxygen < OXYGEN_THRESHOLD;
  const motorStopped = motor_speed < MOTOR_STOP_THRESHOLD;
  return {
    lowOxygen,
    motorStopped,
    alert: lowOxygen || motorStopped
  };
}

app.post('/api/device/data', rateLimit, (req, res) => {
  const errors = validateSingleRecord(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join('; '), code: 'VALIDATION_ERROR' });
  }

  const { device_id, oxygen, motor_speed, temperature } = req.body;

  if (!getDeviceById(device_id)) {
    return res.status(404).json({ error: '设备不存在', code: 'DEVICE_NOT_FOUND' });
  }

  const timestamp = req.body.timestamp && typeof req.body.timestamp === 'number'
    ? req.body.timestamp
    : Date.now();

  addSensorData(device_id, oxygen, motor_speed, temperature, timestamp);
  const alertInfo = detectAlerts(oxygen, motor_speed);

  res.json({
    success: true,
    timestamp,
    ...alertInfo,
    warnings: {
      lowOxygen: alertInfo.lowOxygen,
      motorStopped: alertInfo.motorStopped
    }
  });
});

app.post('/api/device/data/batch', rateLimit, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: '请求体必须是 JSON 对象', code: 'VALIDATION_ERROR' });
  }

  const device_id = body.device_id;
  const records = body.records;

  if (typeof device_id !== 'string' || !device_id.trim()) {
    return res.status(400).json({ error: 'device_id 必须是非空字符串', code: 'VALIDATION_ERROR' });
  }
  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records 必须是数组', code: 'VALIDATION_ERROR' });
  }
  if (records.length === 0) {
    return res.status(400).json({ error: 'records 不能为空', code: 'VALIDATION_ERROR' });
  }
  if (records.length > MAX_BATCH_RECORDS_PER_REQUEST) {
    return res.status(400).json({
      error: `单次最多上传 ${MAX_BATCH_RECORDS_PER_REQUEST} 条记录，本次 ${records.length} 条`,
      code: 'BATCH_TOO_LARGE'
    });
  }

  if (!getDeviceById(device_id)) {
    return res.status(404).json({ error: '设备不存在', code: 'DEVICE_NOT_FOUND' });
  }

  const normalizedRecords = [];
  let validationSkipped = 0;
  const now = Date.now();

  for (const r of records) {
    if (!r || typeof r !== 'object') { validationSkipped++; continue; }
    const ts = typeof r.timestamp === 'number' ? r.timestamp : now;
    if (!isValidSensorValue(r.oxygen) || r.oxygen < 0 || r.oxygen > 100) { validationSkipped++; continue; }
    if (!isValidSensorValue(r.motor_speed) || r.motor_speed < 0 || r.motor_speed > 10000) { validationSkipped++; continue; }
    if (!isValidSensorValue(r.temperature) || r.temperature < -50 || r.temperature > 300) { validationSkipped++; continue; }
    normalizedRecords.push({
      oxygen: r.oxygen,
      motor_speed: r.motor_speed,
      temperature: r.temperature,
      timestamp: ts
    });
  }

  normalizedRecords.sort((a, b) => a.timestamp - b.timestamp);

  const result = addSensorDataBatch(device_id, normalizedRecords);

  let latestAlert = { alert: false, lowOxygen: false, motorStopped: false };
  if (normalizedRecords.length) {
    const last = normalizedRecords[normalizedRecords.length - 1];
    latestAlert = detectAlerts(last.oxygen, last.motor_speed);
  }

  res.json({
    success: true,
    device_id,
    inserted: result.inserted,
    skipped: result.skipped + validationSkipped,
    validationSkipped,
    maxAllowed: MAX_BATCH_RECORDS_PER_REQUEST,
    latestAlert
  });
});

app.post('/api/device/data/batch-multi', rateLimit, (req, res) => {
  const items = req.body && Array.isArray(req.body.items) ? req.body.items : null;
  if (!items) {
    return res.status(400).json({ error: 'items 必须是数组', code: 'VALIDATION_ERROR' });
  }
  if (items.length > MAX_BATCH_DEVICES_PER_REQUEST) {
    return res.status(400).json({
      error: `单次最多涉及 ${MAX_BATCH_DEVICES_PER_REQUEST} 台设备`,
      code: 'BATCH_TOO_LARGE'
    });
  }

  let totalRecords = 0;
  const prepared = [];
  const perDeviceErrors = {};

  for (const item of items) {
    if (!item || typeof item.device_id !== 'string' || !Array.isArray(item.records)) {
      perDeviceErrors[item?.device_id || 'unknown'] = '格式错误';
      continue;
    }
    if (!getDeviceById(item.device_id)) {
      perDeviceErrors[item.device_id] = '设备不存在';
      continue;
    }
    totalRecords += item.records.length;
    if (totalRecords > MAX_BATCH_RECORDS_PER_REQUEST) {
      return res.status(400).json({
        error: `单次批量总记录数不能超过 ${MAX_BATCH_RECORDS_PER_REQUEST}`,
        code: 'BATCH_TOO_LARGE'
      });
    }

    const normalized = [];
    const now = Date.now();
    for (const r of item.records) {
      if (!r || typeof r !== 'object') continue;
      const ts = typeof r.timestamp === 'number' ? r.timestamp : now;
      if (!isValidSensorValue(r.oxygen) || r.oxygen < 0 || r.oxygen > 100) continue;
      if (!isValidSensorValue(r.motor_speed) || r.motor_speed < 0 || r.motor_speed > 10000) continue;
      if (!isValidSensorValue(r.temperature) || r.temperature < -50 || r.temperature > 300) continue;
      normalized.push({
        oxygen: r.oxygen,
        motor_speed: r.motor_speed,
        temperature: r.temperature,
        timestamp: ts
      });
    }
    normalized.sort((a, b) => a.timestamp - b.timestamp);
    prepared.push({ device_id: item.device_id, records: normalized });
  }

  const result = addMultiDeviceBatch(prepared);

  res.json({
    success: true,
    ...result,
    perDeviceErrors: Object.keys(perDeviceErrors).length ? perDeviceErrors : undefined,
    maxAllowedPerRequest: MAX_BATCH_RECORDS_PER_REQUEST,
    maxDevicesPerRequest: MAX_BATCH_DEVICES_PER_REQUEST
  });
});

app.get('/api/devices', rateLimit, (req, res) => {
  const devices = getAllDevices();
  const result = devices.map(d => {
    const statusInfo = getDeviceStatus(d);
    const diagnosis = generateDiagnosis(d.id);
    return { ...d, ...statusInfo, diagnosis };
  });
  res.json(result);
});

app.get('/api/devices/:id', rateLimit, (req, res) => {
  const device = getDeviceById(req.params.id);
  if (!device) {
    return res.status(404).json({ error: '设备不存在', code: 'DEVICE_NOT_FOUND' });
  }

  const statusInfo = getDeviceStatus(device);
  const history = getSensorHistory(req.params.id, 50);
  const diagnosis = generateDiagnosis(req.params.id);

  res.json({
    ...device,
    ...statusInfo,
    diagnosis,
    history,
    thresholds: {
      oxygen_min: OXYGEN_THRESHOLD,
      motor_stop: MOTOR_STOP_THRESHOLD
    },
    maxRecordsPerDevice: MAX_RECORDS_PER_DEVICE
  });
});

app.get('/api/devices/:id/history', rateLimit, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const history = getSensorHistory(req.params.id, limit);
  res.json(history);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), memory: process.memoryUsage() });
});

app.listen(PORT, () => {
  console.log(`降解机管理系统后端已启动: http://localhost:${PORT}`);
  console.log(`安全限制:`);
  console.log(`  请求体上限: ${REQUEST_BODY_LIMIT}`);
  console.log(`  单批次最大记录: ${MAX_BATCH_RECORDS_PER_REQUEST}`);
  console.log(`  单批次最多设备: ${MAX_BATCH_DEVICES_PER_REQUEST}`);
  console.log(`  限流: ${RATE_LIMIT_MAX_REQUESTS} req/${RATE_LIMIT_WINDOW_MS / 1000}s 每 IP`);
  console.log(`API 接口:`);
  console.log(`  POST /api/device/data             - 单条传感器数据上报`);
  console.log(`  POST /api/device/data/batch       - 单设备批量上报 (records 数组)`);
  console.log(`  POST /api/device/data/batch-multi - 多设备批量上报`);
  console.log(`  GET  /api/devices                  - 获取设备列表`);
  console.log(`  GET  /api/devices/:id              - 获取设备详情`);
  console.log(`  GET  /api/health                   - 健康检查`);
});
