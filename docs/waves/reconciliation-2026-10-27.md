# Jira ↔ Workbook reconciliation — 2026-10-27

> Jira: [TB project](https://stratyge.atlassian.net/jira/software/projects/TB) (team-managed, site `stratyge.atlassian.net`).
> Workbook: `docs/TaskBuddy_Delivery_Workbook.xlsx` (sheets `Product Backlog`, `Epic Backlog`).
> Method: `scripts/workflow/reconcile_workbook.py`, matching on the `Blueprint ID:` line in each Jira description. Re-run it before every re-plan.
> Rule: discrepancies are **reported, not silently resolved**. Jira owns identity, status, priority and links. The workbook is the planning input.

## Result

| Check | Result |
|---|---|
| Issues read from Jira | 81 (14 Epic, 67 Story); one page, nothing truncated |
| Workbook stories / epics | 67 / 14 |
| Mapped by Blueprint ID | 81 / 81. No duplicates, nothing unmapped, nothing missing on either side |
| Titles | 67 / 67 identical |
| Priority (P0→Highest, P1→High, P2→Medium, P3→Low) | 67 / 67 match |
| Wave (`wave-N` label) | 67 / 67 match |
| Parent epic | 67 / 67 match |
| `is blocked by` links vs `Blocked By` column | 67 / 67 identical sets |
| Other link types | none |
| Acceptance criteria present in Jira | 67 / 67 (TB-15, 16, 18, 39 use escaped `\[ \]` checkboxes. Same content, different formatting) |

## Discrepancies

| # | Topic | Jira | Workbook | Impact | Proposed resolution (needs your call) |
|---|---|---|---|---|---|
| D1 | **Sprint cadence** | `TB Sprint 1` is **active**, 2026-10-27 → 2026-11-10 (2 weeks), and holds the 18 stories US-001..US-018 (workbook sprints 1 **and** 2) | 1-week sprints. Sprint 1 = 2026-11-02 → 11-06, Sprint 2 = 11-09 → 11-13. 30 pts each | Dates and velocity planning disagree. Wave order is unaffected | Treat Jira as authoritative (2-week sprints from 2026-10-27). Update the workbook's Sprint Backlog and Roadmap dates by hand, or note that the workbook dates are superseded |
| D2 | **Story points** | Story-point field (`customfield_10016`) is empty on all 67. Points exist only as `pts-N` labels | Points column filled (279 total) | Jira velocity and burndown reports will show 0 | Copy the `pts-N` values into the estimate field (a bulk edit, or I can do it on your go). Until then, tools read points from the labels |
| D3 | **Readiness** | All 81 issues are `To Do`. The workflow has no Draft/Ready status | 18 `Ready`, 49 `Draft` | Definition of Ready isn't visible in Jira | Use a `ready` label (or a Draft status) on stories that meet DoR. `/implement-ticket` will refuse stories not marked Ready |
| D4 | **Sprint field on Draft stories** | 49 Draft stories have no sprint (backlog) | Assigned to sprints 3–10 | None now | Expected: assign them at each sprint's planning |

**No conflicts** in identity, scope, priority, wave or dependencies. The wave plan is safe to build on.

## Resolution (2026-10-27, after the owner approved all recommendations)

Verified by re-reading all 81 issues after the writes:

| # | Resolution |
|---|---|
| D1 | **Jira wins.** The owner moved all 67 stories into the active `TB Sprint 1` on the board at 13:15 (issue changelog). Workbook sprint dates are superseded. The reconcile script's sprint warnings are expected until the workbook's sprint column is updated |
| D2 | Story point estimate set on all 67 stories (sum 279) |
| D3 | `ready` label on the 18 Ready stories (TB-15..TB-32) |
| D4 | Superseded by D1 |

**Accepted deviations** (Jira intentionally differs from the workbook; listed in `docs/waves/accepted-deviations.txt` so the script reports them as accepted, not as errors):
- US-040/TB-54: wave 3 (workbook says 4).
- US-024/TB-38: also blocked by TB-54 (US-040).

## Workflow states (verified 2026-10-27)

`To Do` (transition 11) → `In Progress` (21) → `In Review` (2, added today) → `Done` (31). All transitions are global.
