/**
 * The fee copy, swept across the whole source tree.
 *
 * WHY THIS EXISTS: when the fee model changed from "split between the two sides" to "each
 * side pays it in full", the sanctioned strings in fees.ts were updated and two other
 * places were missed — the home hero (i18n.ts) and the Deal Room's note. Both kept telling
 * customers the fee was halved. Unit tests on fees.ts could not catch that, because the
 * wrong sentences did not live in fees.ts.
 *
 * So this test does not test a function. It greps the rendered copy for wording that
 * contradicts the current model, anywhere it appears. Any new screen that describes the
 * fee is covered the moment it is written, without anyone remembering to add a test.
 *
 * If the fee model changes again, update FORBIDDEN — and the failures will list every
 * screen that still needs rewording.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

/**
 * Phrases that were true under the old shared-fee model and are false now.
 *
 * Deliberately narrow: each one is a claim about how the fee divides, not a general word.
 * A pattern that also matched innocent prose would train people to ignore this test.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /split evenly between/i, why: "the fee is not split — each side pays it in full" },
  { pattern: /half each/i, why: "each side pays the whole band fee, not half" },
  { pattern: /each side pays half/i, why: "each side pays the whole band fee" },
  { pattern: /pays the other half/i, why: "there is no other half; the seller pays the same amount" },
  { pattern: /مقسوم بالنص/, why: "الرسم مش مقسوم — كل طرف بيدفعه كامل" },
  { pattern: /بيتقسم بالنص/, why: "الرسم مش مقسوم — كل طرف بيدفعه كامل" },
  { pattern: /نص ونص/, why: "كل طرف بيدفع الرسم كامل" },
  // 2026-10-02: the fee became flat by unit type. Any mention of price bands or a cap is
  // now describing a schedule that no longer exists.
  { pattern: /by price band/i, why: "the fee is by unit type now, not by price band" },
  { pattern: /شريحة السعر/, why: "الرسم بقى حسب نوع الوحدة، مش شريحة السعر" },
  { pattern: /500,000 per side|٥٠٠ ألف جنيه لكل طرف/, why: "there is no 500k cap any more — the top fee is 100k per side" },
  {
    // The cap is per side now, so the unqualified claim understates it by half.
    pattern: /capped at EGP 500,000 however large/i,
    why: "the cap is 500,000 PER SIDE — a large deal carries a million",
  },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Test files describe the old model on purpose, to assert it is gone.
      if (entry === "__tests__") continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test("no screen still describes the fee as split or shared", () => {
  const offences: string[] = [];

  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (const { pattern, why } of FORBIDDEN) {
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          offences.push(`${path.relative(process.cwd(), file)}:${i + 1} — ${why}\n    ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(offences, [], `Stale fee copy:\n${offences.join("\n")}`);
});

test("the sweep actually works — it catches a planted phrase", () => {
  // A grep-based guard that silently matches nothing is worse than no guard, because it
  // reads as passing. This proves the patterns fire.
  const planted = 'const note = "It is split evenly between buyer and seller.";';
  assert.ok(FORBIDDEN.some((f) => f.pattern.test(planted)));

  const arabic = 'ar: "الرسم مقسوم بالنص بين الطرفين"';
  assert.ok(FORBIDDEN.some((f) => f.pattern.test(arabic)));

  // And that it does not fire on the current, correct wording.
  const current = 'en: "a fixed success fee by unit type that each side pays separately"';
  assert.ok(!FORBIDDEN.some((f) => f.pattern.test(current)), current);

  // The 2026-10-02 model change: the old band wording must now be caught.
  assert.ok(FORBIDDEN.some((f) => f.pattern.test('en: "a fixed success fee by price band"')));
  assert.ok(FORBIDDEN.some((f) => f.pattern.test('ar: "رسم ثابت حسب شريحة السعر"')));
});

test("the sweep reaches a meaningful number of files", () => {
  // Guards the traversal itself: a broken walk would return [] and the test above would
  // pass while checking nothing.
  const files = sourceFiles(SRC);
  assert.ok(files.length > 50, `only found ${files.length} source files`);
  assert.ok(files.some((f) => f.endsWith(path.join("lib", "i18n.ts"))), "i18n.ts not swept");
});
