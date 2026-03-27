const settingsKey = "hermes_remote_settings";
const activeConversationKey = "hermes_remote_active_conversation";

const apiBaseInput = document.getElementById("apiBaseInput");
const userTokenInput = document.getElementById("userTokenInput");
const deviceIdInput = document.getElementById("deviceIdInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const refreshBtn = document.getElementById("refreshBtn");
const newConversationBtn = document.getElementById("newConversationBtn");
const conversationList = document.getElementById("conversationList");
const conversationTitle = document.getElementById("conversationTitle");
const statusText = document.getElementById("statusText");
const messagesEl = document.getElementById("messages");
const composerForm = document.getElementById("composerForm");
const messageInput = document.getElementById("messageInput");

let settings = loadSettings();
let activeConversationId = localStorage.getItem(activeConversationKey) || "";
let lastJobId = "";

function loadSettings() {
  const raw = localStorage.getItem(settingsKey);
  if (!raw) {
    return {
      apiBase: window.location.origin,
      userToken: "",
      deviceId: "home-pc",
    };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {
      apiBase: window.location.origin,
      userToken: "",
      deviceId: "home-pc",
    };
  }
}

function saveSettings() {
  settings = {
    apiBase: apiBaseInput.value.trim().replace(/\/$/, "") || window.location.origin,
    userToken: userTokenInput.value.trim(),
    deviceId: deviceIdInput.value.trim() || "home-pc",
  };
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  statusText.textContent = "Settings saved";
  loadConversations();
}

function headers() {
  const result = { "Content-Type": "application/json" };
  if (settings.userToken) {
    result["X-User-Token"] = settings.userToken;
  }
  return result;
}

async function api(path, options = {}) {
  const response = await fetch(`${settings.apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...headers(),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json();
}

function renderMessages(items) {
  messagesEl.innerHTML = "";
  for (const item of items) {
    const card = document.createElement("div");
    card.className = `message ${item.role}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = item.role === "assistant" ? "Hermes" : "You";

    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = item.content;

    card.append(meta, body);
    messagesEl.appendChild(card);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderConversations(items) {
  conversationList.innerHTML = "";
  for (const item of items) {
    const button = document.createElement("button");
    button.className = `conversation-item${item.id === activeConversationId ? " active" : ""}`;
    button.textContent = item.title || item.id;
    button.addEventListener("click", () => {
      activeConversationId = item.id;
      localStorage.setItem(activeConversationKey, activeConversationId);
      loadConversation(activeConversationId);
      renderConversations(items);
    });
    conversationList.appendChild(button);
  }
}

async function loadConversations() {
  try {
    const data = await api("/api/conversations", { method: "GET" });
    renderConversations(data.conversations || []);
    if (!activeConversationId && data.conversations && data.conversations.length > 0) {
      activeConversationId = data.conversations[0].id;
      localStorage.setItem(activeConversationKey, activeConversationId);
      await loadConversation(activeConversationId);
    }
  } catch (error) {
    statusText.textContent = `Failed to load conversations: ${error.message}`;
  }
}

async function loadConversation(conversationId) {
  if (!conversationId) {
    conversationTitle.textContent = "No conversation selected";
    renderMessages([]);
    return;
  }
  try {
    const data = await api(`/api/conversations/${encodeURIComponent(conversationId)}`, { method: "GET" });
    conversationTitle.textContent = conversationId;
    renderMessages(data.messages || []);
    const latestJob = (data.jobs || [])[0];
    statusText.textContent = latestJob ? `Latest job: ${latestJob.status}` : "Idle";
  } catch (error) {
    statusText.textContent = `Failed to load conversation: ${error.message}`;
  }
}

async function pollJob(jobId, conversationId) {
  lastJobId = jobId;
  while (lastJobId === jobId) {
    const job = await api(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
    statusText.textContent = `Job ${job.status}`;
    if (job.status === "completed" || job.status === "failed") {
      await loadConversation(conversationId);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }
  statusText.textContent = "Queueing job...";
  try {
    const data = await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        text,
        conversation_id: activeConversationId,
        channel: "web",
        sender_id: "web-ui",
        device_id: settings.deviceId,
      }),
    });
    activeConversationId = data.conversation_id;
    localStorage.setItem(activeConversationKey, activeConversationId);
    messageInput.value = "";
    await loadConversations();
    await loadConversation(activeConversationId);
    await pollJob(data.job_id, activeConversationId);
  } catch (error) {
    statusText.textContent = `Send failed: ${error.message}`;
  }
}

function newConversation() {
  activeConversationId = "";
  localStorage.removeItem(activeConversationKey);
  conversationTitle.textContent = "New conversation";
  renderMessages([]);
  statusText.textContent = "Idle";
}

apiBaseInput.value = settings.apiBase;
userTokenInput.value = settings.userToken;
deviceIdInput.value = settings.deviceId;

saveSettingsBtn.addEventListener("click", saveSettings);
refreshBtn.addEventListener("click", () => {
  loadConversations();
  loadConversation(activeConversationId);
});
newConversationBtn.addEventListener("click", newConversation);
composerForm.addEventListener("submit", sendMessage);

loadConversations();
loadConversation(activeConversationId);/**
 * Hermes 2.0 – desktop assistant frontend
 * Communicates with the local Flask server (server.py) on the same origin.
 */

// ── API base: same origin as server.py ────────────────────────────────────────
const params = new URLSearchParams(location.search);
const API_BASE = params.get("apiBase") || "/chat";
const ROOT_API_BASE = API_BASE === "/chat" ? "" : (API_BASE.endsWith("/chat") ? API_BASE.slice(0, -5) : API_BASE);
const MODEL_FALLBACK = "openai/gpt-oss-20b";

const {
  attachmentKey,
  nowTime,
  wait,
  escapeHtml,
  downloadTextFile,
  extensionForLanguage,
  buildProgressPhrases,
  startProgressTicker,
} = window.HermesUtils || {};

// ── DOM references ─────────────────────────────────────────────────────────────
const loading             = document.getElementById("loading");
const loadingLog          = document.getElementById("loadingLog");
const assistantApp        = document.getElementById("assistantApp");
const convoList           = document.getElementById("convoList");
const searchInput         = document.getElementById("searchInput");
const messages            = document.getElementById("messages");
const input               = document.getElementById("input");
const fileInput           = document.getElementById("fileInput");
const attachBtn           = document.getElementById("attachBtn");
const attachmentBar       = document.getElementById("attachmentBar");
const attachmentList      = document.getElementById("attachmentList");
const sendBtn             = document.getElementById("sendBtn");
const newChatBtn          = document.getElementById("newChatBtn");
const settingsBtn         = document.getElementById("settingsBtn");
const chatTitle           = document.getElementById("chatTitle");
const statusText          = document.getElementById("statusText");
const modelText           = document.getElementById("modelText");
const latencyText         = document.getElementById("latencyText");
const healthText          = document.getElementById("healthText");
const settingsModal       = document.getElementById("settingsModal");
const themeSelect         = document.getElementById("themeSelect");
const modelSelect         = document.getElementById("modelSelect");
const notificationsToggle = document.getElementById("notificationsToggle");
const exportConvosBtn     = document.getElementById("exportConvosBtn");
const importConvosBtn     = document.getElementById("importConvosBtn");
const importFileInput     = document.getElementById("importFileInput");
const saveSettingsBtn     = document.getElementById("saveSettingsBtn");
const cancelSettingsBtn   = document.getElementById("cancelSettingsBtn");
const tabButtons          = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels           = Array.from(document.querySelectorAll(".tab-panel"));
const refreshMemoryBtn    = document.getElementById("refreshMemoryBtn");
const saveLocalMemoryBtn  = document.getElementById("saveLocalMemoryBtn");
const clearCurrentMemoryBtn = document.getElementById("clearCurrentMemoryBtn");
const clearGlobalMemoryBtn  = document.getElementById("clearGlobalMemoryBtn");
const saveGlobalMemoryBtn   = document.getElementById("saveGlobalMemoryBtn");
const memoryStatus        = document.getElementById("memoryStatus");
const convoMemoryEditor   = document.getElementById("convoMemoryEditor");
const factsList           = document.getElementById("factsList");
const factInput           = document.getElementById("factInput");
const addFactBtn          = document.getElementById("addFactBtn");
const pinEnabledToggle    = document.getElementById("pinEnabledToggle");
const pinInput            = document.getElementById("pinInput");
const pinConfirmInput     = document.getElementById("pinConfirmInput");
const pinModal            = document.getElementById("pinModal");
const pinUnlockInput      = document.getElementById("pinUnlockInput");
const pinUnlockBtn        = document.getElementById("pinUnlockBtn");
const noticeModal         = document.getElementById("noticeModal");
const noticeTitle         = document.getElementById("noticeTitle");
const noticeMessage       = document.getElementById("noticeMessage");
const noticeOkBtn         = document.getElementById("noticeOkBtn");
const shortcutList        = document.getElementById("shortcutList");
const resetShortcutsBtn   = document.getElementById("resetShortcutsBtn");
const voiceBtn            = document.getElementById("voiceBtn");
const messagesChart       = document.getElementById("messagesChart");
const conversationsChart  = document.getElementById("conversationsChart");

// ── state ──────────────────────────────────────────────────────────────────────
let conversations = JSON.parse(localStorage.getItem("hermes_web_conversations") || "{}");
let activeId      = localStorage.getItem("hermes_web_active") || null;
let settings      = JSON.parse(localStorage.getItem("hermes_web_settings") || "{}");
let globalFactsDraft    = [];
let recordingShortcut   = null;
let recognition         = null;
let isRecording         = false;
let messagesChartInstance      = null;
let conversationsChartInstance = null;
let pendingAttachments  = [];
let backendReady        = false;
let backendConnectInProgress = false;
const AUTO_TITLE_MIN_MESSAGES = 4;

// ── settings defaults ──────────────────────────────────────────────────────────
const DEFAULT_SHORTCUTS = {
  newChat:    { key: "n", ctrl: true,  shift: false, alt: false, name: "New Chat",      desc: "Create a new conversation" },
  search:     { key: "k", ctrl: true,  shift: false, alt: false, name: "Focus Search",  desc: "Jump to conversation search" },
  settings:   { key: ",", ctrl: true,  shift: false, alt: false, name: "Open Settings", desc: "Open settings modal" },
  closeModal: { key: "Escape", ctrl: false, shift: false, alt: false, name: "Close Modal", desc: "Close any open modal" },
};

const AVAILABLE_MODELS = [
  { value: "auto",                   label: "Auto (Self-Escalation)" },
  { value: "openai/gpt-oss-20b",     label: "OpenAI GPT-OSS 20B" },
  { value: "openai/gpt-oss-120b",    label: "OpenAI GPT-OSS 120B" },
];

if (!settings.theme)       settings.theme       = "dark";
if (!settings.model)       settings.model       = "auto";
if (typeof settings.notifications !== "boolean") settings.notifications = true;
if (typeof settings.pin_enabled   !== "boolean") settings.pin_enabled   = false;
if (!settings.pin_hash)    settings.pin_hash    = "";
if (!settings.shortcuts)   settings.shortcuts   = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));

// ── PIN helper ─────────────────────────────────────────────────────────────────
function hashPin(pin) {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

// ── settings UI ───────────────────────────────────────────────────────────────
function ensureModelOptions() {
  const currentModel = settings.model || "auto";
  const unique = new Map();
  for (const m of AVAILABLE_MODELS) {
    if (!unique.has(m.value)) unique.set(m.value, m.label);
  }
  modelSelect.innerHTML = "";
  unique.forEach((label, value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    modelSelect.appendChild(opt);
  });
  modelSelect.value = unique.has(currentModel) ? currentModel : "auto";
}

function applySettings() {
  document.body.classList.toggle("theme-light", settings.theme === "light");
  themeSelect.value = settings.theme;
  ensureModelOptions();
  notificationsToggle.checked = settings.notifications;
  pinEnabledToggle.checked    = !!settings.pin_enabled;
  pinInput.value              = "";
  pinConfirmInput.value       = "";
}

function persistSettings() {
  localStorage.setItem("hermes_web_settings", JSON.stringify(settings));
}

// ── notice modal ───────────────────────────────────────────────────────────────
function showHtmlNotice(title, message) {
  noticeTitle.textContent   = title || "Notice";
  noticeMessage.textContent = message || "";
  noticeModal.classList.add("show");
}
function closeHtmlNotice() { noticeModal.classList.remove("show"); }

// ── settings modal ─────────────────────────────────────────────────────────────
async function openSettings() {
  applySettings();
  settingsModal.classList.add("show");
  activateTab("generalTab");
}
function closeSettings() { settingsModal.classList.remove("show"); }

function activateTab(tabId) {
  tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
  tabPanels.forEach(panel => panel.classList.toggle("active", panel.id === tabId));
}

function setMemoryStatus(msg) { memoryStatus.textContent = msg; }

// ── shortcut helpers ───────────────────────────────────────────────────────────
function formatShortcutKey(shortcut) {
  const parts = [];
  if (shortcut.ctrl)  parts.push("Ctrl");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.alt)   parts.push("Alt");
  parts.push(shortcut.key === " " ? "Space" : shortcut.key);
  return parts.join(" + ");
}

function renderShortcuts() {
  shortcutList.innerHTML = "";
  Object.entries(settings.shortcuts).forEach(([id, shortcut]) => {
    const item = document.createElement("div");
    item.className = "shortcut-item";
    item.innerHTML = `
      <div class="shortcut-info">
        <div class="shortcut-name">${shortcut.name}</div>
        <div class="shortcut-desc">${shortcut.desc}</div>
      </div>
      <div class="shortcut-key" data-shortcut-id="${id}">${formatShortcutKey(shortcut)}</div>
    `;
    const keyBtn = item.querySelector(".shortcut-key");
    keyBtn.onclick = () => {
      if (recordingShortcut) return;
      recordingShortcut = id;
      keyBtn.classList.add("recording");
      keyBtn.textContent = "Press keys...";
    };
    shortcutList.appendChild(item);
  });
}

function handleShortcutRecording(e) {
  if (!recordingShortcut) return;
  e.preventDefault();
  e.stopPropagation();
  const key = e.key;
  if (key === "Escape") { recordingShortcut = null; renderShortcuts(); return; }
  settings.shortcuts[recordingShortcut] = {
    ...settings.shortcuts[recordingShortcut],
    key,
    ctrl:  e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt:   e.altKey,
  };
  recordingShortcut = null;
  renderShortcuts();
  persistSettings();
}

function matchesShortcut(e, shortcut) {
  return (e.ctrlKey || e.metaKey) === shortcut.ctrl
    && e.shiftKey === shortcut.shift
    && e.altKey   === shortcut.alt
    && e.key.toLowerCase() === shortcut.key.toLowerCase();
}

// ── voice input ────────────────────────────────────────────────────────────────
function initVoiceInput() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    voiceBtn.style.display = "none";
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous     = true;
  recognition.interimResults = true;
  recognition.lang           = "en-US";
  let finalTranscript = "";
  recognition.onstart  = () => { isRecording = true;  voiceBtn.classList.add("recording");    voiceBtn.textContent = "🔴"; };
  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t + " ";
      else interim += t;
    }
    input.value = finalTranscript + interim;
  };
  recognition.onerror = () => stopVoiceInput();
  recognition.onend   = () => { if (isRecording) stopVoiceInput(); };
}
function startVoiceInput() { if (recognition) try { recognition.start(); } catch (e) {} }
function stopVoiceInput()  {
  if (!recognition) return;
  isRecording = false;
  voiceBtn.classList.remove("recording");
  voiceBtn.textContent = "🎤";
  try { recognition.stop(); } catch (e) {}
}

// ── analytics ──────────────────────────────────────────────────────────────────
function calculateAnalytics() {
  const stats = { totalMessages: 0, totalConvos: Object.keys(conversations).length, convoMessageCounts: {}, userMessages: 0, assistantMessages: 0 };
  Object.entries(conversations).forEach(([, convo]) => {
    const c = convo.messages.length;
    stats.totalMessages += c;
    stats.convoMessageCounts[convo.name] = c;
    convo.messages.forEach(m => {
      if (m.role === "user") stats.userMessages++;
      else if (m.role === "assistant" || m.role === "agent") stats.assistantMessages++;
    });
  });
  stats.avgMessagesPerConvo = stats.totalConvos > 0 ? Math.round(stats.totalMessages / stats.totalConvos) : 0;
  const sorted = Object.entries(stats.convoMessageCounts).sort((a, b) => b[1] - a[1]);
  stats.mostActive = sorted.length > 0 ? sorted[0][0] : "None";
  return stats;
}

function renderAnalytics() {
  const stats = calculateAnalytics();
  document.getElementById("totalMessagesCount").textContent  = stats.totalMessages;
  document.getElementById("totalConvosCount").textContent    = stats.totalConvos;
  document.getElementById("avgMessagesPerConvo").textContent = stats.avgMessagesPerConvo;
  document.getElementById("mostActiveConvo").textContent     = stats.mostActive.length > 15 ? stats.mostActive.substring(0, 15) + "..." : stats.mostActive;

  if (messagesChartInstance) messagesChartInstance.destroy();
  messagesChartInstance = new Chart(messagesChart.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: ["User Messages", "AI Responses"],
      datasets: [{ data: [stats.userMessages, stats.assistantMessages], backgroundColor: ["#3b82f6", "#22c55e"], borderWidth: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#e7ecf6", font: { size: 12 } } },
        title:  { display: true, text: "Messages by Type", color: "#e7ecf6", font: { size: 14 } },
      },
    },
  });

  if (conversationsChartInstance) conversationsChartInstance.destroy();
  const topConvos = Object.entries(stats.convoMessageCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  conversationsChartInstance = new Chart(conversationsChart.getContext("2d"), {
    type: "bar",
    data: {
      labels: topConvos.map(([name]) => name.length > 20 ? name.substring(0, 20) + "..." : name),
      datasets: [{ label: "Messages", data: topConvos.map(([, count]) => count), backgroundColor: "#3b82f6", borderWidth: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: "y",
      plugins: { legend: { display: false }, title: { display: true, text: "Top 5 Conversations", color: "#e7ecf6", font: { size: 14 } } },
      scales: { x: { ticks: { color: "#9aa7bd" }, grid: { color: "#2b3548" } }, y: { ticks: { color: "#9aa7bd" }, grid: { color: "#2b3548" } } },
    },
  });
}

// ── facts / memory ─────────────────────────────────────────────────────────────
function renderFactsList() {
  factsList.innerHTML = "";
  if (!globalFactsDraft.length) {
    factsList.innerHTML = `<div class="fact-empty">No global facts yet.</div>`;
    return;
  }
  globalFactsDraft.forEach((fact, index) => {
    const row = document.createElement("div");
    row.className = "fact-item";
    row.draggable = true;
    row.dataset.index = index;
    row.innerHTML = `
      <div class="fact-handle">☰</div>
      <div>${escapeHtml(fact)}</div>
      <button class="fact-remove" data-index="${index}" title="Remove">Remove</button>
    `;
    row.addEventListener("dragstart", (e) => { row.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", index); });
    row.addEventListener("dragend",   () => { row.classList.remove("dragging"); document.querySelectorAll(".fact-item").forEach(i => i.classList.remove("drag-over")); });
    row.addEventListener("dragover",  (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; const d = document.querySelector(".dragging"); if (d && d !== row) row.classList.add("drag-over"); });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const from = parseInt(e.dataTransfer.getData("text/plain"));
      const to   = parseInt(row.dataset.index);
      if (from !== to) { const [removed] = globalFactsDraft.splice(from, 1); globalFactsDraft.splice(to, 0, removed); renderFactsList(); setMemoryStatus(`Reordered. ${globalFactsDraft.length} pending facts.`); }
    });
    factsList.appendChild(row);
  });
}

async function refreshMemoryView() {
  if (!activeId || !conversations[activeId]) {
    convoMemoryEditor.value = "[]";
    globalFactsDraft = [];
    renderFactsList();
    setMemoryStatus("No active conversation");
    return;
  }
  convoMemoryEditor.value = JSON.stringify(conversations[activeId].messages || [], null, 2);
  setMemoryStatus("Refreshing...");
  try {
    const [convoRes, globalRes] = await Promise.all([
      fetch(`${API_BASE}/memory/${activeId}`),
      fetch(`${API_BASE}/global-memory`),
    ]);
    const convoData  = convoRes.ok  ? await convoRes.json()  : { message_count: 0 };
    const globalData = globalRes.ok ? await globalRes.json() : { facts: [] };
    globalFactsDraft = (globalData.facts || []).map(f => String(f).trim()).filter(Boolean);
    renderFactsList();
    setMemoryStatus(`Loaded ${convoData.message_count || 0} server msgs • ${globalFactsDraft.length} global facts`);
  } catch (err) {
    globalFactsDraft = [];
    renderFactsList();
    setMemoryStatus(`Failed to load: ${err.message || err}`);
  }
}

// ── connection / loading ───────────────────────────────────────────────────────
function log(line, cls = "") {
  const ts   = new Date().toLocaleTimeString();
  const span = cls ? `<span class="${cls}">${line}</span>` : line;
  loadingLog.innerHTML += `[${ts}] ${span}\n`;
  loadingLog.scrollTop = loadingLog.scrollHeight;
}

async function connectWithRetries() {
  if (backendConnectInProgress) return;
  backendConnectInProgress = true;
  const maxAttempts = 8;
  try {
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        log(`Attempt ${i}/${maxAttempts}: connecting to local server...`);
        const res = await fetch("/health", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          backendReady = true;
          log(`Connected ✓  model=${data.model || MODEL_FALLBACK}`, "dot");
          modelText.textContent  = `Model: ${data.model || MODEL_FALLBACK}`;
          healthText.textContent = "Server: healthy";
          await wait(300);
          loading.style.display = "none";
          return;
        }
        log(`Server responded ${res.status}, retrying...`);
      } catch (err) {
        log(`Connection error: ${err.message || err}`);
      }
      const backoff = Math.min(1500 + i * 250, 3000);
      log(`Waiting ${(backoff / 1000).toFixed(1)}s...`);
      await wait(backoff);
    }
    backendReady = false;
    log("Could not connect. Make sure  python server.py  is running, then refresh.", "err");
    healthText.textContent = "Server: Offline";
  } finally {
    backendConnectInProgress = false;
  }
}

// ── conversation management ────────────────────────────────────────────────────
function saveState() {
  localStorage.setItem("hermes_web_conversations", JSON.stringify(conversations));
  if (activeId) localStorage.setItem("hermes_web_active", activeId);
}

function ensureConversationMetadata(convo) {
  if (!convo || typeof convo !== "object") return;
  if (!Array.isArray(convo.messages))          convo.messages         = [];
  if (!convo.name)                             convo.name             = "Untitled Conversation";
  if (typeof convo.manual_name  !== "boolean") convo.manual_name      = false;
  if (typeof convo.auto_named   !== "boolean") convo.auto_named       = false;
  if (typeof convo.auto_title_pending !== "boolean") convo.auto_title_pending = false;
}

function sanitizeGeneratedTitle(text, fallback = "Untitled Conversation") {
  const clean = String(text || "").replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, 60) : fallback;
}

async function autoNameConversationIfNeeded(conversationId) {
  const convo = conversations[conversationId];
  if (!convo) return;
  ensureConversationMetadata(convo);
  if (convo.manual_name || convo.auto_named || convo.auto_title_pending) return;
  if (String(convo.name || "") !== "Untitled Conversation") return;
  if ((convo.messages || []).length < AUTO_TITLE_MIN_MESSAGES) return;

  convo.auto_title_pending = true;
  saveState();
  try {
    const transcript = (convo.messages || []).slice(0, 6)
      .map(m => `${m.role}: ${String(m.content || "").slice(0, 140)}`)
      .join("\n");
    const res = await fetch(`${ROOT_API_BASE}/chat/title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, transcript }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    convo.name       = sanitizeGeneratedTitle(data.title || "", "Untitled Conversation");
    convo.auto_named = true;
  } catch { /* title generation is best-effort */ } finally {
    convo.auto_title_pending = false;
    saveState();
    renderConversations(searchInput.value || "");
    if (activeId && conversations[activeId]) chatTitle.value = conversations[activeId].name;
  }
}

function ensureConversation() {
  if (activeId && conversations[activeId]) return;
  const keys = Object.keys(conversations);
  if (keys.length > 0) { activeId = keys[0]; return; }
  newConversation();
}

function newConversation() {
  const id = `conv_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
  conversations[id] = { name: "Untitled Conversation", messages: [], manual_name: false, auto_named: false, auto_title_pending: false };
  activeId = id;
  saveState();
  renderConversations();
  renderMessages();
}

function deleteConversation(id) {
  delete conversations[id];
  if (activeId === id) activeId = null;
  ensureConversation();
  saveState();
  renderConversations();
  renderMessages();
}

function renderConversations(searchTerm = "") {
  convoList.innerHTML = "";
  const term = searchTerm.toLowerCase().trim();
  Object.values(conversations).forEach(ensureConversationMetadata);
  const filtered = Object.entries(conversations).filter(([, convo]) => {
    if (!term) return true;
    if (convo.name.toLowerCase().includes(term)) return true;
    return convo.messages.some(m => String(m.content || "").toLowerCase().includes(term));
  });
  if (filtered.length === 0 && term) {
    convoList.innerHTML = '<li style="padding: 12px; color: var(--muted); text-align: center;">No matching conversations</li>';
    return;
  }
  filtered.forEach(([id, convo]) => {
    const li = document.createElement("li");
    li.className = `convo-item ${id === activeId ? "active" : ""}`;
    li.innerHTML = `<span class="convo-name" title="${escapeHtml(convo.name)}">${escapeHtml(convo.name)}</span><button class="convo-del" title="Delete">🗑</button>`;
    li.querySelector(".convo-name").onclick = () => { activeId = id; saveState(); renderConversations(); renderMessages(); };
    li.querySelector(".convo-del").onclick  = (e) => { e.stopPropagation(); if (confirm(`Delete '${convo.name}'?`)) deleteConversation(id); };
    convoList.appendChild(li);
  });
  if (activeId && conversations[activeId]) chatTitle.value = conversations[activeId].name;
}

// ── message rendering ──────────────────────────────────────────────────────────
function renderMessages() {
  messages.innerHTML = "";
  const convo = conversations[activeId];
  if (!convo) return;
  for (let msgIndex = 0; msgIndex < convo.messages.length; msgIndex++) {
    const msg = convo.messages[msgIndex];
    const roleLabel = (msg.role === "assistant" || msg.role === "agent") ? "HERMES" : String(msg.role || "user").toUpperCase();
    const box = document.createElement("div");
    box.className = `msg ${msg.role}`;
    const rendered = marked.parse(msg.content || "");
    let metaText = `${roleLabel} • ${msg.timestamp || nowTime()}`;
    if (msg.model) metaText += ` • ${msg.model}`;
    box.innerHTML = `<div class="meta">${metaText}</div>${rendered}`;

    if (msg.role === "assistant") {
      const dlBtn = document.createElement("button");
      dlBtn.className = "code-download-btn";
      dlBtn.textContent = "⬇ Download reply";
      dlBtn.onclick = () => downloadTextFile(`hermes_reply_${msgIndex + 1}.md`, msg.content || "", "text/markdown");
      box.appendChild(dlBtn);
    }

    box.querySelectorAll("pre code").forEach(block => Prism.highlightElement(block));
    box.querySelectorAll("pre code").forEach((block, codeIndex) => {
      const pre = block.closest("pre");
      if (!pre || !pre.parentNode) return;
      const langClass = Array.from(block.classList).find(c => c.startsWith("language-")) || "";
      const lang = langClass.replace("language-", "") || "txt";
      const dlBtn = document.createElement("button");
      dlBtn.className = "code-download-btn";
      dlBtn.textContent = `⬇ Download ${lang} code`;
      dlBtn.onclick = () => {
        const ext = extensionForLanguage(lang);
        downloadTextFile(`hermes_code_${msgIndex + 1}_${codeIndex + 1}.${ext}`, block.textContent || "");
      };
      pre.parentNode.insertBefore(dlBtn, pre);
    });

    messages.appendChild(box);
  }
  messages.scrollTop = messages.scrollHeight;
}

// ── attachment handling ────────────────────────────────────────────────────────
function refreshAttachmentState() {
  if (pendingAttachments.length > 0) {
    attachBtn.textContent = "📎✓";
    attachBtn.title = `${pendingAttachments.length} file(s) attached`;
    attachmentList.innerHTML = pendingAttachments.map((file, index) =>
      `<div class="attachment-chip">` +
      `<span class="attachment-chip-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>` +
      `<button class="attachment-chip-remove" data-remove-index="${index}" title="Remove">✕</button>` +
      `</div>`
    ).join("");
    attachmentBar.classList.add("show");
  } else {
    attachBtn.textContent = "📎";
    attachBtn.title = "Attach file";
    attachmentList.innerHTML = "";
    attachmentBar.classList.remove("show");
  }
}

attachmentList.addEventListener("click", (e) => {
  const btn = e.target.closest(".attachment-chip-remove");
  if (!btn) return;
  const idx = Number(btn.dataset.removeIndex);
  if (!Number.isNaN(idx)) { pendingAttachments.splice(idx, 1); refreshAttachmentState(); }
});

attachBtn.onclick = () => fileInput.click();

fileInput.onchange = (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    if (!pendingAttachments.some(f => attachmentKey(f) === attachmentKey(file))) {
      pendingAttachments.push(file);
    }
  }
  refreshAttachmentState();
  fileInput.value = "";
};

voiceBtn.onclick = () => { if (isRecording) stopVoiceInput(); else startVoiceInput(); };

// ── send message ───────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = input.value.trim();
  if ((!text && pendingAttachments.length === 0) || !activeId) return;

  if (pendingAttachments.length > 0) {
    const filesToSend = [...pendingAttachments];
    pendingAttachments = [];
    refreshAttachmentState();
    await sendFileMessage(filesToSend, text || "Please analyze these files and summarize key points.");
    return;
  }

  const convo = conversations[activeId];
  convo.messages.push({ role: "user", content: text, timestamp: nowTime() });
  input.value = "";
  renderMessages();
  saveState();

  sendBtn.disabled = true;
  const ticker  = startProgressTicker(statusText, buildProgressPhrases(text));
  const started = performance.now();

  try {
    const payload = { message: text, conversation_id: activeId };
    const selectedModel = settings.model || "auto";
    if (selectedModel !== "auto") payload.model = selectedModel;

    const res = await fetch(API_BASE, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    latencyText.textContent = `Latency: ${Math.round(performance.now() - started)} ms`;

    if (!res.ok) {
      const errText = await res.text();
      convo.messages.push({ role: "assistant", content: `API Error: ${errText}`, timestamp: nowTime() });
      renderMessages();
      return;
    }

    const data = await res.json();
    convo.messages.push({
      role:      "assistant",
      content:   data.message || "",
      timestamp: nowTime(),
      model:     data.model || MODEL_FALLBACK,
    });
    modelText.textContent  = `Model: ${data.model || MODEL_FALLBACK}`;
    healthText.textContent = "Server: healthy";

    if (settings.notifications && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Hermes", { body: "New response received" });
    }

    renderMessages();
    autoNameConversationIfNeeded(activeId);
  } catch (err) {
    convo.messages.push({ role: "assistant", content: `Request failed: ${err.message || err}`, timestamp: nowTime() });
    healthText.textContent = "Server: error";
    renderMessages();
  } finally {
    if (ticker) clearInterval(ticker);
    saveState();
    sendBtn.disabled  = false;
    statusText.textContent = "Ready";
  }
}

async function sendFileMessage(files, promptText) {
  if (!files || files.length === 0 || !activeId) return;
  const convo = conversations[activeId];
  const labelPrompt = promptText || "Please analyze this file.";
  const fileList = files.map(f => f.name).join(", ");
  convo.messages.push({ role: "user", content: `[Uploaded files: ${fileList}]\n${labelPrompt}`, timestamp: nowTime() });
  input.value = "";
  renderMessages();
  saveState();

  sendBtn.disabled = true;
  const ticker  = startProgressTicker(statusText, ["Reading file(s)...", "Routing analysis model...", "Analyzing content...", "Finalizing response..."]);
  const started = performance.now();

  try {
    const formData = new FormData();
    files.forEach(file => formData.append("uploads", file));
    formData.append("prompt", labelPrompt);
    formData.append("conversation_id", activeId);
    const selectedModel = settings.model || "auto";
    if (selectedModel !== "auto") formData.append("model", selectedModel);

    const res = await fetch(`${API_BASE}/analyze-file`, { method: "POST", body: formData });
    latencyText.textContent = `Latency: ${Math.round(performance.now() - started)} ms`;

    if (!res.ok) {
      const errText = await res.text();
      convo.messages.push({ role: "assistant", content: `File API Error: ${errText}`, timestamp: nowTime() });
      renderMessages();
      return;
    }
    const data = await res.json();
    convo.messages.push({ role: "assistant", content: data.message || "", timestamp: nowTime(), model: data.model || MODEL_FALLBACK });
    modelText.textContent  = `Model: ${data.model || MODEL_FALLBACK}`;
    healthText.textContent = "Server: healthy";
    renderMessages();
    autoNameConversationIfNeeded(activeId);
  } catch (err) {
    convo.messages.push({ role: "assistant", content: `File request failed: ${err.message || err}`, timestamp: nowTime() });
    healthText.textContent = "Server: error";
    renderMessages();
  } finally {
    if (ticker) clearInterval(ticker);
    saveState();
    sendBtn.disabled       = false;
    statusText.textContent = "Ready";
  }
}

// ── send button / enter key ────────────────────────────────────────────────────
sendBtn.onclick = sendMessage;

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── new chat / search / title ──────────────────────────────────────────────────
newChatBtn.onclick = newConversation;
settingsBtn.onclick = openSettings;

searchInput.addEventListener("input", (e) => renderConversations(e.target.value));

chatTitle.addEventListener("change", () => {
  if (!activeId || !conversations[activeId]) return;
  const val = chatTitle.value.trim() || "Untitled Conversation";
  conversations[activeId].name        = val;
  conversations[activeId].manual_name = true;
  saveState();
  renderConversations();
});

// ── pin unlock ─────────────────────────────────────────────────────────────────
pinUnlockBtn.onclick = () => {
  const entered = pinUnlockInput.value.trim();
  if (!entered) return;
  if (hashPin(entered) !== settings.pin_hash) {
    alert("Invalid PIN.");
    pinUnlockInput.value = "";
    pinUnlockInput.focus();
    return;
  }
  pinModal.classList.remove("show");
  pinUnlockInput.value = "";
};
pinUnlockInput.addEventListener("keydown", (e) => { if (e.key === "Enter") pinUnlockBtn.click(); });

// ── notice modal ───────────────────────────────────────────────────────────────
noticeOkBtn.onclick = closeHtmlNotice;
noticeModal.onclick = (e) => { if (e.target === noticeModal) closeHtmlNotice(); };

// ── settings save/cancel ───────────────────────────────────────────────────────
saveSettingsBtn.onclick = async () => {
  const enablePin   = pinEnabledToggle.checked;
  const newPin      = pinInput.value.trim();
  const confirmPin  = pinConfirmInput.value.trim();

  if (enablePin) {
    if (!settings.pin_hash && !newPin) { alert("Set a PIN to enable PIN lock."); return; }
    if (newPin || confirmPin) {
      if (newPin.length < 4) { alert("PIN must be at least 4 digits/characters."); return; }
      if (newPin !== confirmPin) { alert("PIN confirmation does not match."); return; }
      settings.pin_hash = hashPin(newPin);
    }
  } else {
    settings.pin_hash = "";
  }

  settings.theme         = themeSelect.value;
  settings.model         = modelSelect.value;
  settings.notifications = notificationsToggle.checked;
  settings.pin_enabled   = enablePin;
  persistSettings();
  applySettings();

  if (settings.notifications && typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
  closeSettings();
};

cancelSettingsBtn.onclick = closeSettings;
settingsModal.onclick = (e) => { if (e.target === settingsModal) closeSettings(); };

// ── settings tabs ──────────────────────────────────────────────────────────────
tabButtons.forEach(btn => {
  btn.onclick = () => {
    activateTab(btn.dataset.tab);
    if (btn.dataset.tab === "memoryTab")    refreshMemoryView();
    if (btn.dataset.tab === "analyticsTab") renderAnalytics();
    if (btn.dataset.tab === "shortcutsTab") renderShortcuts();
  };
});

refreshMemoryBtn.onclick = refreshMemoryView;

resetShortcutsBtn.onclick = () => {
  if (!confirm("Reset all keyboard shortcuts to defaults?")) return;
  settings.shortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
  renderShortcuts();
  persistSettings();
  alert("Shortcuts reset to defaults!");
};

// ── save local memory (chat editor) ───────────────────────────────────────────
saveLocalMemoryBtn.onclick = () => {
  if (!activeId || !conversations[activeId]) { alert("No active conversation selected."); return; }
  try {
    const parsed = JSON.parse(convoMemoryEditor.value || "[]");
    if (!Array.isArray(parsed)) throw new Error("JSON must be an array.");
    const normalized = parsed
      .map(item => ({ role: String(item.role || "user"), content: String(item.content || ""), timestamp: item.timestamp ? String(item.timestamp) : nowTime() }))
      .filter(item => item.content.trim());
    conversations[activeId].messages = normalized;
    saveState();
    renderMessages();
    setMemoryStatus(`Saved local chat editor (${normalized.length} messages)`);
  } catch (err) { alert(`Invalid JSON: ${err.message || err}`); }
};

// ── save global memory ─────────────────────────────────────────────────────────
saveGlobalMemoryBtn.onclick = async () => {
  const deduped = [];
  for (const line of globalFactsDraft) {
    const cleaned = String(line || "").trim();
    if (cleaned && !deduped.includes(cleaned)) deduped.push(cleaned);
  }
  setMemoryStatus("Saving global memory...");
  try {
    const res = await fetch(`${API_BASE}/global-memory`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ facts: deduped }),
    });
    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
    const data = await res.json();
    globalFactsDraft = (data.facts || []).map(f => String(f));
    renderFactsList();
    setMemoryStatus(`Saved ${data.facts_count || globalFactsDraft.length} global facts`);
  } catch (err) {
    setMemoryStatus(`Save failed: ${err.message || err}`);
    alert(`Failed to save global memory: ${err.message || err}`);
  }
};

// ── fact list interactions ─────────────────────────────────────────────────────
addFactBtn.onclick = () => {
  const value = String(factInput.value || "").trim();
  if (!value) return;
  if (!globalFactsDraft.includes(value)) { globalFactsDraft.push(value); renderFactsList(); setMemoryStatus(`Added. ${globalFactsDraft.length} pending facts.`); }
  factInput.value = "";
  factInput.focus();
};
factInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addFactBtn.click(); } });
factsList.addEventListener("click", (e) => {
  const btn = e.target.closest(".fact-remove");
  if (!btn) return;
  const index = Number(btn.dataset.index);
  if (!Number.isNaN(index)) { globalFactsDraft.splice(index, 1); renderFactsList(); setMemoryStatus(`Removed. ${globalFactsDraft.length} pending facts.`); }
});

// ── clear memory ───────────────────────────────────────────────────────────────
clearCurrentMemoryBtn.onclick = async () => {
  if (!activeId) return;
  if (!confirm("Clear current chat memory on server (conversation history)?")) return;
  try {
    await fetch(`${API_BASE}/memory/${activeId}`, { method: "DELETE" });
    setMemoryStatus("Cleared current chat memory on server");
    refreshMemoryView();
  } catch (err) { alert(`Failed: ${err.message || err}`); }
};

clearGlobalMemoryBtn.onclick = async () => {
  if (!confirm("Clear ALL global memory facts?")) return;
  try {
    await fetch(`${API_BASE}/global-memory`, { method: "DELETE" });
    globalFactsDraft = [];
    renderFactsList();
    setMemoryStatus("Global memory cleared");
    refreshMemoryView();
  } catch (err) { alert(`Failed: ${err.message || err}`); }
};

// ── export / import conversations ─────────────────────────────────────────────
exportConvosBtn.onclick = () => {
  const dataStr = JSON.stringify(conversations, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `hermes_conversations_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert("Conversations exported successfully!");
};

importConvosBtn.onclick = () => importFileInput.click();
importFileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text     = await file.text();
    const imported = JSON.parse(text);
    if (typeof imported !== "object" || !imported) { alert("Invalid JSON format"); return; }
    const action = confirm("Click OK to MERGE imported conversations, or Cancel to REPLACE all existing conversations.");
    if (action) {
      conversations = { ...conversations, ...imported };
      alert(`Merged ${Object.keys(imported).length} conversations`);
    } else {
      conversations = imported;
      activeId = Object.keys(conversations)[0] || null;
      alert(`Replaced with ${Object.keys(imported).length} conversations`);
    }
    saveState();
    renderConversations();
    if (activeId && conversations[activeId]) { renderMessages(); chatTitle.value = conversations[activeId].name; }
  } catch (err) { alert(`Import failed: ${err.message || err}`); }
  importFileInput.value = "";
};

// ── global keyboard shortcuts ──────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (recordingShortcut) { handleShortcutRecording(e); return; }
  const sc = settings.shortcuts || DEFAULT_SHORTCUTS;
  if (sc.newChat    && matchesShortcut(e, sc.newChat))    { e.preventDefault(); newConversation(); }
  else if (sc.search     && matchesShortcut(e, sc.search))     { e.preventDefault(); searchInput.focus(); searchInput.select(); }
  else if (sc.settings   && matchesShortcut(e, sc.settings))   { e.preventDefault(); openSettings(); }
  else if (sc.closeModal && matchesShortcut(e, sc.closeModal)) { if (settingsModal.classList.contains("show")) closeSettings(); }
});

// ── boot ───────────────────────────────────────────────────────────────────────
ensureConversation();
Object.values(conversations).forEach(ensureConversationMetadata);
applySettings();
refreshAttachmentState();
renderConversations();
renderMessages();
initVoiceInput();

// Start connecting to local backend
connectWithRetries();

// PIN gate
if (settings.pin_enabled && settings.pin_hash) {
  pinModal.classList.add("show");
  setTimeout(() => pinUnlockInput.focus(), 50);
}
