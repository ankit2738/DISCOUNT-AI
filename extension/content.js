(function () {
  function detect() {
    if (!window.DISCOUNT_AI_PARSER) {
      return { ok: false, error: "Product parser did not load. Reload the page after reinstalling the extension." };
    }
    const product = window.DISCOUNT_AI_PARSER.detectProduct(document, location.href);
    return { ok: true, product };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "DETECT_PRODUCT") sendResponse(detect());
    return false;
  });
})();
