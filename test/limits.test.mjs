import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFramePlan, DEFAULT_MAX_DURATION_SEC, DEFAULT_MAX_FRAMES } from "../src/limits.ts";

test("30s clip uses denser fps than a 10-minute clip", () => {
  const shortClip = computeFramePlan(30);
  const longClip = computeFramePlan(600);

  assert.ok(shortClip.fps > longClip.fps, `expected ${shortClip.fps} > ${longClip.fps}`);
  assert.ok(shortClip.maxFrames > 20);
  assert.equal(shortClip.width, 768);
});

test("600s clip is sparse and capped at 100 frames", () => {
  const plan = computeFramePlan(600);
  assert.ok(plan.maxFrames <= DEFAULT_MAX_FRAMES);
  assert.equal(plan.maxFrames, DEFAULT_MAX_FRAMES);
  assert.ok(plan.fps < 0.5);
  assert.equal(plan.width, 768);
});

test("rejects duration over 20 minutes unless a window fits", () => {
  assert.throws(
    () => computeFramePlan(DEFAULT_MAX_DURATION_SEC + 1),
    /20 min|20 minutes|--start|--end/i,
  );

  const windowed = computeFramePlan(DEFAULT_MAX_DURATION_SEC + 60, { start: 10, end: 70 });
  assert.equal(windowed.windowStartSec, 10);
  assert.equal(windowed.windowEndSec, 70);
  assert.ok(windowed.maxFrames <= DEFAULT_MAX_FRAMES);
});

test("rejects a window longer than 20 minutes", () => {
  assert.throws(
    () => computeFramePlan(3_600, { start: 0, end: DEFAULT_MAX_DURATION_SEC + 30 }),
    /20 min|20 minutes/i,
  );
});

test("rejects inverted or out-of-range windows", () => {
  assert.throws(() => computeFramePlan(30, { start: 20, end: 10 }), /--end|--start/i);
  assert.throws(() => computeFramePlan(30, { start: 40 }), /beyond|duration|--start/i);
  assert.throws(() => computeFramePlan(0), /duration/i);
});
