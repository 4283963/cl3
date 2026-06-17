import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 10000
})

export function getDevices() {
  return request.get('/devices')
}

export function getDeviceDetail(id) {
  return request.get(`/devices/${id}`)
}

export function getDeviceHistory(id, limit = 50) {
  return request.get(`/devices/${id}/history`, { params: { limit } })
}

export function uploadDeviceData(data) {
  return request.post('/device/data', data)
}
