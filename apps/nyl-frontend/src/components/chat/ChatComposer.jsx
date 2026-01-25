export default function ChatComposer({ value, onChange, onSubmit, disabled }) {
  return (
    <form className="composer" onSubmit={onSubmit}>
      <input
        className="input"
        value={value}
        onChange={onChange}
        placeholder="Ask Nyl to plan, organize, or reflect..."
        aria-label="Chat message"
        autoFocus
      />
      <button className="button" type="submit" disabled={disabled}>
        Send
      </button>
    </form>
  );
}
