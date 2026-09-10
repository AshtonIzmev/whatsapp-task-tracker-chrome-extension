# WhatsApp Task Tracker

A small Chrome extension that turns a WhatsApp Web conversation into a task.
No account, backend, AI, or build step.

Current version: **1.0.1**. See the [changelog](CHANGELOG.md) for changes and the
[architecture guide](docs/ARCHITECTURE.md) for implementation and maintenance details.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select this repository's folder.
4. Pin **WhatsApp Task Tracker** using Chrome's extensions menu.
5. Open [WhatsApp Web](https://web.whatsapp.com). If it was already open, refresh it.

## Use

1. Open a conversation and scroll to its latest messages.
2. Click the extension icon, then **Capture messages**.
3. The last **5 loaded messages** are captured by default. Change the count
   to any number from **1 to 50**; your preference is saved.
4. Optionally add a task name, a deadline (in your local time), and urgency.
   Without a name, the task is called "Follow up with [conversation]".
5. Click **Save task**.

Urgency can be None, Low, Normal, or High. All three task fields are optional.
The preview shows exactly which messages will be saved; arriving messages are
not added to an existing capture automatically. Capture again to update it.
Cancelling or closing the popup discards the unsaved task.

The popup is also your task list, accessible on any website. Expand a task to
read its saved messages, mark it done, or delete it. Open tasks are ordered by
deadline, then urgency. Past deadlines are highlighted, and the extension badge
shows the number of open tasks. **There are no scheduled notifications**; deadlines
are displayed in the list.

**Back to conversation** reuses an open WhatsApp tab, or opens a new one:

- Direct chats use WhatsApp's phone link when a phone-based conversation ID is
  available.
- Groups and other chats use a link handled by the installed extension. It finds
  the chat by its saved name in WhatsApp's sidebar, using search if necessary.
  If a match cannot be found or is ambiguous, a notice asks you to select it
  yourself. Renamed, archived, or duplicate-name chats may require manual search.
- These links return to the conversation, not an individual message.

## Privacy and limitations

- Tasks and copied message text live in `chrome.storage.local` in this Chrome
  profile. They are not sent to a server or synced to other devices.
- Storage is not encrypted by this extension. Anyone with access to the Chrome
  profile may be able to read it. Deleting a task removes its saved context;
  uninstalling the extension removes its local data.
- The extension only runs its content script on `https://web.whatsapp.com/*`.
  It does not send WhatsApp messages or use WhatsApp's private APIs.
- Opening the popup checks the current conversation; messages are persisted
  only when you click **Save task**.
- WhatsApp virtualizes its message history. The extension can capture only the
  messages currently loaded in the page, **not fetch unseen history**. If fewer
  than the requested count are loaded, it saves the available messages and shows
  the actual count in the preview. Scroll to the bottom before capturing.
- Attachments are represented by placeholders; files, images, and voice notes
  are not downloaded or transcribed.
- Reading chats and reopening groups rely on WhatsApp's page markup. WhatsApp
  updates may require changes to the selectors in `content.js`.
- Refresh WhatsApp tabs after reloading or updating the unpacked extension.
- Tasks are snapshots, not a live mirror of WhatsApp: editing or deleting a
  message in WhatsApp does not update the saved task.
- This MVP has no task editing, recurring tasks, export/import, cross-device
  sync, or automatic task generation. To change task details, create a new task
  and delete the old one.
- Conversation links contain a phone number or chat name/ID, but no saved message
  text. Treat those links as private. Name-based links require this extension.
- Completing a task does not delete its saved messages. Use **Delete** to remove
  them; deletion asks for confirmation and has no undo.

### Messages are visible but capture cannot detect them

Version 1.0.1 detects message bubbles and message metadata as well as legacy
message IDs. It also handles messages inside unrelated `data-id` containers.
After updating the files, click **Reload** on the extension's card in
`chrome://extensions`, then refresh the WhatsApp tab. Both steps are required:
an already-open tab keeps the previous content script until it is refreshed.
Reloading the extension does not delete your saved tasks.

### Other troubleshooting

- **Cannot reach WhatsApp:** check that the tab is on `web.whatsapp.com`, refresh
  it, then reopen the popup. A newly installed/reloaded extension cannot capture
  through an older content script.
- **Wrong or missing conversation link:** search for the saved chat name
  manually. Groups with duplicate names or a name changed since capture may not
  reopen automatically.
- **Task not saved:** errors appear in the popup. Do not assume a task was saved
  until the success message appears. Local Chrome storage has a quota; this
  extension does not request unlimited storage.
- **Tasks missing:** check that you are using the same Chrome profile and
  extension installation, and enable **Show done**. There is no cloud backup.

## Development

Plain JavaScript, HTML, CSS, and Chrome Manifest V3. No dependencies to install.
Run the tests with Node.js 22 or newer:

```sh
npm test
```

For a real-browser smoke test, load the unpacked extension and verify:

1. Capture on a direct chat and on a group, including a media message.
2. Change the message count and reopen the popup to verify persistence.
3. Save with all optional fields blank, then with a deadline and high urgency.
4. Reopen Chrome and confirm tasks are still present.
5. Follow each conversation link, mark a task done, show done, and delete it.
6. On a non-WhatsApp tab, verify capture is disabled and saved tasks remain usable.

### Validation status

The Node suite covers task validation/sorting/links, background persistence and
errors, and capture regressions. It uses mocked Chrome APIs and DOM objects.
Browser fixture checks have also exercised the popup flow, real DOM selectors,
sidebar search, duplicate-name handling, and draft/quote exclusion. These are
not a substitute for testing the live WhatsApp layout.

On 2026-09-10, the user confirmed that capture worked in their live WhatsApp
conversation after the 1.0.1 fix. The following multi-day trial is intended to
check everyday usefulness and discover remaining compatibility issues; it is
not evidence that every chat type or browser lifecycle has been tested.

For feedback, include the extension version, direct/group chat type, expected
versus actual behavior, and steps to reproduce. Mention whether reloading the
extension **and** refreshing WhatsApp changes the result. Avoid sharing private
message text, phone numbers, or unredacted screenshots.

Not affiliated with or endorsed by WhatsApp or Meta.
