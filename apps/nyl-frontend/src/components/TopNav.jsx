export default function TopNav({ label, onHome, onJournal, onProjects, onObsidian, onOpenSettings, children }) {
  return (
    <div className="top-nav">
      <div className="top-nav-brand">
        <span className="titlebar-mark">Nyl</span>
        <span className="titlebar-dot">{label}</span>
      </div>
      {children && <div className="top-nav-center">{children}</div>}
      <div className="top-nav-links">
        {onHome && (
          <button className="nav-link" type="button" onClick={onHome}>
            Home
          </button>
        )}
        {onJournal && (
          <button className="nav-link" type="button" onClick={onJournal}>
            Journal
          </button>
        )}
        {onProjects && (
          <button className="nav-link" type="button" onClick={onProjects}>
            Projects
          </button>
        )}
        {onObsidian && (
          <button className="nav-link" type="button" onClick={onObsidian}>
            Obsidian
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            className="icon-button"
            aria-label="Open settings"
            onClick={onOpenSettings}
          >
            <span aria-hidden="true">⚙</span>
          </button>
        )}
      </div>
    </div>
  );
}
