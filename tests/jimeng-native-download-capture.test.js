Deno.test("binds a clicked Jimeng card to the official download protocol URL", async () => {
  const nativeOriginalUrl = "https://video.example.com/original.mp4?token=test";
  const previewUrl = "https://video.example.com/preview.mp4";
  const metadataUrl = "https://jimeng.jianying.com/mweb/v1/get_asset_list";
  const automaticOriginalUrl = "https://video.example.com/automatic-original.mp4?token=auto";
  const automaticPreviewUrl = "https://video.example.com/automatic-preview.mp4";
  const automaticPosterUrl = "https://image.example.com/automatic-cover.webp";
  let metadataPayload = {
    data: {
      videoInfo: {
        coverUrl: automaticPosterUrl,
        sceneVideoUrls: { downloadUrl: automaticOriginalUrl },
        videoUrl: automaticPreviewUrl
      }
    }
  };
  let nativeDownloadCalls = 0;
  const documentListeners = new Map();

  globalThis.window = globalThis;
  globalThis.location = {
    href: "https://jimeng.jianying.com/ai-tool/generate?type=video",
    origin: "https://jimeng.jianying.com"
  };
  globalThis.fetch = async (input) => {
    if (String(input) === metadataUrl) {
      return new Response(JSON.stringify(metadataPayload), { headers: { "content-type": "application/json" } });
    }
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "video/mp4" }
    });
  };
  globalThis.document = {
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
    body: { parentElement: null },
    documentElement: { dataset: {} },
    querySelectorAll(selector) {
      return selector === "video" ? [video] : [];
    }
  };
  globalThis.MouseEvent ||= class MouseEvent extends Event {};
  globalThis.XMLHttpRequest = class XMLHttpRequest {
    addEventListener() {}
    open() {}
    send() {}
  };

  const card = {
    className: "record-box-wrapper-test",
    parentElement: document.body,
    querySelector(selector) {
      return selector === "video" ? video : null;
    },
    querySelectorAll() {
      return [nativeDownloadButton];
    }
  };
  const video = {
    currentSrc: previewUrl,
    dispatchEvent() {},
    parentElement: card,
    src: previewUrl
  };
  const nativeDownloadButton = {
    className: "card-icon-button-test",
    closest() {
      return null;
    },
    getAttribute() {
      return null;
    },
    parentElement: card,
    textContent: ""
  };

  const source = await Deno.readTextFile(new URL("../jimeng-page.js", import.meta.url));
  (0, eval)(source);

  const chunkQueue = globalThis.__LOADABLE_LOADED_CHUNKS__;
  const parentPush = chunkQueue.push.bind(chunkQueue);
  const moduleFactories = {};
  function webpackJsonpCallback(payload) {
    Object.assign(moduleFactories, payload[1]);
    return parentPush(payload);
  }
  chunkQueue.push = webpackJsonpCallback;
  chunkQueue.push([[5682], {
    639131(module, exports, webpackRequire) {
      function nativeDownload(url) {
        nativeDownloadCalls += 1;
        return fetch(url);
      }
      webpackRequire.d(exports, { P: () => nativeDownload });
    }
  }]);

  const exports = {};
  const webpackRequire = function () {};
  webpackRequire.d = (target, definitions) => {
    for (const [key, getter] of Object.entries(definitions)) {
      Object.defineProperty(target, key, { enumerable: true, get: getter });
    }
  };
  moduleFactories[639131]({ exports }, exports, webpackRequire);
  documentListeners.get("click")({ target: nativeDownloadButton });
  await exports.P(nativeOriginalUrl, "original.mp4");

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("capture timed out")), 1500);
    const onResult = (event) => {
      if (event.detail?.requestId !== "test-request") return;
      clearTimeout(timeout);
      removeEventListener("pixmax-hub:jimeng-resolve-original-result", onResult);
      resolve(event.detail);
    };
    addEventListener("pixmax-hub:jimeng-resolve-original-result", onResult);
    dispatchEvent(new CustomEvent("pixmax-hub:jimeng-resolve-original", {
      detail: { previewUrl, requestId: "test-request" }
    }));
  });

  if (result.url !== nativeOriginalUrl) throw new Error(`unexpected URL: ${result.url}`);
  if (nativeDownloadCalls !== 1) throw new Error("the official download must not be blocked");
  if (document.documentElement.dataset.pixmaxHubNativeDownloadHook !== "ready") {
    throw new Error("download helper factory was not patched");
  }

  video.currentSrc = automaticPreviewUrl;
  video.src = automaticPreviewUrl;
  video.poster = automaticPosterUrl;
  await fetch(metadataUrl, {
    body: JSON.stringify({ count: 20 }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const automaticResult = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("automatic metadata resolve timed out")), 1500);
    const onResult = (event) => {
      if (event.detail?.requestId !== "automatic-request") return;
      clearTimeout(timeout);
      removeEventListener("pixmax-hub:jimeng-resolve-original-result", onResult);
      resolve(event.detail);
    };
    addEventListener("pixmax-hub:jimeng-resolve-original-result", onResult);
    dispatchEvent(new CustomEvent("pixmax-hub:jimeng-resolve-original", {
      detail: {
        contextUrls: [automaticPosterUrl],
        previewUrl: automaticPreviewUrl,
        requestId: "automatic-request"
      }
    }));
  });
  if (automaticResult.url !== automaticOriginalUrl) {
    throw new Error(`unexpected automatic URL: ${automaticResult.url}`);
  }
  if (nativeDownloadCalls !== 1) {
    throw new Error("metadata resolution must not download the video file");
  }

  const indexedRenditionUrl = "https://v3-artist.vlabvod.com/path/preview.mp4?br=1200";
  const indexedPlayerUrl = "https://another-player.example.com/blob-token/current.mp4?br=1200";
  const indexedPosterUrl = "https://p11-dreamina-sign.byteimg.com/card/cover-token.jpeg";
  const indexedOriginalUrl = "https://v3-artist.vlabvod.com/path/origin.mp4?br=11000";
  metadataPayload = {
    data: {
      asset_list: [{
        video: {
          item_list: [{
            common_attr: {
              cover_url: indexedPosterUrl,
              id: "7669845333408517427"
            },
            video: {
              transcoded_video: {
                "720p": {
                  definition: "720p",
                  size: 2_900_000,
                  video_url: indexedRenditionUrl
                },
                origin: {
                  definition: "origin",
                  size: 26_700_000,
                  video_url: indexedOriginalUrl
                }
              }
            }
          }]
        }
      }]
    }
  };
  video.currentSrc = indexedPlayerUrl;
  video.src = indexedPlayerUrl;
  video.poster = indexedPosterUrl;
  await fetch(metadataUrl, {
    body: JSON.stringify({ mode: "workbench-transcoded" }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const indexedResult = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("transcoded origin resolve timed out")), 1500);
    const onResult = (event) => {
      if (event.detail?.requestId !== "transcoded-request") return;
      clearTimeout(timeout);
      removeEventListener("pixmax-hub:jimeng-resolve-original-result", onResult);
      resolve(event.detail);
    };
    addEventListener("pixmax-hub:jimeng-resolve-original-result", onResult);
    dispatchEvent(new CustomEvent("pixmax-hub:jimeng-resolve-original", {
      detail: {
        contextUrls: [indexedPosterUrl],
        previewUrl: indexedPlayerUrl,
        requestId: "transcoded-request"
      }
    }));
  });
  if (indexedResult.url !== indexedOriginalUrl || indexedResult.verified !== true) {
    throw new Error(`transcoded origin was not verified: ${JSON.stringify(indexedResult)}`);
  }
});
