import ChatMarkdown from "./ChatMarkdown";
import ChatMessage from "./ChatMessage";

export default function ChatStream({
  history,
  status,
  streamingId,
  emptyMessage,
  scrollRef,
  onScroll
}) {
  return (
    <div className="chat-stream" ref={scrollRef} onScroll={onScroll}>
      {history.length === 0 && (
        <div className="chat-empty">
          <p>{emptyMessage}</p>
        </div>
      )}
      {history.map((entry) => (
        <div key={entry.id} className="chat-pair">
          <ChatMessage label="You" timestamp={entry.createdAt} variant="user">
            <ChatMarkdown content={entry.user} />
          </ChatMessage>
          {(entry.assistant || (status === "streaming" && entry.id === streamingId)) && (
            <ChatMessage
              label="Nyl"
              timestamp={entry.assistantAt}
              variant="assistant"
              isLive={status === "streaming" && entry.id === streamingId}
            >
              {entry.assistant ? (
                <ChatMarkdown content={entry.assistant} />
              ) : (
                <div className="typing-indicator" aria-label="Nyl is typing">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </ChatMessage>
          )}
        </div>
      ))}
    </div>
  );
}
