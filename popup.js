import { sortTasks, validateMessageCount } from "./core.js";

const $ = selector => document.querySelector(selector);
let tasks = [];
let snapshot = null;
let whatsappTabId = null;

async function request(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || "The extension did not respond. Please reopen it.");
  return result;
}

function showError(error) {
  $("#error").textContent = error.message;
  $("#error").hidden = false;
}

function clearFeedback() {
  $("#error").hidden = true;
  $("#notice").hidden = true;
}

function notice(text) {
  $("#notice").textContent = text;
  $("#notice").hidden = false;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function messageList(messages, list = element("ol", "messages")) {
  list.replaceChildren(...messages.map(message => {
    const item = element("li");
    item.append(
      element("span", "message-meta", [message.sender, message.timestamp].filter(Boolean).join(" · ")),
      element("p", "message-text", message.text)
    );
    return item;
  }));
  return list;
}

function renderTasks() {
  const active = tasks.filter(task => !task.completed).length;
  $("#task-count").textContent = active;
  const visible = sortTasks(tasks).filter(task => !task.completed || $("#show-completed").checked);
  $("#empty").hidden = visible.length > 0;
  $("#empty h3").textContent = tasks.length ? "All caught up." : "Nothing to keep in your head.";
  $("#empty p").textContent = tasks.length
    ? "Show done to see completed tasks, or capture a new conversation."
    : "Open a WhatsApp conversation and capture a few messages to make your first task.";
  $("#tasks").replaceChildren(...visible.map(task => {
    const card = element("article", `task${task.completed ? " completed" : ""}`);
    const top = element("div", "task-top");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `Mark "${task.title}" ${task.completed ? "not done" : "done"}`);
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      clearFeedback();
      try {
        tasks = (await request({ type: "TOGGLE_TASK", id: task.id })).tasks;
        renderTasks();
      } catch (error) {
        checkbox.checked = task.completed;
        showError(error);
      } finally {
        checkbox.disabled = false;
      }
    });
    top.append(checkbox, element("h3", "", task.title));
    card.append(top, element("p", "task-chat", task.chat.title));
    const meta = element("div", "task-meta");
    if (task.deadline) {
      const overdue = !task.completed && Date.parse(task.deadline) < Date.now();
      meta.append(element("span", `tag${overdue ? " overdue" : ""}`,
        `${overdue ? "Overdue · " : "Due "}${new Date(task.deadline).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`));
    }
    if (task.urgency) meta.append(element("span", `tag ${task.urgency}`, `${task.urgency[0].toUpperCase()}${task.urgency.slice(1)} urgency`));
    card.append(meta);
    const actions = element("div", "task-actions");
    const link = element("a", "", "Back to conversation ↗");
    link.href = task.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.addEventListener("click", async event => {
      event.preventDefault();
      clearFeedback();
      try {
        const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
        const existing = tabs.find(tab => tab.active) || tabs[0];
        if (existing) {
          await chrome.tabs.update(existing.id, { url: task.url, active: true });
          await chrome.windows.update(existing.windowId, { focused: true });
        } else {
          await chrome.tabs.create({ url: task.url });
        }
        window.close();
      } catch (error) {
        showError(error);
      }
    });
    const remove = element("button", "text-button", "Delete");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete "${task.title}"`);
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete "${task.title}" and its saved messages?`)) return;
      remove.disabled = true;
      clearFeedback();
      try {
        tasks = (await request({ type: "DELETE_TASK", id: task.id })).tasks;
        renderTasks();
      } catch (error) {
        showError(error);
        remove.disabled = false;
      }
    });
    actions.append(link, remove);
    const details = element("details");
    details.append(element("summary", "", `${task.messages.length} saved message${task.messages.length === 1 ? "" : "s"}`), messageList(task.messages));
    card.append(actions, details);
    return card;
  }));
}

async function captureChat() {
  const count = validateMessageCount($("#message-count").value);
  let response;
  try {
    response = await chrome.tabs.sendMessage(whatsappTabId, { type: "CAPTURE_CHAT", count });
  } catch {
    throw new Error("Cannot reach WhatsApp. Refresh the WhatsApp tab after installing or reloading this extension.");
  }
  if (!response?.ok) throw new Error(response?.error || "Cannot read this conversation.");
  return response.snapshot;
}

$("#message-count").addEventListener("change", async () => {
  clearFeedback();
  try {
    await request({ type: "SET_MESSAGE_COUNT", count: validateMessageCount($("#message-count").value) });
  } catch (error) {
    showError(error);
  }
});

$("#capture").addEventListener("click", async () => {
  clearFeedback();
  $("#capture").disabled = true;
  try {
    const captured = await captureChat();
    await request({ type: "SET_MESSAGE_COUNT", count: validateMessageCount($("#message-count").value) });
    snapshot = captured;
    $("#chat-status").textContent = snapshot.chat.title;
    $("#preview-summary").textContent = `${snapshot.messages.length} captured messages from ${snapshot.chat.title}`;
    messageList(snapshot.messages, $("#preview-messages"));
    $("#task-title").placeholder = `Follow up with ${snapshot.chat.title}`;
    $("#task-form").hidden = false;
    $("#task-title").focus();
  } catch (error) {
    showError(error);
  } finally {
    $("#capture").disabled = false;
  }
});

function closeForm() {
  snapshot = null;
  $("#task-form").reset();
  $("#task-form").hidden = true;
  $("#preview-messages").replaceChildren();
}

$("#cancel").addEventListener("click", closeForm);
$("#show-completed").addEventListener("change", renderTasks);

$("#task-form").addEventListener("submit", async event => {
  event.preventDefault();
  clearFeedback();
  $("#save").disabled = true;
  try {
    const deadline = $("#deadline").value;
    const result = await request({
      type: "CREATE_TASK",
      input: {
        snapshot,
        title: $("#task-title").value,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        urgency: $("#urgency").value
      }
    });
    tasks.unshift(result.task);
    closeForm();
    renderTasks();
    notice("Task saved. One less thing to remember.");
  } catch (error) {
    showError(error);
  } finally {
    $("#save").disabled = false;
  }
});

async function initialize() {
  try {
    const state = await request({ type: "GET_STATE" });
    tasks = state.tasks;
    $("#message-count").value = state.messageCount;
    renderTasks();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith("https://web.whatsapp.com/")) {
      $("#chat-status").textContent = "Open a conversation on web.whatsapp.com to capture a task.";
      return;
    }
    whatsappTabId = tab.id;
    const current = await captureChat();
    $("#chat-status").textContent = current.chat.title;
    $("#connection-dot").classList.add("connected");
    $("#capture").disabled = false;
  } catch (error) {
    $("#chat-status").textContent = "Your saved tasks are still available below.";
    showError(error);
  }
}

initialize();
