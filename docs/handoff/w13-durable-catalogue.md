# Handoff — Wave 13: SCR-12 settings (catalogue already durable)

> **Slot:** W13, work slot (`bc-3553cf8f`).
> **Branch:** `cursor/w13-work-durable-catalogue-72c4`, cut from `origin/main` at `d182043`,
> reset onto `be1b0f8` after leftover C3 landed catalogue sqlite.
> **Item:** C2 **T2-4** remainder — SCR-12 settings · about (`#/settings`). Catalogue sqlite
> was the assigned slice; leftover C3 (`bc-67274eb6`, `cursor/w13-work-durable-catalog-f9cb`)
> merged it to `main` as `0007_catalog` while this slot ran.
> **Not in scope:** browse (already on `main` at `d182043`), search sqlite (`bc-98ce540a`,
> in flight — `0007` is now taken by catalogue, so that sibling must not reuse it), SCR-01
> splash (`GET /config` is not in OpenAPI), SCR-10/11, Beans, a tab bar. No pull request.

---

## 1. What was picked, and why

The assignment was persist **catalogue** as sqlite migration **`0008`** (search sibling may
take **`0007`**). At pick, `origin/main` was `d182043`: browse on main, migrations through
`0006_favorites`, catalogue still `createInMemoryCatalogStore`.

While this slot implemented `0008_catalog`, leftover C3 merged:

```
be1b0f8 Record the W13 merge: the catalogue persists in sqlite
6b0a855 Merge cursor/w13-work-durable-catalog-f9cb
```

That branch used **`0007_catalog`**. Catalogue is durable on `main`. Reusing those files, or
landing a second `0008_catalog` next to `0007_catalog`, would be two schemas for one store.

The assignment's fallback: the next unblocked **client** item from the C3 backlog, not browse,
not search sqlite. Browse is on `main`. Search sqlite is in flight. Remaining unblocked
screens: SCR-01 (blocked on `GET /config`) and **SCR-12** (no data dependency).
`docs/handoff/w13-work-browse.md` named SCR-12 as next.

---

## 2. What changed

`#/settings` (SCR-12). Reachable from the profile entries.

| Surface | What the viewer gets |
| --- | --- |
| Version | `0.0.0`, the package version, not a marketing string |
| Legal | C4/C5 are unpublished. Copy says so. **No ToS or privacy URL is invented.** |
| Support | `mailto:support@example.invalid` — C11 placeholder. A leaked build cannot mail a real inbox |
| On this device | The session is memory-only. No fake "clear cache" button. **No logout** |

"Complete profile" stays off, same as SCR-06: it needs `authorize`, which is not wired.

---

## 3. Files

| File | Contents |
| --- | --- |
| `app/src/routes/settings.ts` | `APP_VERSION`, `SUPPORT_EMAIL` |
| `app/src/routes/SettingsPage.tsx` | the screen |
| `app/src/routes/SettingsPage.test.tsx` | unpublished legal, `.invalid` mail, no logout, no Beans |
| `app/src/routes/routes.ts` | `settings: '/settings'` |
| `app/src/App.tsx` | the route |
| `app/src/routes/ProfilePage.tsx` | the entry |

---

## 4. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | SCR-12, not a second catalogue migration | Leftover C3 owns `0007_catalog` on `main`. Search sqlite is in flight |
| D2 | No ToS/privacy URL | C4/C5 are `[ ]`. A working URL would be a legal document this slot wrote |
| D3 | `support@example.invalid` | C11 is a 2FA portal mailbox. `.invalid` is the repository placeholder |
| D4 | No logout, no clear-cache control | Silent login has no sign-out. The token is memory-only; a button that cleared nothing would lie |
| D5 | No complete-profile entry | Same as SCR-06: `authorize` is not wired |

---

## 5. Mutations

**Invent a ToS `https://` link:** `settings-legal` would contain an `<a>`. The unpublished
assertion fails.

**A working support inbox:** `settings-support-mail` would not contain `.invalid`. Restored.

---

## 6. Verification

`pnpm verify` green on this branch (first try, exit 0).

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,590 |
| `app` | 960 |
| **Total** | **2,687** |

Guardrails passed against `app/dist`. Bundle `index-DjE5Ee-R.js` 336.56 kB (gzip 102.73 kB).

---

## 7. Left open

- **Search directory sqlite.** In flight as `bc-98ce540a`. Catalogue took `0007`; that sibling
  must take a later id (`0008` or after). Do not reuse `0007`.
- **SCR-01 splash.** Still needs `GET /config`, which is not an OpenAPI path. Do not invent it.
- **SCR-10 / PNL-03, SCR-11.** Blocked on Beans (`C3-09`) and a subscription contract.
- **C11 mailbox, C4/C5 URLs.** Business inputs. Replace the `.invalid` address when the portal
  mailbox exists; do not invent a working one before that.
- **PostgreSQL / Drizzle (T14 / T16).** Catalogue sqlite is on `main`. Do not rewrite a
  postgres URL to a file.

Browse (`bc-7cccf28c`) and leftover C3 catalogue (`bc-67274eb6`) landed on `main` as
`d182043` and `be1b0f8` while this slot ran. This branch takes `be1b0f8` and does not retake
their files.
