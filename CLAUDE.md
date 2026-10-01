# Product Lab — rules for Claude

Internal tool for digital-product experimentation (MongoDB, Express, React, Node, Tailwind v4, Recharts).
The main objective of these rules is to minimize token usage and unnecessary output.

## Output and files
- Do not write unnecessary comments in code. Do not explain obvious code.
- Do not generate documentation unless explicitly requested. Do not create README files unless explicitly requested.
- Do not create design documents, reports, summaries, changelogs, artifacts, screenshots, mockups or other unnecessary files.
- Do not repeat information already available in the codebase.
- Do not output large explanations in the terminal. When a task is complete, give a very short summary of what changed.

## Scope discipline
- Inspect the existing project before modifying it. Reuse existing components, hooks, utilities and patterns before creating new ones.
- Do not create duplicate utilities, components or helpers. Do not create multiple versions of the same component.
- Keep implementations concise and maintainable. Do not over-engineer simple functionality.
- Do not create placeholder abstractions for hypothetical future requirements.
- Do not rewrite working code without a reason. Make focused changes.
- Do not generate code that is not required for the requested feature.
- Do not add dependencies unless they provide a real benefit. Do not install libraries the current feature does not need.

## Skills
Skills live in `.agents/skills/` and in Claude Code's skill list. Before implementing a feature, inspect the available skills and use the relevant ones. Follow their instructions instead of inventing alternative approaches.
- `tailwind-4-docs`: any Tailwind work.
- `dataviz`: before creating or changing any chart, KPI tile, meter or chart color.
- `web-design-guidelines`: UI reviews.
- `DESIGN.md`: visual language. Its tokens are mapped in `frontend/src/index.css`; charts use `frontend/src/components/charts/palette.js`.

## Architecture
Keep frontend, backend, database, reusable components, utilities, validation and business logic separated. Top-level folders: `frontend/`, `backend/`, `shared/`.
- `shared/src`: metric formulas (`metrics.js`), enums and labels (`constants.js`), date helpers (`dates.js`), zod input schemas (`schemas.js`). This is the single source for calculations and validation. Never re-implement a formula elsewhere.
- `backend/src`: `models` (Mongoose), `routes` (wiring and validation), `controllers` (HTTP), `services` (business logic, analytics, AI), `middleware`.
- `frontend/src`: `components/ui` (primitives), `components/charts` (chart primitives), `features/<domain>` (pages and domain components), `lib` (API client, query hooks, formatting, date range).
- Products are never deleted. Killing a product sets `status = killed` and keeps all history.
- Calendar dates are `YYYY-MM-DD` strings. Timestamps are `Date` and are bucketed in the configured timezone.

## Security
- Never expose secrets or API keys in frontend code. Read them from environment variables on the backend only (`backend/src/config.js`, `.env.example`).
- Every `/api` route except login requires the session cookie. Gemini is called only from the backend.

## Commands
- `npm run dev` (backend and frontend), `npm run db` (local MongoDB when none is installed)
- `npm test`, `npm run lint`, `npm run build`, `npm run seed -- --reset` (demo data)
