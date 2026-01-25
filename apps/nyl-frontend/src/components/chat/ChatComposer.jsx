export default function ChatComposer({ value, onChange, onSubmit, disabled }) {
  const handleKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
      return;
    }
    if (!value.trim()) {
      return;
    }
    event.preventDefault();
    onSubmit(event);
  };

  return (
    <form className="composer" onSubmit={onSubmit}>
      <textarea
        className="input"
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        placeholder="Ask Nyl to plan, organize, or reflect..."
        aria-label="Chat message"
        autoFocus
        rows={2}
      />
      <button className="button" type="submit" disabled={disabled}>
        Send
      </button>
    </form>
  );
}
