(function () {
  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parsePrice(value) {
    if (value === null || value === undefined) return null;
    const match = String(value).replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
    if (!match) return null;
    const price = Number(match[1]);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function jsonLdProducts() {
    const products = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent || "");
        const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
        while (queue.length) {
          const node = queue.shift();
          if (!node || typeof node !== "object") continue;
          if (Array.isArray(node)) {
            queue.push(...node);
            continue;
          }
          if (node["@graph"]) queue.push(...node["@graph"]);
          const type = node["@type"];
          if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) products.push(node);
        }
      } catch (_) {
        // Ignore malformed retailer JSON-LD.
      }
    }
    return products;
  }

  function fromJsonLd(product) {
    const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
    return {
      name: clean(product.name),
      brand: clean(typeof product.brand === "object" ? product.brand?.name : product.brand),
      price: parsePrice(offers.price || offers.lowPrice || offers.highPrice),
      currency: clean(offers.priceCurrency || "INR"),
      sku: clean(product.sku || product.mpn || product.gtin13),
      availability: clean(offers.availability),
      source: "json_ld",
    };
  }

  function fromMeta() {
    const meta = (property) =>
      document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") ||
      document.querySelector(`meta[name="${property}"]`)?.getAttribute("content") ||
      "";
    const jsonld = jsonLdProducts().map(fromJsonLd).find((item) => item.name);
    if (jsonld) return jsonld;
    return {
      name: clean(meta("og:title") || meta("twitter:title") || document.querySelector("h1")?.textContent || document.title),
      brand: clean(meta("product:brand") || meta("og:brand")),
      price: parsePrice(
        meta("product:price:amount") ||
          meta("og:price:amount") ||
          document.querySelector('[itemprop="price"]')?.getAttribute("content") ||
          document.querySelector('[data-price]')?.getAttribute("data-price"),
      ),
      currency: clean(meta("product:price:currency") || "INR"),
      sku: clean(meta("product:retailer_item_id") || meta("sku")),
      availability: clean(meta("product:availability")),
      source: "meta",
    };
  }

  function pageFallback() {
    const priceNode = Array.from(document.querySelectorAll("body *"))
      .filter((node) => node.children.length === 0 && /₹|Rs\.?|INR/.test(node.textContent || ""))
      .map((node) => parsePrice(node.textContent))
      .find((value) => value !== null);
    return {
      name: clean(document.title).replace(/^Buy\s+/i, "").replace(/\s*[-|:].*$/, ""),
      brand: "",
      price: priceNode || null,
      currency: "INR",
      sku: "",
      availability: "",
      source: "page_fallback",
    };
  }

  function compactQuery(name) {
    return clean(name)
      .replace(/^Buy\s+/i, "")
      .replace(/\s*[-|]\s*(Amazon\.in|Flipkart|Croma|Reliance Digital|Tata CLiQ|Vijay Sales).*$/i, "")
      .replace(/\b(online at best price|at best price in india|free delivery|emi options?)\b/gi, "")
      .replace(/\s+/g, " ")
      .slice(0, 120)
      .trim();
  }

  function detectProduct() {
    const product = fromMeta();
    if (!product.price || !product.name) {
      const fallback = pageFallback();
      product.price = product.price || fallback.price;
      product.name = product.name || fallback.name;
      if (!product.price) product.source = fallback.source;
    }
    return {
      ...product,
      query: compactQuery(product.name || document.title),
      pageUrl: location.href,
      retailer: location.hostname.replace(/^www\./, ""),
      title: clean(document.title),
      detectedAt: new Date().toISOString(),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "DETECT_PRODUCT") {
      sendResponse({ ok: true, product: detectProduct() });
    }
    return false;
  });
})();
