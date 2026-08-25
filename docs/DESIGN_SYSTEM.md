# Design System

The implementation source of truth is `app/globals.css`. Reuse existing classes
and tokens before adding new visual primitives.

## Core tokens

| Token | Purpose |
| --- | --- |
| `--background` | Application canvas |
| `--surface` | Primary cards and panels |
| `--surface-subtle` | Secondary panel backgrounds |
| `--ink` | Primary text |
| `--muted` | Supporting text |
| `--line` | Borders and dividers |
| `--forest`, `--forest-2` | Brand and primary actions |
| `--forest-deep` | Dark navigation, hero, and high-emphasis brand surfaces |
| `--green-bright` | Focus rings and dark-surface brand accents |
| `--green-soft` | Selected, hover, and supporting green surfaces |
| `--red`, `--red-dark` | Urgent/high-priority states |
| `--blue` | Watch/informational states |
| `--gold` | Caution or medium priority |
| `--green` | Verified/success states |
| `--shadow` | Standard elevation |
| `--font-ui` | Readable system-first body and control typography |
| `--font-display` | System-first headings and high-emphasis labels |

Do not introduce arbitrary colors, shadows, radii, font families, or spacing
when these tokens or an existing component pattern apply. If a new token is
necessary, document its semantic role and use it consistently.

## Components and hierarchy

- Reuse `.panel`, `.opportunity-board`, `.detail-panel`, `.opportunity-row`,
  `.score-pill`, `.section-heading`, `.queue-empty`, and existing button/input
  patterns.
- Primary actions use the established forest or gold treatment.
- The primary application palette is dark evergreen, white, and neutral green.
  Red, gold, and blue remain reserved for urgent, caution, and informational
  status meaning rather than general decoration.
- Status treatments pair color with text.
- Headings, labels, and metadata follow the existing typographic hierarchy.
- Prefer progressive disclosure to adding more permanent panels or controls.

## Interaction and layout

- New or modified controls use a minimum 44-pixel interactive target.
- Do not use CSS transforms to scale the main UI.
- Preserve visible focus, sufficient contrast, keyboard navigation, and reduced
  ambiguity at small widths.
- Reuse current responsive breakpoints unless a measured layout defect requires
  another tokenized breakpoint.

Existing components below the 44-pixel target are known baseline debt. New work
must not reproduce or worsen it; targeted fixes should be covered by responsive
and rendering tests.
