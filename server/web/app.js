const params = new URLSearchParams(location.search);
const API_BASE = params.get("apiBase") || "https://hermes-3mc1.onrender.com/chat";
const ROOT_API_BASE = API_BASE.endsWith("/chat") ? API_BASE.slice(0, -5) : API_BASE;
const MODEL_FALLBACK = "llama-3.1-8b-instant";
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

const loading = document.getElementById("loading");
const loadingLog = document.getElementById("loadingLog");

const convoList = document.getElementById("convoList");
const searchInput = document.getElementById("searchInput");
const messages = document.getElementById("messages");
const input = document.getElementById("input");
const fileInput = document.getElementById("fileInput");
const attachBtn = document.getElementById("attachBtn");
const attachmentBar = document.getElementById("attachmentBar");
const attachmentList = document.getElementById("attachmentList");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const settingsBtn = document.getElementById("settingsBtn");
const logoModeToggle = document.getElementById("logoModeToggle");
const logoModeMenu = document.getElementById("logoModeMenu");
const assistantApp = document.getElementById("assistantApp");
const watchdogPage = document.getElementById("watchdogPage");
const watchdogFrame = document.getElementById("watchdogFrame");
const operatorPage = document.getElementById("operatorPage");
const operatorFrame = document.getElementById("operatorFrame");
const chatTitle = document.getElementById("chatTitle");
const statusText = document.getElementById("statusText");
const modelText = document.getElementById("modelText");
const latencyText = document.getElementById("latencyText");
const healthText = document.getElementById("healthText");
const settingsModal = document.getElementById("settingsModal");
const themeSelect = document.getElementById("themeSelect");
const modelSelect = document.getElementById("modelSelect");
const notificationsToggle = document.getElementById("notificationsToggle");
const operatorZoomSelect = document.getElementById("operatorZoomSelect");
const exportConvosBtn = document.getElementById("exportConvosBtn");
const importConvosBtn = document.getElementById("importConvosBtn");
const importFileInput = document.getElementById("importFileInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const refreshMemoryBtn = document.getElementById("refreshMemoryBtn");
const saveLocalMemoryBtn = document.getElementById("saveLocalMemoryBtn");
const clearCurrentMemoryBtn = document.getElementById("clearCurrentMemoryBtn");
const clearGlobalMemoryBtn = document.getElementById("clearGlobalMemoryBtn");
const saveGlobalMemoryBtn = document.getElementById("saveGlobalMemoryBtn");
const memoryStatus = document.getElementById("memoryStatus");
const convoMemoryEditor = document.getElementById("convoMemoryEditor");
const factsList = document.getElementById("factsList");
const factInput = document.getElementById("factInput");
const addFactBtn = document.getElementById("addFactBtn");
const pinEnabledToggle = document.getElementById("pinEnabledToggle");
const pinInput = document.getElementById("pinInput");
const pinConfirmInput = document.getElementById("pinConfirmInput");
const pinModal = document.getElementById("pinModal");
const pinUnlockInput = document.getElementById("pinUnlockInput");
const pinUnlockBtn = document.getElementById("pinUnlockBtn");
const noticeModal = document.getElementById("noticeModal");
const noticeTitle = document.getElementById("noticeTitle");
const noticeMessage = document.getElementById("noticeMessage");
const noticeOkBtn = document.getElementById("noticeOkBtn");
const shortcutList = document.getElementById("shortcutList");
const resetShortcutsBtn = document.getElementById("resetShortcutsBtn");
const voiceBtn = document.getElementById("voiceBtn");
const messagesChart = document.getElementById("messagesChart");
const conversationsChart = document.getElementById("conversationsChart");

let conversations = JSON.parse(localStorage.getItem("hermes_web_conversations") || "{}");
let activeId = localStorage.getItem("hermes_web_active") || null;
let settings = JSON.parse(localStorage.getItem("hermes_web_settings") || "{}");
let globalFactsDraft = [];
let recordingShortcut = null;
let recognition = null;
let isRecording = false;
let messagesChartInstance = null;
let conversationsChartInstance = null;
let pendingAttachments = [];
const AUTO_TITLE_MIN_MESSAGES = 4;
let backendReady = false;
let backendConnectInProgress = false;
let currentPageMode = "assistant";

function modeRequiresBackend(mode) {
  return mode === "assistant" || mode === "watchdog";
}

function updateLoadingGateForMode(mode) {
  if (!loading) return;
  if (!modeRequiresBackend(mode)) {
    loading.style.display = "none";
    return;
  }
  if (!backendReady) {
    loading.style.display = "flex";
    if (!backendConnectInProgress) {
      connectWithRetries();
    }
  } else {
    loading.style.display = "none";
  }
}

function refreshAttachmentState() {
  if (pendingAttachments.length > 0) {
    attachBtn.textContent = "📎✓";
    attachBtn.title = `Attached ${pendingAttachments.length} file(s) (press Send/Enter to send)`;
    attachmentList.innerHTML = pendingAttachments.map((file, index) => (
      `<div class="attachment-chip">` +
      `<span class="attachment-chip-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>` +
      `<button class="attachment-chip-remove" data-remove-index="${index}" title="Remove ${escapeHtml(file.name)}">✕</button>` +
      `</div>`
    )).join("");
    attachmentBar.classList.add("show");
  } else {
    attachBtn.textContent = "📎";
    attachBtn.title = "Attach image or file";
    attachmentList.innerHTML = "";
    attachmentBar.classList.remove("show");
  }
}

const DEFAULT_SHORTCUTS = {
  newChat: { key: "n", ctrl: true, shift: false, alt: false, name: "New Chat", desc: "Create a new conversation" },
  search: { key: "k", ctrl: true, shift: false, alt: false, name: "Focus Search", desc: "Jump to conversation search" },
  settings: { key: ",", ctrl: true, shift: false, alt: false, name: "Open Settings", desc: "Open settings modal" },
  closeModal: { key: "Escape", ctrl: false, shift: false, alt: false, name: "Close Modal", desc: "Close any open modal/dialog" }
};

const AVAILABLE_MODELS = [
  { value: "auto", label: "Auto (Self-Escalation)" },
  { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Instant)" },
  { value: "openai/gpt-oss-20b", label: "OpenAI GPT-OSS 20B" },
  { value: "openai/gpt-oss-120b", label: "OpenAI GPT-OSS 120B" },
];

if (!settings.theme) settings.theme = "dark";
if (!settings.model) settings.model = "auto";
if (typeof settings.notifications !== "boolean") settings.notifications = true;
if (!Number.isFinite(Number(settings.operator_zoom_percent))) settings.operator_zoom_percent = 100;
if (typeof settings.pin_enabled !== "boolean") settings.pin_enabled = false;
if (!settings.pin_hash) settings.pin_hash = "";
if (!settings.shortcuts) settings.shortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));

function hashPin(pin) {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function ensureModelOptions() {
  const currentModel = settings.model || "auto";
  const unique = new Map();
  for (const model of AVAILABLE_MODELS) {
    if (!unique.has(model.value)) {
      unique.set(model.value, model.label);
    }
  }

  modelSelect.innerHTML = "";
  unique.forEach((label, value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modelSelect.appendChild(option);
  });

  modelSelect.size = 1;
  modelSelect.value = unique.has(currentModel) ? currentModel : "auto";
}

function applySettings() {
  document.body.classList.toggle("theme-light", settings.theme === "light");
  themeSelect.value = settings.theme;
  ensureModelOptions();
  notificationsToggle.checked = settings.notifications;
  if (operatorZoomSelect) {
    operatorZoomSelect.value = String(Number(settings.operator_zoom_percent) || 100);
  }
  pinEnabledToggle.checked = !!settings.pin_enabled;
  pinInput.value = "";
  pinConfirmInput.value = "";
}

function persistSettings() {
  localStorage.setItem("hermes_web_settings", JSON.stringify(settings));
}

function showHtmlNotice(title, message) {
  noticeTitle.textContent = title || "Notice";
  noticeMessage.textContent = message || "";
  noticeModal.classList.add("show");
}

function closeHtmlNotice() {
  noticeModal.classList.remove("show");
}

async function openSettings() {
  applySettings();
  settingsModal.classList.add("show");
  activateTab("generalTab");
}

function closeSettings() {
  settingsModal.classList.remove("show");
}

function activateTab(tabId) {
  tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
  tabPanels.forEach(panel => panel.classList.toggle("active", panel.id === tabId));
}

function setMemoryStatus(message) {
  memoryStatus.textContent = message;
}

function buildWatchdogUrl() {
  const query = new URLSearchParams(location.search);
  return `watchdog.html${query.toString() ? `?${query.toString()}` : ""}`;
}

function buildOperatorUrl() {
  const query = new URLSearchParams(location.search);
  query.set("opv", "20260302f");
  return `operator.html${query.toString() ? `?${query.toString()}` : ""}`;
}

function setPageMode(mode, options = {}) {
  const nextMode = mode === "watchdog" || mode === "operator" ? mode : "assistant";
  currentPageMode = nextMode;
  if (assistantApp) {
    assistantApp.style.display = nextMode === "assistant" ? "grid" : "none";
  }
  if (watchdogPage) {
    watchdogPage.classList.toggle("show", nextMode === "watchdog");
  }
  if (operatorPage) {
    operatorPage.classList.toggle("show", nextMode === "operator");
  }
  if (nextMode === "watchdog" && watchdogFrame) {
    const target = buildWatchdogUrl();
    if (!watchdogFrame.src || watchdogFrame.src === "about:blank") {
      watchdogFrame.src = target;
    }
  }
  if (nextMode === "operator" && operatorFrame) {
    const target = buildOperatorUrl();
    if (!operatorFrame.src || operatorFrame.src === "about:blank") {
      operatorFrame.src = target;
    }
  }

  if (!options.skipHistory) {
    const url = new URL(location.href);
    url.searchParams.set("mode", nextMode);
    history.replaceState({}, "", url.toString());
  }

  if (logoModeToggle && logoModeMenu) {
    logoModeMenu.classList.remove("show");
    logoModeToggle.setAttribute("aria-expanded", "false");
  }

  updateLoadingGateForMode(nextMode);
}

function toggleLogoModeMenu() {
  if (!logoModeMenu || !logoModeToggle) return;
  const isOpen = logoModeMenu.classList.toggle("show");
  logoModeToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function closeLogoModeMenu() {
  if (!logoModeMenu || !logoModeToggle) return;
  logoModeMenu.classList.remove("show");
  logoModeToggle.setAttribute("aria-expanded", "false");
}

function formatShortcutKey(shortcut) {
  const parts = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.alt) parts.push("Alt");
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
  if (key === "Escape") {
    recordingShortcut = null;
    renderShortcuts();
    return;
  }
  
  settings.shortcuts[recordingShortcut] = {
    ...settings.shortcuts[recordingShortcut],
    key: key,
    ctrl: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey
  };
  
  recordingShortcut = null;
  renderShortcuts();
  persistSettings();
}

function matchesShortcut(e, shortcut) {
  const ctrlMatch = (e.ctrlKey || e.metaKey) === shortcut.ctrl;
  const shiftMatch = e.shiftKey === shortcut.shift;
  const altMatch = e.altKey === shortcut.alt;
  const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
  return ctrlMatch && shiftMatch && altMatch && keyMatch;
}

function initVoiceInput() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    voiceBtn.style.display = "none";
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  
  let finalTranscript = "";
  
  recognition.onstart = () => {
    isRecording = true;
    voiceBtn.classList.add("recording");
    voiceBtn.textContent = "🔴";
  };
  
  recognition.onresult = (event) => {
    let interimTranscript = "";
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interimTranscript += transcript;
      }
    }
    
    input.value = finalTranscript + interimTranscript;
  };
  
  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    stopVoiceInput();
  };
  
  recognition.onend = () => {
    if (isRecording) {
      stopVoiceInput();
    }
  };
}

function startVoiceInput() {
  if (!recognition) return;
  try {
    recognition.start();
  } catch (e) {
    console.error("Failed to start voice input:", e);
  }
}

function stopVoiceInput() {
  if (!recognition) return;
  isRecording = false;
  voiceBtn.classList.remove("recording");
  voiceBtn.textContent = "🎤";
  try {
    recognition.stop();
  } catch (e) {
  }
}

function calculateAnalytics() {
  const stats = {
    totalMessages: 0,
    totalConvos: Object.keys(conversations).length,
    convoMessageCounts: {},
    userMessages: 0,
    assistantMessages: 0
  };
  
  Object.entries(conversations).forEach(([id, convo]) => {
    const msgCount = convo.messages.length;
    stats.totalMessages += msgCount;
    stats.convoMessageCounts[convo.name] = msgCount;
    
    convo.messages.forEach(msg => {
      if (msg.role === "user") stats.userMessages++;
      else if (msg.role === "assistant" || msg.role === "agent") stats.assistantMessages++;
    });
  });
  
  stats.avgMessagesPerConvo = stats.totalConvos > 0 ? Math.round(stats.totalMessages / stats.totalConvos) : 0;
  
  const sorted = Object.entries(stats.convoMessageCounts).sort((a, b) => b[1] - a[1]);
  stats.mostActive = sorted.length > 0 ? sorted[0][0] : "None";
  
  return stats;
}

function renderAnalytics() {
  const stats = calculateAnalytics();
  
  document.getElementById("totalMessagesCount").textContent = stats.totalMessages;
  document.getElementById("totalConvosCount").textContent = stats.totalConvos;
  document.getElementById("avgMessagesPerConvo").textContent = stats.avgMessagesPerConvo;
  document.getElementById("mostActiveConvo").textContent = stats.mostActive.length > 15 ? stats.mostActive.substring(0, 15) + "..." : stats.mostActive;
  
  if (messagesChartInstance) messagesChartInstance.destroy();
  const messagesCtx = messagesChart.getContext("2d");
  messagesChartInstance = new Chart(messagesCtx, {
    type: "doughnut",
    data: {
      labels: ["User Messages", "AI Responses"],
      datasets: [{
        data: [stats.userMessages, stats.assistantMessages],
        backgroundColor: ["#3b82f6", "#22c55e"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#e7ecf6", font: { size: 12 } } },
        title: { display: true, text: "Messages by Type", color: "#e7ecf6", font: { size: 14 } }
      }
    }
  });
  
  if (conversationsChartInstance) conversationsChartInstance.destroy();
  const topConvos = Object.entries(stats.convoMessageCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const conversationsCtx = conversationsChart.getContext("2d");
  conversationsChartInstance = new Chart(conversationsCtx, {
    type: "bar",
    data: {
      labels: topConvos.map(([name]) => name.length > 20 ? name.substring(0, 20) + "..." : name),
      datasets: [{
        label: "Messages",
        data: topConvos.map(([, count]) => count),
        backgroundColor: "#3b82f6",
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Top 5 Conversations", color: "#e7ecf6", font: { size: 14 } }
      },
      scales: {
        x: { ticks: { color: "#9aa7bd" }, grid: { color: "#2b3548" } },
        y: { ticks: { color: "#9aa7bd" }, grid: { color: "#2b3548" } }
      }
    }
  });
}

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
    
    row.addEventListener("dragstart", (e) => {
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", index);
    });
    
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      document.querySelectorAll(".fact-item").forEach(item => {
        item.classList.remove("drag-over");
      });
    });
    
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const dragging = document.querySelector(".dragging");
      if (dragging && dragging !== row) {
        row.classList.add("drag-over");
      }
    });
    
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });
    
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
      const toIndex = parseInt(row.dataset.index);
      if (fromIndex !== toIndex) {
        const [removed] = globalFactsDraft.splice(fromIndex, 1);
        globalFactsDraft.splice(toIndex, 0, removed);
        renderFactsList();
        setMemoryStatus(`Reordered facts. ${globalFactsDraft.length} pending facts.`);
      }
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

  const localMessages = conversations[activeId].messages || [];
  convoMemoryEditor.value = JSON.stringify(localMessages, null, 2);
  setMemoryStatus("Refreshing...");

  try {
    const [convoRes, globalRes] = await Promise.all([
      fetch(`${API_BASE}/memory/${activeId}`),
      fetch(`${API_BASE}/global-memory`),
    ]);

    const convoData = convoRes.ok ? await convoRes.json() : { summary: "", message_count: 0, history: [] };
    const globalData = globalRes.ok ? await globalRes.json() : { facts: [] };
    globalFactsDraft = (globalData.facts || []).map(f => String(f).trim()).filter(Boolean);
    renderFactsList();
    setMemoryStatus(`Loaded ${convoData.message_count || 0} chat msgs • ${globalData.facts_count || globalFactsDraft.length || 0} global facts`);
  } catch (err) {
    globalFactsDraft = [];
    renderFactsList();
    setMemoryStatus(`Failed to load: ${err.message || err}`);
  }
}

function log(line, cls = "") {
  const ts = new Date().toLocaleTimeString();
  const span = cls ? `<span class="${cls}">${line}</span>` : line;
  loadingLog.innerHTML += `[${ts}] ${span}\n`;
  loadingLog.scrollTop = loadingLog.scrollHeight;
}

async function connectWithRetries() {
  if (backendConnectInProgress) {
    return;
  }
  backendConnectInProgress = true;
  const maxAttempts = 14;
  try {
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        log(`Attempt ${i}/${maxAttempts}: GET ${API_BASE}/health`);
        const response = await fetch(`${API_BASE}/health`, { method: "GET" });
        if (response.ok) {
          const data = await response.json();
          backendReady = true;
          log(`Connected ✓ model=${data.model || MODEL_FALLBACK}`, "dot");
          modelText.textContent = `Model: ${data.model || MODEL_FALLBACK}`;
          healthText.textContent = `Server: ${data.status || "healthy"}`;
          await wait(500);
          updateLoadingGateForMode(currentPageMode);
          return;
        }
        log(`Server responded ${response.status}, retrying...`);
      } catch (error) {
        log(`Connection error: ${error.message || error}. likely cold start, retrying...`);
      }
      const backoff = Math.min(2500 + i * 350, 6000);
      log(`Waiting ${(backoff / 1000).toFixed(1)}s`);
      await wait(backoff);
    }
    backendReady = false;
    log("Failed to connect after retries. You can keep this open and retry by refreshing.", "err");
    healthText.textContent = "Server: Offline";
    updateLoadingGateForMode(currentPageMode);
  } finally {
    backendConnectInProgress = false;
  }
}

function saveState() {
  localStorage.setItem("hermes_web_conversations", JSON.stringify(conversations));
  if (activeId) localStorage.setItem("hermes_web_active", activeId);
}

function ensureConversationMetadata(convo) {
  if (!convo || typeof convo !== "object") return;
  if (!Array.isArray(convo.messages)) convo.messages = [];
  if (!convo.name) convo.name = "Untitled Conversation";
  if (typeof convo.manual_name !== "boolean") convo.manual_name = false;
  if (typeof convo.auto_named !== "boolean") convo.auto_named = false;
  if (typeof convo.auto_title_pending !== "boolean") convo.auto_title_pending = false;
}

function sanitizeGeneratedTitle(text, fallback = "Untitled Conversation") {
  const clean = String(text || "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return fallback;
  return clean.slice(0, 60);
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
    const transcript = (convo.messages || [])
      .slice(0, 6)
      .map(msg => `${msg.role}: ${String(msg.content || "").slice(0, 140)}`)
      .join("\n");

    const response = await fetch(`${ROOT_API_BASE}/chat/title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId,
        transcript,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const generated = sanitizeGeneratedTitle(data.title || "", "Untitled Conversation");
    convo.name = generated;
    convo.auto_named = true;
  } catch {
  } finally {
    convo.auto_title_pending = false;
    saveState();
    renderConversations(searchInput.value || "");
    if (activeId && conversations[activeId]) {
      chatTitle.value = conversations[activeId].name;
    }
  }
}

function ensureConversation() {
  if (activeId && conversations[activeId]) return;
  const keys = Object.keys(conversations);
  if (keys.length > 0) {
    activeId = keys[0];
    return;
  }
  newConversation();
}

function newConversation() {
  const id = `conv_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
  conversations[id] = {
    name: "Untitled Conversation",
    messages: [],
    manual_name: false,
    auto_named: false,
    auto_title_pending: false,
  };
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
  const filtered = Object.entries(conversations).filter(([id, convo]) => {
    if (!term) return true;
    if (convo.name.toLowerCase().includes(term)) return true;
    return convo.messages.some(msg => msg.content.toLowerCase().includes(term));
  });
  
  if (filtered.length === 0 && term) {
    convoList.innerHTML = '<li style="padding: 12px; color: var(--muted); text-align: center;">No matching conversations</li>';
    return;
  }
  
  filtered.forEach(([id, convo]) => {
    const li = document.createElement("li");
    li.className = `convo-item ${id === activeId ? "active" : ""}`;
    li.innerHTML = `
      <span class="convo-name" title="${convo.name}">${convo.name}</span>
      <button class="convo-del" title="Delete">🗑</button>
    `;
    li.querySelector(".convo-name").onclick = () => {
      activeId = id;
      saveState();
      renderConversations();
      renderMessages();
    };
    li.querySelector(".convo-del").onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete '${convo.name}'?`)) deleteConversation(id);
    };
    convoList.appendChild(li);
  });
  if (activeId && conversations[activeId]) {
    chatTitle.value = conversations[activeId].name;
  }
}

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
    if (msg.model) {
      metaText += ` • Model: ${msg.model}`;
    }
    if (msg.routing && Array.isArray(msg.routing.inferred_capabilities) && msg.routing.inferred_capabilities.length) {
      const caps = msg.routing.inferred_capabilities.filter(cap => cap && cap !== "fast_chat" && cap !== "user_selected_model");
      if (caps.length > 0) {
        metaText += ` • Tools/Mode: ${caps.join(", ")}`;
      }
    }
    if (msg.routing && Array.isArray(msg.routing.attempted_models) && msg.routing.attempted_models.length > 0) {
      metaText += ` • Attempted: ${msg.routing.attempted_models.join(" -> ")}`;
    }
    if (msg.routing && msg.routing.fallback_used) {
      metaText += " • Fallback used";
    }
    box.innerHTML = `<div class="meta">${metaText}</div>${rendered}`;

    if (msg.role === "assistant") {
      const replyDownloadBtn = document.createElement("button");
      replyDownloadBtn.className = "code-download-btn";
      replyDownloadBtn.textContent = "⬇ Download reply";
      replyDownloadBtn.onclick = () => {
        const filename = `hermes_reply_${msgIndex + 1}.md`;
        downloadTextFile(filename, msg.content || "", "text/markdown");
      };
      box.appendChild(replyDownloadBtn);
    }

    if (msg.role === "assistant" && msg.routing && Array.isArray(msg.routing.progress_steps) && msg.routing.progress_steps.length) {
      const progress = document.createElement("div");
      progress.className = "hint";
      const routeLabel = msg.routing.strategy ? `Route: ${msg.routing.strategy}` : "Route";
      progress.textContent = `${routeLabel} • ${msg.routing.progress_steps.join(" → ")}`;
      box.appendChild(progress);
    }

    messages.appendChild(box);
    box.querySelectorAll("pre code").forEach(block => {
      Prism.highlightElement(block);
    });

    box.querySelectorAll("pre code").forEach((block, codeIndex) => {
      const pre = block.closest("pre");
      if (!pre || !pre.parentNode) return;
      const languageClass = Array.from(block.classList).find(cls => cls.startsWith("language-")) || "";
      const language = languageClass.replace("language-", "") || "txt";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "code-download-btn";
      downloadBtn.textContent = `⬇ Download ${language} code`;
      downloadBtn.onclick = () => {
        const ext = extensionForLanguage(language);
        const filename = `hermes_code_${msgIndex + 1}_${codeIndex + 1}.${ext}`;
        downloadTextFile(filename, block.textContent || "");
      };
      pre.parentNode.insertBefore(downloadBtn, pre);
    });
  }
  messages.scrollTop = messages.scrollHeight;
}

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
  const progressTicker = startProgressTicker(statusText, buildProgressPhrases(text));
  const started = performance.now();

  try {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: (() => {
        const payload = {
          message: text,
          conversation_id: activeId,
        };
        const selectedModel = settings.model || "auto";
        if (selectedModel !== "auto") {
          payload.model = selectedModel;
        }
        return JSON.stringify(payload);
      })()
    });

    const latency = Math.round(performance.now() - started);
    latencyText.textContent = `Latency: ${latency} ms`;

    if (!response.ok) {
      const errText = await response.text();
      convo.messages.push({ role: "assistant", content: `API Error: ${errText}`, timestamp: nowTime() });
      renderMessages();
      return;
    }

    const data = await response.json();
    convo.messages.push({
      role: "assistant",
      content: data.message || "",
      timestamp: nowTime(),
      model: data.model || MODEL_FALLBACK,
      routing: data.routing || null,
    });
    modelText.textContent = `Model: ${data.model || MODEL_FALLBACK}`;
    healthText.textContent = "Server: healthy";
    if (settings.notifications && document.hidden && typeof Notification !== "undefined") {
      if (Notification.permission === "granted") {
        new Notification("Hermes", { body: "New response received" });
      }
    }
    renderMessages();
    autoNameConversationIfNeeded(activeId);
  } catch (error) {
    convo.messages.push({ role: "assistant", content: `Request failed: ${error.message || error}`, timestamp: nowTime() });
    healthText.textContent = "Server: error";
    renderMessages();
  } finally {
    if (progressTicker) clearInterval(progressTicker);
    saveState();
    sendBtn.disabled = false;
    statusText.textContent = "Ready";
  }
}

async function sendFileMessage(files, promptText) {
  if (!files || files.length === 0 || !activeId) return;

  const convo = conversations[activeId];
  const labelPrompt = promptText || "Please analyze this file.";
  const fileList = files.map(file => file.name).join(", ");
  convo.messages.push({
    role: "user",
    content: `[Uploaded files: ${fileList}]\n${labelPrompt}`,
    timestamp: nowTime(),
  });
  input.value = "";
  renderMessages();
  saveState();

  sendBtn.disabled = true;
  const progressTicker = startProgressTicker(statusText, ["Reading file(s)...", "Routing analysis model...", "Analyzing content...", "Finalizing response..."]);
  const started = performance.now();

  try {
    const formData = new FormData();
    files.forEach(file => formData.append("uploads", file));
    formData.append("prompt", labelPrompt);
    formData.append("conversation_id", activeId);
    const selectedModel = settings.model || "auto";
    if (selectedModel !== "auto") {
      formData.append("model", selectedModel);
    }

    const response = await fetch(`${API_BASE}/analyze-file`, {
      method: "POST",
      body: formData,
    });

    const latency = Math.round(performance.now() - started);
    latencyText.textContent = `Latency: ${latency} ms`;

    if (!response.ok) {
      const errText = await response.text();
      convo.messages.push({ role: "assistant", content: `File API Error: ${errText}`, timestamp: nowTime() });
      renderMessages();
      return;
    }

    const data = await response.json();
    convo.messages.push({
      role: "assistant",
      content: data.message || "",
      timestamp: nowTime(),
      model: data.model || MODEL_FALLBACK,
      routing: data.routing || null,
    });
    modelText.textContent = `Model: ${data.model || MODEL_FALLBACK}`;
    healthText.textContent = "Server: healthy";
    renderMessages();
    autoNameConversationIfNeeded(activeId);
  } catch (error) {
    convo.messages.push({ role: "assistant", content: `File request failed: ${error.message || error}`, timestamp: nowTime() });
    healthText.textContent = "Server: error";
    renderMessages();
  } finally {
    if (progressTicker) clearInterval(progressTicker);
    saveState();
    sendBtn.disabled = false;
    statusText.textContent = "Ready";
  }
}

sendBtn.onclick = sendMessage;
newChatBtn.onclick = newConversation;
settingsBtn.onclick = openSettings;
if (logoModeToggle) {
  logoModeToggle.onclick = () => toggleLogoModeMenu();
  logoModeToggle.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleLogoModeMenu();
    }
  };
}
if (logoModeMenu) {
  logoModeMenu.onclick = (e) => {
    const item = e.target.closest("[data-mode]");
    if (!item) return;
    const mode = item.getAttribute("data-mode") || "assistant";
    setPageMode(mode);
  };
}

voiceBtn.onclick = () => {
  if (isRecording) {
    stopVoiceInput();
  } else {
    startVoiceInput();
  }
};

attachBtn.onclick = () => fileInput.click();
attachmentList.onclick = (event) => {
  const removeBtn = event.target.closest("[data-remove-index]");
  if (!removeBtn) return;
  const index = Number(removeBtn.getAttribute("data-remove-index"));
  if (!Number.isInteger(index) || index < 0 || index >= pendingAttachments.length) return;
  pendingAttachments.splice(index, 1);
  refreshAttachmentState();
  statusText.textContent = pendingAttachments.length > 0
    ? `Attached ${pendingAttachments.length} file(s). Press Send or Enter to send.`
    : "Ready";
};
fileInput.onchange = async (event) => {
  const selected = Array.from(event.target.files || []);
  if (selected.length === 0) return;

  const existingKeys = new Set(pendingAttachments.map(attachmentKey));
  const batchKeys = new Set();
  const uniqueNewFiles = [];
  let duplicateCount = 0;

  for (const file of selected) {
    const key = attachmentKey(file);
    if (existingKeys.has(key) || batchKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }
    batchKeys.add(key);
    uniqueNewFiles.push(file);
  }

  const availableSlots = Math.max(0, 4 - pendingAttachments.length);
  const filesToAdd = uniqueNewFiles.slice(0, availableSlots);
  const limitSkipped = Math.max(0, uniqueNewFiles.length - filesToAdd.length);

  pendingAttachments = [...pendingAttachments, ...filesToAdd];
  refreshAttachmentState();

  const notices = [];
  if (filesToAdd.length > 0) {
    notices.push(`Attached ${pendingAttachments.length} file(s). Press Send or Enter to send.`);
  }
  if (duplicateCount > 0) {
    notices.push(`${duplicateCount} duplicate file(s) were skipped.`);
  }
  if (limitSkipped > 0) {
    notices.push(`Attachment limit is 4 files per message. ${limitSkipped} file(s) were not added.`);
    showHtmlNotice(
      "Attachment limit reached",
      `You can attach up to 4 files per message. Currently attached: ${pendingAttachments.length}. Skipped due to limit: ${limitSkipped}.`
    );
  }

  if (notices.length === 0) {
    statusText.textContent = "No new files were added.";
  } else {
    statusText.textContent = notices.join(" ");
  }
  fileInput.value = "";
};

exportConvosBtn.onclick = () => {
  const dataStr = JSON.stringify(conversations, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hermes_conversations_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert("Conversations exported successfully!");
};

importConvosBtn.onclick = () => {
  importFileInput.click();
};

importFileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (typeof imported !== "object" || !imported) {
      alert("Invalid JSON format");
      return;
    }
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
    if (activeId && conversations[activeId]) {
      renderMessages();
      chatTitle.value = conversations[activeId].name;
    }
  } catch (err) {
    alert(`Import failed: ${err.message || err}`);
  }
  importFileInput.value = "";
};

tabButtons.forEach(btn => {
  btn.onclick = () => {
    activateTab(btn.dataset.tab);
    if (btn.dataset.tab === "memoryTab") {
      refreshMemoryView();
    }
    if (btn.dataset.tab === "analyticsTab") {
      renderAnalytics();
    }
    if (btn.dataset.tab === "shortcutsTab") {
      renderShortcuts();
    }
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

saveLocalMemoryBtn.onclick = () => {
  if (!activeId || !conversations[activeId]) {
    alert("No active conversation selected.");
    return;
  }
  try {
    const parsed = JSON.parse(convoMemoryEditor.value || "[]");
    if (!Array.isArray(parsed)) throw new Error("JSON must be an array.");
    const normalized = parsed.map(item => ({
      role: String(item.role || "user"),
      content: String(item.content || ""),
      timestamp: item.timestamp ? String(item.timestamp) : nowTime(),
    })).filter(item => item.content.trim());
    conversations[activeId].messages = normalized;
    saveState();
    renderMessages();
    setMemoryStatus(`Saved local chat editor (${normalized.length} messages)`);
  } catch (err) {
    alert(`Invalid JSON: ${err.message || err}`);
  }
};

saveGlobalMemoryBtn.onclick = async () => {
  const deduped = [];
  for (const line of globalFactsDraft) {
    const cleaned = String(line || "").trim();
    if (cleaned && !deduped.includes(cleaned)) deduped.push(cleaned);
  }

  setMemoryStatus("Saving global memory...");
  try {
    const response = await fetch(`${API_BASE}/global-memory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts: deduped }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    const data = await response.json();
    globalFactsDraft = (data.facts || []).map(f => String(f));
    renderFactsList();
    setMemoryStatus(`Saved ${data.facts_count || globalFactsDraft.length || 0} global facts`);
  } catch (err) {
    setMemoryStatus(`Save failed: ${err.message || err}`);
    alert(`Failed to save global memory: ${err.message || err}`);
  }
};

addFactBtn.onclick = () => {
  const value = String(factInput.value || "").trim();
  if (!value) return;
  if (!globalFactsDraft.includes(value)) {
    globalFactsDraft.push(value);
    renderFactsList();
    setMemoryStatus(`Added fact. ${globalFactsDraft.length} pending facts.`);
  }
  factInput.value = "";
  factInput.focus();
};

factInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addFactBtn.click();
  }
});

factsList.addEventListener("click", (e) => {
  const button = e.target.closest(".fact-remove");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (Number.isNaN(index)) return;
  globalFactsDraft.splice(index, 1);
  renderFactsList();
  setMemoryStatus(`Removed fact. ${globalFactsDraft.length} pending facts.`);
});

clearCurrentMemoryBtn.onclick = async () => {
  if (!activeId) return;
  if (!confirm("Clear current chat memory on backend?")) return;
  try {
    await fetch(`${API_BASE}/memory/${activeId}`, { method: "DELETE" });
    setMemoryStatus("Cleared current chat memory on backend");
    refreshMemoryView();
  } catch (err) {
    alert(`Failed to clear memory: ${err.message || err}`);
  }
};

clearGlobalMemoryBtn.onclick = async () => {
  if (!confirm("Clear global memory on backend for all chats?")) return;
  try {
    await fetch(`${API_BASE}/global-memory`, { method: "DELETE" });
    globalFactsDraft = [];
    renderFactsList();
    setMemoryStatus("Global memory cleared on backend");
    refreshMemoryView();
  } catch (err) {
    alert(`Failed to clear global memory: ${err.message || err}`);
  }
};

saveSettingsBtn.onclick = async () => {
  const enablePin = pinEnabledToggle.checked;
  const newPin = pinInput.value.trim();
  const confirmPin = pinConfirmInput.value.trim();

  if (enablePin) {
    if (!settings.pin_hash && !newPin) {
      alert("Set a PIN to enable PIN lock.");
      return;
    }
    if (newPin || confirmPin) {
      if (newPin.length < 4) {
        alert("PIN must be at least 4 digits/characters.");
        return;
      }
      if (newPin !== confirmPin) {
        alert("PIN confirmation does not match.");
        return;
      }
      settings.pin_hash = hashPin(newPin);
    }
  } else {
    settings.pin_hash = "";
  }

  settings.theme = themeSelect.value;
  settings.model = modelSelect.value;
  settings.notifications = notificationsToggle.checked;
  settings.operator_zoom_percent = Number(operatorZoomSelect?.value || 100);
  settings.pin_enabled = enablePin;
  persistSettings();
  applySettings();

  if (settings.notifications && typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
  closeSettings();
};

cancelSettingsBtn.onclick = closeSettings;
settingsModal.onclick = (e) => {
  if (e.target === settingsModal) closeSettings();
};

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

searchInput.addEventListener("input", (e) => {
  renderConversations(e.target.value);
});

chatTitle.addEventListener("change", () => {
  if (!activeId || !conversations[activeId]) return;
  const val = chatTitle.value.trim() || "Untitled Conversation";
  conversations[activeId].name = val;
  conversations[activeId].manual_name = true;
  saveState();
  renderConversations();
});

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

pinUnlockInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") pinUnlockBtn.click();
});

noticeOkBtn.onclick = closeHtmlNotice;
noticeModal.onclick = (e) => {
  if (e.target === noticeModal) closeHtmlNotice();
};

document.addEventListener("click", (e) => {
  if (!logoModeMenu || !logoModeToggle) return;
  if (logoModeMenu.contains(e.target) || logoModeToggle.contains(e.target)) return;
  closeLogoModeMenu();
});

window.addEventListener("message", (event) => {
  if (!event || !event.data || typeof event.data !== "object") return;
  const { type, mode } = event.data;
  if (type !== "hermes-mode-switch") return;
  if (mode !== "assistant" && mode !== "watchdog" && mode !== "operator") return;
  setPageMode(mode);
});

document.addEventListener("keydown", (e) => {
  if (recordingShortcut) {
    handleShortcutRecording(e);
    return;
  }
  
  const shortcuts = settings.shortcuts || DEFAULT_SHORTCUTS;
  
  if (shortcuts.newChat && matchesShortcut(e, shortcuts.newChat)) {
    e.preventDefault();
    newConversation();
  }
  else if (shortcuts.search && matchesShortcut(e, shortcuts.search)) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
  else if (shortcuts.settings && matchesShortcut(e, shortcuts.settings)) {
    e.preventDefault();
    openSettings();
  }
  else if (shortcuts.closeModal && matchesShortcut(e, shortcuts.closeModal)) {
    if (settingsModal.classList.contains("show")) {
      closeSettings();
    }
  }
});

ensureConversation();
Object.values(conversations).forEach(ensureConversationMetadata);
applySettings();
refreshAttachmentState();
renderConversations();
renderMessages();
initVoiceInput();

const initialMode = new URLSearchParams(location.search).get("mode") || "assistant";
setPageMode(initialMode, { skipHistory: true });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("data:application/javascript;base64,c2VsZi5hZGRFdmVudExpc3RlbmVyKCdpbnN0YWxsJywgZnVuY3Rpb24oZXZlbnQpIHsKICBzZWxmLnNraXBXYWl0aW5nKCk7Cn0pOwoKc2VsZi5hZGRFdmVudExpc3RlbmVyKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGV2ZW50KSB7CiAgcmV0dXJuIHNlbGYuY2xpZW50cy5jbGFpbSgpOwp9KTsKCnNlbGYuYWRkRXZlbnRMaXN0ZW5lcignZmV0Y2gnLCBmdW5jdGlvbihldmVudCkgewogIGV2ZW50LnJlc3BvbmRXaXRoKGZldGNoKGV2ZW50LnJlcXVlc3QpKTsKfSk7")
    .then(reg => console.log("PWA Service Worker registered"))
    .catch(err => console.log("SW registration failed:", err));
}

if (settings.pin_enabled && settings.pin_hash) {
  pinModal.classList.add("show");
  setTimeout(() => pinUnlockInput.focus(), 50);
}
