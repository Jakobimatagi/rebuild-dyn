import { test } from "node:test";
import assert from "node:assert/strict";
import { carryForwardEntries } from "./dcData.js";

test("carryForwardEntries keeps names + playcaller, drops season-specific flags", () => {
  const season = {
    BUF: { name: "Bobby Babich" },
    MIN: { name: "Brian Flores", playcaller: "DC" },
    LAC: { name: "Jesse Minter", partial: true, note: "took over week 6" },
    NE : { name: "  Vic Fangio  " },
  };
  assert.deepEqual(carryForwardEntries(season), {
    BUF: { name: "Bobby Babich" },
    MIN: { name: "Brian Flores", playcaller: "DC" },
    LAC: { name: "Jesse Minter" },
    NE : { name: "Vic Fangio" },
  });
});

test("carryForwardEntries skips the __init__ sentinel, unnamed entries, and empty input", () => {
  assert.deepEqual(
    carryForwardEntries({
      __init__: { name: "" },
      NYJ: { name: "   " },
      NYG: {},
      MIA: null,
      DAL: { name: "Matt Eberflus" },
    }),
    { DAL: { name: "Matt Eberflus" } },
  );
  assert.deepEqual(carryForwardEntries(undefined), {});
});
