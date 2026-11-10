// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Schedule from "./Schedule.jsx";

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
});
