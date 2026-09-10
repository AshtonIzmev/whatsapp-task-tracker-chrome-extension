export const DEFAULT_MESSAGE_COUNT = 5;
export const MAX_MESSAGE_COUNT = 50;

export function validateMessageCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_MESSAGE_COUNT) {
    throw new Error(`Choose a message count between 1 and ${MAX_MESSAGE_COUNT}.`);
  }
  return count;
}

export function conversationUrl(chat) {
  const phone = /^(\d+)@(?:c\.us|s\.whatsapp\.net)$/.exec(chat.id || "");
  if (phone) return `https://web.whatsapp.com/send?phone=${phone[1]}`;
  return `https://web.whatsapp.com/#wtt-chat=${encodeURIComponent(JSON.stringify({
    title: chat.title,
    id: chat.id || ""
  }))}`;
}

export function createTask(input, now = new Date()) {
  const { chat, messages } = input.snapshot || {};
  if (!chat || typeof chat.title !== "string" || !chat.title.trim()) {
    throw new Error("Open a WhatsApp conversation and capture its messages first.");
  }
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGE_COUNT) {
    throw new Error("No messages were captured. Load some messages and try again.");
  }
  if (messages.some(message => !message || typeof message.text !== "string" || !message.text.trim())) {
    throw new Error("The captured messages are invalid. Capture the conversation again.");
  }
  const urgency = input.urgency || "";
  if (!["", "low", "normal", "high"].includes(urgency)) {
    throw new Error("Choose a valid urgency.");
  }
  let deadline = null;
  if (input.deadline) {
    const date = new Date(input.deadline);
    if (Number.isNaN(date.getTime())) throw new Error("Choose a valid deadline.");
    deadline = date.toISOString();
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length > 160) throw new Error("Keep the task name under 160 characters.");
  const conversation = { title: chat.title.trim(), id: typeof chat.id === "string" ? chat.id : "" };
  return {
    id: crypto.randomUUID(),
    title: title || `Follow up with ${conversation.title}`,
    chat: conversation,
    url: conversationUrl(conversation),
    messages: messages.map(message => ({
      text: message.text,
      sender: typeof message.sender === "string" ? message.sender : "",
      timestamp: typeof message.timestamp === "string" ? message.timestamp : ""
    })),
    urgency,
    deadline,
    completed: false,
    createdAt: now.toISOString()
  };
}

export function sortTasks(tasks) {
  const priority = { high: 3, normal: 2, low: 1, "": 0 };
  return [...tasks].sort((a, b) =>
    Number(a.completed) - Number(b.completed) ||
    (a.deadline ? Date.parse(a.deadline) : Infinity) - (b.deadline ? Date.parse(b.deadline) : Infinity) ||
    priority[b.urgency] - priority[a.urgency] ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}
