# W13 — SCR-06 VIP card, fail-closed

> **Slot:** W13, work slot (`bc-05cba7a1`). One leftover client item, no pull request.
> **Branch:** `cursor/w13-work-client-remain-72c4`, cut from `origin/main` at `14276cb`.
> **Item:** the VIP status card `docs/02-screen-inventory.md` SCR-06 names. C3 numbered client
> items (C3-01, C3-02, C3-04 PNL-01/SCR-09, C3-05, C3-07, C3-10 covers, SCR-03, SCR-12) are on
> `main`. This is the fallback the assignment named: a small fail-closed UX gap already implied
> by a screen, that does not invent Beans.
> **Not in scope:** settings (on `main`), browse (on `main`), catalogue sqlite (on `main` as
> `0007`), search sqlite (`bc-98ce540a`, now on `main` as a port over `0007` — this slot did not
> take `0007`/`0008`), SCR-10/PNL-03, SCR-11, SCR-01, Beans. No pull request.

---

## 1. What was picked, and why

On `origin/main` at `14276cb`:

| C3 client item | State |
| --- | --- |
| C3-01 silent re-login | on `main` |
| C3-02 paging `act` | on `main` |
| C3-04 wallet / PNL-01 | on `main`; SCR-10/11 still gated |
| C3-05 D9 chrome | on `main` |
| C3-07 favourites projection | on `main` |
| SCR-03 browse | on `main` |
| SCR-12 settings | on `main` |

Search sqlite was in flight (`bc-98ce540a`). Catalogue sqlite was already `0007`. This slot did
not open a migration.

The remaining C3 numbered items are gated (C3-08 login, C3-09 Beans, SCR-10/11) or not client
(C3-06 stores, C3-11 gates). SCR-01 still needs `GET /config`, which is not in OpenAPI.

`docs/02-screen-inventory.md` SCR-06 still names a VIP status card. `ProfilePage.tsx` still said
it was not here. `GET /users/me` is not a path. `contracts/openapi.yaml` has no subscription.
Inventing `#/vip` or "not subscribed" is the same class of lie as inventing `0 coins`.

---

## 2. What changed

The signed-in assets area on `#/me` gains a VIP card next to the wallet card. A guest still sees
the login card and nothing else in that area (J10-B).

| Surface | What the viewer gets |
| --- | --- |
| Guest | No VIP card. Assets are the sign-in prompt. |
| Signed in | Heading **VIP**, a statement that status cannot be read, a **disabled** Subscribe button, and the same "not in this version" line PNL-02 already uses. |
| Wallet retry | The VIP card stays. The two cards share no request. |

No `#/vip`. No `<a>` inside the card. No expiry, no active/inactive, no figure, no Beans, no
fiat. The subscribe control is present and disabled for the same reason the wallet's recharge
control is: the inventory asked for the entry, and the contract is named rather than stubbed.

---

## 3. Mutations that bite

Run against this branch, then reverted.

### 3.1 A working `#/vip` link

```
FAIL  src/routes/ProfilePage.test.tsx > the profile VIP card > does not invent a #/vip, a Beans price, or a working subscribe
AssertionError: expected <a …> not to be null
```

That is SCR-11 invented in the client.

### 3.2 "Not subscribed" as a status, or an expiry

```
FAIL  src/routes/ProfilePage.test.tsx > the profile VIP card > quotes no status, because GET /users/me does not exist
AssertionError: expected '…not subscribed…' not to match /active|inactive|expires|expiry|until/i
```

Inventing a negative is still a status the server never sent.

---

## 4. Verify

`pnpm verify` exited 0 on this branch after merging `origin/main` at `5598aba` (search hits
persist via catalogue sqlite `0007`). Overlap was none: this slot is `app/src/routes/ProfilePage*`
plus i18n and the VIP card CSS.

| Package | Tests |
| --- | ---: |
| `packages/shared` | 55 |
| `packages/config` | 45 |
| `packages/quality` | 37 |
| `server` | 1,594 |
| `app` | 964 |
| **Total** | **2,695** |

Format, lint, typecheck, test, build, guardrails all green. Artifact
`dist/assets/index-CFYsMFzN.js` 337.44 kB / 102.92 kB gzip. Guardrails passed.

Four new profile tests. App 960 → 964.

---

## 5. What is still open

- **SCR-01 splash.** Boot already runs `init` and silent login. `GET /config` is not in the
  OpenAPI document; do not invent it in the client.
- **SCR-10 / PNL-03 recharge.** Blocked on a Beans rate (`C3-09`) and `pay()`. The wallet entry
  still says prices have not been set. This slot did not add a second recharge control.
- **SCR-11 VIP.** No subscription contract. This card is the fail-closed stand-in, not the
  screen. A later slot that lands `GET /users/me` or a subscription path replaces the statement
  with a real status; it must not invent one before that.
- **Complete-profile / `authorize`.** Still off SCR-06 and SCR-12. J10-A: the entry belongs with
  the bridge call that does it.
- **PNL-02 on the player.** Unlock is still reachable from DramaPage's rows. A locked picker
  cell is a mark, not a purchase.
- **D9 on a device.** Unchanged. Wired and exercisable; the checklist box stays empty.

Search sqlite (`bc-98ce540a`) landed on `main` as `5598aba` while this slot verified
(`server/src/modules/search/dramas.ts`, `durable-search.test.ts`). This branch has taken that
merge. Files do not overlap.
