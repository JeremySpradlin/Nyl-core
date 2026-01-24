import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import "react-day-picker/dist/style.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const initialSystemPrompt =
  "You are Nyl, a steady, helpful home assistant. Be concise, thoughtful, and practical.";
const MAX_HISTORY_TURNS = 12;
const DEFAULT_ACCENT = "#d07a4a";
const DEFAULT_DOC = { type: "doc", content: [] };
const AUTOSAVE_DELAY_MS = 900;

const formatModelLabel = (name) => {
  if (!name) return "Unknown model";
  const normalized = name.replace(/[:_]/g, " ").trim();
  const parts = normalized.split(/\s+/);
  const sizeToken = parts.find((part) => /\d+b/i.test(part));
  const labelParts = parts.map((part) => {
    if (/\d+(\.\d+)?/i.test(part) && part.includes(".")) {
      return part;
    }
    if (/\d+b/i.test(part)) {
      return part.toUpperCase();
    }
    return part.charAt(0).toUpperCase() + part.slice(1);
  });

  const label = labelParts.join(" ").replace(/B/, "B");
  return sizeToken ? label.replace(sizeToken, sizeToken.toUpperCase()) : label;
};

const hexToRgb = (hex) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return null;
  }
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    return null;
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
};

const darkenHex = (hex, amount) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const clamp = (value) => Math.max(0, Math.min(255, value));
  const toHex = (value) => clamp(value).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r + amount)}${toHex(rgb.g + amount)}${toHex(rgb.b + amount)}`;
};

const buildRing = (hex, alpha) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const mixHexColors = (foregroundHex, backgroundHex, ratio) => {
  const foreground = hexToRgb(foregroundHex);
  const background = hexToRgb(backgroundHex);
  if (!foreground || !background) {
    return foregroundHex;
  }
  const mixChannel = (front, back) => Math.round(front * ratio + back * (1 - ratio));
  return `rgb(${mixChannel(foreground.r, background.r)}, ${mixChannel(
    foreground.g,
    background.g
  )}, ${mixChannel(foreground.b, background.b)})`;
};

const formatApiDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDoc = (body) => {
  if (!body || typeof body !== "object") {
    return DEFAULT_DOC;
  }
  if (!body.type) {
    return DEFAULT_DOC;
  }
  return body;
};

const formatDisplayDate = (date) =>
  date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

const parseSseEvents = (buffer) => {
  const events = [];
  const chunks = buffer.replace(/\r/g, "").split("\n\n");
  const remaining = chunks.pop() || "";

  for (const chunk of chunks) {
    if (!chunk.trim()) {
      continue;
    }
    const dataLines = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, ""));
    if (dataLines.length) {
      events.push(dataLines.join("\n"));
    }
  }

  return { events, remaining };
};

const buildMessages = (systemPrompt, history, userMessage) => {
  const messages = [];
  const recentHistory = history.slice(-MAX_HISTORY_TURNS);
  if (systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() });
  }
  recentHistory.forEach((entry) => {
    messages.push({ role: "user", content: entry.user });
    if (entry.assistant) {
      messages.push({ role: "assistant", content: entry.assistant });
    }
  });
  messages.push({ role: "user", content: userMessage });
  return messages;
};

const makeId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getFocusableElements = (container) => {
  if (!container) {
    return [];
  }
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
    )
  );
};

export default function App() {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [streamingId, setStreamingId] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [selectedDate, setSelectedDate] = useState(todayStart);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [journalEntryId, setJournalEntryId] = useState(null);
  const [journalTitle, setJournalTitle] = useState("");
  const [journalBody, setJournalBody] = useState(DEFAULT_DOC);
  const [journalStatus, setJournalStatus] = useState("idle");
  const [journalError, setJournalError] = useState("");
  const [journalSavedAt, setJournalSavedAt] = useState(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const historyRef = useRef(history);
  const streamUpdateRef = useRef({ timer: null, text: "" });
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef({ title: "", body: DEFAULT_DOC });
  const isSettingContentRef = useRef(false);
  const journalDrawerRef = useRef(null);
  const journalTitleRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const bodyOverflowRef = useRef("");

  const editor = useEditor({
    extensions: [StarterKit],
    content: DEFAULT_DOC,
    onUpdate: ({ editor: currentEditor }) => {
      if (isSettingContentRef.current) {
        return;
      }
      setJournalBody(currentEditor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "journal-editor-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": "journal-body-label"
      }
    }
  });

  const modelOptions = useMemo(() => {
    return models.map((model) => ({
      ...model,
      label: formatModelLabel(model.name || model.id)
    }));
  }, [models]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const saved = window.localStorage.getItem("nyl-theme");
    if (saved) {
      setTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.setAttribute("data-theme", theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("nyl-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const savedAccent = window.localStorage.getItem("nyl-accent");
    if (savedAccent) {
      setAccentColor(savedAccent);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    const accentDark = darkenHex(accentColor, -32);
    root.style.setProperty("--accent", accentColor);
    root.style.setProperty("--accent-dark", accentDark);
    root.style.setProperty("--ring", buildRing(accentColor, 0.35));
    const supportsColorMix =
      typeof CSS !== "undefined" && CSS.supports?.("color", "color-mix(in srgb, #000 50%, #fff)");
    if (supportsColorMix) {
      root.style.removeProperty("--glow");
    } else {
      const bgStart = getComputedStyle(root).getPropertyValue("--bg-start").trim();
      const glowRatio = theme === "dark" ? 0.4 : 0.35;
      root.style.setProperty("--glow", mixHexColors(accentColor, bgStart, glowRatio));
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("nyl-accent", accentColor);
    }
  }, [accentColor, theme]);

  useEffect(() => {
    if (!isJournalOpen || typeof document === "undefined") {
      return;
    }

    bodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflowRef.current;
    };
  }, [isJournalOpen]);

  useEffect(() => {
    if (!isJournalOpen || typeof document === "undefined") {
      return;
    }

    const drawer = journalDrawerRef.current;
    if (!drawer) {
      return;
    }

    lastFocusedRef.current = document.activeElement;
    const focusables = getFocusableElements(drawer);
    const focusTarget = journalTitleRef.current || focusables[0] || drawer;

    requestAnimationFrame(() => {
      focusTarget.focus();
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsJournalOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const currentFocusables = getFocusableElements(drawer);
      if (!currentFocusables.length) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (lastFocusedRef.current?.focus) {
        lastFocusedRef.current.focus();
      }
    };
  }, [isJournalOpen]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch(`${API_BASE}/v1/models`);
        if (!response.ok) {
          throw new Error("Could not load models.");
        }
        const data = await response.json();
        const list = data.models || [];
        const defaultModel = data.default_model;
        const modelNames = new Set(list.map((model) => model.name || model.id));
        setModels(list);
        setError("");
        const hasSelected = selectedModel && modelNames.has(selectedModel);
        if (!hasSelected && list.length) {
          const nextModel =
            (defaultModel && modelNames.has(defaultModel) && defaultModel) ||
            list[0].name ||
            list[0].id;
          setSelectedModel(nextModel);
        }
      } catch (err) {
        setError(err.message || "Failed to load models.");
      }
    };

    loadModels();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
        return () => {
          if (abortRef.current) {
            abortRef.current.abort();
          }
      if (streamUpdateRef.current.timer) {
        clearTimeout(streamUpdateRef.current.timer);
        streamUpdateRef.current.timer = null;
      }
    };
  }, []);

  const scheduleAssistantUpdate = (entryId, nextText) => {
    streamUpdateRef.current.text = nextText;
    if (streamUpdateRef.current.timer) {
      return;
    }
    streamUpdateRef.current.timer = setTimeout(() => {
      const text = streamUpdateRef.current.text;
      streamUpdateRef.current.timer = null;
      setHistory((prev) =>
        prev.map((entry) => (entry.id === entryId ? { ...entry, assistant: text } : entry))
      );
    }, 40);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!input.trim() || !selectedModel || status === "streaming") {
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("streaming");
    setError("");

    const userMessage = input.trim();
    setInput("");

    const entryId = makeId();
    const newEntry = {
      id: entryId,
      user: userMessage,
      assistant: ""
    };
    setHistory((prev) => [...prev, newEntry]);
    setStreamingId(newEntry.id);

    let assistantText = "";
    try {
      const payload = {
        model: selectedModel,
        messages: buildMessages(systemPrompt, historyRef.current, userMessage),
        stream: true,
        rag: { enabled: false, source: "trilium", top_k: 5 }
      };

      const response = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error("The chat stream could not be started.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSseEvents(buffer);
        buffer = remaining;

        for (const event of events) {
          if (event === "[DONE]") {
            continue;
          }
          let data;
          try {
            data = JSON.parse(event);
          } catch (parseError) {
            continue;
          }
          const delta = data?.choices?.[0]?.delta;
          if (!delta?.content) {
            continue;
          }
          assistantText += delta.content;
          scheduleAssistantUpdate(newEntry.id, assistantText);
        }
      }

      if (streamUpdateRef.current.timer) {
        clearTimeout(streamUpdateRef.current.timer);
        streamUpdateRef.current.timer = null;
      }
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, assistant: assistantText } : entry
        )
      );
      setStatus("idle");
      setStreamingId(null);
      abortRef.current = null;
    } catch (err) {
      if (streamUpdateRef.current.timer) {
        clearTimeout(streamUpdateRef.current.timer);
        streamUpdateRef.current.timer = null;
      }
      streamUpdateRef.current.text = "";
      setHistory((prev) =>
        prev.map((entry) => (entry.id === entryId ? { ...entry, assistant: "" } : entry))
      );
      if (err.name === "AbortError") {
        setStatus("idle");
        setStreamingId(null);
        abortRef.current = null;
        return;
      }
      setStatus("idle");
      setError(err.message || "Something went wrong.");
      setStreamingId(null);
      abortRef.current = null;
    }
  };

  const handleCalendarClick = (date) => {
    if (!date) {
      return;
    }
    const clicked = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const label = formatApiDate(clicked);
    if (clicked <= todayStart) {
      setSelectedDate(clicked);
      setIsJournalOpen(true);
      console.log(`Open journal for ${label}`);
    } else {
      console.log(`Future date ${label} not openable`);
    }
  };

  useEffect(() => {
    if (!isJournalOpen) {
      return;
    }
    let isActive = true;
    const loadEntry = async () => {
      setJournalStatus("loading");
      setJournalError("");
      try {
        const response = await fetch(`${API_BASE}/v1/journal/entries/ensure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            journal_date: formatApiDate(selectedDate),
            scope: "daily",
            title: null,
            body: DEFAULT_DOC,
            tags: null
          })
        });
        if (!response.ok) {
          throw new Error("Failed to load journal entry.");
        }
        const entry = await response.json();
        if (!isActive) {
          return;
        }
        const nextTitle = entry.title || "";
        const nextBody = normalizeDoc(entry.body);
        setJournalEntryId(entry.id);
        setJournalTitle(nextTitle);
        setJournalBody(nextBody);
        lastSavedRef.current = { title: nextTitle, body: nextBody };
        setJournalSavedAt(new Date());
        setJournalStatus("saved");
        if (editor) {
          isSettingContentRef.current = true;
          editor.commands.setContent(nextBody, false);
          isSettingContentRef.current = false;
        }
      } catch (err) {
        if (!isActive) {
          return;
        }
        setJournalStatus("error");
        setJournalError(err.message || "Failed to load journal entry.");
      }
    };

    loadEntry();

    return () => {
      isActive = false;
    };
  }, [isJournalOpen, selectedDate, editor]);

  useEffect(() => {
    if (!isJournalOpen || !journalEntryId) {
      return;
    }
    const current = { title: journalTitle, body: journalBody };
    const last = lastSavedRef.current;
    const isSame =
      current.title === last.title &&
      JSON.stringify(current.body) === JSON.stringify(last.body);
    if (isSame) {
      if (journalStatus !== "saved") {
        setJournalStatus("saved");
      }
      return;
    }
    setJournalStatus("saving");
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      try {
        const response = await fetch(`${API_BASE}/v1/journal/entries/${journalEntryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: journalTitle || null,
            body: journalBody
          })
        });
        if (!response.ok) {
          throw new Error("Failed to save journal entry.");
        }
        lastSavedRef.current = current;
        setJournalSavedAt(new Date());
        setJournalStatus("saved");
      } catch (err) {
        setJournalStatus("error");
        setJournalError(err.message || "Failed to save journal entry.");
      }
    }, AUTOSAVE_DELAY_MS);
  }, [journalTitle, journalBody, journalEntryId, isJournalOpen]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  const journalStatusLabel = useMemo(() => {
    if (journalStatus === "loading") return "Loading...";
    if (journalStatus === "saving") return "Saving...";
    if (journalStatus === "error") return "Save failed";
    if (journalStatus === "saved") return "Saved";
    return "Idle";
  }, [journalStatus]);

  const journalSavedLabel = useMemo(() => {
    if (!journalSavedAt) return "No save yet";
    return `Saved at ${journalSavedAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    })}`;
  }, [journalSavedAt]);

  return (
    <div className="page">
      <div className="top-nav">
        <div className="top-nav-brand">
          <span className="titlebar-mark">Nyl</span>
          <span className="titlebar-dot">Home</span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Open settings"
          aria-expanded={isSettingsOpen}
          onClick={() => setIsSettingsOpen(true)}
        >
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
      <div className="content">
        <header className="hero">
          <div>
            <p className="hero-tag">Nyl home assistant</p>
            <h1>Stay grounded, map your day, and think out loud.</h1>
            <p className="hero-sub">
              A calm workspace for planning, remembering, and exploring. Stream replies in real
              time and keep your system prompt close.
            </p>
          </div>
          <div className="hero-side">
            <div className="hero-card calendar-card">
              <div className="calendar-card-header">
                <div className="hero-card-title">Calendar</div>
              </div>
              <div className="calendar-body">
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onDayClick={handleCalendarClick}
                  modifiers={{ future: { after: today }, today: today }}
                  modifiersClassNames={{
                    future: "calendar-future",
                    today: "calendar-today"
                  }}
                />
              </div>
              <div className="calendar-meta">
                Selected: {formatApiDate(selectedDate)}
              </div>
            </div>
            <div className="hero-card">
              <div className="hero-card-title">Model</div>
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                className="select"
              >
                {modelOptions.length === 0 && <option>Loading models...</option>}
                {modelOptions.map((model) => (
                  <option key={model.id || model.name} value={model.name || model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <div className="hero-card-footer">Streaming from {API_BASE}</div>
            </div>
          </div>
        </header>

        <main className="main">
          <section className="panel chat">
            <div className="panel-header">
              <h2>Conversation</h2>
              <p>{status === "streaming" ? "Streaming reply..." : "Ready for your next thought."}</p>
            </div>
            <div className="chat-stream" ref={scrollRef}>
              {history.length === 0 && (
                <div className="chat-empty">
                  <p>Start with a plan, a question, or a memory you want to capture.</p>
                </div>
              )}
              {history.map((entry) => (
                <div key={entry.id} className="chat-pair">
                  <div className="chat-bubble user">
                    <span className="chat-label">You</span>
                    <p>{entry.user}</p>
                  </div>
                  {(entry.assistant || (status === "streaming" && entry.id === streamingId)) && (
                    <div
                      className={`chat-bubble assistant${
                        status === "streaming" && entry.id === streamingId ? " live" : ""
                      }`}
                    >
                      <span className="chat-label">Nyl</span>
                      {entry.assistant ? (
                        <p>{entry.assistant}</p>
                      ) : (
                        <div className="typing-indicator" aria-label="Nyl is typing">
                          <span />
                          <span />
                          <span />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
            <input
              className="input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Nyl to plan, organize, or reflect..."
              autoFocus
            />
              <button className="button" type="submit" disabled={status === "streaming"}>
                Send
              </button>
            </form>

            {error && <div className="error">{error}</div>}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Session status</h2>
              <p>Track the model and keep context tight for the conversation.</p>
            </div>
            <div className="status-panel">
              <div>
                <div className="status-label">Active model</div>
                <div className="status-value">{selectedModel || "Loading..."}</div>
              </div>
              <div>
                <div className="status-label">System guidance</div>
                <div className="status-value">
                  {systemPrompt.trim()
                    ? `${systemPrompt.trim().slice(0, 120)}${systemPrompt.trim().length > 120 ? "…" : ""}`
                    : "Not set yet."}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {isJournalOpen && (
        <div className="journal-overlay" role="presentation">
          <button
            type="button"
            className="journal-scrim"
            aria-label="Close journal"
            onClick={() => setIsJournalOpen(false)}
          />
          <aside
            className="journal-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="journal-title"
            aria-describedby="journal-description"
            tabIndex={-1}
            ref={journalDrawerRef}
          >
            <div className="journal-header">
              <div>
                <p className="journal-eyebrow">Daily journal</p>
                <h2 id="journal-title">{formatDisplayDate(selectedDate)}</h2>
                <p id="journal-description">Your entry saves automatically as you type.</p>
              </div>
              <div className="journal-status">
                <span className={`journal-pill journal-${journalStatus}`}>
                  {journalStatusLabel}
                </span>
                <span className="journal-meta">{journalSavedLabel}</span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close journal"
                onClick={() => setIsJournalOpen(false)}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className="journal-shell">
              <label className="journal-field">
                <span className="journal-label">Title</span>
                <input
                  className="journal-input"
                  type="text"
                  placeholder="Give the day a headline"
                  value={journalTitle}
                  onChange={(event) => setJournalTitle(event.target.value)}
                  ref={journalTitleRef}
                />
              </label>
              <div className="journal-field journal-body">
                <span className="journal-label" id="journal-body-label">
                  Body
                </span>
                <div className="journal-toolbar" role="toolbar" aria-label="Journal formatting">
                  <button
                    type="button"
                    className={`journal-tool${editor?.isActive("bold") ? " active" : ""}`}
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    disabled={!editor?.can().chain().focus().toggleBold().run()}
                    aria-pressed={editor?.isActive("bold") || false}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className={`journal-tool${editor?.isActive("italic") ? " active" : ""}`}
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    disabled={!editor?.can().chain().focus().toggleItalic().run()}
                    aria-pressed={editor?.isActive("italic") || false}
                  >
                    I
                  </button>
                  <button
                    type="button"
                    className={`journal-tool${editor?.isActive("heading", { level: 2 }) ? " active" : ""}`}
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                    aria-pressed={editor?.isActive("heading", { level: 2 }) || false}
                  >
                    H2
                  </button>
                  <button
                    type="button"
                    className={`journal-tool${editor?.isActive("heading", { level: 3 }) ? " active" : ""}`}
                    onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                    aria-pressed={editor?.isActive("heading", { level: 3 }) || false}
                  >
                    H3
                  </button>
                  <button
                    type="button"
                    className={`journal-tool${editor?.isActive("bulletList") ? " active" : ""}`}
                    onClick={() => editor?.chain().focus().toggleBulletList().run()}
                    aria-pressed={editor?.isActive("bulletList") || false}
                  >
                    List
                  </button>
                  <button
                    type="button"
                    className={`journal-tool${editor?.isActive("blockquote") ? " active" : ""}`}
                    onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                    aria-pressed={editor?.isActive("blockquote") || false}
                  >
                    Quote
                  </button>
                </div>
                <div className="journal-editor">
                  <EditorContent editor={editor} />
                </div>
              </div>
              <div className="journal-tags">
                <span className="journal-label">Tags</span>
                <div className="journal-placeholder">Tags input will live here later.</div>
              </div>
              {journalError && <div className="error">{journalError}</div>}
            </div>
          </aside>
        </div>
      )}

      {isSettingsOpen && (
        <div className="settings-overlay" role="presentation">
          <button
            type="button"
            className="settings-scrim"
            aria-label="Close settings"
            onClick={() => setIsSettingsOpen(false)}
          />
          <aside className="settings-drawer" role="dialog" aria-label="Settings">
            <div className="settings-header">
              <div>
                <h2>Settings</h2>
                <p>Adjust guidance and tune the session to your needs.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close settings"
                onClick={() => setIsSettingsOpen(false)}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div className="settings-section">
              <div className="panel-header">
                <h3>System guidance</h3>
                <p>Keep the tone and intent explicit for every session.</p>
              </div>
              <textarea
                className="textarea"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                rows={8}
              />
            </div>

            <div className="settings-section">
              <div className="panel-header">
                <h3>More controls</h3>
                <p>Room for memory, personas, or safety toggles later.</p>
              </div>
              <div className="settings-card">
                <div>
                  <div className="settings-title">Dark mode</div>
                  <div className="settings-sub">Switch the interface palette.</div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={theme === "dark"}
                    onChange={(event) => setTheme(event.target.checked ? "dark" : "light")}
                  />
                  <span className="slider" />
                </label>
              </div>
              <div className="settings-card">
                <div>
                  <div className="settings-title">Accent color</div>
                  <div className="settings-sub">Update the highlight color.</div>
                </div>
                <label className="color-picker">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                    aria-label="Accent color"
                  />
                  <span>{accentColor.toUpperCase()}</span>
                </label>
              </div>
              <div className="settings-placeholder">New settings will appear here.</div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
