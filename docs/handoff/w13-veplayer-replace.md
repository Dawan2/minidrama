# Handoff — Wave 13: native `<video>` replacement stays fail-closed

> **Slot:** W13, work slot (`bc-f269a2f6`).
> **Branch:** `cursor/w13-work-veplayer-replace-72c4`, cut from `origin/main` at `ba4bfb3`.
> **Scope:** wire TikTok Minis `setValidateVideoReplaceElement` so a disallowed `<video>` is
> replaced with the platform's default blocked UI, never with a custom element and never with the
> original player. Product code still cannot name the API.
> **Not in scope:** silent re-login (`bc-3365072b`), the ERROR_OUTCOMES test (already on `main`),
> CoverImage, paging flakes, cycle docs, D9 capsule, wallet, favourites projection. No pull request.

---

## 1. The gap

Playback sessions already exist: `createPlayerFacade` builds a VePlayer instance from
`bridge.getPlayerCtor()`, and `PlayerSurface` mounts it. Native `<video>` is banned in lint, the
bundle scan, HTML integrity, and the mock player. What was still missing is the runtime hook the
platform actually uses when a `<video>` appears anyway.

The documented API ([TikTok Minis Player](https://developers.tiktok.com/docs/en/minis-player)):

```
TTMinis.setValidateVideoReplaceElement(customReplaceElement: (
  videoEl: HTMLVideoElement,
  replaceReason: string,
) => HTMLElement | null)
```

It customises the element that *replaces* a disallowed `<video>`. Returning the original element
would keep native video on screen. Returning any other `HTMLElement` would paint our own blocked
UI — the migration mitigation `docs/plan/media-plane-decision.md` SR-5 forbids. Returning `null`
leaves TikTok's default blocked UI in place.

`docs/plan/cycle-3-backlog.md` C3-10 / D-06 asked for the identifier to be banned from the whole
bundle. That reading of fail-closed would make the runtime policy unenforceable: the installer
*must* name the method to call it. This slot wires the fail-closed callback and bans the identifier
everywhere else. The bundle scan's native-`<video>` rules are unchanged and still fail-closed.

The method also exists on the constructor `TTMinis.getPlayer()` returns. Both homes are installed
with the same callback.

---

## 2. What changed

| File | Change |
| --- | --- |
| `app/src/platform/video-replace.ts` | New. `refuseVideoReplace` always returns `null`. `installFailClosedVideoReplace` installs that function on a namespace or a constructor. Missing or throwing is `absent` / `threw`, not a boot failure |
| `app/src/platform/video-replace.test.ts` | New. 19 tests: the callback, the installer, and TikTokBridge wiring |
| `app/src/platform/tiktok-bridge.ts` | `init` installs on the namespace. `getPlayerCtor` installs on the constructor |
| `app/tools/source-rules.ts` | Production source may name `setValidateVideoReplaceElement` only in `src/platform/video-replace.ts` |
| `app/tools/source-rules.test.ts` | Fixture: a player component that returns the original element is rejected; the installer is accepted |
| `app/tools/bundle-scan.test.ts` | The installer call is not a native-`<video>` match |
| `app/src/testing/import-hygiene.test.ts` | Production source contains no `<video` tag and no `createElement('video')` |
| `docs/handoff/w13-veplayer-replace.md` | This document |

Not on `PlatformBridge`. A screen that could call this API is a second policy. The installer is an
init-time side effect of the real bridge, the same way capability probing is.

`refuseVideoReplace`'s return type is `null`, not `HTMLElement | null`. A callback that started
returning an element fails typecheck, not only a runtime assertion.

`installFailClosedVideoReplace` accepts functions as well as objects. `typeof` a constructor is
`'function'`; treating only `'object'` as a target would skip the `getPlayer()` path, which is the
one the player actually exposes. A test installs on a constructor and would go green-on-absent if
that check were narrowed.

The mock bridge does not grow a method. It never creates a `<video>`, so there is nothing to
replace, and adding a customisation hook to the mock would be the thing the mock exists to avoid.

---

## 3. Mutations that bite

Run against this branch, then reverted. None of these is a typecheck-only catch.

### 3.1 `refuseVideoReplace` returns the original element

```diff
 export function refuseVideoReplace(_videoEl: HTMLVideoElement, _replaceReason: string): null {
-  return null;
+  return _videoEl;
 }
```

9 of 19 tests failed. The first:

```
FAIL  src/platform/video-replace.test.ts > refuseVideoReplace > does not return an HTMLElement of any kind
AssertionError: expected { nodeName: 'VIDEO', tagName: 'VIDEO' } to be null
```

The `it.each` over replace reasons failed the same way, and so did "the installed callback still
returns null when the SDK later invokes it". A callback that kept native video on screen would
have passed every other suite in the repository.

The test fixture is `{ nodeName: 'VIDEO', tagName: 'VIDEO' } as HTMLVideoElement`. It is not
`document.createElement('video')`. Lint, the bundle scan and the source rules all reject that
call, including in tests, because a fixture that built the banned element would teach the suite
the element is fine.

### 3.2 `init` no longer installs the callback

```diff
-      installFailClosedVideoReplace(this.#namespace);
+      // skipped
```

```
FAIL  src/platform/video-replace.test.ts > TikTokBridge wires the fail-closed replace policy
      > installs refuseVideoReplace on the namespace at init
AssertionError: expected "spy" to be called 1 times, but got 0 times
```

18 other tests still passed, including "still inits when the method is missing". The wiring test
is not implied by boot succeeding.

### 3.3 The installer passes `(el) => el` instead of `refuseVideoReplace`

```diff
- (install as …).call(target, refuseVideoReplace);
+ (install as …).call(target, (el) => el);
```

5 of 19 tests failed. Identity:

```
FAIL  … > installs refuseVideoReplace, not a different callback
AssertionError: expected [Function anonymous] to be [Function refuseVideoReplace]
```

And the SDK-invokes-it case:

```
expected { nodeName: 'VIDEO', tagName: 'VIDEO' } to be null
```

A custom callback that kept the original element would have satisfied a test that only asserted
"the method was called".

### 3.4 A product file names the API

`PlayerSurface.tsx` gained:

```ts
void (globalThis as { setValidateVideoReplaceElement?: unknown }).setValidateVideoReplaceElement;
```

```
FAIL  tools/source-rules.test.ts > source tree rules > accepts the source tree that ships
received: [{
  evidence: "void (globalThis as { setValidateVideoReplaceElement?: unknown }).setValidateVideoReplaceElement;",
  file: "src/player/PlayerSurface.tsx",
  line: 8,
  rule: "setValidateVideoReplaceElement may only be installed from src/platform/video-replace.ts",
}]
```

That is C3-10's reverse-verification, aimed at product code rather than at the installer. The
committed fixture in `source-rules.test.ts` is the same shape: a `PlayerSurface` that does
`ns.setValidateVideoReplaceElement((el) => el)` is rejected, and the installer module is accepted.

---

## 4. Why this is not a bundle-scan identifier ban

C3-10 acceptance item 1 asked for `setValidateVideoReplaceElement` to be a banned identifier in
the source rules *and* the bundle scan. The source-rule half is delivered, scoped to product
code. The bundle-scan half is not, on purpose:

- The installer is in the artifact. A scan that failed the build for naming the method would
  fail the build for the thing that keeps replacement fail-closed.
- `bundle-scan.test.ts` now includes the installer call in the "leaves alone" table, next to
  `kind: "video"` and `jsx("video-card")`, so a later identifier ban would have to delete that
  row rather than land silently.
- The bundle scan's native-`<video>` rules (`createElement('video')`, `jsx("video")`, the
  minified factory shape) are untouched. `pnpm check:guardrails` still fails closed on a missing
  artifact and on a media element in `dist`.

SR-5's intent — "it is not called in product code"; "a custom replacement is a mitigation, not a
design" — holds. The letter that banned the identifier from the *bundle* does not, because wiring
the fail-closed callback is what the playback surface now needs.

---

## 5. Ranking

Cycle 3 Tier A still has higher-ranked code items (C3-05 D9, C3-07 favourites projection, C3-04
wallet). This slot was assigned the VePlayer replace gap specifically. Sibling `bc-3439f016`
("W13 work next cycle-3 item") is the slot that picks the next highest. In flight and not
duplicated: silent re-login (`bc-3365072b`), ERROR_OUTCOMES (already on `main`).

---

## 6. Verify

Recorded after the implementation commit. `pnpm verify` is format, lint, typecheck, test, build,
guardrails.

Native `<video>` remains absent from app production source (`rg` over `app/src` excluding tests
and comments finds the installer and the type `HTMLVideoElement` only). The mock player still
renders a `div`.

---

## 7. Conflict register

None opened. `tiktok-bridge.ts` already exposed `setNavigationBarColor` / `getMenuButtonRect`;
this slot does not grow `PlatformBridge`. `source-rules.ts` gained one identifier rule; a sibling
adding a different source rule on the same file would conflict.

Files this branch owns:

- `app/src/platform/video-replace.ts` (new)
- `app/src/platform/video-replace.test.ts` (new)
- `app/src/platform/tiktok-bridge.ts`
- `app/tools/source-rules.ts`
- `app/tools/source-rules.test.ts`
- `app/tools/bundle-scan.test.ts`
- `app/src/testing/import-hygiene.test.ts`
- `docs/handoff/w13-veplayer-replace.md`
