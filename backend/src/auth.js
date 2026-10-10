// Auth: users, roles & permissions, access applications.
// Same pattern as store.js: in-memory Maps serve reads, writes go through to Mongo (store.persist)
// and the app keeps working in-memory if Mongo is unreachable.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { env } from './config.js';
import { store } from './store.js';

const scrypt = promisify(crypto.scrypt);
const clone = (o) => JSON.parse(JSON.stringify(o));
const now = () => new Date().toISOString();

// ---------- permissions & default roles ----------
export const PERMISSIONS = [
  { key: 'dashboard.view', group: 'Insights', label: 'View revenue dashboard (totals, breakdowns)' },
  { key: 'ppp.view', group: 'Insights', label: 'View PPP / partner revenue split' },
  { key: 'stations.view', group: 'Insights', label: 'View stations & footfall' },
  { key: 'spots.view', group: 'Inventory', label: 'View spots & prices' },
  { key: 'ratecard.view', group: 'Inventory', label: 'View rate card calculation & footfall chart' },
  { key: 'assumptions.edit', group: 'Inventory', label: 'Edit pricing assumptions (sliders)' },
  { key: 'spots.status', group: 'Inventory', label: 'Mark spots filled / vacant' },
  { key: 'pitch.view', group: 'Sales', label: 'View saved pitches & export PDF' },
  { key: 'pitch.generate', group: 'Sales', label: 'Generate / regenerate AI pitches' },
  { key: 'export.csv', group: 'Sales', label: 'Download rate card CSV' },
  { key: 'data.manage', group: 'Administration', label: 'Reseed / import footfall data' },
  { key: 'users.manage', group: 'Administration', label: 'Create & edit users' },
  { key: 'roles.manage', group: 'Administration', label: 'Create & edit roles and permissions' },
  { key: 'applications.review', group: 'Administration', label: 'Review access requests' },
];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
const PRIVILEGED = ['users.manage', 'roles.manage'];
const ADMIN_ONLY = ['data.manage', 'users.manage', 'roles.manage', 'applications.review'];

const DEFAULT_ROLES = [
  { name: 'Admin', description: 'Full access to everything, including users, roles and data.', is_admin: true, permissions: PERMISSION_KEYS, system: true },
  { name: 'Commercial Manager', description: 'Runs the commercial side: pricing, inventory, pitches and exports.', is_admin: false,
    permissions: PERMISSION_KEYS.filter((k) => !ADMIN_ONLY.includes(k)) },
  { name: 'Revenue Analyst', description: 'Analyses revenue and tunes pricing assumptions.', is_admin: false,
    permissions: ['dashboard.view', 'ppp.view', 'stations.view', 'spots.view', 'ratecard.view', 'assumptions.edit', 'pitch.view', 'export.csv'] },
  { name: 'Sales Executive', description: 'Sells spots: rate cards, pitches and exports.', is_admin: false,
    permissions: ['stations.view', 'spots.view', 'ratecard.view', 'pitch.view', 'pitch.generate', 'export.csv'] },
  { name: 'PPP Partner', description: 'Concession partner: revenue and PPP split, read-only inventory.', is_admin: false,
    permissions: ['dashboard.view', 'ppp.view', 'stations.view', 'spots.view', 'pitch.view', 'export.csv'] },
  { name: 'Station Auditor (read-only)', description: 'Read-only view of revenue, stations and rate cards.', is_admin: false,
    permissions: ['dashboard.view', 'stations.view', 'spots.view', 'ratecard.view'] },
];

// ---------- validation ----------
export const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const validEmail = (e) => typeof e === 'string' && e.length <= 254 && EMAIL_RE.test(e);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export class HttpError extends Error {
  constructor(status, body) {
    super(body.message || body.error);
    this.status = status;
    this.body = body;
  }
}
const bad = (message, field) => new HttpError(400, { error: 'validation', message, ...(field ? { field } : {}) });

// ---------- passwords ----------
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  if (typeof pw !== 'string' || typeof stored !== 'string') return false;
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

// ~12 chars, unambiguous alphabet, at least one of each class.
export function tempPassword(len = 12) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[crypto.randomInt(s.length)]);
  while (chars.length < len) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function checkNewPassword(pw, field = 'new_password') {
  if (typeof pw !== 'string' || pw.length < 8) throw bad('Password must be at least 8 characters', field);
  if (pw.length > 128) throw bad('Password must be at most 128 characters', field);
}

// ---------- JWT (HS256) ----------
const JWT_TTL_S = 12 * 60 * 60;
let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] JWT_SECRET not set - using a random per-process secret (tokens reset on restart)');
}
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', jwtSecret).update(data).digest();

export function signToken(user) {
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ sub: user._id, v: user.token_version || 0, iat, exp: iat + JWT_TTL_S }));
  return `${head}.${body}.${b64url(sign(`${head}.${body}`))}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = sign(`${head}.${body}`);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const h = JSON.parse(Buffer.from(head, 'base64url').toString());
    if (h.alg !== 'HS256') return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.sub || typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

// ---------- auth store ----------
class AuthStore {
  constructor() {
    this.users = new Map();
    this.roles = new Map();
    this.applications = new Map();
  }

  async init() {
    if (store.mongoOk) {
      try {
        const db = store.db;
        await db.collection('users').createIndex({ username_lc: 1 }, { unique: true });
        await db.collection('roles').createIndex({ name_lc: 1 }, { unique: true });
        await db.collection('applications').createIndex({ status: 1, created_at: -1 });
        if ((await db.collection('roles').countDocuments()) === 0) {
          console.log('[auth] seeding default roles');
          for (const r of DEFAULT_ROLES) {
            const doc = this.newRole(r);
            await db.collection('roles').updateOne({ name_lc: doc.name_lc }, { $setOnInsert: doc }, { upsert: true });
          }
        }
        this.roles = new Map((await db.collection('roles').find().toArray()).map((r) => [r._id, r]));
        if ((await db.collection('users').countDocuments()) === 0) {
          const admin = await this.newAdminFromEnv();
          if (admin) {
            console.log(`[auth] creating first admin "${admin.username}" from .env`);
            await db.collection('users').updateOne({ username_lc: admin.username_lc }, { $setOnInsert: admin }, { upsert: true });
          }
        }
        const [users, apps] = await Promise.all([
          db.collection('users').find().toArray(),
          db.collection('applications').find().toArray(),
        ]);
        this.users = new Map(users.map((u) => [u._id, u]));
        this.applications = new Map(apps.map((a) => [a._id, a]));
        console.log(`[auth] loaded ${this.users.size} users, ${this.roles.size} roles, ${this.applications.size} applications`);
        return;
      } catch (e) {
        console.warn('[auth] Mongo load failed, using in-memory auth data:', e.message);
      }
    }
    this.roles = new Map(DEFAULT_ROLES.map((r) => { const d = this.newRole(r); return [d._id, d]; }));
    const admin = await this.newAdminFromEnv();
    this.users = admin ? new Map([[admin._id, admin]]) : new Map();
    this.applications = new Map();
  }

  newRole({ name, description = '', is_admin = false, permissions = [], system = false }) {
    return { _id: crypto.randomUUID(), name, name_lc: name.toLowerCase(), description, is_admin, permissions: [...permissions], system, created_at: now() };
  }

  async newAdminFromEnv() {
    const adminRole = [...this.roles.values()].find((r) => r.system && r.is_admin) || [...this.roles.values()].find((r) => r.is_admin);
    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !adminRole) {
      console.warn('[auth] ADMIN_USERNAME / ADMIN_PASSWORD not set - no first admin created');
      return null;
    }
    return this.newUser({ username: env.ADMIN_USERNAME, name: env.ADMIN_USERNAME, email: null, role_id: adminRole._id,
      password_hash: await hashPassword(env.ADMIN_PASSWORD), must_change_password: false });
  }

  newUser({ username, name, email, role_id, password_hash, must_change_password }) {
    return { _id: crypto.randomUUID(), username, username_lc: username.toLowerCase(), name: name || username, email: email || null,
      password_hash, role_id, active: true, must_change_password: Boolean(must_change_password), token_version: 0,
      created_at: now(), last_login_at: null };
  }

  // ----- persistence: field-level $set so concurrent instances don't clobber each other -----
  async insert(coll, doc) {
    await store.persist(coll, () => store.db.collection(coll).insertOne(clone(doc)));
  }
  async patch(coll, id, fields) {
    await store.persist(coll, () => store.db.collection(coll).updateOne({ _id: id }, { $set: clone(fields) }));
  }
  async remove(coll, id) {
    await store.persist(coll, () => store.db.collection(coll).deleteOne({ _id: id }));
  }

  async updateUser(user, fields) {
    Object.assign(user, fields);
    await this.patch('users', user._id, fields);
    return user;
  }
  async updateRole(role, fields) {
    Object.assign(role, fields);
    await this.patch('roles', role._id, fields);
    return role;
  }
  async updateApplication(appl, fields) {
    Object.assign(appl, fields);
    await this.patch('applications', appl._id, fields);
    return appl;
  }

  // ----- lookups -----
  userByUsername(username) {
    const lc = String(username || '').toLowerCase();
    for (const u of this.users.values()) if (u.username_lc === lc) return u;
    return null;
  }
  roleByName(name) {
    const lc = String(name || '').toLowerCase();
    for (const r of this.roles.values()) if (r.name_lc === lc) return r;
    return null;
  }
  roleOf(user) {
    return this.roles.get(user?.role_id) || null;
  }
  permissionsOf(user) {
    const role = this.roleOf(user);
    if (!role) return [];
    if (role.is_admin) return [...PERMISSION_KEYS];
    return PERMISSION_KEYS.filter((k) => role.permissions.includes(k));
  }
  isAdmin(user) {
    return Boolean(this.roleOf(user)?.is_admin);
  }
  activeAdmins() {
    return [...this.users.values()].filter((u) => u.active && this.isAdmin(u));
  }
  needsEmail(user) {
    return this.isAdmin(user) && !user.email;
  }
  needsSetup(user) {
    return this.needsEmail(user) || Boolean(user.must_change_password);
  }

  publicUser(user) {
    const role = this.roleOf(user);
    return {
      id: user._id,
      username: user.username,
      name: user.name,
      email: user.email || null,
      role: role ? { id: role._id, name: role.name, is_admin: Boolean(role.is_admin) } : null,
      permissions: this.permissionsOf(user),
      needs_email: this.needsEmail(user),
      must_change_password: Boolean(user.must_change_password),
      active: Boolean(user.active),
      created_at: user.created_at,
      last_login_at: user.last_login_at || null,
    };
  }

  publicRole(role) {
    const user_count = [...this.users.values()].filter((u) => u.role_id === role._id).length;
    return { id: role._id, name: role.name, description: role.description || '', is_admin: Boolean(role.is_admin),
      permissions: role.is_admin ? [...PERMISSION_KEYS] : PERMISSION_KEYS.filter((k) => role.permissions.includes(k)),
      system: Boolean(role.system), created_at: role.created_at, user_count };
  }

  publicApplication(appl) {
    const { _id, ...rest } = appl;
    const role = this.roles.get(appl.requested_role_id);
    return { id: _id, ...rest, requested_role_name: role?.name || null };
  }
}

export const auth = new AuthStore();

// A role "grants privilege" if it is an admin role or holds users.manage / roles.manage.
export const isPrivilegedRole = (role) => Boolean(role && (role.is_admin || PRIVILEGED.some((k) => role.permissions?.includes(k))));

// Re-enter-password check for privilege escalation.
export async function requireConfirmPassword(actor, confirm) {
  if (typeof confirm !== 'string' || !confirm) throw new HttpError(403, { error: 'password_required', message: 'Re-enter your password to grant admin rights' });
  if (!(await verifyPassword(confirm, actor.password_hash))) throw new HttpError(403, { error: 'invalid_password', message: 'Password is incorrect' });
}

// ---------- login lockout ----------
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const fails = new Map(); // username_lc -> { count, locked_until }

function lockedFor(lc) {
  const f = fails.get(lc);
  if (!f?.locked_until) return 0;
  const left = f.locked_until - Date.now();
  if (left <= 0) { fails.delete(lc); return 0; }
  return Math.ceil(left / 1000);
}
function recordFail(lc) {
  const f = fails.get(lc) || { count: 0, locked_until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) { f.locked_until = Date.now() + LOCK_MS; f.count = 0; }
  fails.set(lc, f);
}

export async function login(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || username.length > 64 || password.length > 256) {
    throw new HttpError(400, { error: 'validation', message: 'Username and password are required' });
  }
  const lc = username.trim().toLowerCase();
  const retry = lockedFor(lc);
  if (retry) throw new HttpError(429, { error: 'locked', retry_after_s: retry, message: `Too many failed attempts. Try again in ${retry}s.` });
  const user = auth.userByUsername(lc);
  const ok = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok || !user.active) {
    recordFail(lc);
    const r = lockedFor(lc);
    if (r) throw new HttpError(429, { error: 'locked', retry_after_s: r, message: `Too many failed attempts. Try again in ${r}s.` });
    throw new HttpError(401, { error: 'invalid_credentials', message: user && ok && !user.active ? 'This account is deactivated' : 'Invalid username or password' });
  }
  fails.delete(lc);
  await auth.updateUser(user, { last_login_at: now() });
  return { token: signToken(user), user: auth.publicUser(user) };
}

// ---------- middleware ----------
const SETUP_ALLOWED = new Set(['/auth/me', '/auth/complete-setup', '/auth/logout']);

export function requireAuth(req, res, next) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  const payload = m && verifyToken(m[1].trim());
  const user = payload && auth.users.get(payload.sub);
  if (!user || !user.active || (user.token_version || 0) !== payload.v) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = user;
  req.perms = new Set(auth.permissionsOf(user));
  if (auth.needsSetup(user) && !SETUP_ALLOWED.has(req.path)) {
    return res.status(403).json({ error: 'setup_required', needs_email: auth.needsEmail(user), must_change_password: Boolean(user.must_change_password) });
  }
  next();
}

export const hasPerm = (req, key) => Boolean(req.perms?.has(key));

// All listed permissions required.
export const requirePerm = (...keys) => (req, res, next) => {
  const missing = keys.find((k) => !hasPerm(req, k));
  if (missing) return res.status(403).json({ error: 'forbidden', permission: missing });
  next();
};

// Any one of the listed permissions suffices.
export const requireAnyPerm = (...keys) => (req, res, next) => {
  if (!keys.some((k) => hasPerm(req, k))) return res.status(403).json({ error: 'forbidden', permission: keys[0] });
  next();
};

// ---------- rate limiting for public application form ----------
const applyHits = new Map(); // ip -> [timestamps]
export function rateLimitApply(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const hour = 60 * 60 * 1000;
  const t = Date.now();
  const hits = (applyHits.get(ip) || []).filter((x) => t - x < hour);
  if (hits.length >= 5) {
    const retry = Math.ceil((hits[0] + hour - t) / 1000);
    return res.status(429).json({ error: 'rate_limited', retry_after_s: retry, message: 'Too many requests. Try again later.' });
  }
  hits.push(t);
  applyHits.set(ip, hits);
  if (applyHits.size > 5000) for (const [k, v] of applyHits) if (!v.some((x) => t - x < hour)) applyHits.delete(k);
  next();
}

export { str, bad, checkNewPassword, now };
