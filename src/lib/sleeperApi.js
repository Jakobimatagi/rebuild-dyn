export async function fetchSleeper(path) {
  const res = await fetch(`/sleeper${path}`);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return res.json();
}
