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
  const [chatSessions, setChatSessions] = useState([]);
  const [chatSessionsStatus, setChatSessionsStatus] = useState("idle");
  const [chatSessionsError, setChatSessionsError] = useState("");
  const [chatFilter, setChatFilter] = useState("active");
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeChatTitle, setActiveChatTitle] = useState("Conversation");
  const [openChatMenuId, setOpenChatMenuId] = useState(null);
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
  const autoChatRef = useRef(false);
  const { history, setHistory, input, setInput, status, streamingId, error, handleSubmit } = useChat({
    apiBase: API_BASE,
    systemPrompt,
    selectedModel,
    embeddingModel: selectedEmbeddingModel,
    sessionId: activeChatId,
    onSessionTouched: (sessionId, userMessage) => {
      setChatSessions((prev) => {
        const next = prev.map((session) => {
          if (session.id !== sessionId) {
            return session;
          }
          const nextTitle =
            session.title?.toLowerCase() === "new chat" && userMessage
              ? userMessage.slice(0, 80)
              : session.title;
          return {
            ...session,
            title: nextTitle,
            updated_at: new Date().toISOString()
          };
        });
        return next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      });
    }
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

  const loadChatSessions = useCallback(async () => {
    setChatSessionsStatus("loading");
    setChatSessionsError("");
    try {
      const response = await fetch(`${API_BASE}/v1/chats?status=${chatFilter}`);
      if (!response.ok) {
        throw new Error("Could not load chats.");
      }
      const data = await response.json();
      setChatSessions(Array.isArray(data) ? data : []);
      setChatSessionsStatus("ready");
    } catch (err) {
      setChatSessions([]);
      setChatSessionsStatus("error");
      setChatSessionsError(err.message || "Failed to load chats.");
    }
  }, [chatFilter]);

  useEffect(() => {
    loadChatSessions();
  }, [loadChatSessions]);

  useEffect(() => {
    setActiveChatId(null);
    setActiveChatTitle("Conversation");
    setOpenChatMenuId(null);
  }, [chatFilter]);

  useEffect(() => {
    if (activeChatId || chatSessions.length === 0 || chatFilter !== "active") {
      return;
    }
    setActiveChatId(chatSessions[0].id);
  }, [activeChatId, chatSessions, chatFilter]);

  useEffect(() => {
    if (!activeChatId) {
      setHistory([]);
      setActiveChatTitle("Conversation");
      return;
    }
    const loadChat = async () => {
      try {
        const response = await fetch(`${API_BASE}/v1/chats/${activeChatId}`);
        if (!response.ok) {
          throw new Error("Could not load chat.");
        }
        const data = await response.json();
        const session = data.session;
        const messages = Array.isArray(data.messages) ? data.messages : [];
        const nextHistory = [];
        let current = null;
        messages.forEach((message) => {
          if (message.role === "user") {
            current = {
              id: message.id,
              user: message.content,
              assistant: "",
              createdAt: new Date(message.created_at),
              assistantAt: null
            };
            nextHistory.push(current);
          } else if (message.role === "assistant") {
            if (!current || current.assistant) {
              current = {
                id: message.id,
                user: "",
                assistant: "",
                createdAt: new Date(message.created_at),
                assistantAt: null
              };
              nextHistory.push(current);
            }
            current.assistant = message.content;
            current.assistantAt = new Date(message.created_at);
          }
        });
        setHistory(nextHistory);
        if (session?.title) {
          setActiveChatTitle(session.title);
        }
        if (session?.system_prompt) {
          setSystemPrompt(session.system_prompt);
        }
        if (session?.model) {
          setSelectedModel(session.model);
        }
      } catch (err) {
        setHistory([]);
      }
    };
    loadChat();
  }, [activeChatId]);

  const handleNewChat = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/v1/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New chat",
          model: selectedModel || undefined,
          system_prompt: systemPrompt || undefined
        })
      });
      if (!response.ok) {
        throw new Error("Failed to create chat.");
      }
      const data = await response.json();
      setChatSessions((prev) => [data, ...prev]);
      setActiveChatId(data.id);
      setActiveChatTitle(data.title || "Conversation");
      setHistory([]);
      setChatFilter("active");
    } catch (err) {
      setChatSessionsError(err.message || "Failed to create chat.");
    }
  }, [selectedModel, systemPrompt, setHistory]);

  const handleSelectChat = useCallback((chat) => {
    setActiveChatId(chat.id);
    setActiveChatTitle(chat.title || "Conversation");
  }, []);

  const handleArchiveChatById = useCallback(
    async (chatId) => {
      if (!chatId) {
        return;
      }
      await fetch(`${API_BASE}/v1/chats/${chatId}/archive`, { method: "POST" });
      loadChatSessions();
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    },
    [activeChatId, loadChatSessions]
  );

  const handleRestoreChatById = useCallback(
    async (chatId) => {
      if (!chatId) {
        return;
      }
      await fetch(`${API_BASE}/v1/chats/${chatId}/restore`, { method: "POST" });
      loadChatSessions();
    },
    [loadChatSessions]
  );

  const handleUnarchiveChatById = useCallback(
    async (chatId) => {
      if (!chatId) {
        return;
      }
      await fetch(`${API_BASE}/v1/chats/${chatId}/unarchive`, { method: "POST" });
      loadChatSessions();
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    },
    [activeChatId, loadChatSessions]
  );

  const handleDeleteChatById = useCallback(
    async (chatId) => {
      if (!chatId) {
        return;
      }
      await fetch(`${API_BASE}/v1/chats/${chatId}`, { method: "DELETE" });
      loadChatSessions();
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    },
    [activeChatId, loadChatSessions]
  );

  useEffect(() => {
    if (!openChatMenuId) {
      return;
    }
    const handleCloseMenu = (event) => {
      if (event.target.closest(".chat-session-actions")) {
        return;
      }
      setOpenChatMenuId(null);
    };
    document.addEventListener("click", handleCloseMenu);
    return () => {
      document.removeEventListener("click", handleCloseMenu);
    };
  }, [openChatMenuId]);

  useEffect(() => {
    autoChatRef.current = false;
  }, [chatFilter]);

  useEffect(() => {
    if (autoChatRef.current || chatFilter !== "active" || chatSessionsStatus !== "ready") {
      return;
    }
    if (chatSessions.length === 0 && selectedModel) {
      autoChatRef.current = true;
      handleNewChat();
    }
  }, [chatFilter, chatSessionsStatus, chatSessions.length, selectedModel, handleNewChat]);

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
              <div className="chat-sidebar-actions">
                <button className="button button-secondary" type="button" onClick={handleNewChat}>
                  New chat
                </button>
              </div>
              <div className="chat-filter-row">
                <div className="chat-filter-segment">
                  <button
                    className={`filter-button${chatFilter === "active" ? " active" : ""}`}
                    type="button"
                    onClick={() => setChatFilter("active")}
                  >
                    Active
                  </button>
                  <button
                    className={`filter-button${chatFilter === "archived" ? " active" : ""}`}
                    type="button"
                    onClick={() => setChatFilter("archived")}
                  >
                    Archived
                  </button>
                  <button
                    className={`filter-button${chatFilter === "deleted" ? " active" : ""}`}
                    type="button"
                    onClick={() => setChatFilter("deleted")}
                  >
                    Trash
                  </button>
                </div>
              </div>
              {chatSessionsStatus === "loading" && (
                <div className="sidebar-empty">Loading chats...</div>
              )}
              {chatSessionsStatus === "error" && (
                <div className="error">{chatSessionsError || "Failed to load chats."}</div>
              )}
              {chatSessionsStatus === "ready" && chatSessions.length === 0 && (
                <div className="sidebar-empty">No saved chats yet.</div>
              )}
              <div className="chat-session-list">
                {chatSessions.map((chat) => (
                  <div
                    key={chat.id}
                    className={`chat-session-row${activeChatId === chat.id ? " active" : ""}`}
                  >
                    <button
                      type="button"
                      className="chat-session-item"
                      onClick={() => handleSelectChat(chat)}
                    >
                      <span className="chat-session-title">{chat.title || "New chat"}</span>
                      <span className="chat-session-time">
                        {new Date(chat.updated_at).toLocaleDateString()}
                      </span>
                    </button>
                    <div
                      className="chat-session-actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="chat-session-menu-trigger"
                        aria-haspopup="true"
                        aria-expanded={openChatMenuId === chat.id}
                        onClick={() =>
                          setOpenChatMenuId((prev) => (prev === chat.id ? null : chat.id))
                        }
                      >
                        ⋯
                      </button>
                      {openChatMenuId === chat.id && (
                        <div className="chat-session-menu">
                          {chatFilter === "active" && (
                            <>
                              <button type="button" onClick={() => handleArchiveChatById(chat.id)}>
                                Archive
                              </button>
                              <button type="button" onClick={() => handleDeleteChatById(chat.id)}>
                                Move to trash
                              </button>
                            </>
                          )}
                          {chatFilter === "archived" && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUnarchiveChatById(chat.id)}
                              >
                                Restore
                              </button>
                              <button type="button" onClick={() => handleDeleteChatById(chat.id)}>
                                Move to trash
                              </button>
                            </>
                          )}
                          {chatFilter === "deleted" && (
                            <button type="button" onClick={() => handleRestoreChatById(chat.id)}>
                              Restore
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <ChatPanel
            title={activeChatTitle || "Conversation"}
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
