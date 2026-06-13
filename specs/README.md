# Feature specs

Every major feature rollout gets a numbered spec here **before or alongside**
the work. A spec is the unit of planning and the record of what shipped.

Format (see any existing spec):

- **Status** — `planned` / `in progress` / `shipped (date)`.
- **Problem / Goal** — why this exists, in a few sentences.
- **Approach** — the design decisions and trade-offs, briefly.
- **Tasks** — a checkbox breakdown of the work. Check items off as they
  complete (`- [x]`); a shipped spec has all core tasks checked.
- **Verification** — how it was proven to work (tests, live runs).
- **Follow-ups** — known gaps and deferred work, as unchecked boxes. When a
  follow-up becomes real work, it graduates to its own spec.

Conventions:

- Number sequentially (`006-...md` is next).
- Keep specs current: when scope changes mid-build, edit the spec, don't
  abandon it.
- When a spec ships, update `CLAUDE.md` (major changes) and `index.md`
  (new files) in the same PR.
