export default function TopNav({ label, onHome, onJournal, onOpenSettings }) {
  return (
    <div className="top-nav">
      <div className="top-nav-brand">
        <span className="titlebar-mark">Nyl</span>
        <span className="titlebar-dot">{label}</span>
      </div>
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
        <a
          className="nav-link"
          href="http://jupyter.local"
          target="_blank"
          rel="noopener noreferrer"
        >
          Jupyter
        </a>
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
