import test from "node:test";
import assert from "node:assert/strict";

const data = {};
const listeners = {};
let failWrite = false;
let badge = "";
let accessLevel = "";
globalThis.chrome = {
  runtime: {
    id: "test-extension",
    onMessage: { addListener: callback => { listeners.message = callback; } },
    onInstalled: { addListener: callback => { listeners.install = callback; } },
    onStartup: { addListener: callback => { listeners.startup = callback; } }
  },
  storage: {
    local: {
      get: async () => structuredClone(data),
      set: async values => {
        if (failWrite) throw new Error("Storage quota exceeded");
        Object.assign(data, structuredClone(values));
        const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]));
        listeners.changed(changes, "local");
      },
      setAccessLevel: async options => { accessLevel = options.accessLevel; }
    },
    onChanged: { addListener: callback => { listeners.changed = callback; } }
  },
  action: {
    setBadgeText: async ({ text }) => { badge = text; },
    setBadgeBackgroundColor: async () => {}
  }
};
await import("../background.js");

const request = message => new Promise(resolve => {
  assert.equal(listeners.message(message, { id: "test-extension" }, resolve), true);
});
const input = {
  snapshot: { chat: { title: "Alex", id: "123@c.us" }, messages: [{ text: "Follow up" }] }
};

test("background persistence, mutation serialization and error recovery", async () => {
  await listeners.install();
  assert.equal(accessLevel, "TRUSTED_CONTEXTS");
  assert.deepEqual(await request({ type: "GET_STATE" }), { ok: true, tasks: [], messageCount: 5 });
  assert.deepEqual(await request({ type: "SET_MESSAGE_COUNT", count: 8 }), { ok: true, messageCount: 8 });

  const results = await Promise.all([
    request({ type: "CREATE_TASK", input }),
    request({ type: "CREATE_TASK", input: { ...input, title: "Second task" } })
  ]);
  assert.ok(results.every(result => result.ok));
  assert.equal(data.tasks.length, 2, "simultaneous creates must not overwrite each other");
  assert.equal(badge, "2");
  const id = results[0].task.id;
  await request({ type: "TOGGLE_TASK", id });
  assert.equal(data.tasks.find(task => task.id === id).completed, true);
  assert.equal(badge, "1");
  await listeners.startup();
  assert.equal((await request({ type: "GET_STATE" })).tasks.length, 2);
  assert.equal((await request({ type: "GET_STATE" })).messageCount, 8);

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    failWrite = true;
    const failed = await request({ type: "CREATE_TASK", input });
    assert.equal(failed.ok, false);
    assert.match(failed.error, /quota/);
    assert.equal(data.tasks.length, 2);
    failWrite = false;
    const missing = await request({ type: "DELETE_TASK", id: "does-not-exist" });
    assert.equal(missing.ok, false);
    assert.equal(errors.length, 2, "failures should be logged");
  } finally {
    failWrite = false;
    console.error = originalError;
  }
  await request({ type: "DELETE_TASK", id });
  assert.equal(data.tasks.length, 1);
  await request({ type: "DELETE_TASK", id: data.tasks[0].id });
  assert.equal(badge, "");
});

test("content scripts and external senders cannot read stored conversations", () => {
  const respond = () => assert.fail("untrusted request received a response");
  assert.equal(listeners.message({ type: "GET_STATE" }, { id: "test-extension", tab: { id: 1 } }, respond), false);
  assert.equal(listeners.message({ type: "GET_STATE" }, { id: "another-extension" }, respond), false);
});
