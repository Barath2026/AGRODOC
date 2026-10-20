const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const ACCESS_TOKEN_KEY = 'agrodoc.access-token.v1';
let sessionToken = null;

export function getAccessToken() {
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY) || sessionToken;
  } catch {
    return sessionToken;
  }
}

export function saveAccessToken(token) {
  sessionToken = token;
  try {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // Keep the token for the active tab when persistent storage is unavailable.
  }
}

export function clearAccessToken() {
  sessionToken = null;
  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // The active session can still end when storage is unavailable.
  }
}

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response;
  try {
    response = await fetch(apiUrl(path), { ...options, headers });
  } catch {
    throw new Error('Could not reach the AgroDoc API. Start the backend and try again.');
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join(' ')
      : detail || `Request failed (${response.status}).`;
    if (response.status === 401) clearAccessToken();
    throw new Error(message);
  }
  return payload;
}

function normalizeScan(scan) {
  return {
    ...scan,
    id: String(scan.id ?? scan.scan_id),
    fieldId: scan.field_id == null ? null : String(scan.field_id),
    fieldZoneId: scan.field_zone_id == null ? null : String(scan.field_zone_id),
    createdAt: scan.createdAt || scan.created_at,
    prediction: typeof scan.prediction === 'string'
      ? scan.prediction
      : scan.prediction?.label || scan.prediction?.class || scan.disease,
    health: scan.health || scan.health_status || 'At risk',
    confidence: Number(scan.confidence ?? 0),
    image: apiUrl(scan.image || scan.image_url || scan.thumbnail_url || ''),
    recommendations: Array.isArray(scan.recommendations) ? scan.recommendations : [],
    analysis: scan.analysis || scan.ai_analysis || '',
    isDemo: false,
  };
}

function normalizeField(field) {
  return {
    id: String(field.id),
    name: field.field_name,
    plants: field.plant_count,
    location: field.location_name,
    latitude: field.latitude,
    longitude: field.longitude,
    registeredZones: field.zones?.length || 0,
    monitoredZones: 0,
    totalArea: field.area,
    scannedArea: null,
    zones: (field.zones || []).map(normalizeZone),
  };
}

function normalizeZone(zone) {
  return {
    ...zone,
    id: String(zone.id),
    name: zone.zone_name || zone.name,
    path: zone.polygon || zone.path || [],
  };
}

export async function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register({ name, email, password, confirmPassword }) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      full_name: name,
      email,
      password,
      confirm_password: confirmPassword,
    }),
  });
}

export function getCurrentUser() {
  return request('/auth/me');
}

export async function getFields() {
  return (await request('/fields')).map(normalizeField);
}

export async function createField({ name, plants, location, latitude, longitude, area }) {
  const field = await request('/fields', {
    method: 'POST',
    body: JSON.stringify({ name, plants, location_name: location, latitude, longitude, area }),
  });
  return normalizeField(field);
}

export function getFieldSummary(fieldId) {
  return request(`/fields/${encodeURIComponent(fieldId)}/summary`);
}

export async function createFieldZone(fieldId, { name, color, path }) {
  const zone = await request(`/fields/${encodeURIComponent(fieldId)}/zones`, {
    method: 'POST',
    body: JSON.stringify({ name, color, polygon: path }),
  });
  return normalizeZone(zone);
}

export function deleteFieldZone(fieldId, zoneId) {
  return request(`/fields/${encodeURIComponent(fieldId)}/zones/${encodeURIComponent(zoneId)}`, { method: 'DELETE' });
}

export async function getScans() {
  const result = await request('/diagnosis/history?page_size=100');
  return result.items.map(normalizeScan);
}

export async function getScanDetails(scanId) {
  return normalizeScan(await request(`/diagnosis/${encodeURIComponent(scanId)}`));
}

export async function analyzeImage(file, locationName, { fieldId, fieldZoneId } = {}) {
  const form = new FormData();
  form.append('image', file);
  form.append('location_name', locationName);
  if (fieldId) form.append('field_id', fieldId);
  if (fieldZoneId) form.append('field_zone_id', fieldZoneId);
  return normalizeScan(await request('/diagnosis/predict', { method: 'POST', body: form }));
}

export function submitContactMessage(message) {
  return request('/contact', {
    method: 'POST',
    body: JSON.stringify(message),
  });
}