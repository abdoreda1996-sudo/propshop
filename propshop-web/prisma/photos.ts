/**
 * Demo photography.
 *
 * The seed previously used picsum.photos, which returns a random image per seed — cards
 * showed tree stumps and notebooks, which reads as broken on a property marketplace.
 * These are stable Unsplash IDs of actual interiors and buildings, grouped by the room
 * each listing has to cover (Section 6c), so a listing's "kitchen" photo is a kitchen.
 *
 * Demo assets only. Real listings carry owner-captured, watermarked photos from our own
 * storage once the media pipeline lands.
 */

const unsplash = (id: string, w = 1200, h = 800) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=70`;

const BY_ROOM: Record<string, string[]> = {
  living: [
    "photo-1560448204-e02f11c3d0e2",
    "photo-1493809842364-78817add7ffb",
    "photo-1522708323590-d24dbb6b0267",
    "photo-1600585154340-be6161a56a0c",
    "photo-1567767292278-a4f21aa2d36e",
  ],
  bedroom: [
    "photo-1505693416388-ac5ce068fe85",
    "photo-1522771739844-6a9f6d5f14af",
    "photo-1540518614846-7eded433c457",
    "photo-1616594039964-ae9021a400a0",
    "photo-1618221195710-dd6b41faaea6",
  ],
  kitchen: [
    "photo-1556909114-f6e7ad7d3136",
    "photo-1600489000022-c2086d79f9d4",
    "photo-1556911220-bff31c812dba",
    "photo-1484154218962-a197022b5858",
    "photo-1565538810643-b5bdb714032a",
  ],
  bathroom: [
    "photo-1600566753190-17f0baa2a6c3",
    "photo-1552321554-5fefe8c9ef14",
    "photo-1584622650111-993a426fbf0a",
    "photo-1620626011761-996317b8d101",
    "photo-1600566752355-35792bedcfea",
  ],
  facade: [
    "photo-1502672260266-1c1ef2d93688",
    "photo-1512917774080-9991f1c4c750",
    "photo-1486406146926-c627a92ad1ab",
    "photo-1545324418-cc1a3fa10c00",
    "photo-1494526585095-c41746248156",
  ],
  view: [
    "photo-1600607687939-ce8a6c25118c",
    "photo-1600566753086-00f18fb6b3ea",
    "photo-1512915922686-57c11dde9b6b",
    "photo-1570129477492-45c003edd2be",
    "photo-1416331108676-a22ccb276e35",
  ],
};

/** Deterministic pick, so re-seeding produces the same demo market. */
export function photoFor(room: string, index: number): { full: string; thumb: string } {
  const pool = BY_ROOM[room] ?? BY_ROOM.living;
  const id = pool[index % pool.length];
  return { full: unsplash(id, 1200, 800), thumb: unsplash(id, 600, 400) };
}

