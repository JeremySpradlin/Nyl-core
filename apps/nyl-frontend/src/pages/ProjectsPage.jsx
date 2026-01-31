import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatPanel from "../components/chat/ChatPanel";
import TopNav from "../components/TopNav.jsx";
import useChat from "../hooks/useChat";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const formatScopeLabel = (scope) => {
  if (!scope.startsWith("project:")) {
    return scope;
  }
  const slug = scope.replace("project:", "");
  if (!slug) {
    return "Project";
  }
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const slugifyProject = (value) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
};

const formatDisplayDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const initialSystemPrompt =
  "You are Nyl, a project assistant. Be concise and helpful. Focus on the project context from journal entries.";

export default function ProjectsPage({ onNavigate }) {
  const [projectScopes, setProjectScopes] = useState([]);
  const [scopesStatus, setScopesStatus] = useState("idle");
  const [scopesError, setScopesError] = useState("");
  const [selectedProject, setSelectedProject] = useState(() => {
    return localStorage.getItem("nyl-selected-project") || "";
  });
  const [entries, setEntries] = useState([]);
  const [entriesStatus, setEntriesStatus] = useState("idle");
  const [entriesError, setEntriesError] = useState("");
  const [tasks, setTasks] = useState([]);
  const [tasksStatus, setTasksStatus] = useState("idle");

  // Chat state
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [systemPrompt] = useState(initialSystemPrompt);
  const [chatSessions, setChatSessions] = useState([]);
  const [chatSessionsStatus, setChatSessionsStatus] = useState("idle");
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeChatTitle, setActiveChatTitle] = useState("Project Chat");
  const autoChatRef = useRef(false);

  const { history, setHistory, input, setInput, status, streamingId, error, handleSubmit } = useChat({
    apiBase: API_BASE,
    systemPrompt,
    selectedModel,
    embeddingModel: undefined,
    sessionId: activeChatId,
    scope: selectedProject,
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

  const loadScopes = useCallback(async () => {
    setScopesStatus("loading");
    setScopesError("");
    try {
      const response = await fetch(`${API_BASE}/v1/journal/scopes`);
      if (!response.ok) {
        throw new Error("Could not load scopes.");
      }
      const data = await response.json();
      const allScopes = Array.isArray(data) ? data : [];
      const projects = allScopes.filter((scope) => scope.startsWith("project:"));
      setProjectScopes(projects);
      setScopesStatus("ready");
      if (projects.length > 0 && !selectedProject) {
        setSelectedProject(projects[0]);
      }
    } catch (err) {
      setScopesStatus("error");
      setScopesError(err.message || "Failed to load scopes.");
    }
  }, [selectedProject]);

  useEffect(() => {
    loadScopes();
  }, [loadScopes]);

  useEffect(() => {
    if (selectedProject) {
      localStorage.setItem("nyl-selected-project", selectedProject);
    }
  }, [selectedProject]);

  const loadEntries = useCallback(async (scope) => {
    if (!scope) {
      setEntries([]);
      return;
    }
    setEntriesStatus("loading");
    setEntriesError("");
    try {
      const response = await fetch(
        `${API_BASE}/v1/journal/entries?scope=${encodeURIComponent(scope)}&status=active`
      );
      if (!response.ok) {
        throw new Error("Could not load entries.");
      }
      const data = await response.json();
      setEntries(Array.isArray(data) ? data : []);
      setEntriesStatus("ready");
    } catch (err) {
      setEntries([]);
      setEntriesStatus("error");
      setEntriesError(err.message || "Failed to load entries.");
    }
  }, []);

  useEffect(() => {
    loadEntries(selectedProject);
  }, [selectedProject, loadEntries]);

  const loadTasksForEntries = useCallback(async (entryList) => {
    if (!entryList.length) {
      setTasks([]);
      setTasksStatus("ready");
      return;
    }
    setTasksStatus("loading");
    const allTasks = [];
    for (const entry of entryList) {
      try {
        const response = await fetch(`${API_BASE}/v1/journal/entries/${entry.id}/tasks`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            allTasks.push(...data);
          }
        }
      } catch {
        // skip failed task fetches
      }
    }
    setTasks(allTasks);
    setTasksStatus("ready");
  }, []);

  useEffect(() => {
    loadTasksForEntries(entries);
  }, [entries, loadTasksForEntries]);

  // Load models
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
        const hasSelected = selectedModel && modelNames.has(selectedModel);
        if (!hasSelected && list.length) {
          const nextModel =
            (defaultModel && modelNames.has(defaultModel) && defaultModel) ||
            list[0].name ||
            list[0].id;
          setSelectedModel(nextModel);
        }
      } catch {
        // ignore model load errors
      }
    };
    loadModels();
  }, []);

  // Load chat sessions for selected project
  const loadChatSessions = useCallback(async () => {
    if (!selectedProject) {
      setChatSessions([]);
      setChatSessionsStatus("ready");
      return;
    }
    setChatSessionsStatus("loading");
    try {
      const response = await fetch(
        `${API_BASE}/v1/chats?status=active&scope=${encodeURIComponent(selectedProject)}`
      );
      if (!response.ok) {
        throw new Error("Could not load chats.");
      }
      const data = await response.json();
      setChatSessions(Array.isArray(data) ? data : []);
      setChatSessionsStatus("ready");
    } catch {
      setChatSessions([]);
      setChatSessionsStatus("error");
    }
  }, [selectedProject]);

  useEffect(() => {
    loadChatSessions();
  }, [loadChatSessions]);

  // Reset active chat when project changes
  useEffect(() => {
    setActiveChatId(null);
    setActiveChatTitle("Project Chat");
    setHistory([]);
    autoChatRef.current = false;
  }, [selectedProject, setHistory]);

  // Auto-select first chat that matches current project scope
  useEffect(() => {
    if (activeChatId || chatSessions.length === 0 || chatSessionsStatus !== "ready") {
      return;
    }
    // Only select a chat if it has the correct scope
    const matchingChat = chatSessions.find((c) => c.scope === selectedProject);
    if (matchingChat) {
      setActiveChatId(matchingChat.id);
      setActiveChatTitle(matchingChat.title || "Project Chat");
    }
  }, [activeChatId, chatSessions, chatSessionsStatus, selectedProject]);

  // Auto-create chat if none exist
  useEffect(() => {
    if (autoChatRef.current || !selectedProject || chatSessionsStatus !== "ready") {
      return;
    }
    if (chatSessions.length === 0 && selectedModel) {
      autoChatRef.current = true;
      handleNewChat();
    }
  }, [selectedProject, chatSessionsStatus, chatSessions.length, selectedModel]);

  // Load messages when active chat changes
  useEffect(() => {
    if (!activeChatId) {
      setHistory([]);
      setActiveChatTitle("Project Chat");
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
        if (session?.model) {
          setSelectedModel(session.model);
        }
      } catch {
        setHistory([]);
      }
    };
    loadChat();
  }, [activeChatId, setHistory]);

  const handleNewChat = useCallback(async () => {
    if (!selectedProject) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/v1/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New chat",
          model: selectedModel || undefined,
          system_prompt: systemPrompt || undefined,
          scope: selectedProject
        })
      });
      if (!response.ok) {
        throw new Error("Failed to create chat.");
      }
      const data = await response.json();
      setChatSessions((prev) => [data, ...prev]);
      setActiveChatId(data.id);
      setActiveChatTitle(data.title || "Project Chat");
      setHistory([]);
    } catch {
      // ignore create errors
    }
  }, [selectedModel, systemPrompt, selectedProject, setHistory]);

  const handleSelectChat = useCallback((chat) => {
    setActiveChatId(chat.id);
    setActiveChatTitle(chat.title || "Project Chat");
  }, []);

  const handleNewProject = () => {
    const name = window.prompt("Project name");
    if (!name) {
      return;
    }
    const slug = slugifyProject(name);
    if (!slug) {
      return;
    }
    const scope = `project:${slug}`;
    if (!projectScopes.includes(scope)) {
      setProjectScopes((prev) => [scope, ...prev]);
    }
    setSelectedProject(scope);
  };

  const stats = useMemo(() => {
    const entryCount = entries.length;
    const openTasks = tasks.filter((t) => !t.done).length;
    const completedTasks = tasks.filter((t) => t.done).length;
    return { entryCount, openTasks, completedTasks, totalTasks: tasks.length };
  }, [entries, tasks]);

  const recentEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => new Date(b.journal_date) - new Date(a.journal_date))
      .slice(0, 5);
  }, [entries]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.done !== b.done) {
        return a.done ? 1 : -1;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [tasks]);

  const openTasks = sortedTasks.filter((t) => !t.done);
  const completedTasks = sortedTasks.filter((t) => t.done);

  return (
    <div className="page">
      <TopNav
        label="Projects"
        onHome={() => onNavigate("/")}
        onJournal={() => onNavigate("/journal")}
      >
        <div className="projects-nav-selector">
          <select
            className="select projects-select"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            disabled={scopesStatus === "loading"}
          >
            {scopesStatus === "loading" && <option value="">Loading...</option>}
            {scopesStatus === "ready" && projectScopes.length === 0 && (
              <option value="">No projects</option>
            )}
            {projectScopes.map((scope) => (
              <option key={scope} value={scope}>
                {formatScopeLabel(scope)}
              </option>
            ))}
          </select>
          <button className="button button-sm" type="button" onClick={handleNewProject}>
            + New
          </button>
        </div>
      </TopNav>

      {scopesStatus === "error" && (
        <div className="content">
          <div className="error">{scopesError}</div>
        </div>
      )}

      {selectedProject && (
        <div className="content projects-content">
          <aside className="panel sidebar left">
            <div className="sidebar-section">
              <div className="panel-header">
                <h2>{formatScopeLabel(selectedProject)}</h2>
                <p>Project overview</p>
              </div>
              <div className="projects-stats-inline">
                <div className="projects-stat-inline">
                  <span className="projects-stat-value-sm">{stats.entryCount}</span>
                  <span className="projects-stat-label-sm">Entries</span>
                </div>
                <div className="projects-stat-inline">
                  <span className="projects-stat-value-sm">{stats.openTasks}</span>
                  <span className="projects-stat-label-sm">Open</span>
                </div>
                <div className="projects-stat-inline">
                  <span className="projects-stat-value-sm">{stats.completedTasks}</span>
                  <span className="projects-stat-label-sm">Done</span>
                </div>
              </div>
            </div>

            <div className="sidebar-section">
              <div className="panel-header">
                <h3>Chats</h3>
                <p>Project conversations</p>
              </div>
              <div className="chat-sidebar-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleNewChat}
                  disabled={!selectedProject}
                >
                  New chat
                </button>
              </div>
              {chatSessionsStatus === "loading" && (
                <div className="sidebar-empty">Loading chats...</div>
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
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <ChatPanel
            title={activeChatTitle || "Project Chat"}
            subtitle={status === "streaming" ? "Streaming reply..." : `Context: ${formatScopeLabel(selectedProject)} entries`}
            history={history}
            status={status}
            streamingId={streamingId}
            input={input}
            onInputChange={handleInputChange}
            onSubmit={handleSubmit}
            error={error}
          />

          <aside className="panel sidebar right">
            <div className="sidebar-section">
              <div className="panel-header">
                <h3>Tasks</h3>
                <p>{stats.openTasks} open / {stats.totalTasks} total</p>
              </div>

              {tasksStatus === "loading" && (
                <div className="sidebar-empty">Loading tasks...</div>
              )}

              {tasksStatus === "ready" && tasks.length === 0 && (
                <div className="sidebar-empty">No tasks yet for this project.</div>
              )}

              {tasksStatus === "ready" && openTasks.length > 0 && (
                <div className="projects-task-list">
                  <div className="projects-task-group-label">Open</div>
                  {openTasks.slice(0, 8).map((task) => (
                    <div key={task.id} className="projects-task-item">
                      <span className="projects-task-checkbox" />
                      <span className="projects-task-text">{task.text}</span>
                    </div>
                  ))}
                  {openTasks.length > 8 && (
                    <div className="projects-task-more">+{openTasks.length - 8} more</div>
                  )}
                </div>
              )}

              {tasksStatus === "ready" && completedTasks.length > 0 && (
                <div className="projects-task-list">
                  <div className="projects-task-group-label">Completed</div>
                  {completedTasks.slice(0, 5).map((task) => (
                    <div key={task.id} className="projects-task-item completed">
                      <span className="projects-task-checkbox checked" />
                      <span className="projects-task-text">{task.text}</span>
                    </div>
                  ))}
                  {completedTasks.length > 5 && (
                    <div className="projects-task-more">+{completedTasks.length - 5} more</div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {!selectedProject && scopesStatus === "ready" && (
        <div className="content">
          <div className="projects-empty-state">
            <p>No projects found. Create one to get started.</p>
            <button className="button" type="button" onClick={handleNewProject}>
              + New Project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
