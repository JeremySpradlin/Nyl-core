import { useCallback, useEffect, useRef, useState } from "react";

export default function useEntryList({ apiBase, scope, status }) {
  const [entries, setEntries] = useState([]);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const fetchEntries = useCallback(async () => {
    if (!scope) {
      return;
    }
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState("loading");
    setError("");
    try {
      const response = await fetch(
        `${apiBase}/v1/journal/entries?scope=${encodeURIComponent(
          scope
        )}&limit=200&status=${encodeURIComponent(status)}`,
        { signal: controller.signal }
      );
      if (!response.ok) {
        throw new Error("Could not load entries.");
      }
      const data = await response.json();
      setEntries(Array.isArray(data) ? data : []);
      setState("ready");
    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      setEntries([]);
      setState("error");
      setError(err.message || "Failed to load entries.");
    }
  }, [apiBase, scope, status]);

  useEffect(() => {
    fetchEntries();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchEntries]);

  const upsertEntry = useCallback((entry) => {
    setEntries((prev) => {
      const exists = prev.some((item) => item.id === entry.id);
      if (exists) {
        return prev.map((item) => (item.id === entry.id ? entry : item));
      }
      return [entry, ...prev];
    });
  }, []);

  const removeEntry = useCallback((entryId) => {
    setEntries((prev) => prev.filter((item) => item.id !== entryId));
  }, []);

  return {
    entries,
    status: state,
    error,
    refetch: fetchEntries,
    upsertEntry,
    removeEntry
  };
}
