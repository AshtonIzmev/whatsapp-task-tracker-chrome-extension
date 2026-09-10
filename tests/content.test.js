import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../content.js", import.meta.url), "utf8");

function message(index, {
  outgoing = false, media = false, dataId = `${outgoing}_123@c.us_MSG${index}`,
  bubble = false, metadataOnSelf = false, excluded = false
} = {}) {
  const metadata = `[10:0${index}, 10/09/2026] ${outgoing ? "You" : "Alex"}: `;
  const classes = bubble ? [outgoing ? ".message-out" : ".message-in"] : [];
  const row = {
    parentElement: { closest: () => null },
    closest: () => excluded ? {} : null,
    matches: selector => classes.includes(selector),
    getAttribute: name => name === "data-id" ? dataId : name === "data-pre-plain-text" && metadataOnSelf ? metadata : null,
    querySelector: selector => selector === "[data-pre-plain-text]"
      ? media || metadataOnSelf ? null : { getAttribute: () => metadata }
      : selector === ".message-out" ? null : media ? {} : null,
    querySelectorAll: () => media ? [] : [{
      innerText: `Message ${index}`,
      parentElement: { closest: () => null },
      closest: () => null
    }]
  };
  return row;
}

function contentScript({ rows = [], title = "Alex", hasMain = true } = {}) {
  let listener;
  const main = {
    querySelector: selector => selector.includes("data-id")
      ? rows.find(row => /^(?:true|false)_/.test(row.getAttribute("data-id") || ""))
      : { getAttribute: () => title },
    querySelectorAll: selector => rows.filter(row => selector.split(", ").some(part => {
      if (part === "[data-id]") return row.getAttribute("data-id") !== null;
      if (part === '[data-id^="true_"]') return (row.getAttribute("data-id") || "").startsWith("true_");
      if (part === '[data-id^="false_"]') return (row.getAttribute("data-id") || "").startsWith("false_");
      if (part === "[data-pre-plain-text]") return row.getAttribute("data-pre-plain-text") !== null;
      return row.matches(part);
    }))
  };
  vm.runInNewContext(source, {
    document: { querySelector: () => hasMain ? main : null },
    chrome: { runtime: { onMessage: { addListener: callback => { listener = callback; } } } },
    window: { addEventListener: () => {} },
    location: { hash: "" },
    console
  });
  return count => {
    let response;
    listener({ type: "CAPTURE_CHAT", count }, {}, result => { response = result; });
    return JSON.parse(JSON.stringify(response));
  };
}

test("captures the last requested messages in conversation order, with metadata", () => {
  const capture = contentScript({ rows: Array.from({ length: 8 }, (_, index) => message(index, { outgoing: index === 7 })) });
  const result = capture(5);
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.chat, { title: "Alex", id: "123@c.us" });
  assert.deepEqual(result.snapshot.messages.map(item => item.text), ["Message 3", "Message 4", "Message 5", "Message 6", "Message 7"]);
  assert.equal(result.snapshot.messages[4].sender, "You");
  assert.equal(result.snapshot.messages[0].timestamp, "10:03, 10/09/2026");
});

test("fewer loaded messages and media placeholders are handled", () => {
  const result = contentScript({ rows: [message(1), message(2, { media: true })] })(5);
  assert.equal(result.snapshot.messages.length, 2);
  assert.match(result.snapshot.messages[1].text, /Media or attachment/);
});

test("message bubbles without legacy message IDs are captured", () => {
  const result = contentScript({ rows: [
    message(1, { bubble: true, dataId: null }),
    message(2, { bubble: true, dataId: "opaque-message-id" }),
    message(3, { bubble: true, dataId: null, outgoing: true, media: true })
  ] })(5);
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.chat.id, "");
  assert.deepEqual(result.snapshot.messages.map(item => item.text), [
    "Message 1", "Message 2", "[Media or attachment - view in WhatsApp]"
  ]);
  assert.equal(result.snapshot.messages[2].sender, "You");
});

test("metadata alone identifies messages and is read from the selected node", () => {
  const result = contentScript({ rows: [message(1, { dataId: null, metadataOnSelf: true })] })(5);
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.messages[0], {
    text: "Message 1", sender: "Alex", timestamp: "10:01, 10/09/2026"
  });
});

test("unrelated data-id ancestors do not hide loaded messages", () => {
  const rows = [message(1), message(2)];
  const wrapper = { closest: () => wrapper, parentElement: null };
  rows.forEach(row => { row.parentElement = wrapper; });
  const result = contentScript({ rows })(5);
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.messages.length, 2);
});

test("nested message markers are captured only once and quotes/drafts are excluded", () => {
  const outer = message(1, { bubble: true });
  const inner = message(1, { dataId: null, metadataOnSelf: true });
  inner.parentElement = outer;
  const excluded = message(2, { dataId: null, metadataOnSelf: true, excluded: true });
  const result = contentScript({ rows: [outer, inner, excluded] })(5);
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.messages.length, 1);
});

test("missing conversations, empty histories and invalid counts fail explicitly", () => {
  assert.match(contentScript({ hasMain: false })(5).error, /Open a conversation/);
  assert.match(contentScript({ title: "" })(5).error, /Open a conversation/);
  assert.match(contentScript()(5).error, /No messages/);
  assert.match(contentScript()(0).error, /between 1 and 50/);
  assert.match(contentScript()(51).error, /between 1 and 50/);
});
