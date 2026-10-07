import assert from "node:assert/strict";
import test from "node:test";
import { clockPartsFromTime, scheduleFieldsForInstant, scheduledForFromFields, timeFromClockParts } from "./scheduleTime.js";

test("schedule fields combine wall-clock date and time using the selected timezone", () => {
  assert.equal(scheduledForFromFields("2035-01-02", "09:30", "America/Los_Angeles"), "2035-01-02T17:30:00.000Z");
  assert.deepEqual(scheduleFieldsForInstant("2035-01-02T17:30:00.000Z", "America/Los_Angeles"), { date: "2035-01-02", time: "09:30" });
});

test("schedule fields preserve daylight-saving offsets and reject nonexistent wall-clock times", () => {
  assert.equal(scheduledForFromFields("2035-07-02", "09:30", "America/Los_Angeles"), "2035-07-02T16:30:00.000Z");
  assert.equal(scheduledForFromFields("2035-03-11", "02:30", "America/Los_Angeles"), null);
});

test("clock controls convert 12-hour AM and PM choices to 24-hour scheduling time", () => {
  assert.equal(timeFromClockParts("12", "05", "AM"), "00:05");
  assert.equal(timeFromClockParts("12", "05", "PM"), "12:05");
  assert.equal(timeFromClockParts("07", "51", "PM"), "19:51");
  assert.deepEqual(clockPartsFromTime("19:51"), { hour: "07", minute: "51", period: "PM" });
});

test("invalid and missing calendar or clock fields are rejected", () => {
  assert.equal(scheduledForFromFields("2035-02-30", "12:00", "UTC"), null);
  assert.equal(scheduledForFromFields("2035-02-28", "25:00", "UTC"), null);
  assert.equal(scheduledForFromFields("", "12:00", "UTC"), null);
});
