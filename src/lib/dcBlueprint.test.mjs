import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coordinatorFor,
  coordinatorContinuityFactors,
  CHANGED_COORD_FACTOR,
} from "./dcBlueprint.js";

const DATA = {
  2025: {
    BUF: { name: "Bobby Blitz" },
    MIA: { name: "New Guy" },
    NYJ: { name: "Vacant" },
  },
  2024: {
    BUF: { name: "Bobby Blitz" },
    MIA: { name: "Old Guy" },
    NYJ: { name: "Somebody" },
  },
  2023: {
    BUF: { name: "Earlier Guy" },
    MIA: { name: "Old Guy" },
  },
};

test("coordinatorFor resolves names and treats Vacant/missing as null", () => {
  assert.equal(coordinatorFor(DATA, 2025, "BUF"), "Bobby Blitz");
  assert.equal(coordinatorFor(DATA, 2025, "NYJ"), null); // Vacant
  assert.equal(coordinatorFor(DATA, 2023, "NYJ"), null); // missing
  assert.equal(coordinatorFor(DATA, 2022, "BUF"), null); // year not imported
  assert.equal(coordinatorFor(null, 2025, "BUF"), null);
});

test("continuity factors down-weight seasons under a different coordinator", () => {
  const f = coordinatorContinuityFactors(DATA, 2025);
  // BUF kept its DC 2024→2025 but changed after 2023.
  assert.equal(f.get("BUF|2024"), undefined);
  assert.equal(f.get("BUF|2023"), CHANGED_COORD_FACTOR);
  // MIA changed DCs for 2025: both prior seasons down-weighted.
  assert.equal(f.get("MIA|2024"), CHANGED_COORD_FACTOR);
  assert.equal(f.get("MIA|2023"), CHANGED_COORD_FACTOR);
  // NYJ has no known current DC (Vacant) → neutral everywhere.
  assert.ok(![...f.keys()].some((k) => k.startsWith("NYJ|")));
});

test("empty or missing data yields no overrides", () => {
  assert.equal(coordinatorContinuityFactors({}, 2025).size, 0);
  assert.equal(coordinatorContinuityFactors(null, 2025).size, 0);
});

test("changedFactor is configurable", () => {
  const f = coordinatorContinuityFactors(DATA, 2025, { changedFactor: 0 });
  assert.equal(f.get("MIA|2024"), 0);
});
