import { createTask, DEFAULT_MESSAGE_COUNT, validateMessageCount } from "./core.js";

async function readState() {
  const { tasks = [], messageCount = DEFAULT_MESSAGE_COUNT } = await chrome.storage.local.get(["tasks", "messageCount"]);
  return { tasks, messageCount };
}

async function updateBadge(tasks) {
  const count = tasks.filter(task => !task.completed).length;
  await chrome.action.setBadgeBackgroundColor({ color: "#187568" });
  await chrome.action.setBadgeText({ text: count ? String(count) : "" });
}

async function handleMessage(message) {
  const state = await readState();
  switch (message.type) {
    case "GET_STATE":
      return state;
    case "SET_MESSAGE_COUNT": {
      const messageCount = validateMessageCount(message.count);
      await chrome.storage.local.set({ messageCount });
      return { messageCount };
    }
    case "CREATE_TASK": {
      const task = createTask(message.input);
      await chrome.storage.local.set({ tasks: [task, ...state.tasks] });
      return { task };
    }
    case "TOGGLE_TASK":
    case "DELETE_TASK": {
      if (!state.tasks.some(task => task.id === message.id)) {
        throw new Error("This task no longer exists. Reopen the popup to refresh.");
      }
      const tasks = message.type === "DELETE_TASK"
        ? state.tasks.filter(task => task.id !== message.id)
        : state.tasks.map(task => task.id === message.id ? { ...task, completed: !task.completed } : task);
      await chrome.storage.local.set({ tasks });
      return { tasks };
    }
    default:
      throw new Error("Unknown task tracker request.");
  }
}

// Serialize read-modify-write operations from multiple popup windows.
let pending = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return false;
  pending = pending.then(async () => {
    try {
      sendResponse({ ok: true, ...await handleMessage(message) });
    } catch (error) {
      console.error("Task tracker request failed:", error);
      sendResponse({ ok: false, error: error.message });
    }
  });
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.tasks) {
    updateBadge(changes.tasks.newValue || []).catch(console.error);
  }
});

async function initialize() {
  // Captured messages are available only to extension pages, not content scripts.
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await updateBadge((await readState()).tasks);
}

chrome.runtime.onInstalled.addListener(() => initialize().catch(console.error));
chrome.runtime.onStartup.addListener(() => initialize().catch(console.error));
