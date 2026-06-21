// Shared Trade Report Card renderer. Used by both the League Activity tab
// (historical trade feed) and the Live Draft tab (trades grade live during the
// draft). Consumes a `card` from buildTradeReview (src/lib/tradeReview.js):
// per-lens sides with per-asset value-now, value-then (when a snapshot priced the
// trade date), pick→player resolution, and a value-now winner.

const SOURCE_META = {
  fc: { tag: "FC", title: "Value from FantasyCalc (live market)" },
  ra: { tag: "RA", title: "Value from RosterAudit (live market)" },
  oracle: { tag: "DO", title: "Value from Dynasty Oracle's own internal model" },
  pick_est: { tag: "est", title: "Estimated pick value — pick not yet used, no market feed" },
};

export function sourcesLabel(sources = []) {
  const names = { fc: "FantasyCalc", ra: "RosterAudit", oracle: "Dynasty Oracle", pick_est: "pick estimate" };
  return sources.map((s) => names[s] || s).join(" + ");
}

function SourceTag({ source }) {
  const meta = SOURCE_META[source];
  if (!meta) return null;
  return (
    <span
      title={meta.title}
      style={{
        flexShrink: 0, fontSize: 8, letterSpacing: 0.5, fontWeight: 700,
        color: "#6b7390", textTransform: "uppercase",
      }}
    >
      {meta.tag}
    </span>
  );
}

function AssetLine({ asset }) {
  const isPickUsed = asset.kind === "pick_used";
  const isFuture = asset.kind === "pick_future";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, lineHeight: 1.5 }}>
      <span style={{ flex: 1, minWidth: 0, color: "#e8e8f0" }}>
        {isPickUsed ? (
          <>
            <span style={{ color: "#c084fc" }}>{asset.label}</span>
            <span style={{ color: "#4a5068" }}>{" → "}</span>
            <span>{asset.becameLabel}</span>
            {asset.pickNo ? (
              <span style={{ color: "#4a5068", fontSize: 10 }}> (#{asset.pickNo})</span>
            ) : null}
          </>
        ) : isFuture ? (
          <>
            <span style={{ color: "#c084fc" }}>{asset.label}</span>
            {asset.fromTeam ? (
              <span style={{ color: "#4a5068", fontSize: 10 }}> ({asset.fromTeam}'s pick)</span>
            ) : (
              <span style={{ color: "#4a5068", fontSize: 10 }}> (unused pick)</span>
            )}
          </>
        ) : (
          <span>{asset.label}</span>
        )}
      </span>
      <span style={{ flexShrink: 0, fontWeight: 700, color: "#00f5a0", fontVariantNumeric: "tabular-nums" }}>
        {asset.valueNow}
      </span>
      <SourceTag source={asset.nowSource} />
      {asset.valueThen != null && (
        <span style={{ flexShrink: 0, fontSize: 10, color: "#6b7390", fontVariantNumeric: "tabular-nums" }}>
          (was {asset.valueThen})
        </span>
      )}
    </div>
  );
}

export function ProvenanceTag({ provenance, snapDate, earliestDate }) {
  if (provenance === "snapshot") {
    return (
      <span title={`Values at trade time from a snapshot taken ${snapDate}`} style={{
        fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700,
        color: "#00f5a0", background: "rgba(0,245,160,0.12)", border: "1px solid rgba(0,245,160,0.3)",
        borderRadius: 3, padding: "2px 7px", whiteSpace: "nowrap",
      }}>
        {"📸"} Snapshot {snapDate}
      </span>
    );
  }
  return (
    <span title={earliestDate
      ? `This trade predates our first value snapshot (${earliestDate}), so we can only show what the assets are worth now.`
      : "We haven't captured value snapshots yet, so we can only show what the assets are worth now. Point-in-time values will appear for trades made from here on."}
      style={{
        fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700,
        color: "#7a819c", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 3, padding: "2px 7px", whiteSpace: "nowrap",
      }}>
      Outside snapshot frame
    </span>
  );
}

// Value/winner breakdown attached to a single trade inside the team feed, framed
// from the expanded team's perspective ("Got" vs "Sent"). Multi-team trades show
// every side labeled. AssetLine carries per-asset value-now, pick→player, and
// "(was N)" when a snapshot priced the trade date.
function SideAssets({ side }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {side.assets.length === 0 ? (
        <span style={{ fontSize: 11, color: "#4a5068" }}>{"—"}</span>
      ) : (
        side.assets.map((a, idx) => <AssetLine key={idx} asset={a} />)
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 9, letterSpacing: 1, color: "#6b7390", textTransform: "uppercase", flex: 1 }}>Haul now</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#e8e8f0", fontVariantNumeric: "tabular-nums" }}>{side.totalNow}</span>
        {side.totalThen != null && (
          <span style={{ fontSize: 10, color: "#6b7390", fontVariantNumeric: "tabular-nums" }}>(was {side.totalThen})</span>
        )}
      </div>
    </div>
  );
}

export function FeedTradeBody({ card, rosterId, earliestDate, valueSource = "fc" }) {
  const view = card.views?.[valueSource] || card.views?.fc;
  if (!view) return null;
  const mine = view.sides.find((s) => s.rosterId === rosterId) || view.sides[0];
  const others = view.sides.filter((s) => s.rosterId !== mine.rosterId);
  const twoTeam = view.sides.length === 2;
  const won = view.winnerNowRosterId === mine.rosterId;
  const winnerLabel = view.sides.find((s) => s.rosterId === view.winnerNowRosterId)?.label;

  const verdict = view.evenNow
    ? { text: `Even today (${view.marginNow} apart)`, color: "#7a819c" }
    : won
    ? { text: `You won, +${view.marginNow} today`, color: "#00f5a0" }
    : { text: `${winnerLabel} won, +${view.marginNow} today`, color: "#ff6b35" };

  return (
    <div>
      {/* Verdict + value source + provenance */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: verdict.color, textTransform: "uppercase" }}>
          {won ? "⚑ " : ""}{verdict.text}
        </span>
        {view.valueSources?.length > 0 && (
          <span style={{ fontSize: 9, color: "#4a5068", letterSpacing: 0.5 }}>
            via {sourcesLabel(view.valueSources)}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <ProvenanceTag provenance={card.provenance} snapDate={card.snapDate} earliestDate={earliestDate} />
      </div>

      {twoTeam ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#00f5a0", textTransform: "uppercase", marginBottom: 4 }}>Got</div>
            <SideAssets side={mine} />
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#ff6b35", textTransform: "uppercase", marginBottom: 4 }}>
              Sent {others[0] ? `→ ${others[0].label}` : ""}
            </div>
            {others[0] && <SideAssets side={others[0]} />}
          </div>
        </div>
      ) : (
        /* Multi-team: every side, this team highlighted. */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {view.sides.map((side) => {
            const isMine = side.rosterId === mine.rosterId;
            const isWinner = view.winnerNowRosterId === side.rosterId;
            return (
              <div key={side.rosterId} style={{
                border: `1px solid ${isWinner ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 5, padding: "8px 10px",
                background: isWinner ? "rgba(0,245,160,0.04)" : "transparent",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isMine ? "#00f5a0" : "#c3c9dd", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {side.label} got{isMine ? " (you)" : ""}
                </div>
                <SideAssets side={side} />
              </div>
            );
          })}
        </div>
      )}

      {card.winnerThenRosterId != null && card.winnerThenRosterId !== view.winnerNowRosterId && (
        <div style={{ fontSize: 10, color: "#c084fc", marginTop: 6 }}>
          At the time, {view.sides.find((s) => s.rosterId === card.winnerThenRosterId)?.label} had the edge — the value has since flipped.
        </div>
      )}
    </div>
  );
}
