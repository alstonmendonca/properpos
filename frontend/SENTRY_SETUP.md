# Sentry Setup for ProperPOS Frontend

## Installation

```bash
npx @sentry/wizard@latest -i nextjs
```

This will:
1. Install `@sentry/nextjs`
2. Create `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
3. Wrap `next.config.js` with `withSentryConfig`
4. Create `.env.sentry-build-plugin`

## Environment Variables

Add to `.env.local` (or `.env.production`):

```
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_AUTH_TOKEN=your-auth-token
SENTRY_ORG=your-org
SENTRY_PROJECT=properpos-frontend
```

## What's Already Configured

- `src/app/global-error.tsx` - Reports uncaught errors to Sentry (dynamic import, won't break without Sentry)
- `src/components/ErrorBoundary.tsx` - Reports component errors to Sentry (dynamic import, won't break without Sentry)

## Recommended Settings

- Production traces sample rate: 0.1 (10%)
- Replay session sample rate: 0.1 (10%)
- Replay on error sample rate: 1.0 (100%)
- Filter out: Network errors, AbortError, React hydration warnings
