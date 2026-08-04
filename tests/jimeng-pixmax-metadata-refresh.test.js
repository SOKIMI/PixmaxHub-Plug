Deno.test("refreshes Jimeng prompt metadata without replacing an archived Pixmax URL", async () => {
  const originalFetch = globalThis.fetch;
  const originalChrome = globalThis.chrome;
  let runtimeMessageListener;
  let storedItem;
  const reviewFileUuid = "review-board-file";
  const pixmaxUrl = "https://cdn.pixmax.example/archive/original.mp4";
  const ownerText = [
    "Tester",
    "PIXMAX_CANVAS_CLONER_LIKES_V1",
    JSON.stringify({
      version: 1,
      ownerName: "Tester",
      color: "#ff3864",
      settings: {},
      items: [{
        likeKey: "jimeng:test-video-id",
        source: "jimeng",
        storageProvider: "pixmax",
        pixmaxAssetUuid: "asset-pixmax-123",
        pixmaxUrl,
        originalUrl: pixmaxUrl,
        url: pixmaxUrl,
        annotation: "",
        promptContent: [],
        referenceImages: []
      }]
    })
  ].join("\n");

  globalThis.chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener(listener) { runtimeMessageListener = listener; } }
    },
    storage: {
      local: {
        get(defaults, callback) { callback(defaults); },
        set(_values, callback) { callback?.(); }
      },
      sync: {
        get(defaults, callback) {
          callback({
            ...defaults,
            sharedLikesEnabled: true,
            sharedLikesFileUuid: reviewFileUuid,
            sharedLikesOwnerName: "Tester",
            sharedLikesColor: "#ff3864"
          });
        }
      }
    },
    tabs: { sendMessage(_tabId, _message, callback) { callback?.(); } },
    webRequest: { onBeforeRequest: { addListener() {} } }
  };

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target === "https://app.pixmax.cn/user/api/canvas/get") {
      return jsonResponse({
        success: true,
        data: {
          revision: 4,
          nodes: [{ uuid: "owner-node", type: "BASE_TEXT", metaData: "{}", nodeText: ownerText }]
        }
      });
    }
    if (target === "https://app.pixmax.cn/user/api/canvas/node/batch") {
      const body = JSON.parse(options.body);
      const nodeText = body.update?.[0]?.nodeText || "";
      const jsonStart = nodeText.indexOf("{", nodeText.indexOf("PIXMAX_CANVAS_CLONER_LIKES_V1"));
      storedItem = JSON.parse(nodeText.slice(jsonStart)).items[0];
      return jsonResponse({ success: true, data: {} });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const source = await Deno.readTextFile(new URL("../background.js", import.meta.url));
    (0, eval)(source);
    const response = await new Promise((resolve) => {
      runtimeMessageListener({
        type: "pixmax-cloner:refresh-external-liked-items",
        items: [{
          annotation: "镜头缓慢推近 @参考图 1",
          likeKey: "jimeng:test-video-id",
          mediaType: "video",
          name: "即梦原始标题",
          originalUrl: "https://v26-artist.vlabvod.com/sample-preview.mp4",
          originalVerified: false,
          previewUrl: "https://v26-artist.vlabvod.com/sample-preview.mp4",
          promptContent: [
            { type: "text", text: "镜头缓慢推近 " },
            { type: "image", referenceIndex: 0, name: "参考图 1" }
          ],
          referenceImages: [{ name: "参考图 1", url: "https://example.com/reference.jpg" }],
          source: "jimeng",
          url: "https://v26-artist.vlabvod.com/sample-preview.mp4"
        }]
      }, { tab: { id: 1 } }, resolve);
    });

    if (!response?.ok || response.updated !== 1) {
      throw new Error(`Metadata refresh failed: ${JSON.stringify(response)}`);
    }
    if (storedItem?.url !== pixmaxUrl || storedItem?.originalUrl !== pixmaxUrl) {
      throw new Error("A metadata-only refresh replaced the Pixmax original with the Jimeng preview");
    }
    if (storedItem?.annotation !== "镜头缓慢推近 @参考图 1"
      || storedItem?.promptContent?.[1]?.type !== "image"
      || storedItem?.referenceImages?.[0]?.url !== "https://example.com/reference.jpg") {
      throw new Error("The Jimeng prompt/reference structure was not repaired");
    }
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.chrome = originalChrome;
  }
});

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
