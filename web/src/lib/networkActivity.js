let inFlight = 0;
let installed = false;
const listeners = new Set();

function emit() {
  const active = inFlight > 0;
  listeners.forEach((fn) => {
    try {
      fn(active, inFlight);
    } catch (_) {
      // no-op
    }
  });
}

function start() {
  inFlight += 1;
  emit();
}

function end() {
  inFlight = Math.max(0, inFlight - 1);
  emit();
}

function isIgnoredUrl(url) {
  const s = String(url || "");
  // Ignore long-poll terminate/noise calls that can flicker the bar.
  if (s.includes("/Listen/channel") && s.includes("TYPE=terminate")) return true;
  return false;
}

export function subscribeNetworkActivity(fn) {
  listeners.add(fn);
  fn(inFlight > 0, inFlight);
  return () => listeners.delete(fn);
}

export function installNetworkActivityTracker() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const origFetch = window.fetch?.bind(window);
  if (origFetch) {
    window.fetch = async (...args) => {
      const url = args?.[0] instanceof Request ? args[0].url : args?.[0];
      const ignore = isIgnoredUrl(url);
      if (!ignore) start();
      try {
        return await origFetch(...args);
      } finally {
        if (!ignore) end();
      }
    };
  }

  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    window.XMLHttpRequest = function PatchedXHR() {
      const xhr = new OrigXHR();
      let tracked = false;
      let done = false;

      const open = xhr.open;
      xhr.open = function patchedOpen(method, url, ...rest) {
        tracked = !isIgnoredUrl(url);
        return open.call(this, method, url, ...rest);
      };

      const finalize = () => {
        if (!tracked || done) return;
        done = true;
        end();
      };

      xhr.addEventListener("loadend", finalize);
      xhr.addEventListener("error", finalize);
      xhr.addEventListener("abort", finalize);
      xhr.addEventListener("timeout", finalize);

      const send = xhr.send;
      xhr.send = function patchedSend(...rest) {
        if (tracked) start();
        return send.call(this, ...rest);
      };

      return xhr;
    };
  }
}

