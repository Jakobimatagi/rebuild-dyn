// Drives createSeasonSimulator in frame-budgeted chunks so a big run (10,000
// sims) animates over a couple of seconds instead of freezing the tab in one
// blocking loop. There are no web workers in this app, so cooperative chunking
// is the idiomatic way to keep the UI responsive while the Monte-Carlo grinds.
//
// Scheduling uses setTimeout rather than requestAnimationFrame: rAF is paused
// whenever the page isn't visible (a backgrounded tab — or a headless preview),
// which would silently stall a run. Between chunks we yield to the event loop,
// so the UI stays responsive and React coalesces the once-per-chunk snapshot
// updates. An id ref (bumped on every run/cancel/unmount) invalidates stale
// timers, mirroring the useEffect-cleanup pattern used elsewhere in the tab.

import { useCallback, useEffect, useRef, useState } from "react";
import { createSeasonSimulator } from "./powerRankings.js";

const now = () =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

const FRAME_BUDGET_MS = 12; // work per chunk before yielding for paint

// Pacing presets. "slow" deliberately spreads the run over ~5s with small,
// delayed chunks so a manager can watch the odds settle; "normal"/"fast" run
// the full frame-budget loop (fast just yields less often between chunks).
const PACES = {
  slow: { steps: 110, delay: 40 },
  normal: { steps: 0, delay: 0 },
  fast: { steps: 0, delay: 0 },
};

export function useSeasonSimulation({ input, weeks, playoffTeams, focusRosterId }) {
  const [status, setStatus] = useState("idle"); // idle | running | done
  const [total, setTotal] = useState(0);
  const [snapshot, setSnapshot] = useState(null);

  const timerRef = useRef(null);
  const runIdRef = useRef(0); // bumped on every run/cancel to invalidate stale chunks

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    clearTimer();
    setStatus((s) => (s === "running" ? "idle" : s));
  }, [clearTimer]);

  // Drop any in-flight run when the component unmounts.
  useEffect(() => () => cancel(), [cancel]);

  const run = useCallback(
    (simCount, speed = "normal") => {
      // Invalidate any previous run and start clean.
      runIdRef.current += 1;
      const myRun = runIdRef.current;
      clearTimer();

      const sim = createSeasonSimulator(input || [], {
        weeks,
        playoffTeams,
        focusRosterId,
        // fresh seed each run → results vary run-to-run
      });

      setStatus("running");
      setTotal(simCount);
      setSnapshot(sim.snapshot());

      const pace = PACES[speed] || PACES.normal;
      // In slow mode, take a fixed number of even steps so any sim count takes
      // roughly the same watchable duration.
      const slowChunk = pace.steps > 0 ? Math.max(1, Math.ceil(simCount / pace.steps)) : 0;

      // Adaptive chunk size for normal/fast: start small so the first update
      // paints fast, then grow toward whatever fits in the frame budget.
      let batch = 40;

      const step = () => {
        if (runIdRef.current !== myRun) return; // superseded/cancelled

        if (slowChunk > 0) {
          // One small, deliberately-paced chunk per tick.
          sim.runBatch(Math.min(slowChunk, simCount - sim.simsDone));
        } else {
          const start = now();
          let ranThisChunk = 0;
          // Run sub-batches until we finish or exhaust this chunk's time budget.
          while (sim.simsDone < simCount && now() - start < FRAME_BUDGET_MS) {
            const remaining = simCount - sim.simsDone;
            const take = Math.min(batch, remaining);
            sim.runBatch(take);
            ranThisChunk += take;
            const elapsed = now() - start;
            if (elapsed > 0 && ranThisChunk > 0) {
              const perSim = elapsed / ranThisChunk;
              batch = Math.max(20, Math.min(2000, Math.round(FRAME_BUDGET_MS / perSim)));
            }
          }
        }

        setSnapshot(sim.snapshot());

        if (sim.simsDone >= simCount) {
          timerRef.current = null;
          setStatus("done");
          return;
        }
        timerRef.current = setTimeout(step, pace.delay); // yield, then continue
      };

      timerRef.current = setTimeout(step, pace.delay);
    },
    [input, weeks, playoffTeams, focusRosterId, clearTimer],
  );

  const progress = total > 0 ? Math.min(1, (snapshot?.simsDone || 0) / total) : 0;

  return { status, progress, total, snapshot, run, cancel };
}
