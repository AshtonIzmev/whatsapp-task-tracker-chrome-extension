# Changelog

These entries describe the unpacked extension's development versions, not Chrome
Web Store releases.

## 1.0.1 - 2026-09-10

### Fixed

- Capture no longer requires every message to expose a legacy `true_`/`false_`
  message ID. Incoming/outgoing bubbles and `data-pre-plain-text` metadata can
  identify messages independently.
- Unrelated `data-id` ancestors no longer cause loaded messages to be skipped.
- Nested message markers are deduplicated; metadata or selectable text on the
  selected element itself is recognized.
- Outgoing media can be attributed to "You" without a legacy message ID.
- The no-messages error explains loading and extension-refresh recovery steps.

### Validation

- Added regressions for ID-free bubbles, metadata-only messages, unrelated
  wrappers, nested markers, and excluded quote/draft content.
- A real-DOM browser fixture reproduced zero detections with the old selector
  and the correct last five messages with the fix.
- The user confirmed successful capture in their live conversation.

### Updating

Replace the extension files if using a downloaded copy, click **Reload** in
`chrome://extensions`, then refresh WhatsApp. Existing saved tasks are retained.

## 1.0.0 - 2026-09-10

### Added

- Dependency-free Chrome Manifest V3 extension for WhatsApp Web.
- Recent-message capture with a saved count preference of 1-50 (default 5).
- Task creation with optional name, local-time deadline, and urgency.
- Local task/context storage, completion toggles, deletion confirmation, and
  a completed-task filter.
- Deadline/urgency sorting, overdue labels, and an open-task count badge.
- Native phone links for compatible direct chats; extension-handled name-based
  links for groups and other conversations.
- Saved-message previews, media placeholders, and explicit error messages.
- Node tests and unpacked-installation/privacy documentation.
