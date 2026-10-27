# Jira import guide — Task Buddy

Files in this folder:
- `taskbuddy_jira_import_SMOKE_TEST.csv` — 1 epic + 2 stories. **Import this first.**
- `taskbuddy_jira_import.csv` — full backlog: 14 epics + 67 stories (279 story points, 10 sprints).

I could not test the import against your Jira site, so treat the field mapping below as the expected setup and confirm it with the smoke test.

## 1. Prepare the project (admin step)
Creating a Jira project is usually admin-only through the API, so do this once by hand:
1. Create a **Scrum, company-managed** project named *Task Buddy* with key **TB**. (Company-managed supports Epic Name / Epic Link and sprints in the CSV importer. For a team-managed project map *Epic Link* to *Parent* instead.)
2. Confirm issue types **Epic** and **Story** exist.
3. Create sprints **TB Sprint 1 ... TB Sprint 10** if the importer does not create them for you (labels already carry the sprint, so the plan survives either way).

## 2. Field mapping

| CSV column | Jira field | Notes |
|---|---|---|
| Issue ID | Issue Id | Lets the importer resolve Epic Link and Blocked By inside one file |
| Issue Type | Issue Type | `Epic` or `Story` |
| Summary | Summary | |
| Description | Description | Contains the user story, acceptance criteria checklist, Done gates and the blueprint mapping line |
| Epic Name | Epic Name | Epic rows only |
| Epic Link | Epic Link | Value is the epic's Issue ID (`EP-01`...) |
| Priority | Priority | Highest / High / Medium / Low |
| Story Points | Story point estimate (or Story Points) | Use the field your project shows |
| Status | Status | Optional. Only map it if your workflow has *Draft* and *Ready*; otherwise leave unmapped (everything starts at To Do) |
| Labels | Labels | Comma-separated: wave, workstream, sprint, epic, feature, phase, priority |
| Sprint | Sprint | `TB Sprint 1` ... `TB Sprint 10` |
| Wave | Custom text field, or leave unmapped | Also present in Labels |
| Workstream | Custom text field, or leave unmapped | Also present in Labels |
| Blocked By | Issue link: *Blocks* (inward, "is blocked by") | Values are Issue IDs from this same file |

## 3. Steps
1. Jira > Settings > System > **External System Import > CSV**.
2. Upload `taskbuddy_jira_import_SMOKE_TEST.csv`, choose project **TB**, set the delimiter to comma.
3. Map fields as in the table. Save the mapping configuration so the full import reuses it.
4. Run it and verify: the epic exists, both stories sit under it, `US-002` shows *is blocked by* `US-001`, points and labels are correct, sprint is set (or only in labels).
5. Delete the smoke-test issues, then import `taskbuddy_jira_import.csv` with the saved mapping.
6. Verify totals: **14 epics, 67 stories, 279 story points**.

## 4. Things that may need a manual fix
- **Labels imported as one label** (for example the whole comma string): re-import using the importer's option to split on commas, or add repeated *Labels* columns.
- **Sprint not created / not assigned:** create the sprints first, or bulk-assign by the `sprint-N` label using a filter and *Bulk change*.
- **Blocked By not linked:** map it again to the *Blocks* link type (inward direction), or recreate links with a bulk change using the filter `labels = <epic label>`.
- **Jira keys differ from blueprint IDs:** Jira assigns its own keys (`TB-1`, `TB-2`...). Epics are imported first, so story `US-001` will likely become about `TB-15`. The stable reference is the **Blueprint ID** line at the bottom of each description. Use the Jira key in branch names and commits (`feat/tb-<jira number>/...`).
- **Statuses:** if you mapped Status and the import rejects *Draft* / *Ready*, re-import without it.

## 5. After import
- Put the sprint start date in Jira (the plan assumes Monday 2026-11-02 and 30 points per sprint).
- Re-run the sprint plan if your real velocity differs after Sprint 2; the workbook's *Sprint Backlog* tab recalculates utilization from the blue capacity cells.
