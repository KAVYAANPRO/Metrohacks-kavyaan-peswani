# Yieldline auth & roles: shared contract

No public sign-up. Users only **sign in**. Outsiders can **apply for access**; the application is emailed to every admin and appears in the admin inbox.

## Permissions (keys are fixed)

| key | group | label |
|---|---|---|
| dashboard.view | Insights | View revenue dashboard (totals, breakdowns) |
| ppp.view | Insights | View PPP / partner revenue split |
| stations.view | Insights | View stations & footfall |
| spots.view | Inventory | View spots & prices |
| ratecard.view | Inventory | View rate card calculation & footfall chart |
| assumptions.edit | Inventory | Edit pricing assumptions (sliders) |
| spots.status | Inventory | Mark spots filled / vacant |
| pitch.view | Sales | View saved pitches & export PDF |
| pitch.generate | Sales | Generate / regenerate AI pitches |
| export.csv | Sales | Download rate card CSV |
| data.manage | Administration | Reseed / import footfall data |
| users.manage | Administration | Create & edit users |
| roles.manage | Administration | Create & edit roles and permissions |
| applications.review | Administration | Review access requests |

"Privileged" permissions: `users.manage`, `roles.manage`. An **admin role** is a role with `is_admin: true` (has all permissions implicitly).

## Default roles (seeded once if `roles` collection is empty; `system: true` for Admin)

1. **Admin**: is_admin, all permissions.
2. **Commercial Manager**: everything except data.manage, users.manage, roles.manage, applications.review.
3. **Revenue Analyst**: dashboard.view, ppp.view, stations.view, spots.view, ratecard.view, assumptions.edit, pitch.view, export.csv.
4. **Sales Executive**: stations.view, spots.view, ratecard.view, pitch.view, pitch.generate, export.csv.
5. **PPP Partner**: dashboard.view, ppp.view, stations.view, spots.view, pitch.view, export.csv.
6. **Station Auditor (read-only)**: dashboard.view, stations.view, spots.view, ratecard.view.

First admin user is created from `.env` `ADMIN_USERNAME` / `ADMIN_PASSWORD` only if the `users` collection is empty. Its `email` is null, so it must enter a Gmail on first login.

## Rules
- Passwords hashed with Node `crypto.scrypt` (random 16-byte salt), never logged or returned.
- Token: HMAC-SHA256 signed JWT (`JWT_SECRET`), 12 h expiry, payload `{sub: user_id, v: token_version}`. Header `Authorization: Bearer <token>`. Changing password / deactivating a user bumps `token_version` (invalidates old tokens).
- Login lockout: 5 failed attempts per username → locked 5 minutes (429 `{error:'locked', retry_after_s}`).
- **Setup gate**: if user is an admin with no email (`needs_email`), or has `must_change_password`, every API call except `/api/auth/me`, `/api/auth/complete-setup`, `/api/auth/logout` returns 403 `{error:'setup_required'}`.
- **Re-enter password to make an admin**: creating/updating a user so they get an admin role or a role with a privileged permission, OR creating/updating a role so it becomes is_admin or gains a privileged permission, requires `confirm_password` = the acting user's own password. Missing → 403 `{error:'password_required'}`; wrong → 403 `{error:'invalid_password'}`.
- Cannot delete/deactivate yourself, cannot remove the last active admin, cannot delete the system Admin role or a role that still has users.
- Errors: 401 `{error:'unauthorized'}` (missing/invalid/expired token), 403 `{error:'forbidden', permission:'<key>'}`.

## Data (Mongo collections, in-memory fallback like the rest of store)
- `users`: `{_id, username (unique, case-insensitive), name, email, password_hash, role_id, active, must_change_password, token_version, created_at, last_login_at}`
- `roles`: `{_id, name, description, is_admin, permissions: [keys], system, created_at}`
- `applications`: `{_id, name, email, username, organisation, requested_role_id, reason, status: pending|approved|rejected, created_at, reviewed_by, reviewed_at, note, emailed_to: [emails], email_error}`

## API (all under /api)

Public:
- `POST /auth/login` `{username, password}` → `{token, user}`
- `GET /auth/roles-public` → `[{id, name, description}]` (non-admin roles only; for the apply form)
- `POST /applications` `{name, email, username, organisation, requested_role_id, reason}` → `{ok:true, emailed:<number of admins emailed>}`. Validates fields, rejects a username that already exists or a pending duplicate. Sends email to all active admins with an email (if SMTP configured).
- `GET /health` stays public.

Authenticated:
- `GET /auth/me` → `{user}`
- `POST /auth/complete-setup` `{email?, new_password?}` → `{user, token}` (new token if password changed). email must be valid (Gmail suggested); new_password ≥ 8 chars.
- `POST /auth/change-password` `{current_password, new_password}` → `{token, user}`
- `POST /auth/logout` → `{ok:true}`

`user` object shape returned everywhere:
```json
{ "id": "...", "username": "Kavyaan", "name": "Kavyaan", "email": null,
  "role": { "id": "...", "name": "Admin", "is_admin": true },
  "permissions": ["dashboard.view", "..."],
  "needs_email": true, "must_change_password": false, "active": true,
  "created_at": "...", "last_login_at": "..." }
```

Admin:
- `GET /permissions` → `[{key, label, group}]` (any logged-in user)
- `GET /roles` (roles.manage or users.manage) → `[{id, name, description, is_admin, permissions, system, user_count}]`
- `POST /roles` (roles.manage) `{name, description, permissions, is_admin, confirm_password?}`
- `PATCH /roles/:id` (roles.manage) same fields
- `DELETE /roles/:id` (roles.manage)
- `GET /users` (users.manage) → `[user]`
- `POST /users` (users.manage) `{username, name, email, role_id, password?, confirm_password?}` → `{user, temp_password}` (temp password generated if no password; user gets must_change_password=true)
- `PATCH /users/:id` (users.manage) `{name, email, role_id, active, confirm_password?}` → `{user}`
- `POST /users/:id/reset-password` (users.manage) → `{temp_password}`
- `DELETE /users/:id` (users.manage)
- `GET /applications?status=pending|approved|rejected|all` (applications.review)
- `POST /applications/:id/approve` (applications.review **and** users.manage) `{role_id, username?, confirm_password?}` → `{user, temp_password}`; emails the applicant their username + temp password if SMTP configured.
- `POST /applications/:id/reject` (applications.review) `{note?}`

Existing routes now require:
| route | permission |
|---|---|
| GET /summary | dashboard.view (strip `ppp` field unless ppp.view) |
| GET /stations, /stations/:id, /stations/:id/footfall | stations.view |
| GET /spots, /spots/:id, /compare | spots.view |
| GET /spots/:id/ratecard, GET /assumptions, POST /simulate | ratecard.view |
| POST /assumptions, POST /assumptions/reset | assumptions.edit |
| PATCH /spots/:id/status | spots.status |
| GET /spots/:id/pitch, /spots/:id/pitches | pitch.view |
| POST /spots/:id/pitch, /pitches/pregenerate (both GET and POST) | pitch.generate |
| GET /ratecard.csv | export.csv (frontend downloads via fetch with Authorization header → blob) |
| POST /admin/* | data.manage |

## Email
nodemailer, Gmail SMTP from `.env`: `SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS` (Gmail App Password), `MAIL_FROM` (default SMTP_USER), `APP_URL`. If SMTP not configured: log a warning, set `email_error: 'SMTP not configured'` on the application. Still saved and visible in the admin inbox. `GET /health` includes `mail: {configured: bool}`.
