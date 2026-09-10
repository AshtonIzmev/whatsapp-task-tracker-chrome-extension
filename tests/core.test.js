import test from "node:test";
import assert from "node:assert/strict";
import { conversationUrl, createTask, sortTasks, validateMessageCount } from "../core.js";

const snapshot = {
  chat: { title: "Project team", id: "120363000000@g.us" },
  messages: [{ text: "Send the estimate tomorrow", sender: "Alex", timestamp: "09:30, 10/09/2026" }]
};

test("optional fields have useful defaults and preserve the captured context", () => {
  const task = createTask({ snapshot }, new Date("2026-09-10T10:00:00Z"));
  assert.equal(task.title, "Follow up with Project team");
  assert.equal(task.deadline, null);
  assert.equal(task.urgency, "");
  assert.equal(task.completed, false);
  assert.equal(task.createdAt, "2026-09-10T10:00:00.000Z");
  assert.deepEqual(task.messages, snapshot.messages);
  assert.notEqual(task.messages, snapshot.messages);
  assert.ok(task.id);
});

test("custom fields and time zone offsets are preserved", () => {
  const task = createTask({ snapshot, title: "  Send estimate  ", urgency: "high", deadline: "2026-09-11T10:30:00+02:00" });
  assert.equal(task.title, "Send estimate");
  assert.equal(task.urgency, "high");
  assert.equal(task.deadline, "2026-09-11T08:30:00.000Z");
});

test("message count must be an integer in range", () => {
  for (const value of [1, 5, 50, "12"]) assert.equal(validateMessageCount(value), Number(value));
  for (const value of [0, 51, -1, 2.5, "", "oops", undefined, Infinity]) {
    assert.throws(() => validateMessageCount(value), /between 1 and 50/);
  }
});

test("invalid task data is rejected rather than silently stored", () => {
  assert.throws(() => createTask({}), /conversation/);
  assert.throws(() => createTask({ snapshot: { ...snapshot, messages: [] } }), /No messages/);
  assert.throws(() => createTask({ snapshot: { ...snapshot, messages: [{ text: "" }] } }), /invalid/);
  assert.throws(() => createTask({ snapshot, urgency: "critical" }), /urgency/);
  assert.throws(() => createTask({ snapshot, deadline: "not-a-date" }), /deadline/);
  assert.throws(() => createTask({ snapshot, title: "a".repeat(161) }), /160/);
});

test("phone-based direct chats have native WhatsApp links", () => {
  assert.equal(conversationUrl({ title: "Alex", id: "447700900123@c.us" }), "https://web.whatsapp.com/send?phone=447700900123");
  assert.equal(conversationUrl({ title: "Alex", id: "447700900123@s.whatsapp.net" }), "https://web.whatsapp.com/send?phone=447700900123");
});

test("groups, private IDs and names without an ID use safely encoded extension links", () => {
  for (const id of ["120363000000@g.us", "555123@lid", ""]) {
    const chat = { title: 'Team & friends / #1 "today"', id };
    const url = new URL(conversationUrl(chat));
    assert.equal(url.origin, "https://web.whatsapp.com");
    assert.deepEqual(JSON.parse(decodeURIComponent(url.hash.slice("#wtt-chat=".length))), chat);
  }
});

test("tasks sort open first, then earliest deadline, urgency, and newest", () => {
  const make = (id, fields = {}) => ({
    id, completed: false, urgency: "", deadline: null, createdAt: "2026-09-10T10:00:00Z", ...fields
  });
  const tasks = [
    make("done", { completed: true, deadline: "2020-01-01" }),
    make("plain"),
    make("urgent", { urgency: "high" }),
    make("due", { deadline: "2026-09-15" }),
    make("overdue", { deadline: "2026-09-01" }),
    make("newer", { createdAt: "2026-09-11T10:00:00Z" })
  ];
  assert.deepEqual(sortTasks(tasks).map(task => task.id), ["overdue", "due", "urgent", "newer", "plain", "done"]);
  assert.equal(tasks[0].id, "done");
});
