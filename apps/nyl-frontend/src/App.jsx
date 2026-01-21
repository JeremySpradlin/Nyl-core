import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://api.nyl.local";

const initialSystemPrompt =
  "You are Nyl, a steady, helpful home assistant. Be concise, thoughtful, and practical.";

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
  if (systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() });
  }
  history.forEach((entry) => {
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

export default function App() {
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
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const historyRef = useRef(history);
  const streamUpdateRef = useRef({ timer: null, text: "" });

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
    const loadModels = async () => {
      try {
        const response = await fetch(`${API_BASE}/v1/models`);
        if (!response.ok) {
          throw new Error("Could not load models.");
        }
        const data = await response.json();
        const list = data.models || [];
        setModels(list);
        if (list.length && !selectedModel) {
          setSelectedModel(list[0].name || list[0].id);
        }
      } catch (err) {
        setError(err.message || "Failed to load models.");
      }
    };

    loadModels();
  }, [selectedModel]);

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

    const newEntry = {
      id: makeId(),
      user: userMessage,
      assistant: ""
    };
    setHistory((prev) => [...prev, newEntry]);
    setStreamingId(newEntry.id);

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
      let assistantText = "";

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
          entry.id === newEntry.id ? { ...entry, assistant: assistantText } : entry
        )
      );
      setStatus("idle");
      setStreamingId(null);
      abortRef.current = null;
    } catch (err) {
      if (err.name === "AbortError") {
        setStatus("idle");
        setStreamingId(null);
        return;
      }
      setStatus("idle");
      setError(err.message || "Something went wrong.");
      setStreamingId(null);
    }
  };

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
              <div className="settings-placeholder">New settings will appear here.</div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
