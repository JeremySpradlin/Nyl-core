# Journal Refactor Plan

## Goals
- Replace the slide-out editor with a dedicated `/journal` page.
- Keep the landing page calendar; selecting a date routes to `/journal`.
- Use a conventional writing UX: left pane for project + entries, right pane for editor.
- Keep Tiptap JSON as the content format.
- Add per-entry task management (tasks live inside entry).
- Keep autosave; no explicit save button.
- Soft-delete with Trash view; optional auto-purge after 30 days.

## Non-goals (for now)
- Global task inbox.
- Full project management features beyond create/delete/select.
- Changing editor engine or storage format.
- Complex filtering/search (can follow later).

## Target UX
- **Top nav** remains consistent across pages.
- **Left pane**: projects list (Daily + user projects), create/delete project, entries list for selected project.
- **Editor pane**: title, tasks, body editor, metadata (date, last saved, status).
- **Calendar on landing**: clicking a day opens `/journal` with that date active.

## Data contract and lifecycle (proposed)
- **Entry lifecycle**: draft state exists only in UI; persisted entry exists after first autosave.
- **Soft-delete**: entries marked `is_deleted` with `deleted_at`. Trash view supports restore/hard delete.
- **Autosave**: debounced updates; no explicit Save button.

## Phases

### Phase 1 — Routing + Layout Shell (UI only)
- Add `/journal` route.
- Implement layout skeleton (left pane + editor pane) reusing current components where possible.
- Keep top nav consistent.

**Acceptance**
- `/journal` loads with empty shell and existing top nav.
- Calendar click navigates to `/journal` with selected date in state.

### Phase 2 — Entries + Project Scopes (API reuse)
- Use existing journal scopes (`daily`, `project:<slug>`).
- Left pane shows projects and entries list for selected scope.
- Selecting an entry loads it into editor pane.
- New entry created on first autosave (or explicit Create Entry CTA).

**Acceptance**
- Switching projects updates entry list.
- Selecting an entry loads the correct date + title + body.

### Phase 3 — Tasks (per entry)
- Task list inside editor, below title and above body.
- CRUD tasks for the current entry.

**Acceptance**
- Tasks add/complete/delete persist per entry.

### Phase 4 — Trash + Soft Delete
- Add Trash view in left pane.
- Soft delete entries (default delete action).
- Restore or hard delete from trash.
- Optional auto-purge job (later).

**Acceptance**
- Deleted entries disappear from main list and appear in Trash.
- Restore brings entry back with content intact.

## Component Breakdown
- `JournalPage` (route + state container)
- `ProjectList` (daily + user projects)
- `EntryList` (entries for active project)
- `JournalEditor` (title, tasks, body)
- `TaskList` (checkbox list + input)
- `TrashList` (soft-deleted entries)

## Open Decisions
- Whether to include scope in URL (`/journal?scope=`) for deep linking.
- Auto-purge schedule (30 days vs manual only).

## Next Step
- Phase 1 questions and implementation plan.
