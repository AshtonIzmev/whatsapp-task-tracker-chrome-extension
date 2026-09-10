# Architecture and maintenance

## Scope

This is a local-only, user-driven task tracker, not a WhatsApp automation client.
It reads rendered conversation content, saves an explicit snapshot, and helps
the user return later. It does not send chat messages, fetch unseen history,
call private WhatsApp APIs, or use AI.

## Components

| File | Responsibility |
| --- | --- |
| [manifest.json](../manifest.json) | Manifest V3 permissions, popup, service worker, and WhatsApp-only content-script registration. |
| [content.js](../content.js) | Conversation detection, DOM message capture, and name-based conversation navigation. |
| [popup.html](../popup.html) / [popup.css](../popup.css) | Popup structure, form, previews, task list, and styling. |
| [popup.js](../popup.js) | Capture/form state, task interactions, error display, tab navigation, and rendering. |
| [background.js](../background.js) | Persistent state operations, mutation serialization, storage access level, and badge updates. |
| [core.js](../core.js) | Task validation/defaults, URL generation, and ordering; shared by popup, worker, and tests. |
| [tests/](../tests/) | Node's built-in test runner; no dependencies. |

There is no bundler, application server, dependency install, or build output.
Chrome loads the source files directly. The service worker and popup use ES
modules; the registered content script is a self-contained classic script.

## Capture and save flow

1. The popup asks the worker for stored tasks and the message-count preference.
2. It checks the active tab. Capture is available only after a successful
   conversation probe on WhatsApp Web; the saved list remains usable elsewhere.
3. Clicking **Capture messages** sends `CAPTURE_CHAT` with the selected count to
   the tab. The returned snapshot stays in popup memory.
4. The user reviews the preview and optionally supplies task details. The count
   preference is saved independently of saving a task.
5. **Save task** sends `CREATE_TASK` to the worker. The worker validates and
   normalizes the input, assigns a UUID, persists the task, and responds.
6. Storage changes update the toolbar badge. The popup displays success only
   after the write succeeds.

Closing the popup loses an unsaved snapshot. Saving does not recapture the
conversation, so the preview and persisted message context agree.

### DOM assumptions

The current conversation lives under `#main`; the header provides its title.
Recognized legacy message IDs can also provide the conversation ID.

Message candidates include `.message-in`, `.message-out`,
`[data-pre-plain-text]`, and IDs beginning with `true_` or `false_`. The capture
code excludes quoted-message markers, headers, footers, and editable composers,
then removes candidates nested beneath another selected candidate. Crucially,
an arbitrary `data-id` ancestor is not sufficient to exclude a message.

The last N remaining messages are selected in DOM order. Text comes from
`.selectable-text`; sender and timestamp are extracted from WhatsApp's
`data-pre-plain-text`. Timestamp strings are retained as shown rather than
parsed using assumptions about the user's locale. Non-text messages receive a
placeholder instead of downloading their attachments.

Selectors are compatibility assumptions, not a stable WhatsApp API. When they
break, inspect a redacted DOM sample, add the corresponding regression, and test
against an actual loaded conversation where possible. Do not solve a selector
failure by reading the entire page or the message composer.

## Storage model

`chrome.storage.local` contains two keys:

| Key | Value / default |
| --- | --- |
| `messageCount` | Integer from 1 to 50; defaults to 5. |
| `tasks` | Array of the following task objects; defaults to `[]`. |

```js
{
  id: "generated UUID",
  title: "Follow up with Design team",
  chat: {
    title: "Design team",
    id: "" // Recognized conversation ID when available.
  },
  url: "https://web.whatsapp.com/...",
  messages: [
    { text: "Saved text", sender: "Alex", timestamp: "10:00, 10/09/2026" }
  ],
  urgency: "", // "", "low", "normal", or "high".
  deadline: null, // Otherwise an ISO timestamp.
  completed: false,
  createdAt: "2026-09-10T10:00:00.000Z"
}
```

Names are trimmed and limited to 160 characters; blank names fall back to
`Follow up with [chat title]`. A deadline entered in local time is stored as an
ISO instant and displayed in the current locale/time zone. Past deadlines are
allowed. `capturedAt` exists on the temporary capture response but is not stored
in the task; `createdAt` records task creation time.

Tasks sort incomplete before complete, then earliest deadline (undated last),
highest urgency, and newest creation time. Completing a task retains its context;
deleting removes it. Overdue styling is recalculated when the list renders, not
by a scheduled timer. **Show done** is a popup-only preference.

There is no schema migration, backup, sync, or encryption layer. Avoid
incompatible storage changes without a migration. Chrome storage quotas still
apply; write errors must remain visible rather than becoming success messages.

## Internal messages and persistence

| Recipient | Request | Successful response fields besides `ok: true` |
| --- | --- | --- |
| Content script | `CAPTURE_CHAT`, `count` | `snapshot: { chat, messages, capturedAt }` |
| Worker | `GET_STATE` | `tasks`, `messageCount` |
| Worker | `SET_MESSAGE_COUNT`, `count` | `messageCount` |
| Worker | `CREATE_TASK`, `input` | `task` |
| Worker | `TOGGLE_TASK`, `id` | `tasks` |
| Worker | `DELETE_TASK`, `id` | `tasks` |

Handled failures return `{ ok: false, error }`. The popup shows errors rather
than silently creating empty tasks. Worker failures are also logged.

The worker accepts state requests only from this extension's non-tab contexts.
On installation/startup it restricts local storage to `TRUSTED_CONTEXTS`, keeping
stored conversations unavailable to content scripts. Mutations are queued to
serialize read-modify-write operations and avoid concurrent popup writes
overwriting one another. The badge is refreshed on storage changes and startup.

## Conversation links

- Recognized numeric `@c.us` or `@s.whatsapp.net` IDs produce
  `https://web.whatsapp.com/send?phone=...`.
- Other chats produce `https://web.whatsapp.com/#wtt-chat=...`, where the fragment
  is URI-encoded JSON containing only the saved chat title and ID.
- The popup reuses an existing WhatsApp tab when possible and focuses its window.
- The content script handles its custom fragment on load or hash change. It
  waits for the sidebar, looks for an exact title, and uses the sidebar search
  box if necessary. It never types into the message composer.
- Multiple exact matches or a detectable ID mismatch produce a notice instead
  of reporting success. IDs cannot always be checked; name-based navigation is
  best effort, not a guaranteed unique permalink.
- Notices are dismissible, and the handled fragment is removed from the URL.
  Renamed/archived chats may need manual selection.

Links are conversation-level, not message-level. Names and IDs in links may be
sensitive even though copied message bodies are not included.

## Permissions and data handling

The manifest requests `storage` and host access only for
`https://web.whatsapp.com/*`. It does not request all-site access, notification
permissions, or unlimited storage. Host access permits interaction with
WhatsApp tabs; the extension uses the Tabs/Windows APIs without requesting
broad browsing-history access.

Captured strings are inserted into the popup through `textContent`, not HTML
interpolation. There is no analytics or external data destination. Local-only
storage is not a security boundary against someone who controls the Chrome
profile. Debug reports should use fabricated messages and redacted identifiers.

## Testing and release checklist

Run `npm test` with Node.js 22+. For a capture-only change, run
`node --test tests/content.test.js`. The suite covers:

- Task defaults, validation, time normalization, link generation, and sorting.
- Simultaneous writes, persistence reads, completion/deletion, badge updates,
  write failures/recovery, and rejection of untrusted state requests.
- Ordered capture, fewer-than-requested messages, media placeholders, absent
  conversations, ID-free bubbles, metadata-only messages, wrapper regressions,
  nested candidates, and exclusions.

The Node DOM/Chrome mocks test behavior but cannot prove live selector
compatibility or actual Chrome startup persistence. Browser fixture checks and
the live smoke checklist in the [README](../README.md#development) complement
them. The user's successful 1.0.1 capture is a live confirmation, not a claim of
complete end-to-end coverage.

Before publishing an update:

1. Run relevant tests and `git diff --check`.
2. Keep versions in the manifest and package metadata aligned.
3. Update the [changelog](../CHANGELOG.md) and any changed user-facing behavior.
4. Reload the unpacked extension, refresh WhatsApp, and exercise the affected
   behavior. Avoid uninstalling just to update, since that removes stored tasks.
5. If distributing a ZIP, include source, documentation, and tests; exclude
   `.git`, credentials, browser profiles, and captured user data. Unzip before
   using Chrome's **Load unpacked** action.
6. Push a reviewed branch and open a pull request targeting `main`. There is no
   automated Chrome Web Store publication or configured CI workflow.
