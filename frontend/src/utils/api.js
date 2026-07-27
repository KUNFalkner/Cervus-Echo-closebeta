const BASE = import.meta.env.DEV
  ? 'http://localhost:8000/api'
  : `${window.location.protocol}//${window.location.hostname}:8000/api`

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = localStorage.getItem('token')
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const opts = { method, headers }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)

  return fetch(`${BASE}${path}`, opts)
}

export function wsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = import.meta.env.DEV ? 'localhost:8000' : `${window.location.hostname}:8000`
  return `${proto}://${host}${path}`
}
