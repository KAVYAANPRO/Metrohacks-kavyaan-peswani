import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth, useConfirmPassword, NoAccess, OneTimeSecret } from '../auth'
import { go } from '../App'
import { useLang } from '../i18n'

const LOCALE = { en: 'en-IN', hi: 'hi-IN', gu: 'gu-IN' }

export function errMsg(ex, t) {
  if (!ex) return ''
  if (!ex.status) return t('auth.network')
  if (ex.code) {
    const k = `err.${ex.code}`
    const s = t(k)
    if (s !== k) return s
  }
  return ex.message
}

export function notifyApplicationsChanged() {
  window.dispatchEvent(new CustomEvent('applications:changed'))
}

function useDate() {
  const { lang } = useLang()
  return useCallback((d, withTime = true) => {
    if (!d) return '—'
    const date = new Date(d)
    if (Number.isNaN(date.getTime())) return '—'
    return withTime
      ? date.toLocaleString(LOCALE[lang] || 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString(LOCALE[lang] || 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }, [lang])
}

export default function Admin({ tab: tabParam }) {
  const { t } = useLang()
  const { can } = useAuth()
  const tabs = [
    can('users.manage') && { key: 'users', label: t('admin.tabUsers') },
    can('roles.manage') && { key: 'roles', label: t('admin.tabRoles') },
    can('applications.review') && { key: 'requests', label: t('admin.tabRequests') },
  ].filter(Boolean)

  if (!tabs.length) return <NoAccess />
  const tab = tabs.find((x) => x.key === tabParam)?.key || tabs[0].key

  return (
    <div className="stack">
      <div>
        <h1>{t('admin.title')}</h1>
        <div className="muted">{t('admin.subtitle')}</div>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={`tab${tab === x.key ? ' active' : ''}`}
            onClick={() => go(`/admin?tab=${x.key}`)}>{x.label}{x.key === 'requests' && <PendingBadge />}</button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'requests' && <RequestsTab />}
    </div>
  )
}

export function usePendingCount(enabled) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) { setN(0); return }
    let alive = true
    const load = () => api.applications('pending').then((r) => alive && setN(Array.isArray(r) ? r.length : 0)).catch(() => {})
    load()
    const id = setInterval(load, 60000)
    window.addEventListener('applications:changed', load)
    return () => { alive = false; clearInterval(id); window.removeEventListener('applications:changed', load) }
  }, [enabled])
  return n
}

function PendingBadge() {
  const n = usePendingCount(true)
  return n > 0 ? <span className="count-badge">{n}</span> : null
}

/* ======================= Users ======================= */

function UsersTab() {
  const { t } = useLang()
  const { user: me } = useAuth()
  const withConfirm = useConfirmPassword()
  const fmt = useDate()
  const [users, setUsers] = useState(null)
  const [roles, setRoles] = useState([])
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null) // {kind:'add'|'edit'|'secret'|'delete', user?, secret?}

  const load = useCallback(() => {
    Promise.all([api.users(), api.roles()])
      .then(([u, r]) => { setUsers(u); setRoles(r) })
      .catch((e) => setError(errMsg(e, t)))
  }, [t])
  useEffect(() => { load() }, [load])

  const resetPw = async (u) => {
    setError('')
    try {
      const res = await api.resetPassword(u.id)
      setModal({ kind: 'secret', user: u, secret: res.temp_password, title: t('admin.resetDone', { user: u.username }) })
      load()
    } catch (e) { setError(errMsg(e, t)) }
  }

  const toggleActive = async (u) => {
    setError('')
    try {
      await withConfirm((pw) => api.updateUser(u.id, { active: !u.active }, pw))
      load()
    } catch (e) { if (e.code !== 'cancelled') setError(errMsg(e, t)) }
  }

  return (
    <section className="card">
      <div className="card-title">
        <h2>{t('admin.users')} {users && <span className="muted small">({users.length})</span>}</h2>
        <button className="btn primary" onClick={() => setModal({ kind: 'add' })}>{t('admin.addUser')}</button>
      </div>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      {!users ? <div className="skeleton" /> : users.length === 0 ? <div className="empty">{t('admin.noUsers')}</div> : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.thUsername')}</th><th>{t('admin.thName')}</th><th>{t('admin.thEmail')}</th><th>{t('admin.thRole')}</th>
                <th>{t('admin.thActive')}</th><th>{t('admin.thLastLogin')}</th><th className="num">{t('admin.thActions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me.id
                return (
                  <tr key={u.id} className={u.active ? '' : 'row-inactive'}>
                    <td className="mono" data-label={t('admin.thUsername')}>{u.username}{self && <span className="badge dim" style={{ marginLeft: 6 }}>{t('admin.you')}</span>}</td>
                    <td data-label={t('admin.thName')}>{u.name || '—'}</td>
                    <td className="small" data-label={t('admin.thEmail')}>{u.email || <span className="muted">—</span>}</td>
                    <td data-label={t('admin.thRole')}><RoleBadge role={u.role} /></td>
                    <td data-label={t('admin.thActive')}>
                      <button type="button" className={`badge ${u.active ? 'good' : 'warn'} badge-btn`} disabled={self} onClick={() => toggleActive(u)}
                        title={self ? t('admin.cantSelf') : u.active ? t('admin.deactivate') : t('admin.activate')}>
                        {u.active ? t('admin.active') : t('admin.inactive')}
                      </button>
                      {u.must_change_password && <div className="tiny muted">{t('admin.mustChange')}</div>}
                    </td>
                    <td className="small" data-label={t('admin.thLastLogin')}>{u.last_login_at ? fmt(u.last_login_at) : <span className="muted">{t('admin.never')}</span>}</td>
                    <td className="num" data-label={t('admin.thActions')}>
                      <div className="row-actions">
                        <button className="btn sm" onClick={() => setModal({ kind: 'edit', user: u })}>{t('common.edit')}</button>
                        <button className="btn sm" onClick={() => resetPw(u)}>{t('admin.resetPw')}</button>
                        <button className="btn sm danger" disabled={self} title={self ? t('admin.cantSelf') : ''} onClick={() => setModal({ kind: 'delete', user: u })}>{t('common.delete')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(modal?.kind === 'add' || modal?.kind === 'edit') && (
        <UserForm user={modal.user} roles={roles} self={modal.user?.id === me.id} onClose={() => setModal(null)}
          onSaved={(res) => {
            load()
            if (res?.temp_password) setModal({ kind: 'secret', user: res.user, secret: res.temp_password, title: t('admin.userCreated', { user: res.user?.username || '' }) })
            else setModal(null)
          }} />
      )}
      {modal?.kind === 'secret' && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <OneTimeSecret value={modal.secret} />
          <div className="modal-actions"><button className="btn primary" onClick={() => setModal(null)}>{t('common.done')}</button></div>
        </Modal>
      )}
      {modal?.kind === 'delete' && (
        <ConfirmDialog title={t('admin.deleteUserQ', { user: modal.user.username })} body={t('admin.deleteUserBody')} confirmLabel={t('common.delete')}
          onClose={() => setModal(null)}
          onConfirm={async () => { await api.deleteUser(modal.user.id); load(); setModal(null) }} />
      )}
    </section>
  )
}

function RoleBadge({ role }) {
  if (!role) return <span className="muted">—</span>
  return <span className={`badge ${role.is_admin ? 'solid' : ''}`}>{role.name}</span>
}

function UserForm({ user, roles, self, onClose, onSaved }) {
  const { t } = useLang()
  const withConfirm = useConfirmPassword()
  const isNew = !user
  const [f, setF] = useState(() => ({
    username: user?.username || '', name: user?.name || '', email: user?.email || '',
    role_id: user?.role?.id || roles.find((r) => !r.is_admin)?.id || roles[0]?.id || '',
    active: user ? !!user.active : true, password: '',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const role = roles.find((r) => r.id === f.role_id)
  const privileged = role && (role.is_admin || role.permissions?.some((p) => p === 'users.manage' || p === 'roles.manage'))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (isNew && !f.username.trim()) { setError(t('admin.needUsername')); return }
    if (!f.role_id) { setError(t('admin.needRole')); return }
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) { setError(t('setup.badEmail')); return }
    if (isNew && f.password && f.password.length < 8) { setError(t('pw.tooShort')); return }
    setBusy(true)
    try {
      let res
      if (isNew) {
        const body = { username: f.username.trim(), name: f.name.trim(), email: f.email.trim() || null, role_id: f.role_id }
        if (f.password) body.password = f.password
        res = await withConfirm((pw) => api.createUser(body, pw))
      } else {
        const body = { name: f.name.trim(), email: f.email.trim() || null, role_id: f.role_id }
        if (!self) body.active = f.active
        res = await withConfirm((pw) => api.updateUser(user.id, body, pw))
      }
      onSaved(res)
    } catch (ex) {
      if (ex.code !== 'cancelled') setError(errMsg(ex, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={isNew ? t('admin.addUser') : t('admin.editUser', { user: user.username })} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="modal-form">
        <div className="field-grid">
          <label className="field"><span>{t('auth.username')}</span>
            <input type="text" value={f.username} onChange={set('username')} disabled={!isNew} autoFocus={isNew} autoComplete="off" /></label>
          <label className="field"><span>{t('apply.name')}</span><input type="text" value={f.name} onChange={set('name')} autoComplete="off" /></label>
          <label className="field"><span>{t('apply.email')}</span><input type="email" value={f.email} onChange={set('email')} autoComplete="off" /></label>
          <label className="field"><span>{t('admin.thRole')}</span>
            <select value={f.role_id} onChange={set('role_id')} disabled={self}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_admin ? ` · ${t('admin.adminTag')}` : ''}</option>)}
            </select>
          </label>
        </div>
        {privileged && !self && <div className="note-privileged small">{t('admin.privilegedNote')}</div>}
        {isNew ? (
          <label className="field"><span>{t('admin.initialPw')} <em className="muted">{t('common.optional')}</em></span>
            <input type="text" value={f.password} onChange={set('password')} autoComplete="new-password" placeholder={t('admin.initialPwPh')} />
            <span className="tiny muted field-hint">{t('admin.initialPwHint')}</span>
          </label>
        ) : !self && (
          <label className="check-row"><input type="checkbox" checked={f.active} onChange={set('active')} /> <span>{t('admin.activeLabel')}</span></label>
        )}
        {self && <div className="tiny muted">{t('admin.selfNote')}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy && <span className="spinner" />}{isNew ? t('admin.create') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ======================= Roles ======================= */

function RolesTab() {
  const { t } = useLang()
  const [roles, setRoles] = useState(null)
  const [perms, setPerms] = useState([])
  const [selected, setSelected] = useState(null) // role id, or 'new'
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = useCallback((keep) => {
    return Promise.all([api.roles(), api.permissions()])
      .then(([r, p]) => {
        setRoles(r); setPerms(p)
        setSelected((cur) => keep ?? cur ?? r[0]?.id ?? null)
      })
      .catch((e) => setError(errMsg(e, t)))
  }, [t])
  useEffect(() => { load() }, [load])

  const role = selected === 'new' ? null : roles?.find((r) => r.id === selected)

  return (
    <div className="roles-layout">
      <section className="card roles-list">
        <div className="card-title">
          <h2>{t('admin.roles')}</h2>
          <button className="btn sm primary" onClick={() => setSelected('new')}>{t('admin.newRole')}</button>
        </div>
        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
        {!roles ? <div className="skeleton" /> : (
          <ul className="role-items">
            {roles.map((r) => (
              <li key={r.id}>
                <button type="button" className={`role-item${selected === r.id ? ' active' : ''}`} onClick={() => setSelected(r.id)}>
                  <span className="role-item-name">
                    {r.name}
                    {r.system && <LockIcon />}
                  </span>
                  <span className="role-item-meta tiny muted">
                    {r.is_admin ? t('admin.allPerms') : t('admin.nPerms', { n: r.permissions?.length || 0 })} · {t(r.user_count === 1 ? 'admin.nUsers1' : 'admin.nUsers', { n: r.user_count ?? 0 })}
                  </span>
                </button>
              </li>
            ))}
            {selected === 'new' && <li><div className="role-item active"><span className="role-item-name">{t('admin.newRoleDraft')}</span></div></li>}
          </ul>
        )}
      </section>
      {roles && (selected === 'new' || role) && (
        <RoleEditor key={selected} role={role} perms={perms}
          onSaved={(saved) => load(saved?.id || saved?.role?.id || selected)}
          onDelete={() => setConfirmDelete(role)} />
      )}
      {confirmDelete && (
        <ConfirmDialog title={t('admin.deleteRoleQ', { role: confirmDelete.name })} body={t('admin.deleteRoleBody')} confirmLabel={t('common.delete')}
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => { await api.deleteRole(confirmDelete.id); setConfirmDelete(null); setSelected(null); await load(null) }} />
      )}
    </div>
  )
}

function LockIcon() {
  return <svg className="lock-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
}

function RoleEditor({ role, perms, onSaved, onDelete }) {
  const { t } = useLang()
  const withConfirm = useConfirmPassword()
  const locked = !!role?.system
  const [name, setName] = useState(role?.name || '')
  const [description, setDescription] = useState(role?.description || '')
  const [isAdmin, setIsAdmin] = useState(!!role?.is_admin)
  const [sel, setSel] = useState(() => new Set(role?.permissions || []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const groups = useMemo(() => {
    const m = new Map()
    for (const p of perms) {
      if (!m.has(p.group)) m.set(p.group, [])
      m.get(p.group).push(p)
    }
    return [...m.entries()]
  }, [perms])

  const disabled = locked || isAdmin
  const toggle = (key) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const toggleGroup = (items, on) => setSel((s) => { const n = new Set(s); items.forEach((p) => (on ? n.add(p.key) : n.delete(p.key))); return n })

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setSaved(false)
    if (!name.trim()) { setError(t('admin.needRoleName')); return }
    const body = { name: name.trim(), description: description.trim(), is_admin: isAdmin, permissions: isAdmin ? perms.map((p) => p.key) : [...sel] }
    setBusy(true)
    try {
      const res = await withConfirm((pw) => (role ? api.updateRole(role.id, body, pw) : api.createRole(body, pw)))
      setSaved(true)
      onSaved(res?.role || res)
    } catch (ex) {
      if (ex.code !== 'cancelled') setError(errMsg(ex, t))
    } finally {
      setBusy(false)
    }
  }

  const canDelete = role && !role.system && !(role.user_count > 0)

  return (
    <form className="card role-editor" onSubmit={submit} noValidate>
      <div className="card-title">
        <h2>{role ? t('admin.editRole') : t('admin.newRole')}</h2>
        {locked && <span className="badge solid"><LockIcon /> {t('admin.systemLocked')}</span>}
      </div>
      {locked && <div className="note-privileged small" style={{ marginBottom: 14 }}>{t('admin.systemNote')}</div>}
      <div className="field-grid">
        <label className="field"><span>{t('admin.roleName')}</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={locked} autoFocus={!role} /></label>
        <label className="field"><span>{t('admin.roleDesc')}</span><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} disabled={locked} /></label>
      </div>
      <label className={`admin-toggle${isAdmin ? ' on' : ''}`}>
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} disabled={locked} />
        <span>
          <b>{t('admin.isAdmin')}</b>
          <span className="tiny muted" style={{ display: 'block' }}>{t('admin.isAdminHint')}</span>
        </span>
      </label>

      <div className="perm-grid" aria-disabled={disabled}>
        {groups.map(([group, items]) => {
          const on = items.filter((p) => isAdmin || sel.has(p.key)).length
          const all = on === items.length
          return (
            <fieldset key={group} className="perm-group" disabled={disabled}>
              <legend className="perm-group-head">
                <span className="label">{group}</span>
                <label className="perm-all tiny">
                  <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = on > 0 && !all }}
                    onChange={() => toggleGroup(items, !all)} />
                  {t('admin.selectAll')}
                </label>
              </legend>
              {items.map((p) => (
                <label key={p.key} className="perm-item">
                  <input type="checkbox" checked={isAdmin || sel.has(p.key)} onChange={() => toggle(p.key)} />
                  <span>
                    <span className="perm-label">{p.label}</span>
                    <span className="perm-key mono">{p.key}</span>
                  </span>
                  {(p.key === 'users.manage' || p.key === 'roles.manage') && <span className="badge warn perm-flag">{t('admin.privileged')}</span>}
                </label>
              ))}
            </fieldset>
          )
        })}
      </div>

      {error && <div className="form-error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
      {saved && !error && <div className="form-ok" role="status" style={{ marginTop: 14 }}>{t('admin.saved')}</div>}
      {!locked && (
        <div className="modal-actions">
          {role && (
            <button type="button" className="btn danger" disabled={!canDelete} onClick={onDelete}
              title={role.user_count > 0 ? t('admin.roleInUse', { n: role.user_count }) : ''}>{t('admin.deleteRole')}</button>
          )}
          <span style={{ flex: 1 }} />
          <button type="submit" className="btn primary" disabled={busy}>{busy && <span className="spinner" />}{role ? t('common.save') : t('admin.createRole')}</button>
        </div>
      )}
      {role && role.user_count > 0 && !locked && <div className="tiny muted" style={{ marginTop: 6, textAlign: 'right' }}>{t('admin.roleInUse', { n: role.user_count })}</div>}
    </form>
  )
}

/* ======================= Access requests ======================= */

function RequestsTab() {
  const { t } = useLang()
  const { can } = useAuth()
  const [status, setStatus] = useState('pending')
  const [apps, setApps] = useState(null)
  const [roles, setRoles] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    api.applications(status).then((a) => setApps(sortApps(a))).catch((e) => setError(errMsg(e, t)))
  }, [status, t])
  useEffect(() => { setApps(null); load() }, [load])

  useEffect(() => {
    const p = can('users.manage') || can('roles.manage') ? api.roles() : api.rolesPublic()
    p.then(setRoles).catch(() => api.rolesPublic().then(setRoles).catch(() => {}))
  }, [can])

  const changed = () => { load(); notifyApplicationsChanged() }

  return (
    <section className="stack">
      <div className="row between">
        <h2>{t('admin.requests')} {apps && <span className="muted small">({apps.length})</span>}</h2>
        <div className="seg" role="group" aria-label={t('admin.filter')}>
          {['pending', 'approved', 'rejected', 'all'].map((s) => (
            <button key={s} type="button" className={`seg-btn${status === s ? ' active' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{t(`admin.st.${s}`)}</button>
          ))}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {!apps ? <div className="skeleton" /> : apps.length === 0 ? (
        <div className="empty">{status === 'pending' ? t('admin.noPending') : t('admin.noRequests')}</div>
      ) : (
        <div className="req-list">
          {apps.map((a) => <RequestCard key={a.id || a._id} app={a} roles={roles} onChanged={changed} />)}
        </div>
      )}
    </section>
  )
}

const ORDER = { pending: 0, approved: 1, rejected: 2 }
function sortApps(list) {
  if (!Array.isArray(list)) return []
  return [...list].sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || new Date(b.created_at) - new Date(a.created_at))
}

function RequestCard({ app, roles, onChanged }) {
  const { t } = useLang()
  const { can } = useAuth()
  const withConfirm = useConfirmPassword()
  const fmt = useDate()
  const id = app.id || app._id
  const [mode, setMode] = useState(null) // 'approve' | 'reject'
  const [roleId, setRoleId] = useState(app.requested_role_id || app.requested_role?.id || '')
  const [username, setUsername] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const requested = roles.find((r) => r.id === (app.requested_role_id || app.requested_role?.id))
  const requestedName = app.requested_role?.name || app.requested_role_name || requested?.name || '—'
  const emailedN = Array.isArray(app.emailed_to) ? app.emailed_to.length : Number(app.emailed_to) || 0
  const canApprove = can('users.manage')

  const approve = async (e) => {
    e.preventDefault()
    if (!roleId) { setError(t('admin.needRole')); return }
    setBusy(true); setError('')
    try {
      const body = { role_id: roleId }
      if (username.trim()) body.username = username.trim()
      const res = await withConfirm((pw) => api.approveApplication(id, body, pw))
      setResult(res)
      setMode(null)
    } catch (ex) {
      if (ex.code !== 'cancelled') setError(errMsg(ex, t))
    } finally { setBusy(false) }
  }

  const reject = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api.rejectApplication(id, note.trim())
      setMode(null)
      onChanged()
    } catch (ex) { setError(errMsg(ex, t)) } finally { setBusy(false) }
  }

  const statusBadge = app.status === 'pending' ? 'warn' : app.status === 'approved' ? 'good' : 'dim'
  return (
    <article className={`card req-card status-${app.status}`}>
      <div className="req-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <h3>{app.name}</h3>
            <span className={`badge ${statusBadge}`}>{t(`admin.st.${app.status}`)}</span>
          </div>
          <div className="small muted">{app.email} · <span className="mono">{app.username}</span>{app.organisation ? ` · ${app.organisation}` : ''}</div>
        </div>
        <div className="tiny muted req-date">{fmt(app.created_at)}</div>
      </div>
      <dl className="req-kv">
        <dt>{t('admin.requestedRole')}</dt><dd><span className="badge">{requestedName}</span></dd>
        {app.reason && <><dt>{t('apply.reason')}</dt><dd className="req-reason">{app.reason}</dd></>}
        <dt>{t('admin.emailStatus')}</dt>
        <dd className="small">
          {app.email_error
            ? <span className="email-err">{t('admin.emailError', { err: app.email_error })}</span>
            : emailedN > 0 ? t(emailedN === 1 ? 'admin.emailedAdmins1' : 'admin.emailedAdmins', { n: emailedN })
              : <span className="muted">{t('admin.notEmailed')}</span>}
        </dd>
        {app.status !== 'pending' && (
          <><dt>{t('admin.reviewed')}</dt><dd className="small">{app.reviewed_by_name || app.reviewed_by || '—'} · {fmt(app.reviewed_at)}{app.note ? <div className="muted">“{app.note}”</div> : null}</dd></>
        )}
      </dl>

      {result && (
        <div className="req-result">
          <div className="form-ok">{t('admin.approvedAs', { user: result.user?.username || '', role: result.user?.role?.name || '' })}</div>
          {result.temp_password && <OneTimeSecret value={result.temp_password} />}
          <div className="tiny muted">{result.emailed ? t('admin.applicantEmailed') : t('admin.applicantNotEmailed')}</div>
          <div className="modal-actions"><button className="btn sm" onClick={onChanged}>{t('common.done')}</button></div>
        </div>
      )}

      {app.status === 'pending' && !result && (
        <>
          {mode === 'approve' && (
            <form className="req-form" onSubmit={approve}>
              <div className="field-grid">
                <label className="field"><span>{t('admin.grantRole')}</span>
                  <select value={roleId} onChange={(e) => setRoleId(e.target.value)} autoFocus>
                    <option value="">{t('apply.chooseRole')}</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_admin ? ` · ${t('admin.adminTag')}` : ''}</option>)}
                  </select>
                </label>
                <label className="field"><span>{t('admin.usernameOverride')} <em className="muted">{t('common.optional')}</em></span>
                  <input type="text" value={username} placeholder={app.username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
                </label>
              </div>
              {error && <div className="form-error" role="alert">{error}</div>}
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => { setMode(null); setError('') }}>{t('common.cancel')}</button>
                <button type="submit" className="btn primary" disabled={busy}>{busy && <span className="spinner" />}{t('admin.approveCreate')}</button>
              </div>
            </form>
          )}
          {mode === 'reject' && (
            <form className="req-form" onSubmit={reject}>
              <label className="field"><span>{t('admin.rejectNote')} <em className="muted">{t('common.optional')}</em></span>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder={t('admin.rejectNotePh')} />
              </label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => { setMode(null); setError('') }}>{t('common.cancel')}</button>
                <button type="submit" className="btn danger" disabled={busy}>{busy && <span className="spinner" />}{t('admin.reject')}</button>
              </div>
            </form>
          )}
          {!mode && (
            <div className="req-actions">
              <button className="btn primary" disabled={!canApprove} title={canApprove ? '' : t('admin.needUsersManage')} onClick={() => setMode('approve')}>{t('admin.approve')}</button>
              <button className="btn" onClick={() => setMode('reject')}>{t('admin.reject')}</button>
              {!canApprove && <span className="tiny muted">{t('admin.needUsersManage')}</span>}
            </div>
          )}
        </>
      )}
    </article>
  )
}

/* ======================= shared modal bits ======================= */

function Modal({ title, children, onClose, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal card${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose }) {
  const { t } = useLang()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true); setError('')
    try { await onConfirm() } catch (e) { setError(errMsg(e, t)); setBusy(false) }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{body}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn danger" disabled={busy} onClick={go}>{busy && <span className="spinner" />}{confirmLabel}</button>
      </div>
    </Modal>
  )
}
