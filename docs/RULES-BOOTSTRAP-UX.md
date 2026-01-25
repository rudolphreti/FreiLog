# Bootstrap UX Rules

- Use Bootstrap utilities first.
- Mobile first
- Avoid custom CSS unless necessary.
- Prefer inline panels over modals.
- Keep UI minimal and readable: avoid decorative shadows unless they convey state.
- Tabs should follow Bootstrap's standard pattern:
  - Use `.nav-tabs` directly above `.tab-content`.
  - Wrap tab panels in `.tab-content.border.border-top-0.rounded-bottom.bg-white.p-3` so tabs visually connect to their content.
  - Avoid extra margins/padding between tab headers and panels.

CUD behavior:
- Create / Update / Delete operations MUST NOT:
  - scroll the page to the top,
  - trigger full re-renders,
  - refresh the page,
  - cause visual flicker or layout jumps.
- CUD must be handled smoothly with local state updates and targeted DOM changes only.
- Never re-render or replace focused inputs while the user types; preserve focus to avoid hiding the mobile keyboard.
