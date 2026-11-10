# Schedule module

## Data model

`Schedule` documents belong to the authenticated `userId` and contain a title, category, description, local start date and time, all-day flag, location, notes, timezone, status, and recurrence rule. A recurring activity is stored once as a series. Date-specific changes are stored in its `occurrences` array; an exception can override event details/status, cancel one date, or represent a moved occurrence. Indexes support user/date and user/recurrence lookups.

The model does not create separate records for generated occurrences. APIs expand a series only over the requested range (maximum 367 days). Monthly events on days missing from a month (such as the 31st in February) are skipped.

## API

All routes are mounted at `/api/schedules` after the app's existing cookie-session authentication and CSRF origin check. Ownership comes from the session; request bodies reject ownership fields.

| Method and path | Purpose |
| --- | --- |
| `GET /?from=YYYY-MM-DD&to=YYYY-MM-DD` | Expand and paginate occurrences; supports `search`, `category`, `status`, `recurring`, `page`, and `limit`; includes matching summary counts and planned minutes |
| `GET /conflicts?date=...&startTime=...&endTime=...` | Check overlap on a date; accepts `allDay=true` and `excludeId` |
| `POST /` | Create a one-time or recurring series |
| `PUT /:id?date=...&mode=occurrence\|future\|series` | Edit one occurrence, split a series from a date, or edit the series |
| `PATCH /:id/status` | Set an occurrence to `pending`, `completed`, or `skipped` |
| `DELETE /:id?date=...&mode=occurrence\|future\|series` | Cancel one occurrence, truncate future occurrences, or delete a series |

## Recurrence and timezones

Dates and times are stored as local calendar values, with the user's timezone captured on the series (default `Asia/Kolkata`). This keeps recurring wall-clock times stable across date boundaries and avoids expanding series into timestamp records. Recurrence supports daily, weekly, monthly, and selected weekdays with an optional end date. Overnight events are rejected. Editing or deleting from the future truncates the original series before the selected date; earlier occurrences remain available.

## Conflict detection

The planner checks the selected event date before saving. It warns about overlapping timed events and any all-day event, excludes the series being edited, and lets the user choose to save anyway. A recurring event is checked across generated dates through its repeat-until date, capped at one year for an unbounded rule.

## Reminders

The app has no backend scheduler or notification delivery service. The form states that reminders are unavailable; no reminder is promised or stored. Scheduled delivery would require a durable job queue/worker, per-user timezone handling, and deduplication/cancellation tied to series exceptions.

## Frontend structure

`frontend/src/Schedule.jsx` contains the Schedule route UI, date navigation, view controls, filters, occurrence actions, and form/detail dialogs. `frontend/src/Schedule.css` contains responsive and theme-aware styles. The existing `App.jsx` sidebar and routes expose the module.
