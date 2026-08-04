Deno.test("records the clicked Jimeng element only after an original-video request", async () => {
  let runtimeMessageListener;
  const webRequestListeners = [];
  let storedValues = {};
  let capturedMessage = null;

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
        set(values) {
          storedValues = { ...storedValues, ...values };
        }
      }
    },
    tabs: {
      sendMessage(_tabId, message, callback) {
        capturedMessage = message;
        callback?.();
      }
    },
    webRequest: {
      onBeforeRequest: {
        addListener(listener) {
          webRequestListeners.push(listener);
        }
      }
    }
  };

  const source = await Deno.readTextFile(new URL("../background.js", import.meta.url));
  (0, eval)(source);

  const recipe = {
    ariaLabel: "下载原片",
    classNames: ["card-icon-button-test"],
    path: [2, 1, 0],
    rootKind: "record",
    tagName: "BUTTON",
    text: "",
    title: "下载原片"
  };
  let armResponse;
  runtimeMessageListener({
    type: "pixmax-cloner:jimeng-arm-protocol-capture",
    contextUrls: ["https://video.example.com/preview.mp4"],
    previewUrl: "https://video.example.com/preview.mp4",
    recipe,
    requestId: "record-test"
  }, { tab: { id: 42 } }, (response) => {
    armResponse = response;
  });
  if (!armResponse?.ok) throw new Error("recorder did not arm");

  for (const webRequestListener of webRequestListeners) {
    webRequestListener({
      method: "GET",
      tabId: 42,
      type: "xmlhttprequest",
      url: "https://media.vlabvod.com/path/original.mp4?signature=complete"
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 320));

  if (capturedMessage?.url !== "https://media.vlabvod.com/path/original.mp4?signature=complete") {
    throw new Error(`unexpected captured URL: ${capturedMessage?.url}`);
  }
  if (capturedMessage?.requestId !== "record-test") throw new Error("request correlation was lost");
  if (storedValues.pixmaxJimengDownloadRecipe?.path?.join(",") !== "2,1,0") {
    throw new Error("confirmed element recipe was not stored");
  }
});
