import { fullTeardown } from "./paths/fullTeardown";
import { retoolRebuild } from "./paths/retoolRebuild";
import { positionalArbitrage } from "./paths/positionalArbitrage";
import { veteranPivot } from "./paths/veteranPivot";
import { youthInjection } from "./paths/youthInjection";
import { consolidationPlay } from "./paths/consolidationPlay";
import { allIn } from "./paths/allIn";
import { surgicalUpgrade } from "./paths/surgicalUpgrade";
import { softLanding } from "./paths/softLanding";

export const PATHS = {
  fullTeardown,
  retoolRebuild,
  positionalArbitrage,
  veteranPivot,
  youthInjection,
  consolidationPlay,
  allIn,
  surgicalUpgrade,
  softLanding,
};

export const PATH_ORDER = [
  "fullTeardown",
  "retoolRebuild",
  "positionalArbitrage",
  "veteranPivot",
  "youthInjection",
  "consolidationPlay",
  "allIn",
  "surgicalUpgrade",
  "softLanding",
];

export function getPathsForClass(cls) {
  return PATH_ORDER.map((k) => PATHS[k]).filter((p) => p.class === cls);
}

export function getPath(pathKey) {
  return PATHS[pathKey] || null;
}
