# Chat Refactor Plan (Baseline LLM UX)

## Goals
- Refactor chat into best-practice components + hooks without changing visual theme.
- Move calendar into a reusable module while preserving current placement.
- Establish a modern LLM chat UX baseline (markdown, multiline composer, sane scroll).

## Non-goals (for now)
- Persisted multi-session chat history (backend schema not ready).
- New features like regenerate/stop/copy unless trivial.
- Major visual redesign of typography or theming.

## Current Stock (Issues)
- Chat UI is monolithic in `apps/nyl-frontend/src/App.jsx` with global CSS in `apps/nyl-frontend/src/styles.css`.
- Stream area uses a fixed `max-height`, causing layout brittleness and overflow.
- No overflow handling for long tokens/URLs; composer can appear to overflow.
- Autoscroll always pins to bottom, preventing reading older messages.
- Single-line input, no markdown rendering, missing chat a11y semantics.
- Calendar is embedded directly in `App.jsx` and not reusable.

## Target Architecture
### Components
- `ChatPanel` (layout wrapper: header + stream + composer)
- `ChatStream` (messages list + scroll behavior)
- `ChatMessage` (user/assistant bubble + markdown)
- `ChatComposer` (multiline input + submit behavior)
- `CalendarPanel` (reusable calendar module)

### Hooks
- `useChat` (state + streaming + errors + submit)
- `useAutoScroll` (stick-to-bottom logic)

### Styling
- Scoped chat styles (e.g., `chat.css` or CSS modules) with clear naming.
- Layout uses `grid-template-rows: auto minmax(0, 1fr) auto` for resilience.

## Phases (Each Phase Is Testable)

### Phase 1: Structural refactor (no UX changes)
Deliverables
- Extract components (`ChatPanel`, `ChatStream`, `ChatMessage`, `ChatComposer`).
- Extract `useChat` hook for streaming + state.
- Extract calendar into `CalendarPanel`.
- Add message timestamps (stored in message model, displayed subtly).
- Keep current layout + visuals intact.

Acceptance tests
- Chat renders and streams exactly as before.
- Calendar still renders and works in same location.
- No visual regressions other than incidental spacing.

Design decisions (confirmed)
- Header provided by parent for flexibility.
- Calendar is controlled by parent (`selectedDate` + `onDateSelect`).

### Phase 2: Layout + overflow resilience
Deliverables
- Replace fixed `max-height` with flexible layout.
- Add word-break/overflow rules on message content.
- Add autoscroll behavior that stops when user scrolls up.

Acceptance tests
- Composer never overflows; long tokens wrap.
- Chat stream fills available space and stays scrollable.
- Autoscroll only when user is near bottom.

Design decisions (confirmed)
- Autoscroll threshold: 60px from bottom.
- Stream fills available vertical space (no fixed max height).

### Phase 3: Modern chat UX baseline
Deliverables
- Markdown rendering for assistant messages.
- Multiline composer: Enter to send, Shift+Enter newline.
- Basic chat a11y semantics.

Acceptance tests
- Markdown (lists, code blocks, links) renders reliably.
- Keyboard behavior matches expected chat UX.
- Screen reader announces new assistant messages.

Design decisions (confirmed)
- Use `react-markdown` + `remark-gfm` for markdown.
- Add syntax highlighting only if it stays low-complexity.
- Render markdown for both user and assistant messages.
- Composer: Enter submits only when non-empty; Shift+Enter inserts newline.

### Phase 4: Calendar as reusable module
Deliverables
- Calendar becomes a sidebar module and can be placed in other screens.
- Current placement preserved (or moved to a right sidebar if desired).

Acceptance tests
- Calendar can be mounted in at least two locations without code changes.
- Theming still consistent with the rest of the app.

Design decisions (confirmed)
- Use dedicated left + right columns in the main layout.
- Right sidebar is persistent, and the calendar is collapsible.

## Open Questions
- Do we want message timestamps now or later?

## Clarified Scope
- Left rail: minimal empty state with a “New chat” button (no mock history yet).
- Autoscroll threshold is a configurable constant.

## Risks
- Markdown rendering can introduce layout regression if code blocks are not constrained.
- Autoscroll logic can be annoying if “near bottom” threshold is off.
