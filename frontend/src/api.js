const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'yl-token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage unavailable */ }
}

// Error carrying the HTTP status and the API's JSON body ({error, permission, retry_after_s, ...}).
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data || {}
    this.code = this.data.error || null
  }
}

async function send(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !opts.noAuthEvents) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
    if (res.status === 403 && data.error === 'setup_required') {
      window.dispatchEvent(new CustomEvent('auth:setup'));
    }
    throw new ApiError(data.message || data.error || `Request failed (${res.status})`, res.status, data);
  }
  return res;
}

async function req(path, opts = {}) {
  const res = await send(path, opts);
  return res.json().catch(() => ({}));
}

// Adds confirm_password to a body only when one was given.
const withPw = (body, confirm_password) => (confirm_password ? { ...body, confirm_password } : body);

export const api = {
  health: () => req('/health', { noAuthEvents: true }),
  summary: () => req('/summary'),
  stations: () => req('/stations'),
  footfall: (id) => req(`/stations/${id}/footfall`),
  spots: (params = {}) => req('/spots?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v))),
  spot: (id) => req(`/spots/${id}`),
  ratecard: (id) => req(`/spots/${id}/ratecard`),
  setStatus: (id, status) => req(`/spots/${id}/status`, { method: 'PATCH', body: { status } }),
  assumptions: () => req('/assumptions'),
  saveAssumptions: (patch, spotId) => req(`/assumptions${spotId ? `?spot_id=${spotId}` : ''}`, { method: 'POST', body: patch }),
  resetAssumptions: () => req('/assumptions/reset', { method: 'POST' }),
  getPitch: (id, category = '', language = 'en') => req(`/spots/${id}/pitch?` + new URLSearchParams({ language, ...(category ? { category } : {}) })),
  pitch: (id, body = {}) => req(`/spots/${id}/pitch`, { method: 'POST', body: { language: 'en', ...body } }),
  pregenerate: (limit = 4) => req('/pitches/pregenerate', { method: 'POST', body: { limit } }),

  // CSV needs the Authorization header, so fetch it as a blob and trigger a download.
  downloadCsv: async (filename = 'yieldline-ratecard.csv') => {
    const res = await send('/ratecard.csv');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // ---- auth (public) ----
  login: (username, password) => req('/auth/login', { method: 'POST', body: { username, password }, noAuthEvents: true }),
  rolesPublic: () => req('/auth/roles-public', { noAuthEvents: true }),
  apply: (body) => req('/applications', { method: 'POST', body, noAuthEvents: true }),

  // ---- auth (signed in) ----
  me: () => req('/auth/me'),
  completeSetup: (body) => req('/auth/complete-setup', { method: 'POST', body }),
  changePassword: (current_password, new_password) => req('/auth/change-password', { method: 'POST', body: { current_password, new_password }, noAuthEvents: true }),
  logout: () => req('/auth/logout', { method: 'POST', noAuthEvents: true }),

  // ---- admin ----
  permissions: () => req('/permissions'),
  roles: () => req('/roles'),
  createRole: (body, pw) => req('/roles', { method: 'POST', body: withPw(body, pw) }),
  updateRole: (id, body, pw) => req(`/roles/${id}`, { method: 'PATCH', body: withPw(body, pw) }),
  deleteRole: (id) => req(`/roles/${id}`, { method: 'DELETE' }),
  users: () => req('/users'),
  createUser: (body, pw) => req('/users', { method: 'POST', body: withPw(body, pw) }),
  updateUser: (id, body, pw) => req(`/users/${id}`, { method: 'PATCH', body: withPw(body, pw) }),
  resetPassword: (id) => req(`/users/${id}/reset-password`, { method: 'POST' }),
  deleteUser: (id) => req(`/users/${id}`, { method: 'DELETE' }),
  applications: (status = 'pending') => req(`/applications?status=${encodeURIComponent(status)}`),
  approveApplication: (id, body, pw) => req(`/applications/${id}/approve`, { method: 'POST', body: withPw(body, pw) }),
  rejectApplication: (id, note) => req(`/applications/${id}/reject`, { method: 'POST', body: note ? { note } : {} }),
};

export const inr = (x) => (x == null ? '—' : '₹' + Math.round(x).toLocaleString('en-IN'));
export const num = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-IN'));
export const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export function lakh(x) {
  if (x == null) return '—';
  if (x >= 1e7) return `₹${(x / 1e7).toFixed(2)} Cr`;
  if (x >= 1e5) return `₹${(x / 1e5).toFixed(1)} L`;
  return inr(x);
}
export const TYPE_LABEL = { ad_panel: 'Ad panel', kiosk: 'Kiosk', shop: 'Shop' };
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
