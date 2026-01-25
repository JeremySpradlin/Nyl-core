const formatTimestamp = (value) => {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
};

export default function ChatMessage({ label, timestamp, variant, isLive, children }) {
  const timeLabel = formatTimestamp(timestamp);
  return (
    <div className={`chat-bubble ${variant}${isLive ? " live" : ""}`}>
      <div className="chat-label">
        <span>{label}</span>
        {timeLabel && <span className="chat-timestamp">{timeLabel}</span>}
      </div>
      {children}
    </div>
  );
}
