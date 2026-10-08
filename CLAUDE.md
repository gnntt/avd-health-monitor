# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/claude-code) when working with this repository.

## Project Overview

AVD Health Monitor is a browser-only web page that monitors, in real time, whether an Azure Virtual Desktop (AVD) client device can reach the endpoints it needs. The build is a single self-contained `index.html` that users open by double-clicking (`file://`) or from any web server. There is no backend.

## Tech Stack

- **Frontend**: React 19, TypeScript 5, TailwindCSS 3, Recharts (graphs), Zustand (state)
- **Build**: pnpm, Vite, vite-plugin-singlefile (inlines all JS/CSS into one HTML file)
- **Tests**: Vitest + happy-dom

## Project Structure

```
src/
├── components/
│   ├── Dashboard.tsx          # Main monitoring view
│   ├── EndpointCard.tsx       # Individual endpoint display
│   ├── EndpointTile.tsx       # Compact endpoint tile
│   ├── SettingsPanel.tsx      # Configuration UI, export/import/reset
│   └── ErrorBoundary.tsx      # Error handling wrapper
├── data/
│   ├── endpoints.json         # Built-in AVD end-user endpoints
│   └── builtInEndpoints.ts    # Flattens endpoints.json, applies overrides
├── hooks/
│   └── useStatusIndicator.ts  # Favicon color, tab title, browser notifications
├── store/
│   └── useAppStore.ts         # Global Zustand state, persisted to localStorage
├── services/
│   └── latencyService.ts      # Browser latency probe (fetch HEAD, no-cors)
└── types.ts                   # TypeScript definitions
```

## Common Commands

```bash
pnpm install            # Install dependencies
pnpm dev                # Dev server with hot reload
pnpm build              # Type check + build dist/index.html (single file)
pnpm test:run           # Tests
pnpm exec tsc --noEmit  # Type checking
```

## Key Concepts

### Latency Testing
- `src/services/latencyService.ts` sends `HEAD` requests with `mode: 'no-cors'`, `cache: 'no-store'` and times them with `performance.now()`
- Two requests per test; the faster one (warm connection) is reported. 5 second timeout.
- Responses are opaque: a resolved fetch means reachable, a rejected one means unreachable. Status codes and failure reasons are not visible.
- Only HTTP(S) can be tested. `redirect: 'manual'` is not allowed with `no-cors`.

### Must work from file://
- Keep the build a single file (no external scripts, no `public/` assets): browsers block module scripts loaded from `file://`
- Don't add features that need a server or a backend

### Settings Storage
- Zustand `persist` middleware stores `config`, `customEndpoints`, `endpointOverrides` and 24h of history in `localStorage` (`avd-health-monitor-state`)
- Built-in endpoints come from `endpoints.json`; user changes to them (enabled, muted, name, url, port) are stored as `endpointOverrides`
- Export/Import in Settings writes/reads a `SettingsFile` JSON; imported data is validated by `sanitizeConfig` and friends in the store

### Status Indicator
- `useStatusIndicator` colors the favicon (SVG data URL) and sets the tab title from the average latency
- Browser notifications after `alertThreshold` consecutive slow checks, at most every `alertCooldown` minutes; needs Notification permission

## State Management

Zustand store in `src/store/useAppStore.ts` manages:
- `endpoints` - Built-in (with overrides) plus custom endpoints
- `endpointStatuses` - Latest result and history per endpoint
- `config` - Thresholds, interval, theme, notification settings
- `isPaused` - Monitoring pause state

## Testing

- Tests: `src/lib/utils.test.ts`, `src/store/useAppStore.test.ts`, `src/services/latencyService.test.ts`
- Test setup in `src/test/setup.ts`
- Run with `pnpm test:run`

## CI/CD

- `.github/workflows/ci.yml` - Tests and builds on push/PR; on release, uploads `avd-health-monitor.html`
- Release Please for automated versioning (`.release-please-config.json`)
