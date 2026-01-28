import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "react-day-picker/dist/style.css";
import CalendarPanel from "../components/calendar/CalendarPanel";
import ChatPanel from "../components/chat/ChatPanel";
import TopNav from "../components/TopNav.jsx";
import useChat from "../hooks/useChat";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

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

const formatApiDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthRange = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
};

export default function LandingPage({
  onNavigate,
  theme,
  setTheme,
  accentColor,
  setAccentColor
}) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt);
  const [modelError, setModelError] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayStart);
  const [isCalendarOpen, setIsCalendarOpen] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(todayStart.getFullYear(), todayStart.getMonth(), 1)
  );
  const [calendarMarkers, setCalendarMarkers] = useState({});
  const [embeddingModels, setEmbeddingModels] = useState([]);
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState("");
  const [ragJob, setRagJob] = useState(null);
  const [ragJobStatus, setRagJobStatus] = useState("idle");
  const [ragJobError, setRagJobError] = useState("");
  const ragPollRef = useRef(null);
  const { history, input, setInput, status, streamingId, error, handleSubmit } = useChat({
    apiBase: API_BASE,
    systemPrompt,
    selectedModel,
    embeddingModel: selectedEmbeddingModel
  });
  const handleInputChange = (event) => setInput(event.target.value);

  const modelOptions = useMemo(() => {
    return models.map((model) => ({
      ...model,
      label: formatModelLabel(model.name || model.id)
    }));
  }, [models]);

  useEffect(() => {
    const nextMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    setCalendarMonth(nextMonth);
  }, [selectedDate]);

  useEffect(() => {
    return () => {
      if (ragPollRef.current) {
        clearInterval(ragPollRef.current);
        ragPollRef.current = null;
      }
    };
  }, []);

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
        setModelError("");
        const hasSelected = selectedModel && modelNames.has(selectedModel);
        if (!hasSelected && list.length) {
          const nextModel =
            (defaultModel && modelNames.has(defaultModel) && defaultModel) ||
            list[0].name ||
            list[0].id;
          setSelectedModel(nextModel);
        }
      } catch (err) {
        setModelError(err.message || "Failed to load models.");
      }
    };

    loadModels();
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }
    const loadEmbeddingModels = async () => {
      try {
        const response = await fetch(`${API_BASE}/v1/models/embeddings`);
        if (!response.ok) {
          throw new Error("Could not load embedding models.");
        }
        const data = await response.json();
        const list = data.models || [];
        setEmbeddingModels(list);
        const defaultModel = data.default_model;
        if (defaultModel && list.some((model) => model.name === defaultModel)) {
          setSelectedEmbeddingModel(defaultModel);
        } else if (list.length && !selectedEmbeddingModel) {
          setSelectedEmbeddingModel(list[0].name);
        }
      } catch (err) {
        setRagJobError(err.message || "Failed to load embedding models.");
      }
    };

    loadEmbeddingModels();
  }, [isSettingsOpen]);

  const fetchCalendarMarkers = useCallback(
    async (monthDate) => {
      const { start, end } = getMonthRange(monthDate);
      try {
        const response = await fetch(
          `${API_BASE}/v1/journal/entries/dates?start=${formatApiDate(
            start
          )}&end=${formatApiDate(end)}`
        );
        if (!response.ok) {
          throw new Error("Could not load journal dates.");
        }
        const data = await response.json();
        const nextMarkers = data.reduce((acc, item) => {
          const key = item.journal_date;
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push({ scope: item.scope, count: item.count });
          return acc;
        }, {});
        setCalendarMarkers(nextMarkers);
      } catch (err) {
        setCalendarMarkers({});
      }
    },
    [API_BASE]
  );

  useEffect(() => {
    if (!isCalendarOpen) {
      return;
    }
    fetchCalendarMarkers(calendarMonth);
  }, [calendarMonth, fetchCalendarMarkers, isCalendarOpen]);

  const pollRagJob = async (jobId) => {
    try {
      const poll = await fetch(`${API_BASE}/v1/rag/jobs/${jobId}`);
      if (!poll.ok) {
        throw new Error("Failed to fetch job status.");
      }
      const data = await poll.json();
      setRagJob(data);
      setRagJobStatus(data.status);
      if (data.status === "completed" || data.status === "failed") {
        if (ragPollRef.current) {
          clearInterval(ragPollRef.current);
          ragPollRef.current = null;
        }
      }
    } catch (err) {
      setRagJobError(err.message || "Failed to poll job status.");
      if (ragPollRef.current) {
        clearInterval(ragPollRef.current);
        ragPollRef.current = null;
      }
    }
  };

  const startRagPolling = (jobId) => {
    if (ragPollRef.current) {
      clearInterval(ragPollRef.current);
    }
    ragPollRef.current = setInterval(() => {
      pollRagJob(jobId);
    }, 3000);
  };

  useEffect(() => {
    if (!isSettingsOpen) {
      if (ragPollRef.current) {
        clearInterval(ragPollRef.current);
        ragPollRef.current = null;
      }
      return;
    }
    if (!ragJob || ragJob.status === "completed" || ragJob.status === "failed") {
      return;
    }
    pollRagJob(ragJob.id);
    startRagPolling(ragJob.id);
    return () => {
      if (ragPollRef.current) {
        clearInterval(ragPollRef.current);
        ragPollRef.current = null;
      }
    };
  }, [isSettingsOpen, ragJob]);

  const handleCalendarClick = (date) => {
    if (!date) {
      return;
    }
    const clicked = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const label = formatApiDate(clicked);
    setSelectedDate(clicked);
    if (clicked <= todayStart) {
      onNavigate(`/journal?date=${label}&scope=daily`);
    } else {
      console.log(`Future date ${label} not openable`);
    }
  };

  const handleRagReindex = async () => {
    if (!selectedEmbeddingModel) {
      setRagJobError("Select an embedding model first.");
      return;
    }
    const confirmed = window.confirm(
      "Reindex all journal entries? This may take a while."
    );
    if (!confirmed) {
      return;
    }
    setRagJobError("");
    setRagJobStatus("running");
    try {
      const response = await fetch(
        `${API_BASE}/v1/rag/reindex/journal?embedding_model=${encodeURIComponent(
          selectedEmbeddingModel
        )}`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error("Failed to start reindex job.");
      }
      const job = await response.json();
      setRagJob(job);

      setRagJobStatus(job.status);
      pollRagJob(job.id);
      if (isSettingsOpen) {
        startRagPolling(job.id);
      }
    } catch (err) {
      setRagJobStatus("idle");
      setRagJobError(err.message || "Failed to start reindex job.");
    }
  };

  return (
    <div className="page">
      <TopNav
        label="Home"
        onJournal={() => onNavigate("/journal")}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
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
          <aside className="panel sidebar left">
            <div className="sidebar-section">
              <div className="panel-header">
                <h2>Chats</h2>
                <p>Jump back into a session or start fresh.</p>
              </div>
              <button className="button button-secondary" type="button">
                New chat
              </button>
              <div className="sidebar-empty">No saved chats yet.</div>
            </div>
            <div className="sidebar-section">
              <div className="panel-header">
                <h3>Session status</h3>
                <p>Context and model settings for this chat.</p>
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
                      ? `${systemPrompt.trim().slice(0, 120)}${
                          systemPrompt.trim().length > 120 ? "…" : ""
                        }`
                      : "Not set yet."}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <ChatPanel
            title="Conversation"
            subtitle={status === "streaming" ? "Streaming reply..." : "Ready for your next thought."}
            history={history}
            status={status}
            streamingId={streamingId}
            input={input}
            onInputChange={handleInputChange}
            onSubmit={handleSubmit}
            error={error || modelError}
          />

          <aside className="panel sidebar right">
            <div className="sidebar-section">
              <div className="calendar-toggle">
                <div className="panel-header">
                  <h3>Calendar</h3>
                  <p>Pick a day to open a journal entry.</p>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={isCalendarOpen ? "Collapse calendar" : "Expand calendar"}
                  onClick={() => setIsCalendarOpen((prev) => !prev)}
                >
                  <span aria-hidden="true">{isCalendarOpen ? "▾" : "▸"}</span>
                </button>
              </div>
              {isCalendarOpen && (
                <CalendarPanel
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  markers={calendarMarkers}
                  selectedDate={selectedDate}
                  onSelectDate={handleCalendarClick}
                  today={today}
                  selectedLabel={formatApiDate(selectedDate)}
                />
              )}
            </div>
            <div className="sidebar-section">
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
          </aside>
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
                <h3>RAG</h3>
                <p>Reindex journal entries for retrieval.</p>
              </div>
              <div className="rag-controls">
                <label className="status-label" htmlFor="embedding-model">
                  Embedding model
                </label>
                <select
                  id="embedding-model"
                  className="select"
                  value={selectedEmbeddingModel}
                  onChange={(event) => setSelectedEmbeddingModel(event.target.value)}
                >
                  {embeddingModels.length === 0 && (
                    <option value="">Loading embedding models...</option>
                  )}
                  {embeddingModels.map((model) => (
                    <option key={model.id || model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <button
                  className="button"
                  type="button"
                  onClick={handleRagReindex}
                  disabled={ragJobStatus === "running"}
                >
                  {ragJobStatus === "running" ? "Reindexing..." : "Reindex journal"}
                </button>
              </div>
              {ragJob && (
                <div className="rag-status">
                  <div className="rag-progress">
                    <div
                      className="rag-progress-bar"
                      style={{
                        width:
                          ragJob.total > 0
                            ? `${Math.round((ragJob.processed / ragJob.total) * 100)}%`
                            : "0%"
                      }}
                    />
                  </div>
                  <div className="rag-progress-meta">
                    {ragJob.status} · {ragJob.processed}/{ragJob.total}
                  </div>
                </div>
              )}
              {ragJobError && <div className="error">{ragJobError}</div>}
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
