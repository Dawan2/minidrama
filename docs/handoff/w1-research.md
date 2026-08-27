# W1 Research — Handoff

> Wave 1 · official research slot (W1 WORK SLOT 1). Branch: `cursor/w1-research-official-bb4f`,
> branched from `cursor/w1-architecture-bed5` so the architecture set is present and cross-references
> resolve.
> Constraints observed: no subagents, no pull request, commit and push only, Markdown under `docs/`,
> **no architecture or design file rewritten** — every disagreement is registered as a finding for the
> owning slot.

---

## 1. What this slot was asked to do, and what it found

The brief was to fetch the official 小程序短剧接入 One Page from Feishu, cross-check it against the
public TikTok Minis documentation, and fill in the **U-01 – U-22** uncertainty register that the
design slot left open in `docs/design/minis-integration.md` §2.2.

**The One Page was retrieved in full.** That alone closes blocker **B-1**, which every Wave 1
document so far has carried: the platform conclusions in the repository no longer rest on public
documentation alone. Beyond that:

- **Seven U-items moved to verified** — U-07, U-10, U-15, U-18, U-20, U-21, U-22. Two more (U-09,
  U-11) are resolved in mechanism with only values outstanding. Five are narrowed, three unchanged.
- **Blocker B-2 is closed.** The webhook signature algorithm is published, and the guess recorded in
  `docs/handoff/w1-architecture.md` §3 — "HMAC-SHA256 over the raw body with a timestamp window" —
  turns out to be exactly right, down to the raw-body requirement.
- **Open item O-1 is closed.** Mini dramas use the bare `TTMinis.*` namespace; `TTMinis.game.*`
  belongs to the mini-games product line, which also ships a different CLI.
- **Two findings need a decision, not an implementation.** The media plane may not be available to us
  at launch, and the EIS compliance review is a long-lead gate nobody is tracking. Both are in §4.

---

## 2. Deliverables

| File | Contents |
|---|---|
| `docs/research/one-page-feishu.md` | Structured extract of the Feishu One Page — onboarding pipeline, qualification and compliance gates, Portal field specifications, SKU and IAA policy, review and release rules, the media-asset pilot notice, traffic entries, analytics, the full settlement model, and all five FAQ sections. Includes §13, the six substantive divergences between the Chinese and English versions of the same page, and §14, the ten findings for other slots |
| `docs/research/tiktok-minis-official.md` | Primary-source research on the public documentation: the two SDK namespaces and toolchains (§2), identity (§3), VePlayer and preload (§4), media assets and playability (§5), monetization including the webhook signature algorithm (§6), build/config/release (§7), the four places the official docs contradict themselves (§8), and **§9, the U-01 – U-22 disposition table** |
| `docs/research/sources.md` | Graded source register (A/B/C), the 23 Lark documents the One Page references but which were not retrieved, the 14 public pages that were, and a reproducible description of the capture method with its known losses |
| `docs/research/gaps.md` | **Only what is still open.** Four decision-level gaps, nine API-surface gaps, six business/operations items, and a closing table of what not to re-open |
| `docs/handoff/w1-research.md` | This file |

Nothing outside `docs/research/` and `docs/handoff/` was touched: `git diff
origin/cursor/w1-architecture-bed5...HEAD` reports additions only, so `docs/architecture/*` is
byte-identical to the branch this slot started from.

`docs/design/*` does not exist on this branch — it lives on `cursor/w1-technical-design-docs-8a32`,
which was never merged in. The U-01 – U-22 register was read out of that branch with `git show` and
is left exactly as it stands there; the disposition in `docs/research/tiktok-minis-official.md` §9 is
a **commentary on** that register, not an edit to it. Whoever merges the two branches still has to
carry the resolved values into `docs/design/minis-integration.md` §2.2.

---

## 3. How the One Page was obtained, and how much to trust it

This matters because the answer is not "downloaded a PDF".

The page is a Lark wiki document. A plain HTTPS fetch returns a login redirect; an anonymous guest
session gets the SSR shell but not the body; the Lark document-content APIs reject the guest session.
The body renders client-side into a **virtualised DOM**, so a single rendered snapshot returns only
the first screen — which is why an initial fetch produced about 1,300 characters and stopped at
section 2.2.

The document was captured by driving a headless Chromium through the whole page, harvesting every
`data-block-id` node as it entered the DOM, and collapsing Lark's parent/child text duplication.
2,640 blocks over a ~100,000 px document reduced to 365 distinct content blocks, roughly 103 KB of
text, with continuous section numbering from §1 to §7 in both language versions — which is the
evidence that nothing in the middle was skipped. The method is written up in
`docs/research/sources.md` §5 so the next person can repeat it.

**Two limits to keep in mind when reading the extract:**

1. **Images did not survive.** 12 screenshots, 14 whiteboard diagrams and 4 attachments were lost.
   Where the original conveys something only visually — most notably the **Google Play platform fee**
   in §6.1.1 — the extract records the caption and marks it visual-only.
2. **The page's header said "Modified Today".** This is a same-day snapshot of a living document.
   Anything time-sensitive, particularly the dated notices in §2.3.2, §2.4 and §3, should be
   re-checked rather than assumed stable.

---

## 4. The two findings that need a decision

### 4.1 The BytePlus + VePlayer media plane may be a pilot we are not in

`docs/architecture/system-overview.md` corrections A1–A3 derive the entire media design — no
`<video>` element anywhere in the bundle, no own CDN, playability enforced by the platform — from the
VePlayer mandate being in force today. The public
[Minis Player](https://developers.tiktok.com/docs/en/minis-player) doc does state it in the present
tense, and that reading is defensible.

The One Page §3 carries a notice dated 2026-06-25 that reads differently. In English: pilot access
"will begin in July", and **"developers who are not included in the pilot can continue to use their
own solutions"**, with the switchover date to be announced and "sufficient switching time" reserved.
In Chinese, more conservatively: 方案处于试点阶段，**尚未开放统一接入**, with phase-one invited
testing already closed.

Both can be true — the public doc describing the destination, the One Page describing the rollout —
but they imply different launch plans. If we are not in the pilot, our launch media plane is ours,
and VePlayer becomes a migration rather than a foundation. **This is worth resolving before Wave 2
scopes the media work**, and the fastest route is the account manager plus the media library and
player integration guide (S-OP-1). The One Page also offers a useful first step regardless of the
answer: pre-register BytePlus account information so the platform can assist with preferential
pricing, account opening and upload preparation.

Registered as gap **G-R1** and finding **F-2**. The architecture's abstraction survives either way —
the playback API already returns a descriptor rather than a URL — so nothing needs to be undone. What
changes is the plan, not the interfaces.

### 4.2 EIS compliance review is a dated gate with 15–30 US business days of lead time

From **2026-08-08**, every IAA and IAP Minis launching in the **US or EU** must pass the External
Information Sharing (EIS) compliance review. Processing takes **15–30 US business days** after
submission. IAA Minis additionally receive a **TPRM questionnaire**, and US launch additionally
requires a separate **USDS TPRM review**. From the same date both IAA and IAP Minis must select
sensitive data in the questionnaire — and inability to select it is the signal that the entity is
associated with a restricted region, which would make US listing impossible outright.

The specification details are not public; the full rules sit behind an **NDA** at
`developers.tiktok.com/doc/data-access-compliance-requirements`, readable only by Org Admins and
Owners.

No Wave 1 document tracks this. It is pure calendar with no engineering compression available, it
gates any US or EU launch, and its first input — whether our entity, its operating location and its
controlling shareholders fall on the restricted-country list — is not knowable from any document this
slot could read. Registered as gap **G-R5** and finding **F-3**.

---

## 5. Findings for the other slots

Ten in total, listed in full with affected files in `docs/research/one-page-feishu.md` §14. **No
upstream file was edited.** The four that change work rather than confirm it:

| # | Finding | Who should act |
|---|---|---|
| **F-4** | **IAA placement policy is a review criterion, and it constrains the unlock UX.** Rewarded ads are permitted in exactly two places: after an episode finishes, before the next one starts; and when the user manually skips the current episode, e.g. by dragging the progress bar. Explicitly prohibited: auto-triggered rewarded ads on auto-play or auto-next, and rewarded ads popping up mid-episode when the user moves the progress bar. Interstitials must never appear when the Minis opens and must observe a cooldown. Journey J5 and the unlock panel PNL-02 currently assume a free-form "watch an ad to unlock" button, which does not obviously fit either permitted slot | W1 design / product |
| **F-5** | **IAA requires TikTok ≥ 44.2.0, and TikTok Pro Android does not support it at all.** Paid traffic is already capped at 44.2.0+ by the ads product, but **organic traffic below that is ours to detect and prompt** — the platform suggests a toast guiding the upgrade. This is a concrete requirement on the capability policy, not just another `canIUse` call | W1 design |
| **F-6** | **`login` has no frequency control, and calling it on entry and again before ordering is the platform's own recommendation.** It is also the only way to detect an account switch, because TikTok clears the `tiktok.com` cookie on switch but state held in web storage is undetectable. Our session design keeps nothing durable in web storage, so this pattern is both available and necessary | W1 design |
| **F-7** | **Beans economics.** TikTok reports 100 Beans = 1 USD to the stores; the user actually pays roughly 100 Beans = 1.5 USD after tax and channel fees. Recharge **rounds up to the nearest tier**, so a user who recharges 100 and spends 90 leaves 10 Beans on their TikTok account — and **developer revenue counts Beans consumed, not Beans recharged**. Own-UI prices should be displayed in **USD**, because the TikTok account region and the store region can differ and change | W1 architecture + design |

Three more are confirmations rather than changes: the one-production-plus-one-canary release model,
the required-capability list including interstitials, and the platform runtime restrictions all match
what the architecture already says, now from the primary source.

---

## 6. Two operational facts worth pulling out

Both come from `docs/research/tiktok-minis-official.md` §5 and neither is in the Wave 1 set.

**Moderation has two lanes, and the architecture diagram shows only the fast one.** Normal moderation
takes **2 weeks**; the urgent lane takes **1–3 working days** and is capped at **35 shows per
organisation per day**. `docs/architecture/system-overview.md` §6.1 labels the pipeline "1–3 working
days", which is the urgent lane. Catalogue build-out should be planned against the 2-week default.

**One rejected episode dark-screens the whole drama.** The media-asset documentation states it twice:
"as long as any drama shell element or any episode within a drama version fails moderation, all
episodes under that version cannot be played." Playability is a property of the `(album_id, version)`
pair, not of the episode. Our kill switch and drift reconciler must therefore operate at version
granularity and hide the whole drama pre-emptively, rather than greying out one cell in the episode
grid — which is what a naïve reading of the review-status enum would produce.

A third, smaller one: the BytePlus `AccessKeyID` / `SecretAccessKey` bound on the Dev Portal are a
production-outage risk. If they rotate without the Portal being updated, **every video-related open
API call becomes invalid and playback stops**. Key rotation needs a runbook.

---

## 7. Where the official documentation contradicts itself

Four places, detailed in `docs/research/tiktok-minis-official.md` §8. Flagged here because each is
somewhere a Wave 2 implementer could write correct code against one source and fail against another:

1. **`minis.config.json` key names** — the same page gives three inconsistent shapes
   (`bgColorLight` vs `lightModeBgColor`, `build.outputDir` vs `build.output` vs a `build.folderName`
   mentioned only in prose, `domain.trustedDomains` vs `domain.allowList`). Generate the file with the
   real CLI; never hand-author it.
2. **CLI package and commands** — drama pages say `tiktok-minis-cli` and `minis dev|build`; the
   mini-games page that actually documents `minis.config.json` says `@tiktok-minis/cli` and
   `ttdx minis`. They may be two different toolchains with two different config schemas.
3. **Subtitle formats** — the player doc gives WebVTT/SRT/ASS/SSA, the media-asset doc gives
   VTT/SRT/ASS/TTML. Author in SRT or VTT, which every source agrees on.
4. **Apple platform fee** — 30% in the One Page's SKU pricing section, 15% in the One Page's own
   settlement formula. The contract governs.

---

## 8. What did not get done, and why

- **The 23 Lark documents referenced by the One Page were not fetched.** They are separate wiki
  documents, each needing its own capture pass, and several are behind an NDA or a role check. They
  are catalogued with IDs in `docs/research/sources.md` §2.1 so the next slot can prioritise. The
  three most valuable are **S-OP-1** (media library and player — resolves G-R1), **S-OP-11**
  (subscription integration guide — likely resolves U-08 / G-R6) and **S-OP-14** (Generate Minis Link
  Open API — likely resolves G-R9 and G-R10).
- **No images or diagrams were recovered.** The Google Play platform fee, the Dev Portal walkthrough
  screenshots and the subscription tier display figures exist only as images in the original.
- **Nothing was verified on a device.** Every open item that resolves through "run it and see" —
  the SDK error shape, timeout behaviour, lifecycle events in the drama namespace, autoplay policy,
  MSE availability in the real WebView — stays open by design. They are listed in
  `docs/research/gaps.md` §2 with the isolation that keeps each of them non-blocking.

---

## 9. Suggested next steps

In rough order of value:

1. **Ask the account manager about pilot inclusion** (G-R1). It has the largest blast radius of
   anything open, and it is a single question.
2. **Start the EIS clock, or decide the US and EU are out of scope for v1** (G-R5). It is the longest
   lead time in the project and it cannot be compressed.
3. **Read the region picker in the Dev Portal** (G-R2) rather than either version of the One Page,
   and settle the launch region list — it decides currency presentation, locale set and whether RTL
   is in scope at all.
4. **Capture the three high-value Lark sub-documents** (S-OP-1, S-OP-11, S-OP-14) using the method in
   `docs/research/sources.md` §5.
5. **Implement the real webhook verifier** behind the existing `SignatureVerifier` interface — the
   algorithm is now known, and the compensating order-query sweeper can stay as the safety net.
6. **Take F-4 to product.** The rewarded-ad placement rules are review criteria, and they may not fit
   the unlock panel as currently designed. Finding that out at submission time would be expensive.

---

## 10. Branch and verification

| | |
|---|---|
| Branch | `cursor/w1-research-official-bb4f` |
| Branched from | `cursor/w1-architecture-bed5` at `3692cf5` |
| Files added | 5, all Markdown, all under `docs/` |
| Files modified | 0 |
| Files deleted | 0 |
| Pull request | none, per the brief |

Verify that no upstream document was touched:

```bash
git diff --stat cursor/w1-architecture-bed5..cursor/w1-research-official-bb4f
# expect only docs/research/*.md and docs/handoff/w1-research.md
```
