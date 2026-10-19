import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTime, parseWatchArgs } from "../src/cli.ts";

test("parseTime accepts seconds and clock values", () => {
  assert.equal(parseTime("12"), 12);
  assert.equal(parseTime("12.5"), 12.5);
  assert.equal(parseTime("1:30"), 90);
  assert.equal(parseTime("1:02:03"), 3723);
});

test("parseWatchArgs handles doctor, status, and help", () => {
  assert.equal(parseWatchArgs("").kind, "help");
  assert.equal(parseWatchArgs("doctor").kind, "doctor");
  assert.equal(parseWatchArgs("status").kind, "status");
});

test("parseWatchArgs reads path and --start/--end", () => {
  const parsed = parseWatchArgs("--start 10 --end 1:00 ./talk.mp4");
  assert.equal(parsed.kind, "watch");
  assert.equal(parsed.source, "./talk.mp4");
  assert.equal(parsed.start, 10);
  assert.equal(parsed.end, 60);
});

test("parseWatchArgs supports equals flags and quoted paths", () => {
  const parsed = parseWatchArgs(`--start=2 --end=8 "/tmp/my clip.mp4"`);
  assert.equal(parsed.kind, "watch");
  assert.equal(parsed.source, "/tmp/my clip.mp4");
  assert.equal(parsed.start, 2);
  assert.equal(parsed.end, 8);
});

test("parseWatchArgs rejects unknown flags", () => {
  assert.throws(() => parseWatchArgs("clip.mp4 --foo"), /Unknown flag/);
});
