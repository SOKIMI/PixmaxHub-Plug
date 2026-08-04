Deno.test("records and exports a redacted Jimeng download transaction", async () => {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    const adjusted = delay >= 20000 ? 200 : delay >= 4000 ? 30 : delay;
    return realSetTimeout(callback, adjusted, ...args);
  };
  globalThis.clearTimeout = (timer) => realClearTimeout(timer);

  try {
    let runtimeMessageListener;
    const listeners = {};
    let storedValues = {};
    const tabMessages = [];
    globalThis.chrome = {
      runtime: {
        getManifest() {
          return { version: "2.0.19" };
        },
        lastError: null,
        onMessage: {
          addListener(listener) {
            runtimeMessageListener = listener;
          }
        }
      },
      storage: {
        local: {
          get(defaults, callback) {
            callback({ ...defaults, ...storedValues });
          },
          set(values, callback) {
            storedValues = { ...storedValues, ...values };
            callback?.();
          }
        }
      },
      tabs: {
        sendMessage(_tabId, message, callback) {
          tabMessages.push(message);
          callback?.();
        }
      },
      webRequest: Object.fromEntries([
        "onBeforeRedirect",
        "onBeforeRequest",
        "onBeforeSendHeaders",
        "onCompleted",
        "onErrorOccurred",
        "onHeadersReceived"
      ].map((name) => [name, {
        addListener(listener) {
          (listeners[name] ||= []).push(listener);
        }
      }]))
    };

    const source = await Deno.readTextFile(new URL("../background.js", import.meta.url));
    (0, eval)(source);

    let startResponse;
    runtimeMessageListener({
      type: "pixmax-cloner:jimeng-trace-start",
      contextUrls: ["https://preview.example.com/video.mp4"],
      pageUrl: "https://jimeng.jianying.com/ai-tool/generate?workspace=123",
      previewUrl: "https://preview.example.com/video.mp4",
      workspace: "123"
    }, { tab: { id: 77 } }, (response) => {
      startResponse = response;
    });
    if (!startResponse?.ok || !startResponse.traceId) throw new Error("trace did not start");

    const apiUrl = "https://jimeng.jianying.com/mweb/v1/get_asset_list";
    const apiBody = JSON.stringify({ asset_id: "asset-123", count: 20 });
    for (const listener of listeners.onBeforeRequest || []) {
      listener({
        method: "POST",
        requestBody: { raw: [{ bytes: new TextEncoder().encode(apiBody).buffer }] },
        requestId: "api-request",
        tabId: 77,
        type: "xmlhttprequest",
        url: apiUrl
      });
    }
    for (const listener of listeners.onBeforeSendHeaders || []) {
      listener({
        method: "POST",
        requestHeaders: [
          { name: "Cookie", value: "session=secret-account-cookie" },
          { name: "Content-Type", value: "application/json" }
        ],
        requestId: "api-request",
        tabId: 77,
        type: "xmlhttprequest",
        url: apiUrl
      });
    }

    const originalUrl = "https://media.vlabvod.com/signature/6a7a2921/video/original.mp4?auth_key=1785800000-0-0-deadbeef&dy_q=1785785999";
    runtimeMessageListener({
      type: "pixmax-cloner:jimeng-trace-page-event",
      event: {
        filename: "original.mp4",
        method: "GET",
        phase: "native-download-helper",
        requestId: "native-1",
        url: originalUrl
      }
    }, { tab: { id: 77 } }, () => {});
    runtimeMessageListener({
      type: "pixmax-cloner:jimeng-trace-page-event",
      event: {
        body: JSON.stringify({ data: { videoInfo: { sceneVideoUrls: { downloadUrl: originalUrl } } } }),
        contentType: "application/json",
        phase: "fetch-response",
        requestId: "api-request",
        responseHeaders: { "content-type": "application/json", "set-cookie": "private=true" },
        responseUrl: apiUrl,
        status: 200,
        url: apiUrl
      }
    }, { tab: { id: 77 } }, () => {});

    await new Promise((resolve) => realSetTimeout(resolve, 90));

    const document = storedValues.pixmaxJimengLastFullTrace;
    if (!document) throw new Error("trace document was not stored");
    if (!document.summary.downloadUrls.includes(originalUrl)) throw new Error("original URL was not summarized");
    if (!document.summary.expiryMarkers.some((marker) => marker.name === "auth_key")) {
      throw new Error("auth_key expiry marker was not analyzed");
    }
    if (!document.summary.expiryMarkers.some((marker) => marker.name === "path_hex_timestamp")) {
      throw new Error("hex path expiry marker was not analyzed");
    }
    const headerEvent = document.events.find((event) => event.phase === "beforeSendHeaders");
    const cookie = headerEvent?.headers?.find((header) => header.name === "Cookie");
    if (!String(cookie?.value).startsWith("[REDACTED")) throw new Error("cookie was not redacted");
    const bodyEvent = document.events.find((event) => event.phase === "beforeRequest" && event.requestId === "api-request");
    if (!String(bodyEvent?.body).includes("asset-123")) throw new Error("request body was not preserved");
    const completion = tabMessages.find((message) => message.type === "pixmax-cloner:jimeng-trace-complete");
    if (!completion?.filename?.endsWith(".json")) throw new Error("trace document was not sent for download");
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
});
