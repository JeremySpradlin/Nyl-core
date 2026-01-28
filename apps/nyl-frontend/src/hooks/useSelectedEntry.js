import { useCallback, useEffect, useRef, useState } from "react";

const formatApiDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function useSelectedEntry({ apiBase, scope, date, includeDeleted }) {
  const [entry, setEntry] = useState(null);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const fetchEntry = useCallback(async () => {
    if (!scope || !date) {
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
        `${apiBase}/v1/journal/entries/by-date?scope=${encodeURIComponent(
          scope
        )}&date=${formatApiDate(date)}&include_deleted=${includeDeleted ? "true" : "false"}`,
        { signal: controller.signal }
      );
      if (response.status === 404) {
        setEntry(null);
        setState("missing");
        return;
      }
      if (!response.ok) {
        throw new Error("Could not load entry.");
      }
      const data = await response.json();
      setEntry(data);
      setState("ready");
    } catch (err) {
      if (err.name === "AbortError") {
        return;
      }
      setEntry(null);
      setState("error");
      setError(err.message || "Failed to load entry.");
    }
  }, [apiBase, scope, date, includeDeleted]);

  useEffect(() => {
    fetchEntry();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchEntry]);

  return {
    entry,
    setEntry,
    status: state,
    error,
    refetch: fetchEntry
  };
}
