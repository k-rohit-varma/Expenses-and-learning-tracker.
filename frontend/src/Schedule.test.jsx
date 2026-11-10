// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Schedule from "./Schedule.jsx";
import { dateKeyInTimezone, eventDurationMinutes, formatLocalTime, timelineLayout } from "./scheduleTime.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function installApi(initialItems = []) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    const path = String(url); calls.push({ path, options });
    const payload = path.includes("/conflicts") ? { conflicts: [] } : path.endsWith("/schedules") ? { item: {} } : {
      items: initialItems, summary: { totalEvents: initialItems.length, completed: 0, remaining: initialItems.length, missed: 0, plannedMinutes: 45 }, pagination: { page: 1, limit: 100, total: initialItems.length, pages: 1 },
    };
    return { ok: true, status: 200, json: async () => payload };
  }));
  return calls;
}

describe("Schedule planner", () => {
  it("shows summary cards and supports date navigation and Day, Week, and Month views", async () => {
    const calls = installApi();
    render(<Schedule onToast={vi.fn()} settings={{ timezone: "Asia/Kolkata" }} />);
    expect(await screen.findByRole("heading", { name: "Daily timeline" })).toBeTruthy();
    expect(screen.getByText("Planned hours")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Select date"), { target: { value: "2026-11-12" } });
    await waitFor(() => expect(calls.some((call) => call.path.includes("from=2026-11-12"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(calls.some((call) => call.path.includes("from=2026-11-11"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls.filter((call) => call.path.includes("from=2026-11-12")).length).toBeGreaterThan(1));
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(await screen.findByRole("heading", { name: "Weekly overview" })).toBeTruthy();
    expect(document.querySelectorAll(".schedule-grid-day").length).toBe(7);
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(await screen.findByRole("heading", { name: "Monthly overview" })).toBeTruthy();
    expect(document.querySelectorAll(".schedule-grid-day").length).toBeGreaterThanOrEqual(28);
  });

  it("creates a schedule after checking for conflicts", async () => {
    const calls = installApi(), onToast = vi.fn();
    render(<Schedule onToast={onToast} />);
    fireEvent.click(await screen.findByRole("button", { name: /add schedule/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "DSA practice" } });
    fireEvent.click(screen.getAllByRole("button", { name: /add schedule/i }).at(-1));
    await waitFor(() => expect(calls.some((call) => call.path.includes("/schedules/conflicts"))).toBe(true));
    const createCall = calls.find((call) => call.path.endsWith("/schedules") && call.options.method === "POST");
    expect(createCall).toBeTruthy();
    expect(JSON.parse(createCall.options.body).title).toBe("DSA practice");
    await waitFor(() => expect(onToast).toHaveBeenCalledWith("Schedule added."));
  });

  it("edits the selected occurrence without sending presentation-only fields", async () => {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const calls = installApi([{ id: "schedule-id@" + date, seriesId: "schedule-id", occurrenceDate: date, title: "Editing test", description: "", category: "Work", startTime: "09:00", endTime: "09:45", allDay: false, location: "", notes: "", status: "pending", recurring: false, recurrence: { frequency: "none", weekdays: [], until: "" } }]);
    render(<Schedule onToast={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /editing test/i }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Updated title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.some((call) => call.options.method === "PUT")).toBe(true));
    const update = calls.find((call) => call.options.method === "PUT");
    expect(JSON.parse(update.options.body)).toMatchObject({ title: "Updated title", startDate: date });
    expect(JSON.parse(update.options.body)).not.toHaveProperty("seriesId");
  });

  it("positions event cards on their matching local clock markers with duration-scaled heights", async () => {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const events = [
      ["seven", "07:00", "08:00"],
      ["noon", "12:00", "13:00"],
      ["evening", "19:00", "20:00"],
      ["nine", "21:00", "21:30"],
      ["short", "15:15", "15:30"],
      ["quarter-hour", "10:30", "11:15"],
      ["long", "08:15", "10:15"],
      ["midnight", "23:30", "23:59"],
    ].map(([title, startTime, endTime]) => ({ id: `${title}@${date}`, seriesId: title, occurrenceDate: date, title, description: "", category: "Work", startTime, endTime, allDay: false, location: "", notes: "", status: "pending", recurring: false }));
    events.push({ id: `all-day@${date}`, seriesId: "all-day", occurrenceDate: date, title: "All-day meeting", description: "", category: "Appointments", startTime: "", endTime: "", allDay: true, location: "", notes: "", status: "pending", recurring: false });
    installApi(events);
    render(<Schedule onToast={vi.fn()} settings={{ timezone: "Asia/Kolkata" }} />);
    const seven = await screen.findByTestId("schedule-event-seven");
    const noon = screen.getByTestId("schedule-event-noon");
    const evening = screen.getByTestId("schedule-event-evening");
    const nine = screen.getByTestId("schedule-event-nine");
    expect(seven.style.top).toBe("630px");
    expect(screen.getByTestId("schedule-hour-07").style.top).toBe(seven.style.top);
    expect(seven.style.height).toBe("90px");
    expect(noon.style.top).toBe("1080px");
    expect(screen.getByTestId("schedule-hour-12").style.top).toBe(noon.style.top);
    expect(evening.style.top).toBe("1710px");
    expect(screen.getByTestId("schedule-hour-19").style.top).toBe(evening.style.top);
    expect(evening.style.height).toBe("90px");
    expect(nine.style.top).toBe("1890px");
    expect(screen.getByTestId("schedule-hour-21").style.top).toBe(nine.style.top);
    expect(nine.style.height).toBe("45px");
    expect(screen.getByTestId("schedule-event-short").style.height).toBe("15px");
    expect(screen.getByTestId("schedule-event-quarter-hour").style.height).toBe("45px");
    expect(screen.getByTestId("schedule-event-long").style.height).toBe("120px");
    expect(screen.getByTestId("schedule-event-midnight").style.top).toBe("1410px");
    expect(screen.getByTestId("schedule-all-day-all-day").textContent).toContain("All-day meeting");
    expect(screen.getByRole("button", { name: /evening, 07:00 PM to 08:00 PM/i })).toBeTruthy();
  });

  it("keeps wall-clock labels independent of host timezone and assigns overlapping events separate lanes", () => {
    expect(formatLocalTime("07:00")).toBe("07:00 AM");
    expect(formatLocalTime("12:00")).toBe("12:00 PM");
    expect(formatLocalTime("19:00")).toBe("07:00 PM");
    expect(formatLocalTime("21:00")).toBe("09:00 PM");
    const events = [
      { title: "A", startTime: "19:00", endTime: "20:00" },
      { title: "B", startTime: "19:30", endTime: "20:00" },
      { title: "C", startTime: "20:00", endTime: "20:15" },
      { title: "D", startTime: "10:30", endTime: "11:15" },
    ];
    const laidOut = timelineLayout(events);
    expect(Object.fromEntries(laidOut.map((x) => [x.event.title, x.lane]))).toEqual({ D: 0, A: 0, B: 1, C: 0 });
    expect(laidOut.every((x) => x.width === "50%")).toBe(true);
    expect(events.map(eventDurationMinutes)).toEqual([60, 30, 15, 45]);
    const instant = "2026-11-10T18:45:00.000Z";
    expect(dateKeyInTimezone(instant, "Asia/Kolkata")).toBe("2026-11-11");
    expect(dateKeyInTimezone(instant, "America/Los_Angeles")).toBe("2026-11-10");
  });
});
