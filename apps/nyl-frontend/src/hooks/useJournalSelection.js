import { useCallback, useMemo } from "react";

const parseDateParam = (search) => {
  const params = new URLSearchParams(search);
  const raw = params.get("date");
  if (!raw) {
    return null;
  }
  const [year, month, day] = raw.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const parseScopeParam = (search) => {
  const params = new URLSearchParams(search);
  const raw = params.get("scope");
  if (!raw) {
    return "daily";
  }
  return raw.trim() || "daily";
};

const formatApiDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDate = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export default function useJournalSelection(location, onNavigate) {
  const selectedDate = useMemo(() => {
    const parsed = parseDateParam(location.search);
    return normalizeDate(parsed || new Date());
  }, [location.search]);

  const selectedScope = useMemo(() => parseScopeParam(location.search), [location.search]);

  const setSelection = useCallback(
    (scope, date) => {
      const nextDate = normalizeDate(date);
      onNavigate(`/journal?date=${formatApiDate(nextDate)}&scope=${scope}`);
    },
    [onNavigate]
  );

  return { selectedDate, selectedScope, setSelection };
}
