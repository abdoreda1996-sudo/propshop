/**
 * Cover photo selection.
 *
 * `setCoverMedia` needs a database and is covered by the API; these pin the two pure
 * rules that decide what the buyer actually sees on a card.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { coverOf, suggestCover, coverRoomRank, COVER_FIRST } from "../cover";

type M = { id: string; room?: string | null; isCover?: boolean; isVerified?: boolean; sortOrder?: number };

const media: M[] = [
  { id: "living", room: "living", sortOrder: 0, isVerified: true },
  { id: "bedroom", room: "bedroom", sortOrder: 1, isVerified: true },
  { id: "kitchen", room: "kitchen", sortOrder: 2, isVerified: true },
  { id: "bathroom", room: "bathroom", sortOrder: 3, isVerified: true },
  { id: "facade", room: "facade", sortOrder: 4, isVerified: true },
  { id: "view", room: "view", sortOrder: 5, isVerified: true },
];

test("coverOf falls back to the lowest sortOrder when nothing is flagged", () => {
  // Every listing seeded before isCover existed lands here, so this must not be null.
  assert.equal(coverOf(media)?.id, "living");
});

test("coverOf respects the flag regardless of capture order", () => {
  const flagged = media.map((m) => ({ ...m, isCover: m.id === "facade" }));
  assert.equal(coverOf(flagged)?.id, "facade");
});

test("coverOf is insensitive to the order of the array it is given", () => {
  const flagged = media.map((m) => ({ ...m, isCover: m.id === "view" }));
  assert.equal(coverOf([...flagged].reverse())?.id, "view");
});

test("coverOf handles a listing with no media", () => {
  assert.equal(coverOf([]), null);
});

test("the fallback is the lowest sortOrder, not the first array element", () => {
  const shuffled: M[] = [
    { id: "c", sortOrder: 2 },
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
  ];
  assert.equal(coverOf(shuffled)?.id, "a");
});

test("a villa leads with the facade — the buyer is buying the building", () => {
  assert.equal(suggestCover(media, "villa")?.id, "facade");
  assert.equal(suggestCover(media, "townhouse")?.id, "facade");
  assert.equal(suggestCover(media, "chalet")?.id, "facade");
});

test("an apartment leads with the living room, not the shared block facade", () => {
  // This is the whole reason the rule takes a unit type: ranking facade everywhere gave
  // every apartment in a compound a near-identical exterior on its card.
  assert.equal(suggestCover(media, "apartment")?.id, "living");
  assert.equal(suggestCover(media, "studio")?.id, "living");
});

test("an unknown or missing unit type is treated as an interior unit", () => {
  assert.equal(suggestCover(media)?.id, "living");
  assert.equal(suggestCover(media, "office")?.id, "living");
  assert.equal(suggestCover(media, null)?.id, "living");
});

test("each ranking falls through in order when rooms are missing", () => {
  const without = (...rooms: string[]) => media.filter((m) => !rooms.includes(m.room ?? ""));
  assert.equal(suggestCover(without("facade"), "villa")?.id, "view");
  assert.equal(suggestCover(without("facade", "view"), "villa")?.id, "living");
  assert.equal(suggestCover(without("living"), "apartment")?.id, "view");
  assert.equal(suggestCover(without("living", "view"), "apartment")?.id, "kitchen");
});

test("the bathroom is never chosen while any other room exists", () => {
  for (const type of ["villa", "apartment", "studio", "chalet"]) {
    const rank = coverRoomRank(type);
    const worst = Object.entries(rank).sort((a, b) => b[1] - a[1])[0][0];
    assert.equal(worst, "bathroom", `${type} should rank the bathroom last`);
  }
});

test("suggestCover never fronts a verified listing with an unverified photo", () => {
  // An unverified upload is exactly the photo that could have been lifted from another
  // portal. It must not become the face of a listing we call "verified".
  const withUnverifiedFacade: M[] = [
    { id: "facade", room: "facade", sortOrder: 0, isVerified: false },
    { id: "bathroom", room: "bathroom", sortOrder: 1, isVerified: true },
  ];
  // The bathroom is the worst room and still wins, because the facade is unverified.
  assert.equal(suggestCover(withUnverifiedFacade, "villa")?.id, "bathroom");
});

test("suggestCover does not mutate the array it is given", () => {
  const input = [...media];
  suggestCover(input, "villa");
  assert.deepEqual(
    input.map((m) => m.id),
    media.map((m) => m.id),
  );
});

test("suggestCover handles a listing with no media", () => {
  assert.equal(suggestCover([], "villa"), null);
  assert.equal(suggestCover([]), null);
});

test("COVER_FIRST puts the flag ahead of capture order", () => {
  // `take: 1` alongside this ordering is what makes the card a single row read; if the
  // isCover clause ever moved second, the card would silently show media[0] again.
  assert.deepEqual(COVER_FIRST, [{ isCover: "desc" }, { sortOrder: "asc" }]);
});
