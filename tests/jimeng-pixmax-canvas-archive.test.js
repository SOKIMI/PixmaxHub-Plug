Deno.test("uploads a verified Jimeng original into the target Pixmax canvas and stores only the Pixmax URL", async () => {
  const originalFetch = globalThis.fetch;
  const originalChrome = globalThis.chrome;
  let runtimeMessageListener;
  let archiveCreateNode;
  let authorizeRequest;
  let sharedStoredItem;
  let ossPutRequest;
  const progressMessages = [];
  const reviewFileUuid = "review-board-file";
  const archiveFileUuid = "1f17948c-7f24-6472-8b47-2979ca759811";
  const ownerText = [
    "Tester",
    "PIXMAX_CANVAS_CLONER_LIKES_V1",
    JSON.stringify({
      version: 1,
      ownerName: "Tester",
      color: "#ff3864",
      settings: {},
      items: []
    })
  ].join("\n");

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
    tabs: {
      sendMessage(_tabId, message, callback) {
        if (message?.type === "pixmax-cloner:jimeng-upload-progress") progressMessages.push(message);
        callback?.();
      }
    },
    webRequest: {
      onBeforeRequest: { addListener() {} }
    }
  };

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("v3-dreamnia.jimeng.com")) {
      return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
        status: 200,
        headers: { "content-length": "8", "content-type": "video/mp4" }
      });
    }
    if (target === "https://app.pixmax.cn/user/api/canvas/get") {
      const body = JSON.parse(options.body);
      if (body.fileUuid === reviewFileUuid) {
        return jsonResponse({
          success: true,
          data: {
            revision: 4,
            nodes: [{ uuid: "owner-node", type: "BASE_TEXT", metaData: "{}", nodeText: ownerText }]
          }
        });
      }
      if (body.fileUuid === archiveFileUuid) {
        return jsonResponse({ success: true, data: { revision: 9, nodes: [] } });
      }
    }
    if (target === "https://app.pixmax.cn/user/api/assets/oss/authorize") {
      authorizeRequest = JSON.parse(options.body);
      return jsonResponse({
        success: true,
        data: {
          endpoint: "https://oss-cn-test.aliyuncs.com",
          bucketName: "pixmax-test",
          accessKeyId: "temporary-id",
          accessKeySecret: "temporary-secret",
          securityToken: "temporary-token",
          objectKey: "jimeng/original.mp4",
          callbackUrl: "https://app.pixmax.cn/user/api/assets/oss/callback",
          callbackBody: "sessionId=test-session&object=${object}",
          callbackBodyType: "application/x-www-form-urlencoded",
          sessionId: "test-session",
          webUrl: "/fallback/original.mp4"
        }
      });
    }
    if (target === "https://pixmax-test.oss-cn-test.aliyuncs.com/jimeng/original.mp4") {
      ossPutRequest = options;
      return jsonResponse({
        assetUuid: "asset-pixmax-123",
        relativePath: "/callback/original.mp4",
        previewPath: "/callback/poster.jpg",
        width: 1920,
        height: 1080
      });
    }
    if (target === "https://app.pixmax.cn/user/api/assets/getAssetsLink") {
      return jsonResponse({
        success: true,
        data: [{
          assetsUuid: "asset-pixmax-123",
          webUrl: "/archive/original.mp4",
          previewWebUrl: "/archive/poster.jpg",
          ossSynced: true,
          ossDomain: "https://cdn.pixmax.example",
          width: 1920,
          height: 1080
        }]
      });
    }
    if (target === "https://app.pixmax.cn/user/api/canvas/node/batch") {
      const body = JSON.parse(options.body);
      if (body.fileUuid === archiveFileUuid) {
        archiveCreateNode = body.create?.[0];
      } else if (body.fileUuid === reviewFileUuid) {
        const nodeText = body.update?.[0]?.nodeText || "";
        const jsonStart = nodeText.indexOf("{", nodeText.indexOf("PIXMAX_CANVAS_CLONER_LIKES_V1"));
        sharedStoredItem = JSON.parse(nodeText.slice(jsonStart)).items[0];
      }
      return jsonResponse({ success: true, data: {} });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const source = await Deno.readTextFile(new URL("../background.js", import.meta.url));
    (0, eval)(source);
    const jimengSource = await Deno.readTextFile(new URL("../jimeng.js", import.meta.url));
    const runnerStart = jimengSource.indexOf("async function runUploadJob");
    const runnerEnd = jimengSource.indexOf("function findVideoByLikeKey", runnerStart);
    const runnerSource = jimengSource.slice(runnerStart, runnerEnd);
    const captureIndex = runnerSource.indexOf("captureOfficialOriginalUrl(currentVideo)");
    if (runnerSource.indexOf("buildJimengLikeItem(currentVideo)") < 0
      || runnerSource.indexOf("buildJimengLikeItem(currentVideo)") > captureIndex
      || runnerSource.lastIndexOf("buildJimengLikeItem(refreshedVideo)") < captureIndex) {
      throw new Error("Jimeng metadata must be merged from snapshots before and after the native download action");
    }
    const originalUrl = "https://v3-dreamnia.jimeng.com/signature/video/tos/original?br=11564&mime_type=video_mp4";
    const previewUrl = "https://v26-artist.vlabvod.com/hash/video/tos/sample?br=1273&mime_type=video_mp4";
    const response = await new Promise((resolve) => {
      runtimeMessageListener({
        type: "pixmax-cloner:toggle-external-like",
        item: {
          annotation: "让角色走向镜头 @参考图 1，然后转身",
          likeKey: "jimeng:test-video-id",
          mediaType: "video",
          name: "即梦测试视频",
          originalUrl,
          originalVerified: true,
          previewUrl,
          promptContent: [
            { type: "text", text: "让角色走向镜头 " },
            { type: "image", referenceIndex: 0, name: "参考图 1" },
            { type: "text", text: "，然后转身" }
          ],
          referenceImages: [{ name: "参考图 1", url: "https://example.com/reference.jpg" }],
          source: "jimeng",
          url: originalUrl,
          videoWidth: 1920,
          videoHeight: 1080,
          website: "https://jimeng.jianying.com/ai-tool/generate?type=video"
        }
      }, { tab: { id: 1 } }, resolve);
    });

    if (!response?.ok || response.liked !== true) {
      throw new Error(`Like failed: ${JSON.stringify(response)}`);
    }
    if (!ossPutRequest || !String(ossPutRequest.headers?.Authorization || "").startsWith("OSS temporary-id:")) {
      throw new Error("The video was not uploaded with an OSS authorization signature");
    }
    if (ossPutRequest.duplex !== "half" || typeof ossPutRequest.body?.getReader !== "function") {
      throw new Error("The Jimeng original was not streamed directly into Pixmax OSS");
    }
    if (!/^JM-\d{8}-\d{6} 即梦测试视频\.mp4$/.test(String(authorizeRequest?.fileName || ""))) {
      throw new Error(`The Pixmax asset filename has no time code: ${JSON.stringify(authorizeRequest)}`);
    }
    if (archiveCreateNode?.type !== "BASE_VIDEO" || archiveCreateNode?.defaultAssetUuid !== "asset-pixmax-123") {
      throw new Error(`The Pixmax video node was not created correctly: ${JSON.stringify(archiveCreateNode)}`);
    }
    const archiveMeta = JSON.parse(archiveCreateNode.metaData);
    if (archiveMeta.data?.pixmaxHubLikeKey !== "jimeng:test-video-id") {
      throw new Error("The archive node is missing its Jimeng identity metadata");
    }
    if (!/^JM-\d{8}-\d{6}$/.test(String(archiveMeta.data?.archiveCode || ""))) {
      throw new Error("The archive node is missing its searchable time code");
    }
    if (archiveMeta.data?.promptContent?.[1]?.type !== "image"
      || archiveMeta.data?.referenceImages?.[0]?.url !== "https://example.com/reference.jpg") {
      throw new Error("The archive node lost the Jimeng inline prompt/reference image structure");
    }
    if (sharedStoredItem?.url !== "https://cdn.pixmax.example/archive/original.mp4") {
      throw new Error(`Review Board did not store the Pixmax URL: ${JSON.stringify(sharedStoredItem)}`);
    }
    if (String(sharedStoredItem?.url || "").includes("jimeng.com") || sharedStoredItem?.linkMayExpire !== false) {
      throw new Error("Review Board retained the expiring Jimeng source URL");
    }
    if (sharedStoredItem?.promptContent?.[1]?.type !== "image"
      || sharedStoredItem?.referenceImages?.[0]?.url !== "https://example.com/reference.jpg") {
      throw new Error("Review Board lost the Jimeng prompt or reference images");
    }
    if (sharedStoredItem?.name !== "即梦测试视频"
      || !String(sharedStoredItem?.pixmaxAssetName || "").startsWith(`${sharedStoredItem.archiveCode} · `)) {
      throw new Error("Review Board did not preserve Jimeng metadata beside the coded Pixmax asset name");
    }
    if (sharedStoredItem?.fileUuid !== archiveFileUuid || sharedStoredItem?.nodeId !== archiveCreateNode.uuid) {
      throw new Error("Review Board did not retain the target Pixmax canvas node identity");
    }
    for (const state of ["authorizing", "processing", "saving", "success"]) {
      if (!progressMessages.some((message) => message.state === state)) {
        throw new Error(`The Jimeng upload queue never received the ${state} stage`);
      }
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
