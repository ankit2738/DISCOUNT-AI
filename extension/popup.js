if (new URLSearchParams(location.search).has("panel")) {
  document.body.classList.add("sidepanel");
}

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
      if (chrome.runtime.lastError) return reject(new Error("Could not read this page. Reload the tab after installing the extension."));
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

function variantLabel(variant) {
  if (!variant) return "Exact variant not resolved";
  const attrs = Object.entries(variant.attributes || {}).map(([key, value]) => `${key}: ${value}`).join(" · ");
  return `${variant.name || variant.sku}${attrs ? ` · ${attrs}` : ""}`;
}

async function detectPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab.");
    const response = await tabMessage(tab.id, { type: "DETECT_PRODUCT" });
    const product = response.product;
    state.detection = product;
    $("detected-name").textContent = product.name || "Product name not detected";
    $("detected-variant").textContent = product.variantHint ? `Selected page variant: ${product.variantHint}` : "Variant inferred from product title";
    $("detected-meta").textContent = [
      product.retailerName || product.retailer || "unknown retailer",
      product.price ? `page price ${inr.format(product.price)}` : "page price not detected",
      product.sku ? `ID ${product.sku}` : "no retailer ID",
    ].join(" · ");
    $("detection-source").textContent = product.confidence === "high" ? "structured data" : product.isProductPage ? "product page" : "not a product page";
    $("query").value = product.query || "";
    $("compare-button").disabled = !product.query;
    if (product.isProductPage && product.query) await analyse(product);
    else showStatus("Open an Amazon.in or Flipkart product page, or search for an exact model.", "ok");
  } catch (error) {
    $("detected-name").textContent = "Open a product page to detect it.";
    $("detected-meta").textContent = error.message;
    $("detected-variant").textContent = "";
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

function renderHistory(history) {
  const svg = $("history-chart");
  const points = (history.points || []).filter((point) => point.price !== null);
  svg.replaceChildren();
  if (points.length < 2) {
    $("history-note").textContent = "Not enough tracked history to draw a chart.";
    $("history-range").textContent = "";
    return;
  }
  const values = points.map((point) => point.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const step = 360 / (points.length - 1);
  const coordinates = points.map((point, index) => {
    const x = index * step;
    const y = 68 - ((point.price - min) / span) * 58;
    return [x, y];
  });
  const ns = "http://www.w3.org/2000/svg";
  const area = document.createElementNS(ns, "path");
  area.setAttribute("d", `M0 72 L${coordinates.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")} L360 72 Z`);
  area.setAttribute("class", "history-area");
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("points", coordinates.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "));
  line.setAttribute("class", "history-line");
  svg.append(area, line);
  $("history-range").textContent = `${inr.format(min)} – ${inr.format(max)}`;
  $("history-note").textContent = `${history.days || points.length} tracked days · average ${history.average ? inr.format(history.average) : "unavailable"}${history.is_demo ? " · demo history" : ""}`;
}

function renderEvidence(deal) {
  const list = $("deal-evidence");
  list.replaceChildren();
  for (const evidence of deal.evidence || []) {
    const item = document.createElement("li");
    item.textContent = evidence.description;
    list.append(item);
  }
  $("deal-summary").textContent = (deal.explanation || []).slice(-2).join(" ");
}

function renderOffers(intelligence) {
  const list = $("offer-list");
  list.replaceChildren();
  for (const coupon of intelligence.coupons || []) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = `${coupon.code} · ${coupon.title}`;
    const detail = document.createElement("span");
    detail.textContent = `${coupon.expires_at ? `expires ${new Date(coupon.expires_at).toLocaleDateString()}` : "expiry not listed"} · ${coupon.is_demo ? "demo" : "verified"}`;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "link-button";
    copy.textContent = "Copy code";
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(coupon.code);
      copy.textContent = "Copied";
    });
    item.append(title, detail, copy);
    list.append(item);
  }
  for (const offer of intelligence.bank_offers || []) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = `${offer.bank_name} ${offer.card_type} · ${offer.title}`;
    const detail = document.createElement("span");
    detail.textContent = [
      offer.estimated_discount ? `up to ${inr.format(offer.estimated_discount)}` : "offer available",
      offer.expires_at ? `expires ${new Date(offer.expires_at).toLocaleDateString()}` : "expiry not listed",
      offer.is_cashback ? "cashback is not an immediate discount" : "",
      offer.is_demo ? "demo" : "verified",
    ].filter(Boolean).join(" · ");
    item.append(title, detail);
    list.append(item);
  }
  if (!list.children.length) {
    const item = document.createElement("li");
    item.textContent = "No verified coupon or eligible bank offer is recorded for this listing.";
    list.append(item);
  }
}

function renderAlternatives(intelligence) {
  const list = $("alternative-list");
  list.replaceChildren();
  const alternatives = intelligence.alternatives?.alternatives || [];
  if (!alternatives.length) {
    const item = document.createElement("li");
    item.textContent = "No comparable tracked alternative found.";
    list.append(item);
    return;
  }
  for (const alternative of alternatives.slice(0, 3)) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `${state.config.webBase}/products/${alternative.slug}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = alternative.name;
    const detail = document.createElement("span");
    detail.textContent = `from ${inr.format(alternative.lowest_effective_price)} · value score ${alternative.value_score}`;
    item.append(link, detail);
    list.append(item);
  }
}

function renderResult(result) {
  const intelligence = result.intelligence;
  const match = result.match;
  const listing = intelligence.listing;
  const cheapest = (intelligence.comparison || []).find((item) => item.is_cheapest_effective) || intelligence.comparison?.[0] || listing;
  $("result").classList.remove("hidden");
  $("result-name").textContent = match.product.name;
  $("result-summary").textContent = `${match.product.brand || "Unknown brand"} · ${match.product.category || "uncategorised"} · ${intelligence.comparison?.length || 0} exact-variant retailer${intelligence.comparison?.length === 1 ? "" : "s"}`;
  $("result-variant").textContent = variantLabel(match.variant);
  $("result-demo").classList.toggle("hidden", !listing.is_demo);
  $("match-confidence").textContent = `${match.confidence}% variant match`;

  const gap = $("price-gap");
  gap.classList.add("hidden");
  gap.classList.remove("negative");
  if (state.detection?.price && listing.effective?.effective_price) {
    const difference = state.detection.price - listing.effective.effective_price;
    gap.classList.remove("hidden");
    if (difference > 0) {
      gap.textContent = `This page is ${inr.format(difference)} above the tracked effective price. Verify coupon and seller eligibility.`;
    } else if (difference < 0) {
      gap.classList.add("negative");
      gap.textContent = `This page appears ${inr.format(Math.abs(difference))} below the tracked effective price. Check the exact variant and seller.`;
    } else {
      gap.textContent = "This page matches the tracked effective price.";
    }
  }

  $("deal-score").textContent = `${intelligence.deal_score.score}/100`;
  $("deal-grade").textContent = intelligence.deal_score.grade;
  $("deal-confidence").textContent = `${intelligence.deal_score.confidence}% confidence`;
  $("advice-label").textContent = intelligence.buy_or_wait.recommendation.toUpperCase();
  $("advice-confidence").textContent = `${intelligence.buy_or_wait.confidence}% confidence`;
  renderHistory(intelligence.price_history);
  renderEvidence(intelligence.deal_score);

  const fake = intelligence.fake_discount;
  $("fake-risk").textContent = `${fake.risk_level} · ${fake.risk_score}/100`;
  $("fake-risk").className = `pill${["high", "medium"].includes(fake.risk_level) ? " warning" : ""}`;
  $("fake-summary").textContent = `${fake.summary} ${(fake.evidence || []).map((item) => item.detail).join(" ")} This is a prompt to verify, not an accusation.`;

  $("advice-pill").textContent = intelligence.buy_or_wait.recommendation;
  $("advice-pill").className = `pill${intelligence.buy_or_wait.recommendation === "wait" ? " warning" : ""}`;
  const adviceReasons = $("advice-reasons");
  adviceReasons.replaceChildren();
  for (const reason of intelligence.buy_or_wait.reasons || []) {
    const item = document.createElement("li");
    item.textContent = reason;
    adviceReasons.append(item);
  }

  const list = $("listing-list");
  list.replaceChildren(...(intelligence.comparison || []).map((item, index) => listingNode(item, index + 1)));
  renderOffers(intelligence);
  renderAlternatives(intelligence);

  $("open-product").href = `${state.config.webBase}/products/${match.product.slug}`;
  $("open-cheapest").href = cheapest
    ? `${state.config.apiBase}/api/affiliate/click/${cheapest.id}?source_page=chrome_extension`
    : `${state.config.webBase}/products/${match.product.slug}`;
  $("open-cheapest").classList.toggle("hidden", !cheapest);
  $("target-price").value = listing.effective?.effective_price ? Math.max(1, Math.floor(listing.effective.effective_price * 0.95)) : "";
  $("disclaimer").textContent = [match.disclaimer, intelligence.deal_score?.is_demo ? "Seeded price history and offers are demo data." : ""].filter(Boolean).join(" ");
}

async function analyse(detection, query = "") {
  clearStatus();
  $("result").classList.add("hidden");
  setBusy(true);
  showStatus("Resolving the exact variant and evidence…", "ok");
  try {
    const response = await runtime({ type: "ANALYSE_PRODUCT", detection, query });
    state.result = response.result;
    if (!response.result.found) {
      showStatus(response.result.match?.message || "No exact tracked variant matched. Not comparing a different model or configuration.");
      return;
    }
    clearStatus();
    renderResult(response.result);
  } catch (error) {
    showStatus(error.message);
  } finally {
    setBusy(false);
  }
}

async function compare(manual = false) {
  const query = $("query").value.trim();
  if (query.length < 2) return showStatus("Enter at least two characters to search.");
  const detection = state.detection || {};
  await analyse({ ...detection, name: query, title: query }, query);
  if (manual && state.result?.found) showStatus("Analysis refreshed.", "ok");
}

async function createAlert() {
  if (!state.result?.found) return showStatus("Run an exact-variant analysis before creating an alert.");
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
      product_id: state.result.match.product.id,
      variant_id: state.result.match.variant?.id,
      target_price: target,
    });
    showStatus(`Alert created at ${inr.format(target)} for ${state.result.match.variant?.name}.`, "ok");
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

async function openSidePanel() {
  const current = await chrome.windows.getCurrent();
  try {
    await runtime({ type: "OPEN_SIDE_PANEL", windowId: current.id });
  } catch (error) {
    showStatus(`${error.message} You can also use Chrome's side-panel menu for DISCOUNT AI.`);
  }
}

async function init() {
  const response = await runtime({ type: "GET_CONFIG" });
  applyConfig(response.config);
  $("settings-toggle").addEventListener("click", () => $("settings-panel").classList.toggle("hidden"));
  $("open-side-panel").addEventListener("click", () => void openSidePanel());
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
