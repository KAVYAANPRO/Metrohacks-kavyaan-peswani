// HTTP routes for login, users, roles and access applications (see AUTH_SPEC.md).
import crypto from 'node:crypto';
import {
  auth, login, signToken, verifyPassword, hashPassword, tempPassword, requireConfirmPassword, isPrivilegedRole,
  requirePerm, requireAnyPerm, rateLimitApply, HttpError, PERMISSIONS, PERMISSION_KEYS, USERNAME_RE, validEmail,
  str, bad, checkNewPassword, now,
} from './auth.js';
import { applicationEmail, approvalEmail, sendMail } from './mailer.js';

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => (e instanceof HttpError ? res.status(e.status).json(e.body) : next(e)));

const notFound = (what) => new HttpError(404, { error: `${what} not found` });

function parseUsername(v, field = 'username') {
  const u = typeof v === 'string' ? v.trim() : '';
  if (!USERNAME_RE.test(u)) throw bad('Username must be 3-32 characters: letters, digits, dot, underscore or dash', field);
  return u;
}
function parseEmail(v, { required = false, field = 'email' } = {}) {
  const e = typeof v === 'string' ? v.trim() : '';
  if (!e) {
    if (required) throw bad('Email is required', field);
    return null;
  }
  if (!validEmail(e)) throw bad('Enter a valid email address', field);
  return e.toLowerCase();
}
function parseName(v, { required = false, field = 'name' } = {}) {
  const n = str(v, 200);
  if (required && n.length < 2) throw bad('Name is required', field);
  if (n.length > 100) throw bad('Name is too long', field);
  return n;
}
function parsePermissions(v) {
  if (v == null) return [];
  if (!Array.isArray(v)) throw bad('permissions must be an array', 'permissions');
  const unknown = v.filter((k) => !PERMISSION_KEYS.includes(k));
  if (unknown.length) throw bad(`unknown permission(s): ${unknown.join(', ')}`, 'permissions');
  return PERMISSION_KEYS.filter((k) => v.includes(k));
}
function roleOr400(id, field = 'role_id') {
  const role = auth.roles.get(id);
  if (!role) throw bad('Unknown role', field);
  return role;
}
function assertUsernameFree(username, exceptId = null) {
  const u = auth.userByUsername(username);
  if (u && u._id !== exceptId) throw new HttpError(409, { error: 'username_taken', message: 'That username is already taken', field: 'username' });
}
const lastAdminError = () => new HttpError(400, { error: 'last_admin', message: 'Cannot remove the last active admin' });

// A generated temp password always forces a change on first login; an admin-chosen password does not.
async function createUser({ username, name, email, role_id, password }) {
  const temp = password ? null : tempPassword();
  const user = auth.newUser({ username, name, email, role_id, password_hash: await hashPassword(password || temp),
    must_change_password: !password });
  auth.users.set(user._id, user);
  await auth.insert('users', user);
  return { user, temp_password: temp };
}

// ======================= public =======================
export function publicAuthRoutes(api) {
  api.post('/auth/login', wrap(async (req, res) => {
    const { username, password } = req.body || {};
    res.json(await login(username, password));
  }));

  api.get('/auth/roles-public', (_req, res) => {
    res.json([...auth.roles.values()].filter((r) => !r.is_admin)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((r) => ({ id: r._id, name: r.name, description: r.description || '' })));
  });

  api.post('/applications', rateLimitApply, wrap(async (req, res) => {
    const b = req.body || {};
    const name = parseName(b.name, { required: true });
    const email = parseEmail(b.email, { required: true });
    const username = parseUsername(b.username);
    const organisation = str(b.organisation, 200);
    if (organisation.length > 120) throw bad('Organisation is too long', 'organisation');
    const reason = str(b.reason, 2000);
    if (reason.length > 1000) throw bad('Reason is too long (max 1000 characters)', 'reason');
    const role = auth.roles.get(b.requested_role_id);
    if (!role || role.is_admin) throw bad('Choose a role', 'requested_role_id');
    assertUsernameFree(username);
    const dup = [...auth.applications.values()].find((a) => a.status === 'pending' &&
      (a.username.toLowerCase() === username.toLowerCase() || a.email === email));
    if (dup) throw new HttpError(409, { error: 'duplicate_application', message: 'A request for this username or email is already pending' });

    const appl = { _id: crypto.randomUUID(), name, email, username, organisation, requested_role_id: role._id, reason,
      status: 'pending', created_at: now(), reviewed_by: null, reviewed_at: null, note: null, emailed_to: [], email_error: null };
    auth.applications.set(appl._id, appl);
    await auth.insert('applications', appl);

    const admins = auth.activeAdmins().filter((u) => u.email).map((u) => u.email);
    const msg = applicationEmail(appl, role.name);
    const r = admins.length ? await sendMail(admins, msg.subject, msg.text, msg.html) : { sent: 0, sent_to: [], error: 'no admin has an email address' };
    await auth.updateApplication(appl, { emailed_to: r.sent_to, email_error: r.error });
    res.status(201).json({ ok: true, emailed: r.sent });
  }));
}

// ======================= authenticated =======================
export function protectedAuthRoutes(api) {
  // ----- self -----
  api.get('/auth/me', (req, res) => res.json({ user: auth.publicUser(req.user) }));

  api.post('/auth/complete-setup', wrap(async (req, res) => {
    const u = req.user;
    const b = req.body || {};
    const fields = {};
    if (b.email != null && b.email !== '') fields.email = parseEmail(b.email);
    else if (auth.needsEmail(u)) throw bad('Enter your email address (Gmail recommended)', 'email');
    if (b.new_password != null && b.new_password !== '') {
      checkNewPassword(b.new_password);
      if (await verifyPassword(b.new_password, u.password_hash)) throw bad('Choose a password different from the current one', 'new_password');
      fields.password_hash = await hashPassword(b.new_password);
      fields.must_change_password = false;
      fields.token_version = (u.token_version || 0) + 1;
    } else if (u.must_change_password) {
      throw bad('Choose a new password', 'new_password');
    }
    await auth.updateUser(u, fields);
    res.json({ user: auth.publicUser(u), token: signToken(u) });
  }));

  api.post('/auth/change-password', wrap(async (req, res) => {
    const u = req.user;
    const { current_password, new_password } = req.body || {};
    if (!(await verifyPassword(current_password, u.password_hash))) throw new HttpError(403, { error: 'invalid_password', message: 'Current password is incorrect' });
    checkNewPassword(new_password);
    await auth.updateUser(u, { password_hash: await hashPassword(new_password), must_change_password: false, token_version: (u.token_version || 0) + 1 });
    res.json({ token: signToken(u), user: auth.publicUser(u) });
  }));

  api.post('/auth/logout', (_req, res) => res.json({ ok: true }));

  api.get('/permissions', (_req, res) => res.json(PERMISSIONS));

  // ----- roles -----
  api.get('/roles', requireAnyPerm('roles.manage', 'users.manage'), (_req, res) => {
    res.json([...auth.roles.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => auth.publicRole(r)));
  });

  function parseRoleBody(b, existing = null) {
    const out = {};
    if (!existing || b.name !== undefined) {
      const name = str(b.name, 200);
      if (name.length < 2 || name.length > 60) throw bad('Role name must be 2-60 characters', 'name');
      const clash = auth.roleByName(name);
      if (clash && clash._id !== existing?._id) throw new HttpError(409, { error: 'role_exists', message: 'A role with that name already exists', field: 'name' });
      out.name = name;
      out.name_lc = name.toLowerCase();
    }
    if (!existing || b.description !== undefined) {
      const d = str(b.description, 1000);
      if (d.length > 300) throw bad('Description is too long (max 300 characters)', 'description');
      out.description = d;
    }
    if (!existing || b.permissions !== undefined) out.permissions = parsePermissions(b.permissions);
    if (!existing || b.is_admin !== undefined) out.is_admin = Boolean(b.is_admin);
    return out;
  }

  // Does going from `before` (null for new) to `after` make the role admin or add a privileged permission?
  const escalates = (before, after) => {
    if (after.is_admin && !before?.is_admin) return true;
    if (before?.is_admin) return false;
    return ['users.manage', 'roles.manage'].some((k) => after.permissions.includes(k) && !before?.permissions?.includes(k));
  };

  api.post('/roles', requirePerm('roles.manage'), wrap(async (req, res) => {
    const fields = parseRoleBody(req.body || {});
    if (escalates(null, fields)) await requireConfirmPassword(req.user, req.body?.confirm_password);
    const role = auth.newRole(fields);
    auth.roles.set(role._id, role);
    await auth.insert('roles', role);
    res.status(201).json(auth.publicRole(role));
  }));

  api.patch('/roles/:id', requirePerm('roles.manage'), wrap(async (req, res) => {
    const role = auth.roles.get(req.params.id);
    if (!role) throw notFound('role');
    const fields = parseRoleBody(req.body || {}, role);
    if (role.system && fields.is_admin === false) throw new HttpError(400, { error: 'system_role', message: 'The system Admin role must stay an admin role' });
    const after = { ...role, ...fields };
    if (escalates(role, after)) await requireConfirmPassword(req.user, req.body?.confirm_password);
    if (role.is_admin && !after.is_admin) {
      const remaining = auth.activeAdmins().filter((u) => u.role_id !== role._id);
      if (!remaining.length) throw lastAdminError();
    }
    await auth.updateRole(role, fields);
    res.json(auth.publicRole(role));
  }));

  api.delete('/roles/:id', requirePerm('roles.manage'), wrap(async (req, res) => {
    const role = auth.roles.get(req.params.id);
    if (!role) throw notFound('role');
    if (role.system) throw new HttpError(400, { error: 'system_role', message: 'The system Admin role cannot be deleted' });
    const count = [...auth.users.values()].filter((u) => u.role_id === role._id).length;
    if (count) throw new HttpError(409, { error: 'role_in_use', message: `${count} user(s) still have this role`, user_count: count });
    auth.roles.delete(role._id);
    await auth.remove('roles', role._id);
    res.json({ ok: true });
  }));

  // ----- users -----
  api.get('/users', requirePerm('users.manage'), (_req, res) => {
    res.json([...auth.users.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((u) => auth.publicUser(u)));
  });

  api.post('/users', requirePerm('users.manage'), wrap(async (req, res) => {
    const b = req.body || {};
    const username = parseUsername(b.username);
    assertUsernameFree(username);
    const name = parseName(b.name) || username;
    const email = parseEmail(b.email);
    const role = roleOr400(b.role_id);
    if (b.password != null && b.password !== '') checkNewPassword(b.password, 'password');
    if (isPrivilegedRole(role)) await requireConfirmPassword(req.user, b.confirm_password);
    const { user, temp_password } = await createUser({ username, name, email, role_id: role._id, password: b.password || null });
    res.status(201).json({ user: auth.publicUser(user), temp_password });
  }));

  api.patch('/users/:id', requirePerm('users.manage'), wrap(async (req, res) => {
    const user = auth.users.get(req.params.id);
    if (!user) throw notFound('user');
    const b = req.body || {};
    const fields = {};
    if (b.name !== undefined) fields.name = parseName(b.name, { required: true });
    if (b.email !== undefined) fields.email = parseEmail(b.email);
    if (b.role_id !== undefined && b.role_id !== user.role_id) fields.role_id = roleOr400(b.role_id)._id;
    if (b.active !== undefined) {
      if (typeof b.active !== 'boolean') throw bad('active must be true or false', 'active');
      if (b.active !== user.active) fields.active = b.active;
    }
    const isSelf = user._id === req.user._id;
    if (isSelf && fields.active === false) throw new HttpError(400, { error: 'cannot_modify_self', message: 'You cannot deactivate yourself' });

    const after = { ...user, ...fields };
    const wasAdmin = user.active && auth.isAdmin(user);
    const staysAdmin = after.active && auth.isAdmin(after);
    if (wasAdmin && !staysAdmin && auth.activeAdmins().length <= 1) throw lastAdminError();

    const newRole = auth.roleOf(after);
    const gainsPrivilege = isPrivilegedRole(newRole) && after.active && (fields.role_id || fields.active === true);
    if (gainsPrivilege) await requireConfirmPassword(req.user, b.confirm_password);

    if (fields.active === false) fields.token_version = (user.token_version || 0) + 1;
    await auth.updateUser(user, fields);
    res.json({ user: auth.publicUser(user) });
  }));

  api.post('/users/:id/reset-password', requirePerm('users.manage'), wrap(async (req, res) => {
    const user = auth.users.get(req.params.id);
    if (!user) throw notFound('user');
    const temp = tempPassword();
    await auth.updateUser(user, { password_hash: await hashPassword(temp), must_change_password: true, token_version: (user.token_version || 0) + 1 });
    res.json({ temp_password: temp });
  }));

  api.delete('/users/:id', requirePerm('users.manage'), wrap(async (req, res) => {
    const user = auth.users.get(req.params.id);
    if (!user) throw notFound('user');
    if (user._id === req.user._id) throw new HttpError(400, { error: 'cannot_modify_self', message: 'You cannot delete yourself' });
    if (user.active && auth.isAdmin(user) && auth.activeAdmins().length <= 1) throw lastAdminError();
    auth.users.delete(user._id);
    await auth.remove('users', user._id);
    res.json({ ok: true });
  }));

  // ----- applications -----
  api.get('/applications', requirePerm('applications.review'), (req, res) => {
    const status = String(req.query.status || 'pending');
    if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return res.status(400).json({ error: 'validation', message: 'status must be pending, approved, rejected or all', field: 'status' });
    res.json([...auth.applications.values()].filter((a) => status === 'all' || a.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => auth.publicApplication(a)));
  });

  api.post('/applications/:id/approve', requirePerm('applications.review', 'users.manage'), wrap(async (req, res) => {
    const appl = auth.applications.get(req.params.id);
    if (!appl) throw notFound('application');
    if (appl.status !== 'pending') throw new HttpError(409, { error: 'already_reviewed', message: `Application is already ${appl.status}` });
    const b = req.body || {};
    const role = roleOr400(b.role_id || appl.requested_role_id);
    const username = parseUsername(b.username || appl.username);
    assertUsernameFree(username);
    if (isPrivilegedRole(role)) await requireConfirmPassword(req.user, b.confirm_password);

    const { user, temp_password } = await createUser({ username, name: appl.name, email: appl.email, role_id: role._id });
    const msg = approvalEmail({ name: appl.name, username, tempPassword: temp_password, roleName: role.name });
    const r = await sendMail(appl.email, msg.subject, msg.text, msg.html);
    await auth.updateApplication(appl, { status: 'approved', reviewed_by: req.user.username, reviewed_at: now(),
      note: str(b.note, 1000) || null, approved_user_id: user._id, approval_emailed: r.sent > 0, approval_email_error: r.error });
    res.json({ user: auth.publicUser(user), temp_password, emailed: r.sent > 0, email_error: r.error });
  }));

  api.post('/applications/:id/reject', requirePerm('applications.review'), wrap(async (req, res) => {
    const appl = auth.applications.get(req.params.id);
    if (!appl) throw notFound('application');
    if (appl.status !== 'pending') throw new HttpError(409, { error: 'already_reviewed', message: `Application is already ${appl.status}` });
    await auth.updateApplication(appl, { status: 'rejected', reviewed_by: req.user.username, reviewed_at: now(), note: str(req.body?.note, 1000) || null });
    res.json({ ok: true, application: auth.publicApplication(appl) });
  }));
}
