(function () {
  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parsePrice(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/\u00a0/g, " ");
    const match = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i) || text.match(/([\d,]+(?:\.\d{1,2})?)/);
    if (!match) return null;
    const price = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function pick(doc, selectors) {
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      if (!node) continue;
      const value = clean(node.getAttribute("content") || node.getAttribute("data-price") || node.textContent);
      if (value) return value;
    }
    return "";
  }

  function meta(doc, name) {
    return clean(
      doc.querySelector(`meta[property="${name}"]`)?.getAttribute("content") ||
        doc.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ||
        "",
    );
  }

  function jsonLdProducts(doc) {
    const products = [];
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
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
        // Ignore malformed retailer metadata.
      }
    }
    return products;
  }

  function fromJsonLd(doc) {
    const product = jsonLdProducts(doc).find((item) => item.name);
    if (!product) return null;
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

  function retailerFor(url) {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("amazon.")) return { slug: "amazon", name: "Amazon.in" };
    if (host.includes("flipkart.")) return { slug: "flipkart", name: "Flipkart" };
    if (host.includes("croma.")) return { slug: "croma", name: "Croma" };
    if (host.includes("reliancedigital.")) return { slug: "reliance", name: "Reliance Digital" };
    if (host.includes("myntra.")) return { slug: "myntra", name: "Myntra" };
    if (host.includes("meesho.")) return { slug: "meesho", name: "Meesho" };
    if (host.includes("vijaysales.")) return { slug: "vijaysales", name: "Vijay Sales" };
    if (host.includes("tatacliq.")) return { slug: "tatacliq", name: "Tata CLiQ" };
    return { slug: "", name: host };
  }

  function amazonExternalId(doc, url) {
    const fromUrl = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (fromUrl) return fromUrl[1].toUpperCase();
    const asin = doc.querySelector('input#ASIN, input[name="ASIN"]')?.value;
    return clean(asin).toUpperCase();
  }

  function amazon(doc, url) {
    const title = pick(doc, ["#productTitle", "#title", "h1#title"]);
    const price = parsePrice(
      pick(doc, [
        "#corePrice_feature_div .a-offscreen",
        "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
        "#priceblock_ourprice",
        "#priceblock_dealprice",
        ".priceToPay .a-offscreen",
        "#tp_price_block_total_price_ww .a-offscreen",
        '[data-a-color="price"] .a-offscreen',
      ]),
    );
    const selected = Array.from(
      doc.querySelectorAll(
        "#twister .a-selected, #variation_color_name .selection, #variation_size_name .selection, #variation_style_name .selection, #inline-twister-expanded-dimension-text-color_name, #inline-twister-expanded-dimension-text-size_name, #inline-twister-expanded-dimension-text-style_name",
      ),
    )
      .map((node) => clean(node.textContent))
      .filter(Boolean);
    const variantHint = clean(selected.join(" "));
    return {
      name: title,
      price,
      sku: amazonExternalId(doc, url),
      brand: meta(doc, "product:brand"),
      availability: pick(doc, ["#availability span", "#availability"]),
      variantHint,
      source: price && title ? "amazon_dom" : "amazon_partial",
    };
  }

  function flipkart(doc, url) {
    const title = pick(doc, ["span.VU-ZEz", "span.B_NuCI", "h1._6EBuvT", "h1"]);
    const price = parsePrice(
      pick(doc, [
        "div.Nx9bqj",
        "div._30jeq3",
        "div._16Jk6d",
        "div._1vC4OE",
        '[class*="price"]',
      ]),
    );
    const selected = Array.from(
      doc.querySelectorAll(
        "._2cMfP0 ._3f2Svv, ._2cMfP0 a._1fGeJ5, ._3L1n0e, ._2Tpdn3, ._1psv1H, ._3n8fna",
      ),
    )
      .map((node) => clean(node.getAttribute("title") || node.textContent))
      .filter(Boolean);
    const urlParams = new URL(url).searchParams;
    return {
      name: title,
      price,
      sku: clean(urlParams.get("pid")),
      brand: meta(doc, "product:brand"),
      availability: pick(doc, ["._16FRp0", "._1dVbu9", "[class*='stock']"]),
      variantHint: clean(selected.join(" ")),
      source: price && title ? "flipkart_dom" : "flipkart_partial",
    };
  }

  function generic(doc) {
    const structured = fromJsonLd(doc);
    if (structured) return { ...structured, variantHint: "" };
    const title = clean(meta(doc, "og:title") || meta(doc, "twitter:title") || doc.querySelector("h1")?.textContent || doc.title);
    const price = parsePrice(
      meta(doc, "product:price:amount") ||
        meta(doc, "og:price:amount") ||
        pick(doc, ['[itemprop="price"]', "[data-price]", ".price", ".product-price"]),
    );
    return {
      name: title,
      price,
      sku: clean(meta(doc, "product:retailer_item_id") || meta(doc, "sku") || doc.querySelector('[itemprop="sku"]')?.getAttribute("content")),
      brand: clean(meta(doc, "product:brand") || meta(doc, "og:brand")),
      availability: clean(meta(doc, "product:availability")),
      variantHint: "",
      source: "generic_metadata",
    };
  }

  function compactQuery(name) {
    return clean(name)
      .replace(/^Buy\s+/i, "")
      .replace(/\s*[-|:]\s*(Amazon\.in|Flipkart|Croma|Reliance Digital|Tata CLiQ|Vijay Sales).*$/i, "")
      .replace(/\b(online at best price|at best price in india|free delivery|emi options?|with exchange offer)\b/gi, "")
      .replace(/\s+/g, " ")
      .slice(0, 180)
      .trim();
  }

  function isProductPage(url, product) {
    const parsed = new URL(url);
    if (/amazon\./i.test(parsed.hostname)) return /\/(?:dp|gp\/product)\//i.test(parsed.pathname);
    if (/flipkart\./i.test(parsed.hostname)) return /\/p\//i.test(parsed.pathname) && parsed.searchParams.has("pid");
    return Boolean(product.name && (product.price || product.sku));
  }

  function detectProduct(doc, url) {
    const retailer = retailerFor(url);
    let product;
    if (retailer.slug === "amazon") product = amazon(doc, url);
    else if (retailer.slug === "flipkart") product = flipkart(doc, url);
    else product = generic(doc);

    if (!product.name) product.name = clean(doc.title);
    if (!product.price) {
      const fallback = parsePrice(pick(doc, ['[itemprop="price"]', "[data-price]", ".price"]));
      product.price = fallback;
    }
    const variantHint = clean(
      [product.variantHint, product.name.match(/\b(?:64|128|256|512)\s?gb\b|\b1\s?tb\b/gi)?.join(" ")]
        .filter(Boolean)
        .join(" "),
    );
    return {
      ...product,
      query: compactQuery(product.name || doc.title),
      variantHint,
      pageUrl: url,
      retailer: retailer.slug || new URL(url).hostname.replace(/^www\./, ""),
      retailerName: retailer.name,
      title: clean(doc.title),
      isProductPage: isProductPage(url, product),
      confidence: product.source === "json_ld" ? "high" : product.price ? "medium" : "low",
      detectedAt: new Date().toISOString(),
    };
  }

  const api = { clean, parsePrice, detectProduct, compactQuery };
  if (typeof window !== "undefined") window.DISCOUNT_AI_PARSER = api;
  if (typeof module !== "undefined") module.exports = api;
})();
