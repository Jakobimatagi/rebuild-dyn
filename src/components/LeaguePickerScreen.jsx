import { styles } from "../styles";

export default function LeaguePickerScreen({
  leagues,
  onSelectLeague,
  loading,
  selectedLeague,
  error,
}) {
  return (
    <>
      <div style={styles.header}>
        <div style={styles.logo}>Dynasty OS — Select League</div>
        <h1 style={styles.title}>Your Leagues</h1>
      </div>
      {error && (
        <div style={{ color: "#ff6b35", fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {leagues.map((league) => (
        <button
          key={league.league_id}
          className="dyn-btn-outline"
          style={styles.btnOutline}
          onClick={() => onSelectLeague(league)}
        >
          <span style={{ color: "#00f5a0" }}>▸ </span>
          {league.name}
          <span style={{ color: "#d1d7ea", marginLeft: 12, fontSize: 11 }}>
            {league.total_rosters ? `${league.total_rosters} teams · ` : ""}
            {league.season}
            {league._ff_team_name && (
              <span style={{ color: "#9aa0b8" }}>
                {" "}· Your team: {league._ff_team_name}
              </span>
            )}
          </span>
          {loading && selectedLeague?.league_id === league.league_id && (
            <span style={{ color: "#00f5a0", marginLeft: 8 }}>Loading...</span>
          )}
        </button>
      ))}
      {!leagues.length && !loading && (
        <div style={{ color: "#d1d7ea", fontSize: 12, marginTop: 12 }}>
          No leagues found for this account in recent seasons.
        </div>
      )}
    </>
  );
}
