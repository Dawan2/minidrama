# Gate open questions

> **Not a second register.** The authoritative table is `docs/plan/wave-protocol.md` §6.1.
> This file is the ask: questions the account manager / business track has not answered.
> **No dates, rates, or approvals are filled in.** Unknown stays unknown.
> Written W13 (`docs/handoff/w13-gate-writeback.md`) against `main` at `a6c04d3`.

C1 started the two-cycle clock (`docs/verify/cycle-1-report.md` §8.1). C2 closed with the same
business-track table (`docs/verify/cycle-2-report.md` §8, D-15). Rule-3 escalations are filed in
`docs/plan/wave-protocol.md` §6.4. Filing them is not the same as answering them.

---

## How to use this file

- A later plan wave writes **answers** into `docs/plan/wave-protocol.md` §6.1, with evidence
  (mail, ticket, Portal screenshot path). Until then every row below stays `unknown`.
- Do not copy a guessed date into the status column. GATE-7's published duration is 15–30 US
  business days *after submission*; there is no submission date in this repository.
- Do not copy a guessed ingest date into GATE-8. The question is Q-G-3 / Q-MP-1, not "are we in
  the pilot".
- Do not put a coin→Beans rate in code. The question is Q-G-7.

---

## Questions

| # | Owner | Question | Status | What would count as an answer |
| --- | --- | --- | --- | --- |
| **Q-G-1** | Product + business (B-4) | What is the documented first-launch region set? EU, US, both, neither? | **unknown** | A written region list. Excluding EU and US is a legitimate release of GATE-7 and GATE-5 |
| **Q-G-2** | Business | Has an EIS questionnaire been started? If submitted, on what date? | **unknown** | Date + ticket/questionnaire id. **Do not invent a date** |
| **Q-G-3** | Business (GATE-8 / Q-MP-1) | From what date can our `client_key` upload through `/v2/sg/shortdrama/*` and submit albums for moderation? | **unknown** | A calendar date from the AM or from `S-OP-1`. **Do not invent a date** |
| **Q-G-4** | Business (GATE-8 / Q-MP-2) | Are we in the media-storage-and-player pilot (One Page §3, 2026-06-25)? If not, what is the admission path? | **unknown** | Yes/no + path. A "no" without Q-G-3's date is not actionable |
| **Q-G-5** | Business (GATE-6) | Does a TikTok mini-drama account-manager relationship exist, and what is the contact? | **unknown** | A name or mailbox. This is also the entry point for GATE-7 and GATE-8 |
| **Q-G-6** | Business (GATE-1) | Are the developer-account / organisation / App credentials available to inject into the runtime secret store? | **unknown** | Triple in the secret store. Organisation name, app name and type need sign-off *before* create |
| **Q-G-7** | Business (C3-09) | What Beans amount did a real (sandbox) trade order of a known coin price actually charge? | **unknown** | One observed pair (coins, Beans). No rate in types until then |
| **Q-G-8** | Business (GATE-3) | Industry qualification / partner approval: submitted? Date? Result? | **unknown** | Submission date and outcome. **Do not invent a date** |
| **Q-G-9** | User / business (GATE-0) | Where is the official requirements PDF, or an authenticated One Page export covering everything after §2.5? | **unknown** | File in the workspace, or view access for a named account |

The six media-plane questions Q-MP-1…Q-MP-6 in `docs/plan/media-plane-decision.md` §8.2 remain the
GATE-8 ask. Q-G-3 and Q-G-4 are Q-MP-1 and Q-MP-2 restated so they sit next to the other
business-track holes. Q-MP-3…Q-MP-6 are not repeated here; they still have no answers.

---

## What this file does not claim

- It does not release any gate.
- It does not close D-06 (`setValidateVideoReplaceElement` policy — a source-rules question, not a
  business gate) or D-07 (`docs/12-api-contracts.md` unlock-path wording).
- It does not decide X-21 (two cycle-numbering schemes). That stays on P3.
- It does not rewrite `docs/plan/w1-conflict-register.md` or `docs/plan/media-plane-decision.md`.
  Those still *propose* GATE-7 / GATE-8; §6.1 is now the table they should point at.
