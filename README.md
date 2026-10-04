# Warmly

A privacy-first scheduling experience for friends. Warmly finds shared free time without exposing event names, guests, or calendar details.

## Frontend foundation

- React and TypeScript
- Vite
- Tailwind CSS
- shadcn/ui primitives
- React Aria date and calendar behavior
- Motion for the host journey animation
- Vitest for domain tests

The approved standalone design reference is kept in `design/approved-prototype.html`. Production UI lives in typed React components under `src/`; the prototype is not imported at runtime.

## Local development

```bash
npm install
npm run dev
```

## Checks

```bash
npm run lint
npm run test
npm run build
```

This first implementation is a frontend shell with local fixture state. Authentication, encrypted calendar connections, FreeBusy orchestration, and event creation will be added behind service boundaries in later stages.
