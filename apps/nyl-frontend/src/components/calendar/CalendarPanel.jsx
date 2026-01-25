import { DayPicker } from "react-day-picker";

export default function CalendarPanel({ selectedDate, onSelectDate, today, selectedLabel }) {
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
          modifiers={{ future: { after: today }, today: today }}
          modifiersClassNames={{
            future: "calendar-future",
            today: "calendar-today"
          }}
        />
      </div>
      <div className="calendar-meta">Selected: {selectedLabel}</div>
    </div>
  );
}
