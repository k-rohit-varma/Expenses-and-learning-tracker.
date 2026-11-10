export const MINUTES_PER_DAY = 24 * 60;
export const TIMELINE_PIXELS_PER_MINUTE = 1.5;

export function dateKeyInTimezone(instant, timeZone) {
  const value = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(value.getTime())) throw new RangeError("Invalid instant.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function clockMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatLocalTime(value) {
  const minutes = clockMinutes(value);
  if (minutes === null) return "";
  const hour = Math.floor(minutes / 60);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function eventDurationMinutes(event) {
  if (event.allDay) return MINUTES_PER_DAY;
  const start = clockMinutes(event.startTime), end = clockMinutes(event.endTime);
  // Overnight ranges are not supported by the Schedule API.
  return start === null || end === null || end <= start ? 0 : end - start;
}

export function timelineLayout(events, pixelsPerMinute = TIMELINE_PIXELS_PER_MINUTE) {
  const timed = events.map((event) => ({
    event,
    start: clockMinutes(event.startTime),
    duration: eventDurationMinutes(event),
  })).filter(({ event, start, duration }) => !event.allDay && start !== null && duration > 0)
    .sort((a, b) => a.start - b.start || a.duration - b.duration || a.event.title.localeCompare(b.event.title));

  const laneEnds = [];
  for (const item of timed) {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) lane = laneEnds.length;
    item.lane = lane;
    laneEnds[lane] = item.start + item.duration;
  }
  const laneCount = Math.max(1, laneEnds.length);
  return timed.map(({ event, start, duration, lane }) => ({
    event,
    startMinute: start,
    durationMinutes: duration,
    lane,
    laneCount,
    top: start * pixelsPerMinute,
    height: duration * pixelsPerMinute,
    left: `${lane * (100 / laneCount)}%`,
    width: `${100 / laneCount}%`,
  }));
}
