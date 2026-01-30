import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TopNav from "../components/TopNav.jsx";
import useEntryList from "../hooks/useEntryList.js";
import useJournalSelection from "../hooks/useJournalSelection.js";
import useSelectedEntry from "../hooks/useSelectedEntry.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const AUTOSAVE_DELAY_MS = 900;

const DEFAULT_DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: []
    }
  ]
};

const formatDisplayDate = (date) =>
  date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

const formatApiDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseApiDateString = (value) => {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
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

const formatScopeLabel = (scope) => {
  if (scope === "daily") {
    return "Daily journal";
  }
  if (!scope.startsWith("project:")) {
    return scope;
  }
  const slug = scope.replace("project:", "");
  if (!slug) {
    return "Project journal";
  }
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

const isSameDoc = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function JournalPage({ location, onNavigate }) {
  const { selectedDate, selectedScope, setSelection } = useJournalSelection(
    location,
    onNavigate
  );
  const [projectScopes, setProjectScopes] = useState([]);
  const [entriesFilter, setEntriesFilter] = useState("active");
  const [draftId, setDraftId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState(DEFAULT_DOC);
  const [draftIsDeleted, setDraftIsDeleted] = useState(false);
  const [draftStatus, setDraftStatus] = useState("idle");
  const [draftError, setDraftError] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskInput, setTaskInput] = useState("");
  const [taskStatus, setTaskStatus] = useState("idle");
  const [taskError, setTaskError] = useState("");
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef({ title: "", body: DEFAULT_DOC });
  const isSettingContentRef = useRef(false);
  const hydratedRef = useRef({ id: null, body: DEFAULT_DOC });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true
        }
      })
    ],
    content: DEFAULT_DOC,
    onUpdate: ({ editor: currentEditor }) => {
      if (isSettingContentRef.current) {
        return;
      }
      setDraftBody(currentEditor.getJSON());
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

  const {
    entries,
    status: entriesStatus,
    error: entriesError,
    refetch: refetchEntries,
    upsertEntry,
    removeEntry
  } = useEntryList({ apiBase: API_BASE, scope: selectedScope, status: entriesFilter });

  const {
    entry: selectedEntry,
    setEntry: setSelectedEntry,
    status: selectedEntryStatus,
    error: selectedEntryError
  } = useSelectedEntry({
    apiBase: API_BASE,
    scope: selectedScope,
    date: selectedDate,
    includeDeleted: entriesFilter === "deleted"
  });

  const scopeOptions = useMemo(() => ["daily", ...projectScopes], [projectScopes]);

  useEffect(() => {
    if (selectedScope.startsWith("project:") && !projectScopes.includes(selectedScope)) {
      setProjectScopes((prev) => [selectedScope, ...prev]);
    }
  }, [selectedScope, projectScopes]);

  const loadProjectScopes = useCallback(async () => {
    const stored = JSON.parse(window.localStorage.getItem("nyl-project-scopes") || "[]");
    const storedProjects = Array.isArray(stored) ? stored : [];
    try {
      const response = await fetch(`${API_BASE}/v1/journal/scopes`);
      if (!response.ok) {
        throw new Error("Could not load project scopes.");
      }
      const data = await response.json();
      const apiScopes = Array.isArray(data) ? data : [];
      const projects = apiScopes.filter((scope) => scope.startsWith("project:"));
      const merged = Array.from(new Set([...projects, ...storedProjects]));
      setProjectScopes(merged);
    } catch (err) {
      if (storedProjects.length) {
        setProjectScopes(storedProjects);
      } else {
        setProjectScopes([]);
      }
    }
  }, []);

  useEffect(() => {
    loadProjectScopes();
  }, [loadProjectScopes]);

  useEffect(() => {
    window.localStorage.setItem("nyl-project-scopes", JSON.stringify(projectScopes));
  }, [projectScopes]);

  useEffect(() => {
    if (!selectedEntry) {
      if (selectedEntryStatus === "missing") {
        setDraftId(null);
        setDraftTitle("");
        setDraftBody(DEFAULT_DOC);
        setDraftIsDeleted(false);
        lastSavedRef.current = { title: "", body: DEFAULT_DOC };
        setDraftStatus("idle");
        setDraftSavedAt(null);
        setDraftError("");
        if (editor) {
          isSettingContentRef.current = true;
          editor.commands.setContent(DEFAULT_DOC, false);
          isSettingContentRef.current = false;
        }
      }
      return;
    }
    const nextTitle = selectedEntry.title || "";
    const nextBody = normalizeDoc(selectedEntry.body);
    const nextDeleted = Boolean(selectedEntry.is_deleted);
    const shouldHydrate =
      hydratedRef.current.id !== selectedEntry.id ||
      !isSameDoc(hydratedRef.current.body, nextBody);
    const isSameEntry = hydratedRef.current.id === selectedEntry.id;
    setDraftId(selectedEntry.id);
    setDraftTitle(nextTitle);
    setDraftBody(nextBody);
    setDraftIsDeleted(nextDeleted);
    lastSavedRef.current = { title: nextTitle, body: nextBody };
    setDraftStatus("saved");
    if (!isSameEntry) {
      setDraftSavedAt(null);
    }
    setDraftError("");
    if (editor && shouldHydrate) {
      isSettingContentRef.current = true;
      editor.commands.setContent(nextBody, false);
      isSettingContentRef.current = false;
      hydratedRef.current = { id: selectedEntry.id, body: nextBody };
    }
  }, [selectedEntry, selectedEntryStatus, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!draftIsDeleted);
    }
  }, [editor, draftIsDeleted]);

  useEffect(() => {
    if (!draftId || draftIsDeleted) {
      setTasks([]);
      setTaskInput("");
      setTaskStatus("idle");
      setTaskError("");
      return;
    }
    const current = { title: draftTitle, body: draftBody };
    const last = lastSavedRef.current;
    const isSame = current.title === last.title && isSameDoc(current.body, last.body);
    if (isSame) {
      if (draftStatus !== "saved") {
        setDraftStatus("saved");
      }
      return;
    }
    setDraftStatus("saving");
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      try {
        const response = await fetch(`${API_BASE}/v1/journal/entries/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draftTitle || null,
            body: draftBody
          })
        });
        if (response.status === 204) {
          lastSavedRef.current = { title: "", body: DEFAULT_DOC };
          setDraftId(null);
          setDraftTitle("");
          setDraftBody(DEFAULT_DOC);
          setDraftStatus("saved");
          setDraftSavedAt(new Date());
          removeEntry(draftId);
          setSelectedEntry(null);
          return;
        }
        if (!response.ok) {
          throw new Error("Failed to save entry.");
        }
        const updated = await response.json();
        lastSavedRef.current = { title: updated.title || "", body: normalizeDoc(updated.body) };
        setDraftSavedAt(new Date());
        setDraftStatus("saved");
        upsertEntry(updated);
      } catch (err) {
        setDraftStatus("error");
        setDraftError(err.message || "Failed to save entry.");
      }
    }, AUTOSAVE_DELAY_MS);
  }, [
    draftId,
    draftIsDeleted,
    draftTitle,
    draftBody,
    removeEntry,
    setSelectedEntry,
    upsertEntry
  ]);

  useEffect(() => {
    if (!draftId || draftIsDeleted) {
      return;
    }
    let isActive = true;
    const loadTasks = async () => {
      setTasks([]);
      setTaskStatus("loading");
      setTaskError("");
      try {
        const response = await fetch(`${API_BASE}/v1/journal/entries/${draftId}/tasks`);
        if (!response.ok) {
          throw new Error("Failed to load tasks.");
        }
        const data = await response.json();
        if (!isActive) {
          return;
        }
        setTasks(Array.isArray(data) ? data : []);
        setTaskStatus("ready");
      } catch (err) {
        if (!isActive) {
          return;
        }
        setTasks([]);
        setTaskStatus("error");
        setTaskError(err.message || "Failed to load tasks.");
      }
    };
    loadTasks();
    return () => {
      isActive = false;
    };
  }, [draftId, draftIsDeleted]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  const handleSelectScope = (scope) => {
    setSelection(scope, selectedDate);
  };

  const handleSelectEntry = (entry) => {
    const entryDate = parseApiDateString(entry.journal_date) || new Date(entry.journal_date);
    setSelection(entry.scope, entryDate);
  };

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
    setSelection(scope, selectedDate);
  };

  const handleCreateEntry = async () => {
    setDraftStatus("saving");
    setDraftError("");
    try {
      const response = await fetch(`${API_BASE}/v1/journal/entries/ensure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journal_date: formatApiDate(selectedDate),
          scope: selectedScope,
          title: draftTitle || null,
          body: draftBody,
          tags: null
        })
      });
      if (!response.ok) {
        throw new Error("Failed to create entry.");
      }
      const entry = await response.json();
      setSelectedEntry(entry);
      upsertEntry(entry);
    } catch (err) {
      setDraftStatus("error");
      setDraftError(err.message || "Failed to create entry.");
    }
  };

  const handleDeleteEntry = async () => {
    if (!draftId) {
      return;
    }
    const confirmed = window.confirm("Move this entry to trash?");
    if (!confirmed) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/v1/journal/entries/${draftId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error("Failed to delete entry.");
      }
      removeEntry(draftId);
      setSelectedEntry(null);
      setDraftId(null);
      setDraftTitle("");
      setDraftBody(DEFAULT_DOC);
      setDraftIsDeleted(false);
      setDraftStatus("idle");
      setDraftSavedAt(null);
      setTasks([]);
    } catch (err) {
      setDraftError(err.message || "Failed to delete entry.");
    }
  };

  const handleRestoreEntry = async () => {
    if (!draftId) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/v1/journal/entries/${draftId}/restore`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to restore entry.");
      }
      const entry = await response.json();
      setEntriesFilter("active");
      setSelectedEntry(entry);
      upsertEntry(entry);
      setSelection(entry.scope, parseApiDateString(entry.journal_date) || selectedDate);
    } catch (err) {
      setDraftError(err.message || "Failed to restore entry.");
    }
  };

  const handleCreateTask = async () => {
    const text = taskInput.trim();
    if (!text || !draftId) {
      return;
    }
    setTaskError("");
    try {
      const response = await fetch(`${API_BASE}/v1/journal/entries/${draftId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) {
        throw new Error("Failed to create task.");
      }
      const task = await response.json();
      setTasks((prev) => [...prev, task]);
      setTaskInput("");
      setTaskStatus("ready");
    } catch (err) {
      setTaskError(err.message || "Failed to create task.");
    }
  };

  const handleToggleTask = async (taskId, done) => {
    try {
      const response = await fetch(`${API_BASE}/v1/journal/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done })
      });
      if (!response.ok) {
        throw new Error("Failed to update task.");
      }
      const updated = await response.json();
      setTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
    } catch (err) {
      setTaskError(err.message || "Failed to update task.");
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      const response = await fetch(`${API_BASE}/v1/journal/tasks/${taskId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error("Failed to delete task.");
      }
      setTasks((prev) => prev.filter((task) => task.id !== taskId));
    } catch (err) {
      setTaskError(err.message || "Failed to delete task.");
    }
  };

  const statusLabel = useMemo(() => {
    if (draftStatus === "saving") return "Saving...";
    if (draftStatus === "error") return "Save failed";
    if (draftStatus === "saved") return "Saved";
    return "Draft";
  }, [draftStatus]);

  const savedLabel = useMemo(() => {
    if (!draftSavedAt) return "";
    return `Saved at ${draftSavedAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    })}`;
  }, [draftSavedAt]);

  const selectedEntryId = selectedEntry?.id || draftId;
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.done !== b.done) {
        return a.done ? 1 : -1;
      }
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.created_at.localeCompare(b.created_at);
    });
  }, [tasks]);
  const openTaskCount = sortedTasks.filter((task) => !task.done).length;

  return (
    <div className="page">
      <TopNav label="Journal" onHome={() => onNavigate("/")} />
      <div className="content journal-page">
        <aside className="panel journal-sidebar">
          <div className="panel-header">
            <h2>Projects</h2>
            <p>Select a journal scope.</p>
          </div>
          <button className="button button-secondary" type="button" onClick={handleNewProject}>
            New project
          </button>
          <div className="project-list">
            {scopeOptions.map((scope) => (
              <button
                key={scope}
                type="button"
                className={`project-item${selectedScope === scope ? " active" : ""}`}
                onClick={() => handleSelectScope(scope)}
              >
                {formatScopeLabel(scope)}
              </button>
            ))}
            {scopeOptions.length === 0 && (
              <div className="sidebar-empty">No projects yet.</div>
            )}
          </div>

          <div className="panel-header journal-entries-header">
            <h3>Entries</h3>
            <div className="filter-tabs">
              <button
                className={`filter-tab${entriesFilter === "active" ? " active" : ""}`}
                type="button"
                onClick={() => setEntriesFilter("active")}
              >
                Active
              </button>
              <button
                className={`filter-tab${entriesFilter === "deleted" ? " active" : ""}`}
                type="button"
                onClick={() => setEntriesFilter("deleted")}
              >
                Trash
              </button>
            </div>
          </div>
          {entriesStatus === "loading" && (
            <div className="sidebar-empty">Loading entries...</div>
          )}
          {entriesStatus === "error" && (
            <div className="error">{entriesError || "Failed to load entries."}</div>
          )}
          {entriesStatus === "ready" && entries.length === 0 && (
            <div className="sidebar-empty">No entries yet.</div>
          )}
          <div className="journal-entry-list">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`journal-entry-item${
                  selectedEntryId === entry.id ? " active" : ""
                }${entry.is_deleted ? " is-deleted" : ""}`}
                onClick={() => handleSelectEntry(entry)}
              >
                <div className="journal-entry-row">
                  <span className="journal-entry-date">
                    {formatDisplayDate(
                      parseApiDateString(entry.journal_date) || new Date(entry.journal_date)
                    )}
                  </span>
                  <span className="journal-entry-title">
                    {entry.title || "Untitled entry"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>
        <section className="panel journal-editor-shell">
          <div className="panel-header journal-editor-header">
            <div>
              <h2>{formatDisplayDate(selectedDate)}</h2>
              <p>{formatScopeLabel(selectedScope)}</p>
            </div>
            <div className="journal-status">
              <span className={`journal-pill journal-${draftStatus}`}>{statusLabel}</span>
              {savedLabel && <span className="journal-meta">{savedLabel}</span>}
              {draftId && !draftIsDeleted && (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleDeleteEntry}
                >
                  Delete
                </button>
              )}
              {draftId && draftIsDeleted && (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleRestoreEntry}
                >
                  Restore
                </button>
              )}
            </div>
          </div>
          {selectedEntryStatus === "error" && (
            <div className="error">{selectedEntryError || "Failed to load entry."}</div>
          )}
          {selectedEntryStatus === "missing" && entriesFilter === "active" && (
            <div className="journal-notice">
              No entry exists for this day yet. Create it to start writing.
            </div>
          )}
          <div className="journal-editor-grid">
            <div className="journal-editor-main">
              <label className="journal-field">
                <span className="journal-label">Title</span>
                <input
                  className="journal-input"
                  type="text"
                  placeholder="Give the day a headline"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  disabled={draftIsDeleted}
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
                    disabled={!editor?.can().chain().focus().toggleBold().run() || draftIsDeleted}
                    aria-pressed={editor?.isActive("bold") || false}
                  >
                    B
                  </button>
              <button
                type="button"
                className={`journal-tool${editor?.isActive("italic") ? " active" : ""}`}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                disabled={!editor?.can().chain().focus().toggleItalic().run() || draftIsDeleted}
                aria-pressed={editor?.isActive("italic") || false}
              >
                I
              </button>
              <button
                type="button"
                className={`journal-tool${editor?.isActive("heading", { level: 2 }) ? " active" : ""}`}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                disabled={draftIsDeleted}
                aria-pressed={editor?.isActive("heading", { level: 2 }) || false}
              >
                H2
              </button>
              <button
                type="button"
                className={`journal-tool${editor?.isActive("heading", { level: 3 }) ? " active" : ""}`}
                onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                disabled={draftIsDeleted}
                aria-pressed={editor?.isActive("heading", { level: 3 }) || false}
              >
                H3
              </button>
              <button
                type="button"
                className={`journal-tool${editor?.isActive("bulletList") ? " active" : ""}`}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                disabled={draftIsDeleted}
                aria-pressed={editor?.isActive("bulletList") || false}
              >
                List
              </button>
              <button
                type="button"
                className={`journal-tool${editor?.isActive("orderedList") ? " active" : ""}`}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                disabled={draftIsDeleted}
                aria-pressed={editor?.isActive("orderedList") || false}
              >
                Ordered
              </button>
              <button
                type="button"
                className={`journal-tool${editor?.isActive("codeBlock") ? " active" : ""}`}
                onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                disabled={draftIsDeleted}
                aria-pressed={editor?.isActive("codeBlock") || false}
              >
                Code
              </button>
              <button
                type="button"
                className={`journal-tool${editor?.isActive("blockquote") ? " active" : ""}`}
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                disabled={draftIsDeleted}
                aria-pressed={editor?.isActive("blockquote") || false}
              >
                Quote
              </button>
                </div>
                <div className="journal-editor">
                  <EditorContent editor={editor} />
                </div>
              </div>
            </div>
            <aside className="journal-editor-side">
              <div className="journal-field journal-tasks-section">
                <div className="journal-tasks-header">
                  <span className="journal-label">Tasks</span>
                  <span className="journal-tasks-meta">
                    {openTaskCount} open / {sortedTasks.length} total
                  </span>
                </div>
                {!draftId && (
                  <div className="journal-tasks-empty">
                    Create the entry to add tasks.
                  </div>
                )}
                {draftId && !draftIsDeleted && (
                  <div className="journal-tasks">
                    {taskStatus === "loading" && (
                      <div className="journal-tasks-empty">Loading tasks...</div>
                    )}
                    {taskStatus === "ready" && sortedTasks.length === 0 && (
                      <div className="journal-tasks-empty">No tasks yet.</div>
                    )}
                    {sortedTasks.map((task) => (
                      <label key={task.id} className="journal-task">
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={(event) => handleToggleTask(task.id, event.target.checked)}
                        />
                        <span className={`journal-task-text${task.done ? " done" : ""}`}>
                          {task.text}
                        </span>
                        <button
                          type="button"
                          className="icon-button journal-task-delete"
                          aria-label="Delete task"
                          onClick={() => handleDeleteTask(task.id)}
                        >
                          ✕
                        </button>
                      </label>
                    ))}
                    <div className="journal-task-input">
                      <input
                        className="journal-input"
                        type="text"
                        placeholder="Add a task"
                        value={taskInput}
                        onChange={(event) => setTaskInput(event.target.value)}
                        disabled={!draftId || draftIsDeleted}
                      />
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={handleCreateTask}
                        disabled={!draftId || draftIsDeleted || !taskInput.trim()}
                      >
                        Add
                      </button>
                    </div>
                    {taskError && <div className="error">{taskError}</div>}
                  </div>
                )}
                {draftId && draftIsDeleted && (
                  <div className="journal-tasks-empty">Restore the entry to edit tasks.</div>
                )}
              </div>
            </aside>
          </div>
          {!draftId && entriesFilter === "active" && (
            <div className="journal-create">
              <p className="journal-create-text">
                This entry is empty. Create it to start saving.
              </p>
              <button className="button" type="button" onClick={handleCreateEntry}>
                Create entry
              </button>
            </div>
          )}
          {draftError && <div className="error">{draftError}</div>}
        </section>
      </div>
    </div>
  );
}
