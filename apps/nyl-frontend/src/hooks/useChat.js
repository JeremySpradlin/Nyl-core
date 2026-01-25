import { useEffect, useRef, useState } from "react";

const MAX_HISTORY_TURNS = 12;

const parseSseEvents = (buffer) => {
  const events = [];
  const chunks = buffer.replace(/\r/g, "").split("\n\n");
  const remaining = chunks.pop() || "";

  for (const chunk of chunks) {
    if (!chunk.trim()) {
      continue;
    }
    const dataLines = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, ""));
    if (dataLines.length) {
      events.push(dataLines.join("\n"));
    }
  }

  return { events, remaining };
};

const buildMessages = (systemPrompt, history, userMessage) => {
  const messages = [];
  const recentHistory = history.slice(-MAX_HISTORY_TURNS);
  if (systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() });
  }
  recentHistory.forEach((entry) => {
    messages.push({ role: "user", content: entry.user });
    if (entry.assistant) {
      messages.push({ role: "assistant", content: entry.assistant });
    }
  });
  messages.push({ role: "user", content: userMessage });
  return messages;
};

const makeId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function useChat({ apiBase, systemPrompt, selectedModel }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [streamingId, setStreamingId] = useState(null);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const historyRef = useRef(history);
  const streamUpdateRef = useRef({ timer: null, text: "" });

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (streamUpdateRef.current.timer) {
        clearTimeout(streamUpdateRef.current.timer);
        streamUpdateRef.current.timer = null;
      }
    };
  }, []);

  const scheduleAssistantUpdate = (entryId, nextText) => {
    streamUpdateRef.current.text = nextText;
    if (streamUpdateRef.current.timer) {
      return;
    }
    streamUpdateRef.current.timer = setTimeout(() => {
      const text = streamUpdateRef.current.text;
      streamUpdateRef.current.timer = null;
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                assistant: text,
                assistantAt: entry.assistantAt || new Date()
              }
            : entry
        )
      );
    }, 40);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!input.trim() || !selectedModel || status === "streaming") {
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("streaming");
    setError("");

    const userMessage = input.trim();
    setInput("");

    const entryId = makeId();
    const newEntry = {
      id: entryId,
      user: userMessage,
      assistant: "",
      createdAt: new Date(),
      assistantAt: null
    };
    setHistory((prev) => [...prev, newEntry]);
    setStreamingId(newEntry.id);

    let assistantText = "";
    try {
      const payload = {
        model: selectedModel,
        messages: buildMessages(systemPrompt, historyRef.current, userMessage),
        stream: true,
        rag: { enabled: false, source: "trilium", top_k: 5 }
      };

      const response = await fetch(`${apiBase}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error("The chat stream could not be started.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSseEvents(buffer);
        buffer = remaining;

        for (const event of events) {
          if (event === "[DONE]") {
            continue;
          }
          let data;
          try {
            data = JSON.parse(event);
          } catch (parseError) {
            continue;
          }
          const delta = data?.choices?.[0]?.delta;
          if (!delta?.content) {
            continue;
          }
          assistantText += delta.content;
          scheduleAssistantUpdate(newEntry.id, assistantText);
        }
      }

      if (streamUpdateRef.current.timer) {
        clearTimeout(streamUpdateRef.current.timer);
        streamUpdateRef.current.timer = null;
      }
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                assistant: assistantText,
                assistantAt: entry.assistantAt || new Date()
              }
            : entry
        )
      );
      setStatus("idle");
      setStreamingId(null);
      abortRef.current = null;
    } catch (err) {
      if (streamUpdateRef.current.timer) {
        clearTimeout(streamUpdateRef.current.timer);
        streamUpdateRef.current.timer = null;
      }
      streamUpdateRef.current.text = "";
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, assistant: "", assistantAt: null } : entry
        )
      );
      if (err.name === "AbortError") {
        setStatus("idle");
        setStreamingId(null);
        abortRef.current = null;
        return;
      }
      setStatus("idle");
      setError(err.message || "Something went wrong.");
      setStreamingId(null);
      abortRef.current = null;
    }
  };

  return {
    history,
    input,
    setInput,
    status,
    streamingId,
    error,
    handleSubmit
  };
}
