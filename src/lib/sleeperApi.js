const SLEEPER_BASE_URL = import.meta.env.DEV
  ? "/sleeper"
  : "https://api.sleeper.app/v1";

export async function fetchSleeper(path) {
  const res = await fetch(`${SLEEPER_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return res.json();
}
