import posthog from "posthog-js";

const KEY = import.meta.env.VITE_POSTHOG_KEY;
// Use a same-origin proxy in production so ad blockers don't drop events.
// Vercel rewrites /ingest/* to PostHog (see vercel.json). In dev (vite),
// rewrites don't run, so fall back to the direct host.
const isProd = import.meta.env.PROD;
const HOST =
  import.meta.env.VITE_POSTHOG_HOST ||
  (isProd ? "/ingest" : "https://us.i.posthog.com");

let started = false;

export function initAnalytics() {
  if (started || !KEY || typeof window === "undefined") return;
  posthog.init(KEY, {
    api_host: HOST,
    ui_host: "https://us.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    person_profiles: "identified_only",
  });
  started = true;
}

export function track(event, props) {
  if (!started) return;
  posthog.capture(event, props);
}

export function identify(userId, traits) {
  if (!started || !userId) return;
  posthog.identify(String(userId), traits);
}

export function resetIdentity() {
  if (!started) return;
  posthog.reset();
}
