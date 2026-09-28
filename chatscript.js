/* Vertex Games chat — bottom-right widget (Cloudflare Workers AI + page control) */

function getVertexPage() {
  return window.VertexPage || window.SoluViewPage || null;
}

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function createEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"']+/gi;

function trimUrlTrailingPunctuation(url) {
  return url.replace(/[.,;:!?)\]]+$/, "");
}

function linkifyTextToFragment(text) {
  const fragment = document.createDocumentFragment();
  const str = String(text || "");
  if (!str) return fragment;

  let lastIndex = 0;
  let match;

  URL_IN_TEXT_RE.lastIndex = 0;
  while ((match = URL_IN_TEXT_RE.exec(str)) !== null) {
    const rawUrl = match[0];
    const url = trimUrlTrailingPunctuation(rawUrl);
    const urlStart = match.index;

    if (urlStart > lastIndex) {
      fragment.appendChild(document.createTextNode(str.slice(lastIndex, urlStart)));
    }

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = url;
    a.className = "sv-chat__link";
    fragment.appendChild(a);

    lastIndex = urlStart + rawUrl.length;
  }

  if (lastIndex < str.length) {
    fragment.appendChild(document.createTextNode(str.slice(lastIndex)));
  }

  return fragment;
}

function createMessageEl(role, content) {
  const cls =
    role === "user" ? "sv-chat__msg sv-chat__msg--user" : "sv-chat__msg sv-chat__msg--assistant";
  const el = document.createElement("div");
  el.className = cls;
  el.appendChild(linkifyTextToFragment(cleanMessageForDisplay(content)));
  return el;
}

const ACTION_TAG_RE = /\[SV_ACTION\][\s\S]*?\[\/SV_ACTION\]/gi;
const ACTION_TAG_OPEN_RE = /\[SV_ACTION\][\s\S]*/gi;
const PROPOSAL_SENT_KEY = "vg_chat_proposal_sent_v1";
const PROPOSAL_FLOW_KEY = "vg_chat_proposal_flow_v1";
const CHAT_HISTORY_KEY = "vg_chat_history_v1";

function stripActionTags(text) {
  return String(text || "")
    .replace(ACTION_TAG_RE, "")
    .replace(ACTION_TAG_OPEN_RE, "")
    .replace(/\[\/SV_ACTION\]/gi, "")
    .trim();
}

function sanitizeWebsiteReply(text) {
  let out = stripActionTags(text);
  out = out.replace(
    /\s*(?:visit|see|check out|go to)\s+(?:our\s+)?(?:website|site)(?:\s+at)?[^.!?]*[.!?]?/gi,
    ""
  );
  out = out.replace(/\s*for more(?: information)?[^.!?]*[.!?]?/gi, "");
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  return out;
}

function cleanMessageForDisplay(text) {
  return sanitizeWebsiteReply(text);
}

function markProposalFlowActive() {
  try {
    sessionStorage.setItem(PROPOSAL_FLOW_KEY, "1");
  } catch {
    // ignore
  }
}

function isProposalFlowActive() {
  try {
    return sessionStorage.getItem(PROPOSAL_FLOW_KEY) === "1";
  } catch {
    return false;
  }
}

function normalizeProposalFields(data) {
  const d = data || {};
  return {
    FullName: String(d.FullName || d.name || "").trim(),
    Email: String(d.Email || d.email || "").trim(),
    Project: String(d.Project || d.project || "3D Game").trim(),
    Description: String(d.Description || d.description || d.details || "").trim(),
  };
}

function hasCompleteProposalFields(fields) {
  const f = normalizeProposalFields(fields);
  if (!f.FullName || f.FullName.length < 2) return false;
  if (!f.Email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.Email)) return false;
  if (!f.Project) return false;
  if (!f.Description || f.Description.length < 8) return false;
  return true;
}

function inferProjectType(text) {
  const lower = String(text || "").toLowerCase();
  if (/^2d|two.?d|pixel|mobile 2d/.test(lower)) return "2D Game";
  if (/vr|ar|virtual reality|augmented|xr|immersive/.test(lower)) return "VR/AR Experience";
  if (/mvp|prototype|proof of concept/.test(lower)) return "Prototype / MVP";
  if (/full.?cycle|end.?to.?end/.test(lower)) return "Full-Cycle Development";
  if (/^3d|three.?d|unreal|unity/.test(lower)) return "3D Game";
  return "3D Game";
}

function extractProposalFromText(text) {
  const str = String(text || "");
  const emailMatch = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!emailMatch) return null;

  const email = emailMatch[0];
  let fullName = "";

  const namePatterns = [
    /(?:my\s+)?names?\s*(?:is\s*)?[:\s]+([A-Za-z][A-Za-z\s'.-]{1,40}?)(?=\s*,|\s+email|\s+e-?mail|$)/i,
    /(?:my\s+)?named\s+([A-Za-z][A-Za-z\s'.-]{1,40}?)(?=\s+email|\s+e-?mail|$)/i,
    /(?:i'?m|i am)\s+([A-Za-z][A-Za-z\s'.-]{1,40}?)(?=\s*,|\s+and|\s+email|$)/i,
  ];

  for (let i = 0; i < namePatterns.length; i += 1) {
    const m = str.match(namePatterns[i]);
    if (m && m[1]) {
      fullName = m[1].trim();
      break;
    }
  }

  if (!fullName) {
    const before = str.slice(0, emailMatch.index).replace(/^(my\s+)?names?\s*(is\s*)?/i, "").trim();
    const parts = before
      .split(/\s+/)
      .filter((w) => w.length > 1 && !/^(my|name|named|is|the|hi|hello)$/i.test(w));
    if (parts.length) fullName = parts.slice(-2).join(" ") || parts[0];
  }

  fullName = fullName.replace(/\s+/g, " ").trim();

  let description = "";
  const descMatch = str.match(
    /(?:project\s*)?(?:desct?ion|details?|brief)\s*(?:is\s*)?[:\s]+(.+)/i
  );
  if (descMatch) {
    description = descMatch[1].trim();
  } else {
    const afterEmail = str.slice(emailMatch.index + email.length).trim().replace(/^[,.\s]+/, "");
    if (afterEmail.length >= 12) description = afterEmail;
  }
  if (!description || description.length < 8) {
    description = str.replace(email, "").trim();
  }

  if (!fullName || fullName.length < 2) return null;

  return normalizeProposalFields({
    FullName: fullName,
    Email: email,
    Project: inferProjectType(str),
    Description: description.slice(0, 1200),
  });
}

function isProposalDetailsMessage(text) {
  return hasCompleteProposalFields(extractProposalFromText(text));
}

const INTENT_RULES = [
  {
    test: (t) =>
      /\b(services?|what do you (do|offer)|capabilities|offerings|2d|3d game dev)\b/.test(t) &&
      !/\b(send|submit|proposal|contact|inquiry)\b/.test(t),
    actions: [{ type: "scroll", target: "services" }],
  },
  {
    test: (t) => /\b(tech|engine|unity|unreal|godot|platform)\b/.test(t) && !/\b(publish|store)\b/.test(t),
    actions: [{ type: "scroll", target: "tech" }],
  },
  {
    test: (t) => /\b(publish|store|steam|google play|app store|itch)\b/.test(t),
    actions: [{ type: "scroll", target: "publish" }],
  },
  {
    test: (t) => /\b(portfolio|showcase|our work|examples? of work|your work|games you)\b/.test(t),
    actions: [{ type: "scroll", target: "portfolio" }],
  },
  {
    test: (t) => /\b(process|how (it|you) work|workflow|timeline|delivery|steps)\b/.test(t),
    actions: [{ type: "scroll", target: "services" }],
  },
  {
    test: (t) => /\b(location|where are you|office|based|morocco|tanger)\b/.test(t),
    actions: [],
  },
  {
    test: (t) =>
      /\b(contact|get started|send (a )?proposal|submit (a )?project|project (inquiry|brief)|reach you|hire you|quote|start (a )?project)\b/.test(
        t
      ) && !isConversationClosing(t),
    actions: [{ type: "scroll", target: "contact" }, { type: "focus_proposal" }],
  },
];

function userWantsProposalFlow(text) {
  const t = (text || "").toLowerCase();
  return (
    isProposalFlowActive() ||
    /\b(send|submit)\s+(a\s+)?(proposal|inquiry|project)\b/.test(t) ||
    /\b(need to send|want to send|like to send)\b.*\b(proposal|inquiry|project)\b/.test(t)
  );
}

function isConversationClosing(text) {
  const t = (text || "").trim().toLowerCase().replace(/[!?.…]+$/g, "").trim();
  if (!t) return false;
  if (/^(thanks?|thank you|thx|ty|cheers|much appreciated)(\s+(a\s+lot|so\s+much|anyway))?$/.test(t)) {
    return true;
  }
  if (/^thanks\s+for(\s+your)?\s+(help|assistance|support)/.test(t)) {
    return true;
  }
  if (/^(ok|okay|great|perfect|awesome|nice),?\s*(thanks?|thank you|thx)$/.test(t)) {
    return true;
  }
  if (/^(bye|goodbye|see you|take care|have a (nice|good|great) day)/.test(t)) {
    return true;
  }
  return false;
}

function isSubmitConfirmation(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t || isConversationClosing(text)) return false;
  if (/^send(\s+proposal)?$/.test(t) || /^submit(\s+proposal)?$/.test(t)) return true;
  return (
    /\b(yes|yep|yeah|sure|ok|okay|go ahead|do it|send it|submit|confirm|send)\b/.test(t) &&
    (/\b(send|submit|proposal|go ahead|do it|confirm)\b/.test(t) || t === "yes" || /^yes\b/.test(t))
  );
}

function wasProposalSent() {
  try {
    return sessionStorage.getItem(PROPOSAL_SENT_KEY) === "1";
  } catch {
    return false;
  }
}

function markProposalSent() {
  try {
    sessionStorage.setItem(PROPOSAL_SENT_KEY, "1");
  } catch {
    // ignore
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      return parsed.slice(-10).map((m) => ({
        role: m.role,
        content: cleanMessageForDisplay(m.content),
      }));
    }
  } catch {
    // ignore
  }
  return [
    {
      role: "assistant",
      content:
        "Hi — I’m Vertex Games Assistant. Ask about our services, tech, portfolio, process, or say “send a proposal” to start your project.",
    },
  ];
}

function saveHistory(history) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history.slice(-16)));
  } catch {
    // ignore
  }
}

function trimHistoryForApi(history) {
  return history.slice(-8).map((m) => ({
    role: m.role,
    content: String(m.content || "").slice(0, 420),
  }));
}

function detectIntentFromUser(text) {
  if (isConversationClosing(text)) return [];
  const t = (text || "").toLowerCase();
  const actions = [];
  INTENT_RULES.forEach((rule) => {
    if (rule.test(t)) actions.push(...rule.actions);
  });
  return actions;
}

function parseActionsFromText(text) {
  const actions = [];
  const raw = String(text || "");
  const tagRe = /\[SV_ACTION\]([\s\S]*?)\[\/SV_ACTION\]/gi;
  let match;

  while ((match = tagRe.exec(raw)) !== null) {
    try {
      const action = JSON.parse(match[1].trim());
      if (!action || !action.type) continue;
      if (action.type === "submit_proposal") {
        actions.push({ type: "fill_proposal", data: action.data || {} });
      } else {
        actions.push(action);
      }
    } catch {
      // ignore malformed action blocks
    }
  }

  const cleanText = cleanMessageForDisplay(raw);
  return { cleanText: cleanText.replace(/\n{3,}/g, "\n\n").trim(), actions };
}

function filterActions(actions, userText, state) {
  return actions.filter((action) => {
    if (!action || !action.type) return false;

    if (action.type === "fill_proposal" && state.proposalSubmitted) return false;

    if (
      action.type === "focus_proposal" &&
      state.proposalSubmitted &&
      isConversationClosing(userText)
    ) {
      return false;
    }

    return true;
  });
}

async function trySubmitProposal(fields, context) {
  const page = getVertexPage();
  if (!page || context.proposalSubmitted) return false;

  const normalized = normalizeProposalFields(fields);
  if (!hasCompleteProposalFields(normalized)) {
    page.fillProposal(normalized);
    page.scrollTo("contact");
    return false;
  }

  page.fillProposal(normalized);
  page.scrollTo("contact");

  if (context.setTyping) context.setTyping("Sending your inquiry…");

  try {
    await page.submitProposal(normalized, { source: "chat", fillForm: true });
    context.proposalSubmitted = true;
    markProposalSent();
    const firstName = normalized.FullName.split(" ")[0];
    const thanks = `Thanks, ${firstName}! Your project inquiry was sent. We’ll be in touch soon.`;
    if (context.onSuccess) context.onSuccess(thanks);
    context.justSubmitted = true;
    return true;
  } catch (err) {
    const errMsg = err.message || "Couldn’t send the proposal. Please try the form below.";
    if (context.onError) context.onError(errMsg);
    return false;
  }
}

async function runPageActions(actions, context) {
  const page = getVertexPage();
  if (!page || !actions.length) return;

  const filtered = filterActions(actions, context.userText || "", context);

  for (const action of filtered) {
    if (action.type === "scroll") {
      page.scrollTo(action.target || "top");
      continue;
    }

    if (action.type === "focus_proposal") {
      markProposalFlowActive();
      page.scrollTo("contact");
      page.focusProposal(action.field);
      continue;
    }

    if (action.type === "fill_proposal") {
      markProposalFlowActive();
      await trySubmitProposal(action.data || {}, context);
    }
  }
}

function initWidget() {
  const root = qs("[data-sv-chat]");
  if (!root) return;

  const api = root.getAttribute("data-api") || "https://vertex.moerziki.workers.dev/";
  const apiKey = root.getAttribute("data-api-key") || "";

  const fab = qs("[data-sv-chat-fab]", root);
  const panel = qs("[data-sv-chat-panel]", root);
  const closeBtn = qs("[data-sv-chat-close]", root);
  const messages = qs("[data-sv-chat-messages]", root);
  const input = qs("[data-sv-chat-input]", root);
  const send = qs("[data-sv-chat-send]", root);
  const typing = qs("[data-sv-chat-typing]", root);

  let history = loadHistory();
  let sending = false;
  let proposalSubmitted = wasProposalSent();

  function setOpen(isOpen) {
    root.classList.toggle("is-open", isOpen);
    panel.setAttribute("aria-hidden", String(!isOpen));
    fab.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) setTimeout(() => input?.focus(), 50);
  }

  function renderAll() {
    messages.innerHTML = "";
    history.forEach((m) => {
      messages.appendChild(createMessageEl(m.role, m.content));
    });
    messages.scrollTop = messages.scrollHeight;
  }

  function setTyping(text) {
    if (!typing) return;
    typing.textContent = text || "";
    typing.hidden = !text;
  }

  function buildActionContext(userText) {
    return {
      userText,
      proposalSubmitted,
      justSubmitted: false,
      setTyping,
      onSuccess: (msg) => {
        history.push({ role: "assistant", content: msg });
        saveHistory(history);
        renderAll();
      },
      onError: (msg) => {
        history.push({ role: "assistant", content: msg });
        saveHistory(history);
        renderAll();
      },
    };
  }

  async function sendMessage() {
    const text = (input.value || "").trim();
    if (!text || sending) return;
    sending = true;
    input.value = "";

    if (isConversationClosing(text)) {
      history.push({ role: "user", content: text });
      history.push({
        role: "assistant",
        content: proposalSubmitted
          ? "You’re welcome! We have your project inquiry and will be in touch soon."
          : "You’re welcome! Let me know if you need anything else.",
      });
      saveHistory(history);
      renderAll();
      sending = false;
      return;
    }

    if (userWantsProposalFlow(text)) {
      markProposalFlowActive();
    }

    const userIntentActions = detectIntentFromUser(text);
    if (userIntentActions.length) {
      const ctx = buildActionContext(text);
      await runPageActions(userIntentActions, ctx);
      proposalSubmitted = ctx.proposalSubmitted || wasProposalSent();
      if (ctx.justSubmitted) {
        history.push({ role: "user", content: text });
        saveHistory(history);
        renderAll();
        sending = false;
        return;
      }
    }

    history.push({ role: "user", content: text });
    saveHistory(history);
    renderAll();

    if (!proposalSubmitted && isProposalDetailsMessage(text) && userWantsProposalFlow(text)) {
      const extracted = extractProposalFromText(text);
      const ctx = buildActionContext(text);
      const submitted = await trySubmitProposal(extracted, ctx);
      proposalSubmitted = ctx.proposalSubmitted || wasProposalSent();
      if (submitted) {
        sending = false;
        return;
      }
    }

    setTyping("Thinking…");
    send.disabled = true;

    try {
      const res = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          prompt: text,
          history: trimHistoryForApi(history.slice(0, -1)),
          proposalAlreadySent: proposalSubmitted,
          onWebsite: true,
        }),
      });

      const data = await res.json().catch(() => ({}));
      const raw =
        (data && data.response) ||
        (data && data.error ? `Error: ${data.error}` : "Sorry — try again in a moment.");

      const { cleanText, actions } = parseActionsFromText(raw);
      const safeActions = filterActions(actions, text, { proposalSubmitted });
      let replyText = cleanMessageForDisplay(cleanText);

      const ctx = buildActionContext(text);
      ctx.proposalSubmitted = proposalSubmitted;

      if (safeActions.length) {
        await runPageActions(safeActions, ctx);
        proposalSubmitted = ctx.proposalSubmitted || wasProposalSent();
      }

      if (!ctx.justSubmitted && replyText) {
        history.push({ role: "assistant", content: replyText });
        saveHistory(history);
        renderAll();
      } else if (safeActions.some((a) => a.type === "fill_proposal")) {
        history.push({
          role: "assistant",
          content: "Please share your full name, email, and a short project description.",
        });
        saveHistory(history);
        renderAll();
      }
    } catch (e) {
      console.error(e);
      history.push({
        role: "assistant",
        content: "Sorry — connection issue. Please try again.",
      });
      saveHistory(history);
      renderAll();
    } finally {
      setTyping("");
      send.disabled = false;
      sending = false;
    }
  }

  fab.addEventListener("click", () => setOpen(!root.classList.contains("is-open")));
  closeBtn.addEventListener("click", () => setOpen(false));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  send.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  document.addEventListener("vertex:proposal-submitted", (e) => {
    const detail = e.detail || {};
    if (detail.success) {
      proposalSubmitted = true;
      markProposalSent();
    }
  });

  renderAll();
  setOpen(false);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWidget);
} else {
  initWidget();
}
