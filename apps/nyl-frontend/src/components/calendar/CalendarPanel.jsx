import { useEffect, useRef } from "react";
import { DayPicker } from "react-day-picker";

const MAX_MARKERS = 3;

const hashScope = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const colorForScope = (scope) => {
  if (scope === "daily") {
    return "var(--accent)";
  }
  const hue = hashScope(scope) % 360;
  return `hsl(${hue} 55% 60%)`;
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function CalendarPanel({
  selectedDate,
  onSelectDate,
  today,
  selectedLabel,
  markers = {},
  month,
  onMonthChange
}) {
  // Override DayButton to keep keyboard focus behavior while rendering marker bars.
  const DayButton = (props) => {
    const { day, modifiers, children, ...buttonProps } = props;
    const ref = useRef(null);
    useEffect(() => {
      if (modifiers?.focused) {
        ref.current?.focus();
      }
    }, [modifiers?.focused]);
    const key = formatDateKey(day.date);
    const entries = day.outside ? [] : markers[key] || [];
    const visible = entries.slice(0, MAX_MARKERS);
    const remaining = entries.length - visible.length;
    return (
      <button ref={ref} {...buttonProps}>
        <span className="calendar-day-content">
          <span className="calendar-day-number">{children}</span>
          {visible.length > 0 && (
            <span className="calendar-day-bars" aria-hidden="true">
              {visible.map((entry) => (
                <span
                  key={entry.scope}
                  className="calendar-day-bar"
                  style={{ background: colorForScope(entry.scope) }}
                  title={entry.scope}
                />
              ))}
              {remaining > 0 && (
                <span className="calendar-day-more" title={`${remaining} more`}>
                  +{remaining}
                </span>
              )}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="hero-card calendar-card">
      <div className="calendar-card-header">
        <div className="hero-card-title">Calendar</div>
      </div>
      <div className="calendar-body">
        <DayPicker
          mode="single"
          selected={selectedDate}
          onDayClick={onSelectDate}
          month={month}
          onMonthChange={onMonthChange}
          modifiers={{ future: { after: today }, today: today }}
          modifiersClassNames={{
            future: "calendar-future",
            today: "calendar-today"
          }}
          components={{ DayButton }}
        />
      </div>
      <div className="calendar-meta">Selected: {selectedLabel}</div>
    </div>
  );
}
