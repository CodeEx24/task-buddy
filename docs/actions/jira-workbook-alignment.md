# Align Jira and the delivery workbook

> Related: workflow / Wave 1 · reconciliation [D1–D3](../waves/reconciliation-2026-10-27.md#discrepancies)
> Status: Open · Created by Claude Code on 2026-10-27

## Purpose
The 2026-10-27 reconciliation found no conflicts in scope, priority, waves or dependencies. It did find three planning-data gaps that make Jira reports and the readiness gate unreliable. Two need you (sprint cadence, readiness marker). One I can do on your go (story points).

## Prerequisites
- Jira project admin on TB (you added the In Review status, so you have it).
- Write access to `docs/TaskBuddy_Delivery_Workbook.xlsx` (Excel).

## Steps
1. **Sprint cadence (D1).** Decide which wins: Jira's active 2-week `TB Sprint 1` (2026-10-27 → 11-10, holding US-001..018) or the workbook's 1-week sprints from 2026-11-02.
   - If Jira wins: in the workbook's *Sprint Backlog* and *Product Roadmap* tabs, update the dates (or add a note "superseded by Jira sprints from 2026-10-27").
   - If the workbook wins: in Jira, edit Sprint 1's dates and move US-011..018 (TB-25..32) to a new Sprint 2.
2. **Readiness marker (D3).** Pick one so `/implement-ticket` can check Definition of Ready in Jira:
   - **Recommended:** a `ready` label. Bulk-add it to the 18 stories whose workbook status is Ready (TB-15..TB-32). Filter: `project = TB AND labels in (sprint-1, sprint-2)`, then Bulk change → Edit → Labels → Add `ready`.
   - Or: add a *Ready* status before *In Progress* in the board workflow.
3. **Story points (D2).** Either reply "go" and I copy each `pts-N` label into the estimate field, or do it yourself via Bulk change per `pts-N` label (filter `project = TB AND labels = pts-3`, then set Story point estimate = 3; repeat for 2, 5 and 8).

## Expected result
Jira sprint dates and the workbook agree (or the workbook says it's superseded). Ready stories carry the chosen marker. Every story has a point estimate.

## Verify
Ask Claude to "re-run the reconciliation". `scripts/workflow/reconcile_workbook.py` should report 0 errors and no `points` or `sprint` warnings.

## Completion checklist
- [ ] D1 sprint cadence decided and the losing side updated
- [ ] D3 readiness marker chosen and applied to the 18 Ready stories
- [ ] D2 story points populated (by you or by Claude on your go)
- [ ] Reconciliation re-run clean; status above set to Done

## If it fails
- Bulk change is missing: it needs the *Bulk change* global permission. Edit issues one by one, or ask Claude to do the points via the connector.
- The label didn't apply to some issues: re-run the filter with `AND labels != ready` and repeat.
