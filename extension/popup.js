const state = {
  config: null,
  detection: null,
  result: null,
  busy: false,
};

const $ = (id) => document.getElementById(id);
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function runtime(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response) return reject(new Error("No response from extension worker."));
      if (!response.ok) return reject(new Error(response.error || "Request failed."));
      resolve(response);
    });
  });
}

function tabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) return reject(new Error("Could not read this page. Reload it after installing the extension."));
      if (!response?.ok) return reject(new Error(response?.error || "Could not detect the product."));
      resolve(response);
    });
  });
}

function showStatus(text, kind = "error") {
  const node = $("status");
  node.textContent = text;
  node.className = `status${kind === "ok" ? " ok" : ""}`;
}

function clearStatus() {
  $("status").className = "status hidden";
  $("status").textContent = "";
}

function setBusy(value) {
  state.busy = value;
  $("compare-button").disabled = value || !$("query").value.trim();
  $("alert-button").disabled = value;
  $("login-button").disabled = value;
  $("save-config").disabled = value;
}

function applyConfig(config) {
  state.config = config;
  $("api-base").value = config.apiBase || "";
  $("web-base").value = config.webBase || "";
  const signedIn = Boolean(config.token && config.user);
  $("account-label").textContent = signedIn ? `Signed in as ${config.user.name || config.user.email}` : "Demo mode · not signed in";
  $("logout-button").classList.toggle("hidden", !signedIn);
  $("open-web").href = config.webBase || "http://localhost:3000";
}

async function detectPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab.");
    const response = await tabMessage(tab.id, { type: "DETECT_PRODUCT" });
    state.detection = response.product;
    $("detected-name").textContent = response.product.name || "Product name not detected";
    $("detected-meta").textContent = [
      response.product.retailer || "unknown retailer",
      response.product.price ? `page price ${inr.format(response.product.price)}` : "page price not detected",
      response.product.source === "json_ld" ? "structured data" : "page metadata",
    ].join(" · ");
    $("detection-source").textContent = response.product.source === "json_ld" ? "verified markup" : "best effort";
    $("query").value = response.product.query || "";
    $("compare-button").disabled = !response.product.query;
    if (response.product.query) await compare();
  } catch (error) {
    $("detected-name").textContent = "Open a product page to detect it.";
    $("detected-meta").textContent = error.message;
    $("detection-source").textContent = "unavailable";
    $("compare-button").disabled = true;
  }
}

function listingNode(listing, rank) {
  const item = document.createElement("li");
  const retailer = document.createElement("span");
  retailer.className = "retailer";
  retailer.textContent = `${rank}. ${listing.retailer?.name || "Retailer"}${listing.is_cheapest_effective ? " · cheapest" : ""}`;
  const price = document.createElement("span");
  price.className = "price";
  price.textContent = inr.format(listing.effective?.effective_price ?? listing.price);
  const detail = document.createElement("span");
  detail.className = "detail";
  const coupon = listing.effective?.coupon_discount ? ` · coupon saves ${inr.format(listing.effective.coupon_discount)}` : "";
  const bank = listing.effective?.best_bank_offer?.estimated_discount
    ? ` · bank offer up to ${inr.format(listing.effective.best_bank_offer.estimated_discount)}`
    : "";
  detail.textContent = `${listing.availability || "availability unknown"}${coupon}${bank}${listing.is_demo ? " · demo data" : ""}`;
  item.append(retailer, price, detail);
  return item;
}

function renderResult(result) {
  const section = $("result");
  const product = result.product;
  const comparison = result.comparison;
  const cheapest = comparison.listings?.find((listing) => listing.is_cheapest_effective) || comparison.listings?.[0];
  section.classList.remove("hidden");
  $("result-name").textContent = product.name;
  $("result-summary").textContent = `${product.brand || "Unknown brand"} · ${product.category || "uncategorised"} · ${comparison.listings?.length || 0} exact-variant retailer${comparison.listings?.length === 1 ? "" : "s"}`;
  $("result-demo").classList.toggle("hidden", !product.is_demo);

  const gap = $("price-gap");
  gap.classList.add("hidden");
  gap.classList.remove("negative");
  if (state.detection?.price && cheapest?.effective?.effective_price) {
    const difference = state.detection.price - cheapest.effective.effective_price;
    gap.classList.remove("hidden");
    if (difference > 0) {
      gap.textContent = `This page is ${inr.format(difference)} above the current catalog effective price. Verify coupon and seller eligibility.`;
    } else if (difference < 0) {
      gap.classList.add("negative");
      gap.textContent = `This page appears ${inr.format(Math.abs(difference))} below the catalog effective price. Check the exact variant and seller.`;
    } else {
      gap.textContent = "This page matches the catalog effective price.";
    }
  }

  const list = $("listing-list");
  list.replaceChildren(...(comparison.listings || []).slice(0, 4).map((listing, index) => listingNode(listing, index + 1)));
  $("open-product").href = `${state.config.webBase}/products/${product.slug}`;
  $("open-cheapest").href = cheapest
    ? `${state.config.apiBase}/api/affiliate/click/${cheapest.id}?source_page=chrome_extension&session_id=${encodeURIComponent(comparison.comparison_session_id)}`
    : `${state.config.webBase}/products/${product.slug}`;
  $("open-cheapest").classList.toggle("hidden", !cheapest);
  $("target-price").value = cheapest?.effective?.effective_price ? Math.max(1, Math.floor(cheapest.effective.effective_price * 0.95)) : "";
  $("disclaimer").textContent = comparison.disclaimer || "Retailer data may be demo data. Verify before purchase.";
}

async function compare(manual = false) {
  const query = $("query").value.trim();
  if (query.length < 2) return showStatus("Enter at least two characters to search.");
  clearStatus();
  $("result").classList.add("hidden");
  setBusy(true);
  showStatus("Searching exact-variant prices…", "ok");
  try {
    const response = await runtime({ type: "SEARCH_PRODUCT", query });
    state.result = response.result;
    if (!response.result.found) {
      showStatus("No match in the current catalog. The page title may need a more specific brand/model query.");
      return;
    }
    clearStatus();
    renderResult(response.result);
    if (manual) showStatus("Comparison loaded.", "ok");
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(false);
  }
}

async function createAlert() {
  if (!state.result?.found) return showStatus("Run a comparison before creating an alert.");
  if (!state.config?.token) {
    $("settings-panel").classList.remove("hidden");
    return showStatus("Log in with your DISCOUNT AI account to create alerts.");
  }
  const target = Number($("target-price").value);
  if (!Number.isFinite(target) || target <= 0) return showStatus("Enter a valid target price.");
  clearStatus();
  setBusy(true);
  try {
    await runtime({
      type: "ADD_ALERT",
      product_id: state.result.product.id,
      variant_id: state.result.comparison.variant?.id,
      target_price: target,
    });
    showStatus(`Alert created at ${inr.format(target)}. It will be checked against new price snapshots.`, "ok");
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(false);
  }
}

async function login() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || !password) return showStatus("Enter your email and password.");
  clearStatus();
  setBusy(true);
  try {
    const response = await runtime({ type: "LOGIN", email, password });
    applyConfig(response.config);
    $("login-password").value = "";
    showStatus("Signed in. You can now create price alerts.", "ok");
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(false);
  }
}

async function saveConfig() {
  clearStatus();
  setBusy(true);
  try {
    const response = await runtime({
      type: "SAVE_CONFIG",
      apiBase: $("api-base").value,
      webBase: $("web-base").value,
    });
    applyConfig(response.config);
    showStatus("Connection saved.", "ok");
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(false);
  }
}

async function logout() {
  const response = await runtime({ type: "LOGOUT" });
  applyConfig(response.config);
  showStatus("Logged out locally.", "ok");
}

async function init() {
  const response = await runtime({ type: "GET_CONFIG" });
  applyConfig(response.config);
  $("settings-toggle").addEventListener("click", () => $("settings-panel").classList.toggle("hidden"));
  $("compare-button").addEventListener("click", () => void compare(true));
  $("alert-button").addEventListener("click", () => void createAlert());
  $("login-button").addEventListener("click", () => void login());
  $("logout-button").addEventListener("click", () => void logout());
  $("save-config").addEventListener("click", () => void saveConfig());
  $("query").addEventListener("input", () => {
    $("compare-button").disabled = state.busy || !$("query").value.trim();
  });
  $("query").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !state.busy) void compare(true);
  });
  await detectPage();
}

void init();
