(() => {
  const messageSelector = '.message-in, .message-out, [data-pre-plain-text], [data-id^="true_"], [data-id^="false_"]';
  const excludedSelector = 'header, footer, [contenteditable="true"], [data-testid="quoted-message"], [data-testid="quoted-message-container"]';

  function currentChat() {
    const main = document.querySelector("#main");
    const titleNode = main?.querySelector(
      'header [data-testid="conversation-info-header-chat-title"], header span[title]'
    );
    const title = (titleNode?.getAttribute("title") || titleNode?.textContent || "").trim();
    if (!main || !title) throw new Error("Open a conversation in WhatsApp Web first.");
    const messageId = main.querySelector('[data-id^="true_"], [data-id^="false_"]')?.getAttribute("data-id") || "";
    const id = /^(?:true|false)_([^_]+@[^_]+)_/.exec(messageId)?.[1] || "";
    return { main, chat: { title, id } };
  }

  function capture(count) {
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      throw new Error("Choose a message count between 1 and 50.");
    }
    const { main, chat } = currentChat();
    const candidates = [...main.querySelectorAll(messageSelector)].filter(row => !row.closest(excludedSelector));
    const candidateSet = new Set(candidates);
    // A bubble can contain both an ID wrapper and metadata. Capture it only once,
    // without treating unrelated data-id ancestors as message containers.
    const rows = candidates.filter(row => {
      for (let parent = row.parentElement; parent && parent !== main; parent = parent.parentElement) {
        if (candidateSet.has(parent)) return false;
      }
      return true;
    });
    const messages = rows.map(row => {
      const metadata = row.getAttribute("data-pre-plain-text") ||
        row.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text") || "";
      const parts = /^\[([^\]]+)\]\s*(.*?):\s*$/.exec(metadata);
      const texts = [
        ...(row.matches(".selectable-text") ? [row] : []),
        ...row.querySelectorAll(".selectable-text")
      ].filter(node =>
        !node.parentElement?.closest(".selectable-text") &&
        !node.closest(excludedSelector)
      );
      let text = texts.map(node => (node.innerText || node.textContent || "").trim()).filter(Boolean).join("\n");
      if (!text) {
        const media = row.querySelector('img, video, audio, [data-testid*="audio"], [data-testid*="document"], [data-icon*="document"]');
        text = media ? "[Media or attachment - view in WhatsApp]" : "[Non-text message - view in WhatsApp]";
      }
      return {
        text,
        sender: parts?.[2] || (
          (row.getAttribute("data-id") || "").startsWith("true_") ||
          row.matches(".message-out") || row.querySelector(".message-out") ? "You" : ""
        ),
        timestamp: parts?.[1] || ""
      };
    }).slice(-count);
    if (!messages.length) throw new Error("No messages were detected. Wait for the conversation to load and try again. If messages are already visible, reload the extension and refresh WhatsApp.");
    return { chat, messages, capturedAt: new Date().toISOString() };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "CAPTURE_CHAT") return false;
    try {
      sendResponse({ ok: true, snapshot: capture(message.count) });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  });

  function showNotice(text) {
    let notice = document.querySelector("#wtt-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "wtt-notice";
      notice.setAttribute("role", "status");
      Object.assign(notice.style, {
        position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
        zIndex: "2147483647", background: "#143c35", color: "white", padding: "16px 20px",
        borderRadius: "12px", font: "14px/1.5 system-ui", maxWidth: "480px",
        boxShadow: "0 6px 30px #0004"
      });
      const dismiss = document.createElement("button");
      dismiss.textContent = "Dismiss";
      Object.assign(dismiss.style, { marginLeft: "12px", cursor: "pointer" });
      dismiss.addEventListener("click", () => notice.remove());
      notice.append(document.createElement("span"), dismiss);
      document.body.append(notice);
    }
    notice.querySelector("span").textContent = text;
  }

  async function waitFor(find, timeout = 10000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const result = find();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return null;
  }

  function matchingRows(title) {
    const matches = [...document.querySelectorAll("#pane-side span[title]")].filter(node =>
      node.getAttribute("title") === title
    );
    return [...new Set(matches.map(node =>
      node.closest('[role="listitem"], [role="row"]') || node
    ))];
  }

  let opening = false;
  async function openLinkedChat() {
    if (!location.hash.startsWith("#wtt-chat=") || opening) return;
    opening = true;
    const hash = location.hash;
    try {
      const target = JSON.parse(decodeURIComponent(hash.slice("#wtt-chat=".length)));
      if (!target || typeof target.title !== "string" || !target.title.trim()) {
        throw new Error("This conversation link is invalid.");
      }
      showNotice(`Finding "${target.title}"...`);
      const side = await waitFor(() => document.querySelector("#side"), 30000);
      if (!side) throw new Error(`Log in to WhatsApp, then open the task link again to find "${target.title}".`);
      let rows = matchingRows(target.title);
      if (!rows.length) {
        // Only use the sidebar search box; never type into a message composer.
        const search = side.querySelector('[contenteditable="true"][role="textbox"]');
        if (!search) throw new Error(`Search WhatsApp for "${target.title}" to reopen this conversation.`);
        search.focus();
        const selection = getSelection();
        const range = document.createRange();
        range.selectNodeContents(search);
        selection.removeAllRanges();
        selection.addRange(range);
        if (!document.execCommand("insertText", false, target.title)) {
          throw new Error(`Search WhatsApp for "${target.title}" to reopen this conversation.`);
        }
        await waitFor(() => matchingRows(target.title).length);
        // Allow search results to settle before checking for duplicate names.
        await new Promise(resolve => setTimeout(resolve, 500));
        rows = matchingRows(target.title);
      }
      if (rows.length !== 1) {
        throw new Error(rows.length > 1
          ? `More than one chat is named "${target.title}". Please select the right conversation in WhatsApp.`
          : `Could not find "${target.title}". It may have been renamed or archived. Please search for it in WhatsApp.`);
      }
      rows[0].click();
      const opened = await waitFor(() => {
        const titleNode = document.querySelector('#main header [data-testid="conversation-info-header-chat-title"], #main header span[title]');
        return (titleNode?.getAttribute("title") || titleNode?.textContent || "").trim() === target.title;
      });
      if (!opened) throw new Error(`Select "${target.title}" in WhatsApp to return to your conversation.`);
      const actual = currentChat().chat;
      if (target.id && actual.id && target.id !== actual.id) {
        throw new Error("This chat has the same name but a different ID. Please select the original conversation.");
      }
      showNotice(`Opened "${target.title}". Your saved task context is in the extension.`);
    } catch (error) {
      console.error("Task tracker conversation link failed:", error);
      showNotice(error.message);
    } finally {
      if (location.hash === hash) history.replaceState(null, "", location.pathname + location.search);
      opening = false;
      if (location.hash.startsWith("#wtt-chat=")) openLinkedChat();
    }
  }

  window.addEventListener("hashchange", openLinkedChat);
  openLinkedChat();
})();
