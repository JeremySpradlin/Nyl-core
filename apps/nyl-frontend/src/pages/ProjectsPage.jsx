import { useCallback, useEffect, useMemo, useState } from "react";
import TopNav from "../components/TopNav.jsx";

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
  const [chatInput, setChatInput] = useState("");

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

  const handleChatSubmit = (e) => {
    e.preventDefault();
    // Mock - just clear input for now
    setChatInput("");
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
          <aside className="panel projects-sidebar-left">
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

            <div className="projects-section">
              <h3>Recent Entries</h3>
              {entriesStatus === "loading" && (
                <div className="projects-empty">Loading...</div>
              )}
              {entriesStatus === "error" && <div className="error">{entriesError}</div>}
              {entriesStatus === "ready" && recentEntries.length === 0 && (
                <div className="projects-empty">No entries yet.</div>
              )}
              {entriesStatus === "ready" && recentEntries.length > 0 && (
                <div className="projects-entries-list">
                  {recentEntries.map((entry) => (
                    <div key={entry.id} className="projects-entry-item">
                      <span className="projects-entry-date">
                        {formatDisplayDate(entry.journal_date)}
                      </span>
                      <span className="projects-entry-title">
                        {entry.title || "Untitled"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="panel projects-chat">
            <div className="panel-header">
              <h2>Project Chat</h2>
              <p>Ask questions about this project.</p>
            </div>
            <div className="chat-stream">
              <div className="chat-empty">
                Chat with context from your {formatScopeLabel(selectedProject)} entries. Coming soon.
              </div>
            </div>
            <form className="composer" onSubmit={handleChatSubmit}>
              <textarea
                className="input"
                placeholder="Ask about this project..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                rows={1}
              />
              <button className="button" type="submit" disabled={!chatInput.trim()}>
                Send
              </button>
            </form>
          </section>

          <aside className="panel projects-sidebar-right">
            <div className="panel-header">
              <h3>Tasks</h3>
              <p>{stats.openTasks} open / {stats.totalTasks} total</p>
            </div>

            {tasksStatus === "loading" && (
              <div className="projects-empty">Loading tasks...</div>
            )}

            {tasksStatus === "ready" && tasks.length === 0 && (
              <div className="projects-empty">No tasks yet for this project.</div>
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
