const DEFAULT_CONFIG = {
  apiBase: "http://127.0.0.1:8000",
  webBase: "http://localhost:3000",
  token: "",
  user: null,
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get("config");
  if (!current.config) await chrome.storage.local.set({ config: DEFAULT_CONFIG });
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
});

async function getConfig() {
  const stored = await chrome.storage.local.get("config");
  return { ...DEFAULT_CONFIG, ...(stored.config || {}) };
}

function normaliseBase(value) {
  const url = new URL(String(value || "").trim());
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL must use http or https.");
  return url.toString().replace(/\/+$/, "");
}

async function api(path, { method = "GET", body, token } = {}) {
  const config = await getConfig();
  const base = normaliseBase(config.apiBase);
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || `Request failed (${response.status})`);
  }
  return payload;
}

function resolveQuery(detection, query) {
  const params = new URLSearchParams({
    title: query || detection?.name || detection?.title || "",
    variant_hint: detection?.variantHint || "",
  });
  if (detection?.retailer) params.set("retailer", detection.retailer);
  if (detection?.sku) params.set("external_id", detection.sku);
  return `/api/extension/resolve?${params.toString()}`;
}

async function analyse(detection, query = "") {
  const config = await getConfig();
  const resolved = await api(resolveQuery(detection, query), {
    token: config.token || undefined,
  });
  if (!resolved.matched || !resolved.listing) {
    return { found: false, detection, match: resolved };
  }
  const intelligence = await api(`/api/extension/intelligence?listing_id=${resolved.listing.id}`, {
    token: config.token || undefined,
  });
  return {
    found: true,
    detection,
    match: resolved,
    intelligence,
    exactVariant: resolved.variant,
    disclaimer: resolved.disclaimer,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "GET_CONFIG") {
      return sendResponse({ ok: true, config: await getConfig() });
    }
    if (message.type === "SAVE_CONFIG") {
      const current = await getConfig();
      const next = {
        ...current,
        apiBase: normaliseBase(message.apiBase || current.apiBase),
        webBase: normaliseBase(message.webBase || current.webBase),
      };
      await chrome.storage.local.set({ config: next });
      return sendResponse({ ok: true, config: next });
    }
    if (message.type === "LOGIN") {
      const payload = await api("/api/auth/login", {
        method: "POST",
        body: { email: message.email, password: message.password },
      });
      const config = await getConfig();
      const next = { ...config, token: payload.access_token, user: payload.user };
      await chrome.storage.local.set({ config: next });
      return sendResponse({ ok: true, config: next });
    }
    if (message.type === "LOGOUT") {
      const config = await getConfig();
      const next = { ...config, token: "", user: null };
      await chrome.storage.local.set({ config: next });
      return sendResponse({ ok: true, config: next });
    }
    if (message.type === "ANALYSE_PRODUCT") {
      return sendResponse({ ok: true, result: await analyse(message.detection, message.query) });
    }
    if (message.type === "SEARCH_PRODUCT") {
      return sendResponse({
        ok: true,
        result: await analyse({ ...(message.detection || {}), name: message.query }, message.query),
      });
    }
    if (message.type === "ADD_ALERT") {
      const config = await getConfig();
      if (!config.token) throw new Error("Log in inside the extension to create alerts.");
      const payload = await api("/api/alerts", {
        method: "POST",
        token: config.token,
        body: {
          product_id: message.product_id,
          variant_id: message.variant_id || null,
          target_price: message.target_price,
          channel: "in_app",
        },
      });
      return sendResponse({ ok: true, alert: payload });
    }
    if (message.type === "OPEN_SIDE_PANEL") {
      const windowId = message.windowId;
      if (chrome.sidePanel?.open && windowId) {
        await chrome.sidePanel.open({ windowId });
        return sendResponse({ ok: true });
      }
      throw new Error("Side panel is unavailable in this browser.");
    }
    return sendResponse({ ok: false, error: "Unknown action" });
  })().catch((error) => sendResponse({ ok: false, error: error.message || "Request failed" }));
  return true;
});
