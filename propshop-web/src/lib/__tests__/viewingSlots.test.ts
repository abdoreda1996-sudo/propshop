import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlot, slotFor, windowOf, describeSlot, clock12, VIEWING_WINDOWS } from "../viewingSlots";

test("exactly three windows: 11-14, 14-18, 18-21", () => {
  assert.deepEqual(
    VIEWING_WINDOWS.map((w) => [w.start, w.end]),
    [[11, 14], [14, 18], [18, 21]],
  );
});

test("a window start in winter is Cairo UTC+2", () => {
  const at = slotFor("2027-01-15", "11-14")!;
  assert.equal(at.toISOString(), "2027-01-15T09:00:00.000Z");
});

test("a window start in summer respects Egyptian DST (UTC+3)", () => {
  const at = slotFor("2027-07-15", "18-21")!;
  assert.equal(at.toISOString(), "2027-07-15T15:00:00.000Z");
});

test("round-trips through describeSlot", () => {
  for (const w of VIEWING_WINDOWS) {
    const d = describeSlot(slotFor("2027-03-10", w.key)!);
    assert.equal(d.date, "2027-03-10");
    assert.equal(d.window, w.key);
  }
});

test("rejects anything that is not a window start", () => {
  assert.equal(slotFor("2027-01-15", "9-11"), null);
  assert.equal(slotFor("15/01/2027", "11-14"), null);
  assert.equal(parseSlot("2027-01-15T10:00:00.000Z"), null); // 12:00 Cairo
  assert.equal(parseSlot("2027-01-15T09:30:00.000Z"), null); // 11:30 Cairo
  assert.equal(parseSlot("not a date"), null);
  assert.equal(parseSlot(42), null);
});

test("accepts both {date, window} and an ISO window start", () => {
  const a = parseSlot({ date: "2027-01-15", window: "14-18" })!;
  const b = parseSlot(a.toISOString())!;
  assert.equal(a.getTime(), b.getTime());
  assert.equal(windowOf(a)?.key, "14-18");
});

test("times are only ever shown on a 12-hour clock", () => {
  assert.equal(clock12(0, 0, false), "12 AM");
  assert.equal(clock12(12, 0, false), "12 PM");
  assert.equal(clock12(14, 30, false), "2:30 PM");
  assert.equal(clock12(21, 0, true), "9 م");
  for (const w of VIEWING_WINDOWS) assert.doesNotMatch(w.en + w.ar, /1[3-9]|2[0-3]/);
});
