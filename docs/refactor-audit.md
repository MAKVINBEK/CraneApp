# Refactor Audit

This audit tracks the remaining files that still violate the clean architecture
guide by size or mixed responsibilities.

## Refactored In This Pass

- `client/mobile/services/api/*` now delegate to application services instead of
  duplicating fetch/auth/error handling.
- `client/mobile/services/storage/localStorage.js` now delegates to an
  infrastructure storage adapter.
- `server/services/message-service/*` now has matching controller/service
  behavior for edit, delete, read, forward, pin, and reactions.
- `server/gateway/apiGateway.js` no longer owns call routes, support routes,
  health routes, upload/media routes, GIF routes, sticker routes, auth account
  routes, user profile/search routes, user settings/preferences/device/storage/
  passcode/export routes, reports/moderation routes, error handlers, or auth
  middleware. Chat read/write routes, message read/write routes, encryption
  routes, emoji routes, message social routes, primary auth routes, startup
  migrations, realtime gateway, bot service, traffic protection, and rate
  limiters are now route/service modules too.
- `client/mobile/screens/chats/chats.js` no longer owns reaction UI, browser
  notifications, session-greeting infrastructure, bot-message text localization,
  call panel/incoming-call UI, or side-menu/section-tab navigation.

## Remaining Monoliths

- `client/mobile/screens/chats/chats.js`: still around 6.2k lines. Next split:
  message composer/media upload, chat list rendering, message context menu,
  support/admin panels, group creation, video notes.
- `server/gateway/apiGateway.js`: now around 630 lines and should remain a
  composition point only.
- `client/mobile/scripts/i18n.js`: large translation/data module. It should be
  split by locale or loaded as JSON dictionaries.
- `client/mobile/components/media-editor/photo-editor.js`: large UI component
  that mixes editor state, DOM rendering, and image processing.

## Rule For Future Changes

New behavior should not be added to `chats.js` or `apiGateway.js`. Add a
feature-specific service/controller/module and keep these files as composition
points only. Files under microservice/feature roots must stay at or below 500
lines; `npm run check:architecture` enforces this.
