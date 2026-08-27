# W1 Product IA / Journeys / Compliance — Handoff

> Wave 1 · product slot. Branch `cursor/w1-product-ia-9cd1`, branched from `cursor/w1-architecture-bed5`
> (base commit `3692cf5`), which itself carries the earlier Wave 1 documents so all cross-references resolve.
> Constraints observed: no subagents, no pull request, no architecture file rewritten, no test removed, no CI
> weakened, all output is Markdown under `docs/`.

---

## 1. Deliverables

| File | Contents |
|---|---|
| `docs/product/sitemap-and-ia.md` | Surface ownership map (what TikTok renders vs what we render), sitemap, player surface anatomy and plugin policy, preload-aware IA, route table, back-stack amendments, entry points, catalogue IA, **operations console IA**, localization IA, gap register G9–G14, supersession table |
| `docs/product/user-journeys.md` | Ten amendments (PA-1 … PA-10) to the existing J1–J14, five new consumer journeys (J15 platform-blocked playback, J16 continuity and first frame, J17 subtitles, J18 legacy clients and capability degradation, J19 reviewer walkthrough) and five new operator journeys (J20 publishing, J21 rejection and appeal, J22 emergency takedown, J23 user reports, J24 organization onboarding) |
| `docs/product/compliance-tiktok-minis.md` | The One Page gap closure: source and coverage, the five-stage onboarding chain, sixteen previously-unknown facts (ONE-1 … ONE-16), runtime obligations RC-1 … RC-12, six registered conflicts, three proposed risk entries, critical path, open questions, and **Appendix A: the extracted One Page text (§1–§2.5)** |
| `docs/product/acceptance-criteria.md` | 67 criteria in nine groups with Given/When/Then statements, verification method per criterion, a release-blocking subset, and a journey→criteria traceability matrix |
| `docs/handoff/w1-product-ia.md` | This file |

The single Mermaid diagram in `sitemap-and-ia.md` was rendered with `@mermaid-js/mermaid-cli` to confirm it parses.

---

## 2. The One Page: what was actually obtained

The task named the Feishu source as official and said the PDF was skipped. The document was fetched.

| Property | Value |
|---|---|
| URL | `https://bytedance.larkoffice.com/wiki/MJ2BwFqSxi4r2SkwHS8cRrlsnVb` |
| Retrieved | 2026-08-27, anonymous access |
| Method | The wiki page ships the document's block payload inside the server-rendered HTML. The payload was parsed back into ordered text and tables, including table cell contents |
| Obtained | §1 introduction through §2.5 basic information, all tables in that range |
| Not obtained | Everything after the basic-information field table. Feishu paginates block delivery and serves the remainder only to authenticated sessions; the document API redirects anonymous callers to login. Screenshots, two board diagrams, one file attachment and two synced blocks are also unavailable |

The extract is reproduced in `docs/product/compliance-tiktok-minis.md` Appendix A, in the original Chinese with
English glosses, so the next reader can diff against an authenticated copy without re-deriving anything.

**Effect on blocker B-1.** It is no longer true that the One Page "could not be located". It is now half-read. The
proposed replacement wording for `docs/architecture/risks.md` §5 is in `compliance-tiktok-minis.md` §2 — deliberately
proposed rather than applied, because this slot does not edit architecture files.

---

## 3. Gaps closed

### Against the One Page

The most consequential finding is **EIS**: after 2026-08-08, launching an IAA or IAP mini program in Europe or the
US requires passing the EIS compliance review, whose criteria are not public, and whose recommended first step is
an off-system questionnaire with the account manager. No repository document mentioned it. It changes the shape of
the launch plan for any monetized Western launch.

Also new, and all recorded as ONE-1 … ONE-16 with their landing places:

- Organization name and app name are **permanent**, and both are created before any engineering starts.
- IAA became self-service in the Portal on 2026-07-09 — contradicting the checklist's assumption that an account
  manager must allowlist the organization.
- Contract signing is a four-step Portal flow attached to enabling IAP.
- Entity verification typically takes three working days; merchant qualification will become mandatory for
  publishing dramas and for monetization.
- USDS disqualifies restricted-country entities from US listing outright, and otherwise weighs requested data types
  against demonstrated security capability, evidenced by materials such as a penetration test report.
- The US data-access compliance requirements are readable only after the org Admin and Owner sign an NDA.
- Practical onboarding detail that unblocks on-device testing: prepare one US and one JP TikTok account, registered
  with the SIM removed and the system language set to the target country.
- The representative-work requirement (risk P-2) has a documented workaround: a group-relationship document or an
  authorization PDF, with a sample provided.

### Against the VePlayer architecture

The product documents predated corrections A1–A6 and still described a self-hosted media plane. Closed by:

- A **surface ownership map** and a plugin policy, replacing the assumption that the player screen is ours to
  build. PNL-05 is deleted; definition, rate and subtitles are VePlayer plugins.
- Episode switching restated as `playNext` on one retained instance rather than a route `replace`.
- Signed-URL mechanics (expiry, re-signing, quality ladder) removed; playback is a descriptor, and
  `play_auth_token` matters only below TikTok 44.5.0.
- **Platform-blocked playback (J15)** introduced as a first-class state with its own fallback reason, its own copy,
  its own alert and its own metric — the missing consequence of "the platform enforces playability, we can only
  deny".
- Preload made an IA concern: manual scene on list screens warming one candidate, feed scene inside the player,
  with an explicit transition.
- Subtitles reframed as platform assets with exactly one product decision (default track) and one publishing
  precondition (a language is complete or it is not offered).
- The operator side of the product written down at all: publishing over album versions, the eight-state moderation
  machine, the capped urgent lane, appeals, emergency takedown ordering, and the platform's 72-hour user-report SLA.

---

## 4. Registered, not applied

This slot deliberately did not edit other slots' documents. Each item below is written up where it was found, with
the recommended resolution, for its owner to apply.

| # | Item | Where recorded | Suggested owner |
|---|---|---|---|
| B-1 rewording | One Page located; onboarding half transcribed; technical half still unread | `compliance-tiktok-minis.md` §2 | Architecture |
| C-11, C-12, C-13 | Proposed risk entries: EIS gate, permanent names, USDS security-capability evidence | `compliance-tiktok-minis.md` §7 | Architecture |
| C-ONE-1 … C-ONE-6 | Conflicts with `docs/11-official-onboarding-checklist.md`: IAA self-service, contract flow, the EIS gate, verification lead time, irreversible names, icon criteria | `compliance-tiktok-minis.md` §6 | W1A checklist owner |
| PNL-05 deletion, episode-switch mechanics, `BLOCKED` fallback reason | Supersession table | `sitemap-and-ia.md` §12 | W1 P2 IA/screen-inventory owner |
| PA-1 … PA-10 | Journey amendments | `user-journeys.md` §2 | W1 P2 journeys owner |
| G9 … G14 | New IA gaps: blocked-playback state, ops console, legacy-client experience, preload scene transitions, share capability, user-report rota ownership | `sitemap-and-ia.md` §11 | Product / contract / ops |

---

## 5. Assumptions

- The product set is written in English, matching `docs/architecture/`, with a terminology map back to the Chinese
  documents. The One Page extract keeps its original Chinese so it can be diffed against an authenticated copy.
- Interstitial ads are integrated because they are a required capability, but the product position for launch is
  that they never interrupt an episode. This is a product choice, not a platform requirement; it is stated as
  PA-4 and AC-MON-10 so it can be revisited deliberately.
- Plugin keep/ignore choices in `sitemap-and-ia.md` §4.1 are a starting position derived from the platform's own
  immersive configuration example. They are cheap to revisit and expensive to get structurally wrong, which is why
  the *rule* (one control per state, owned by the plugin) matters more than the list.
- Acceptance criteria assume the quality gates in `docs/14-quality-gates.md` stay as written. Nothing here lowers a
  threshold, removes a test, or adds an exemption.

---

## 6. Blockers this slot could not clear

| # | Blocker | Effect |
|---|---|---|
| One Page, part two | Sections after 2.5 need an authenticated Feishu session | The six open questions in `compliance-tiktok-minis.md` §9 stay open, and the technical half of the B-1 diff cannot be done |
| EIS scope | Criteria are not public; the process starts with an account-manager questionnaire | The largest unknown on the monetized-launch path |
| Region decision (B-4) | Still undecided, and it now also determines whether EIS and USDS apply | Blocks localization scope, legal URLs, and the compliance critical path |
| User-report rota (G14) | No owner named | A 72-hour platform SLA with nobody on it |
| Operations console (G10) | No design owner | J20–J23 are undeliverable without one |

---

## 7. Suggested next work

1. **Business track:** obtain an authenticated One Page copy; start EIS with the account manager, including the
   pre-submission questionnaire; get the organization and app names signed off *before* creation; decide the launch
   regions.
2. **Contract slot:** add the `BLOCKED` playback outcome and its error code, and the media-ops surface (album
   versions, the eight moderation states, listing, authorization, reconciliation) that the API contracts still lack.
3. **Frontend slot:** build the player facade to the plugin policy and instance discipline in `sitemap-and-ia.md`
   §4, and land the `build`-method acceptance criteria (AC-PL-1, AC-CMP-1 … AC-CMP-5, AC-I18N-1) as gates with the
   first commit rather than later.
4. **Content-ops slot:** design the console around album versions and the moderation state machine, with the urgent
   quota visible at the point of submission.
5. **Operations:** name the user-report rota owner and rehearse the emergency takedown (AC-OPS-5, AC-OPS-6).

---

## 8. Verification performed

- Mermaid diagram in `sitemap-and-ia.md` rendered successfully with `@mermaid-js/mermaid-cli` v11.
- Cross-document references checked: journey identifiers J1–J24, acceptance identifiers referenced from the
  journeys (`AC-PB-*`, `AC-PL-*`, `AC-PF-*`, `AC-I18N-*`, `AC-CAP-*`, `AC-OPS-*`) all resolve, and every screen and
  panel identifier used here exists in `docs/02-screen-inventory.md` except the deliberately deleted PNL-05.
- No file outside `docs/product/` and `docs/handoff/w1-product-ia.md` was modified.
