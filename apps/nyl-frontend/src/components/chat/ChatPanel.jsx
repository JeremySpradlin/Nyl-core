import ChatComposer from "./ChatComposer";
import ChatStream from "./ChatStream";
import useAutoScroll from "../../hooks/useAutoScroll";

export default function ChatPanel({
  title,
  subtitle,
  history,
  status,
  streamingId,
  input,
  onInputChange,
  onSubmit,
  error
}) {
  const { scrollRef, onScroll } = useAutoScroll([history]);

  return (
    <section className="panel chat">
      <div className="panel-header">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <ChatStream
        history={history}
        status={status}
        streamingId={streamingId}
        emptyMessage="Start with a plan, a question, or a memory you want to capture."
        scrollRef={scrollRef}
        onScroll={onScroll}
      />
      <ChatComposer
        value={input}
        onChange={onInputChange}
        onSubmit={onSubmit}
        disabled={status === "streaming"}
      />
      {error && <div className="error">{error}</div>}
    </section>
  );
}
