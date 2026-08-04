Deno.test("blocks Jimeng preview samples and imports only a verified original", async () => {
  let runtimeMessageListener;
  let eagleFetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    eagleFetchCalls += 1;
    return new Response(JSON.stringify({ status: "success", data: {} }), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  };

  try {
    globalThis.chrome = {
      runtime: {
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
            callback(defaults);
          },
          set(_values, callback) {
            callback?.();
          }
        },
        sync: {
          get(defaults, callback) {
            callback({
              ...defaults,
              eagleApiUrl: "http://localhost:41595",
              eagleFolderId: "verified-originals",
              eagleFolderName: "Verified Originals"
            });
          }
        }
      },
      tabs: {
        sendMessage(_tabId, _message, callback) {
          callback?.();
        }
      },
      webRequest: {
        onBeforeRequest: { addListener() {} }
      }
    };

    const source = await Deno.readTextFile(new URL("../background.js", import.meta.url));
    (0, eval)(source);

    const previewUrl = "https://v26-artist.vlabvod.com/hash/6a70fca1/video/tos/sample?br=1273&mime_type=video_mp4";
    const sendImport = (originalUrl, originalVerified) => new Promise((resolve) => {
      runtimeMessageListener({
        type: "pixmax-cloner:eagle-import-url",
        item: {
          likeKey: "jimeng:sample",
          mediaType: "video",
          name: "即梦视频",
          originalUrl,
          originalVerified,
          previewUrl,
          source: "jimeng",
          url: originalUrl,
          website: "https://jimeng.jianying.com/ai-tool/generate?type=video"
        }
      }, { tab: { id: 1 } }, resolve);
    });

    const badResponse = await sendImport(previewUrl, true);
    if (badResponse?.ok !== false || !String(badResponse?.error).includes("预览小样")) {
      throw new Error(`preview was not rejected: ${JSON.stringify(badResponse)}`);
    }
    if (eagleFetchCalls !== 0) throw new Error("preview rejection must happen before the Eagle API call");

    const originalUrl = "https://v3-dreamnia.jimeng.com/signature/6a7a2921/video/tos/original?br=11564&mime_type=video_mp4";
    const goodResponse = await sendImport(originalUrl, true);
    if (!goodResponse?.ok) throw new Error(`verified original was rejected: ${JSON.stringify(goodResponse)}`);
    if (eagleFetchCalls !== 1) throw new Error("verified original was not sent to Eagle exactly once");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
