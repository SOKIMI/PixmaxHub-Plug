(() => {
  "use strict";

  if (window.__pixmaxHubJimengOriginalObserver) return;
  window.__pixmaxHubJimengOriginalObserver = true;

  const RESOLVE_EVENT = "pixmax-hub:jimeng-resolve-original";
  const RESOLVE_RESULT_EVENT = "pixmax-hub:jimeng-resolve-original-result";
  const MEDIA_CANDIDATE_EVENT = "pixmax-hub:jimeng-media-candidates";
  const MEDIA_CANDIDATE_REQUEST_EVENT = "pixmax-hub:jimeng-request-media-candidates";
  const RECORDED_ORIGINAL_EVENT = "pixmax-hub:jimeng-recorded-original";
  const AUTOMATIC_NATIVE_EVENT = "pixmax-hub:jimeng-run-recorded-download";
  const TRACE_EVENT = "pixmax-hub:jimeng-trace-event";
  const TRACE_START_EVENT = "pixmax-hub:jimeng-trace-start";
  const DOWNLOAD_HELPER_MODULE_ID = "639131";
  const DOWNLOAD_HELPER_FACTORY_MARKER = "__pixmaxHubDownloadCaptureFactory";
  const originalByPreviewKey = new Map();
  const originalByPreviewUrl = new Map();
  const originalByAlias = new Map();
  const originalCandidates = [];
  let recentVideoContext = null;
  let automaticNativeCapture = null;
  let candidateDispatchTimer = 0;
  let replayMetadataRequests = async () => {};
  let protocolTraceSession = null;
  let protocolTraceRequestSequence = 0;

  installWebpackDownloadCapture();
  installProtocolCapture();
  installProtocolTraceControl();

  function installWebpackDownloadCapture() {
    const chunkQueue = window.__LOADABLE_LOADED_CHUNKS__ = window.__LOADABLE_LOADED_CHUNKS__ || [];
    for (const payload of chunkQueue) patchDownloadHelperChunk(payload);

    const ownPush = Object.getOwnPropertyDescriptor(chunkQueue, "push")?.value;
    let pushImplementation = typeof ownPush === "function" ? ownPush : Array.prototype.push;
    Object.defineProperty(chunkQueue, "push", {
      configurable: true,
      enumerable: false,
      get() {
        const capturedImplementation = pushImplementation;
        return function (...payloads) {
          for (const payload of payloads) patchDownloadHelperChunk(payload);
          return Reflect.apply(capturedImplementation, this, payloads);
        };
      },
      set(nextImplementation) {
        if (typeof nextImplementation === "function") pushImplementation = nextImplementation;
      }
    });
  }

  function patchDownloadHelperChunk(payload) {
    const modules = Array.isArray(payload) && payload[1];
    if (!modules || typeof modules !== "object") return;
    const originalFactory = modules[DOWNLOAD_HELPER_MODULE_ID];
    if (typeof originalFactory !== "function" || originalFactory[DOWNLOAD_HELPER_FACTORY_MARKER]) return;

    function capturedDownloadFactory(module, exports, webpackRequire) {
      const originalDefine = webpackRequire?.d;
      if (typeof originalDefine !== "function") {
        return Reflect.apply(originalFactory, this, arguments);
      }

      let wrappedDownload;
      let wrappedOriginal;
      webpackRequire.d = function (target, definitions) {
        if (target === exports && definitions && typeof definitions.P === "function") {
          const originalGetter = definitions.P;
          definitions = {
            ...definitions,
            P: () => {
              const nativeDownload = originalGetter();
              if (typeof nativeDownload !== "function") return nativeDownload;
              if (wrappedDownload && wrappedOriginal === nativeDownload) return wrappedDownload;
              wrappedOriginal = nativeDownload;
              wrappedDownload = function (url, filename, ...rest) {
                const automaticCapture = automaticNativeCapture;
                const normalizedUrl = clean(url);
                if (/^https?:\/\//i.test(normalizedUrl)) {
                  emitProtocolTraceEvent({
                    filename: String(filename || ""),
                    method: "GET",
                    phase: "native-download-helper",
                    requestId: nextProtocolTraceRequestId("native"),
                    url: normalizedUrl
                  });
                  rememberProtocolOriginal(normalizedUrl, {
                    filename: String(filename || ""),
                    hint: "jimeng-native-download-helper"
                  });
                }
                if (automaticCapture && /^https?:\/\//i.test(normalizedUrl)) {
                  return Promise.resolve({ ok: true });
                }
                return Reflect.apply(nativeDownload, this, [url, filename, ...rest]);
              };
              return wrappedDownload;
            }
          };
        }
        return Reflect.apply(originalDefine, this, [target, definitions]);
      };

      try {
        return Reflect.apply(originalFactory, this, arguments);
      } finally {
        webpackRequire.d = originalDefine;
      }
    }

    Object.defineProperty(capturedDownloadFactory, DOWNLOAD_HELPER_FACTORY_MARKER, { value: true });
    modules[DOWNLOAD_HELPER_MODULE_ID] = capturedDownloadFactory;
    if (document.documentElement) document.documentElement.dataset.pixmaxHubNativeDownloadHook = "ready";
  }

  function clean(value) {
    return String(value || "")
      .replace(/\\u0026/g, "&")
      .replace(/&amp;/g, "&")
      .trim();
  }

  function mediaKey(value) {
    try {
      const path = new URL(clean(value)).pathname.replace(/\/+$/, "");
      const id = path.split("/").filter(Boolean).pop() || "";
      return id ? `jimeng:${id}` : "";
    } catch {
      return "";
    }
  }

  function normalizeComparableUrl(value) {
    try {
      const url = new URL(clean(value));
      url.hash = "";
      return url.href;
    } catch {
      return clean(value);
    }
  }

  function mediaAliases(value) {
    const aliases = new Set();
    try {
      const url = new URL(clean(value));
      url.hash = "";
      aliases.add(`url:${url.href}`);
      aliases.add(`path:${url.pathname.replace(/\/+$/, "")}`);
      const segments = url.pathname.split("/").filter(Boolean);
      const basename = segments.at(-1) || "";
      if (basename) aliases.add(`basename:${basename}`);
      for (const [key, entry] of url.searchParams) {
        if (!entry || entry.length < 8) continue;
        if (/^(?:id|vid|video|video_id|videoid|uri|tos_uri|file_id|fileid|resource_id)$/i.test(key)) {
          aliases.add(`query:${key.toLowerCase()}:${entry}`);
          aliases.add(`token:${entry}`);
        }
      }
      for (const segment of segments) {
        if (segment.length >= 16 && /^[0-9a-z._~-]+$/i.test(segment)) aliases.add(`token:${segment}`);
      }
    } catch {
      // Only absolute HTTP(S) media URLs are indexed.
    }
    return [...aliases];
  }

  function collectRelatedAssetUrls(value, depth = 0, contextKey = "videoInfo", output = new Set(), visited = new Set()) {
    if (!value || typeof value !== "object" || depth > 5 || visited.has(value)) return output;
    visited.add(value);
    let entries;
    try {
      entries = Object.entries(value).slice(0, 300);
    } catch {
      return output;
    }
    for (const [key, entry] of entries) {
      if (typeof entry === "string") {
        const url = clean(entry);
        if (/^https?:\/\//i.test(url)
          && /(?:video|play|url|link|download|transcode|origin|source|cover|poster)/i.test(`${contextKey} ${key}`)) {
          output.add(url);
        }
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      if (/video|play|url|media|scene|content|source|origin|cover|poster/i.test(`${contextKey} ${key}`)) {
        collectRelatedAssetUrls(entry, depth + 1, key, output, visited);
      }
    }
    return output;
  }

  function rememberOriginal(downloadUrl, previewUrls = [], hint = "jimeng-asset-response", metadata = {}) {
    const normalizedDownloadUrl = clean(downloadUrl);
    if (!/^https?:\/\//i.test(normalizedDownloadUrl)) return null;
    const normalizedPreviews = [...new Set(previewUrls
      .map(clean)
      .filter((url) => /^https?:\/\//i.test(url) && url !== normalizedDownloadUrl))];
    const existing = originalCandidates.find((candidate) => candidate.url === normalizedDownloadUrl);
    const candidate = existing || {
      hint,
      observedAt: Date.now(),
      previewUrls: [],
      url: normalizedDownloadUrl
    };
    candidate.hint = hint || candidate.hint;
    candidate.observedAt = Date.now();
    candidate.definition = String(metadata.definition || candidate.definition || "");
    candidate.itemId = String(metadata.itemId || candidate.itemId || "");
    candidate.size = Number(metadata.size || candidate.size || 0);
    candidate.verified = Boolean(metadata.verified || candidate.verified);
    candidate.previewUrls = [...new Set([...candidate.previewUrls, ...normalizedPreviews])].slice(0, 40);
    if (!existing) originalCandidates.unshift(candidate);
    if (originalCandidates.length > 300) originalCandidates.length = 300;

    for (const previewUrl of candidate.previewUrls) {
      originalByPreviewUrl.set(normalizeComparableUrl(previewUrl), normalizedDownloadUrl);
      const key = mediaKey(previewUrl);
      if (key) originalByPreviewKey.set(key, normalizedDownloadUrl);
      for (const alias of mediaAliases(previewUrl)) originalByAlias.set(alias, normalizedDownloadUrl);
    }
    scheduleCandidateDispatch();
    return candidate;
  }

  function rememberProtocolOriginal(url, { filename = "", hint = "jimeng-download-protocol" } = {}) {
    const contextUrls = automaticNativeCapture?.contextUrls || [];
    const previewUrl = clean(automaticNativeCapture?.previewUrl || recentVideoContext?.previewUrl);
    const candidate = rememberOriginal(
      url,
      [...contextUrls, previewUrl].filter(Boolean),
      hint,
      { definition: "origin", verified: true }
    );
    if (candidate && automaticNativeCapture) {
      finishAutomaticNativeCapture({
        filename,
        source: hint,
        url: candidate.url,
        verified: true
      });
    }
    return candidate;
  }

  function finishAutomaticNativeCapture(result = {}) {
    const capture = automaticNativeCapture;
    if (!capture) return;
    automaticNativeCapture = null;
    window.clearTimeout(capture.timer);
    dispatchResolveResult(capture.requestId, result);
  }

  function getCandidateEventDetails() {
    const details = [];
    for (const candidate of originalCandidates) {
      const previews = candidate.previewUrls.length ? candidate.previewUrls : [""];
      for (const previewUrl of previews) {
        details.push({
          contextKey: mediaKey(previewUrl),
          contextPreviewUrl: previewUrl,
          hint: candidate.hint,
          itemId: candidate.itemId,
          observedAt: candidate.observedAt,
          previewUrls: candidate.previewUrls,
          url: candidate.url,
          verified: Boolean(candidate.verified)
        });
        if (details.length >= 300) return details;
      }
    }
    return details;
  }

  function dispatchCandidates() {
    window.clearTimeout(candidateDispatchTimer);
    candidateDispatchTimer = 0;
    window.dispatchEvent(new CustomEvent(MEDIA_CANDIDATE_EVENT, {
      detail: getCandidateEventDetails()
    }));
  }

  function scheduleCandidateDispatch() {
    if (candidateDispatchTimer) return;
    candidateDispatchTimer = window.setTimeout(dispatchCandidates, 0);
  }

  function getVideoModel(value, contextKey = "") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    try {
      const videoContainer = value.video?.transcoded_video ? value.video : value;
      const transcodedVideo = videoContainer.transcoded_video || videoContainer.transcodedVideo;
      const origin = transcodedVideo?.origin;
      const originUrl = clean(origin?.video_url || origin?.videoUrl);
      if (/^https?:\/\//i.test(originUrl) && String(origin?.definition || "origin").toLowerCase() === "origin") {
        const renditionUrls = Object.values(transcodedVideo)
          .map((rendition) => clean(rendition?.video_url || rendition?.videoUrl))
          .filter((url) => /^https?:\/\//i.test(url) && url !== originUrl);
        const associationUrls = [...new Set([
          ...renditionUrls,
          ...collectAssetIdentityUrls(value)
        ].filter((url) => url !== originUrl))];
        const largestPreviewSize = Math.max(0, ...Object.entries(transcodedVideo)
          .filter(([key]) => key !== "origin")
          .map(([, rendition]) => Number(rendition?.size) || 0));
        const originSize = Number(origin?.size) || 0;
        const verified = originSize > 0 && (!largestPreviewSize || originSize > largestPreviewSize * 1.2);
        const candidate = rememberOriginal(
          originUrl,
          associationUrls,
          "jimeng-transcoded-origin-response",
          {
            definition: "origin",
            itemId: value.common_attr?.id || value.commonAttr?.id || "",
            size: originSize,
            verified
          }
        );
        return {
          downloadUrl: candidate?.url || originUrl,
          previewKeys: associationUrls.map(mediaKey).filter(Boolean),
          verified
        };
      }
    } catch {
      // Continue with older sceneVideoUrls response shapes.
    }
    let sceneVideoUrls;
    let directSceneUrl = "";
    try {
      sceneVideoUrls = value.sceneVideoUrls || value.scene_video_urls;
      directSceneUrl = /scene.?video.?urls?/i.test(contextKey)
        ? value.downloadUrl || value.download_url
        : "";
    } catch {
      return null;
    }
    const downloadUrl = clean(
      sceneVideoUrls?.downloadUrl
      || sceneVideoUrls?.download_url
      || directSceneUrl
    );
    if (!/^https?:\/\//i.test(downloadUrl)) {
      const protocolDownloadUrl = clean(value.downloadUrl || value.download_url);
      if (hasFreshVideoContext() && looksLikeVideoRequest(protocolDownloadUrl)) {
        rememberProtocolOriginal(protocolDownloadUrl, {
          hint: `jimeng-download-response:${contextKey}`
        });
        return { downloadUrl: protocolDownloadUrl, previewKeys: [] };
      }
      return null;
    }

    const relatedUrls = [...collectRelatedAssetUrls(value)];
    const previews = relatedUrls.filter((url) => clean(url) !== downloadUrl);
    rememberOriginal(downloadUrl, previews, "jimeng-sceneVideoUrls-response");
    const previewKeys = previews.map(mediaKey).filter(Boolean);
    return { downloadUrl, previewKeys };
  }

  function collectAssetIdentityUrls(value) {
    const urls = new Set();
    const add = (entry) => {
      if (typeof entry === "string") {
        const url = clean(entry);
        if (/^https?:\/\//i.test(url)) urls.add(url);
        return;
      }
      if (Array.isArray(entry)) {
        for (const item of entry.slice(0, 40)) add(item);
        return;
      }
      if (!entry || typeof entry !== "object") return;
      for (const item of Object.values(entry).slice(0, 80)) add(item);
    };
    const commonAttr = value?.common_attr || value?.commonAttr;
    add(commonAttr?.cover_url || commonAttr?.coverUrl);
    add(commonAttr?.cover_url_map || commonAttr?.coverUrlMap);
    add(commonAttr?.item_urls || commonAttr?.itemUrls);
    add(value?.cover_url || value?.coverUrl);
    add(value?.poster_url || value?.posterUrl);
    return [...urls];
  }

  function indexKnownAssetPayload(payload) {
    const data = payload?.data;
    if (!data || typeof data !== "object") return;
    const items = [];
    const appendItems = (value) => {
      if (!Array.isArray(value)) return;
      for (const item of value.slice(0, 500)) {
        if (item && typeof item === "object") items.push(item);
      }
    };
    appendItems(data.item_list || data.itemList);
    appendItems(data.asset_list || data.assetList);
    for (const asset of (data.asset_list || data.assetList || []).slice(0, 300)) {
      appendItems(asset?.item_list || asset?.itemList);
      appendItems(asset?.video?.item_list || asset?.video?.itemList);
    }
    for (const item of items) getVideoModel(item, "jimeng-known-asset-item");
  }

  function indexPayloadAsync(payload) {
    const urgent = [];
    const normal = [{ contextKey: "payload", depth: 0, value: payload }];
    const visited = new Set();
    let normalIndex = 0;
    let inspected = 0;

    const step = () => {
      let batchSize = 0;
      while ((urgent.length || normalIndex < normal.length) && inspected < 30000 && batchSize < 160) {
        const current = urgent.pop() || normal[normalIndex++];
        const value = current.value;
        if (!value || typeof value !== "object" || visited.has(value) || current.depth > 20) continue;
        visited.add(value);
        inspected += 1;
        batchSize += 1;
        getVideoModel(value, current.contextKey);

        let entries;
        try {
          entries = Object.entries(value).slice(0, 500);
        } catch {
          continue;
        }
        for (const [key, entry] of entries) {
          if (!entry || typeof entry !== "object") continue;
          const next = { contextKey: key, depth: current.depth + 1, value: entry };
          if (/scene.?video|video.?info|material|subject.?data|summary.?data|content|entity|record/i.test(key)) urgent.push(next);
          else normal.push(next);
        }
      }
      if ((urgent.length || normalIndex < normal.length) && inspected < 30000) {
        window.setTimeout(step, 0);
      }
    };
    window.setTimeout(step, 0);
  }

  function decodeJsonString(value) {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return String(value || "").replace(/\\\//g, "/").replace(/\\u0026/g, "&");
    }
  }

  function indexResponseText(text) {
    if (!text || text.length > 12_000_000) return;
    let parsedPayload = null;
    if (/transcoded_video|transcodedVideo/.test(text)) {
      try {
        parsedPayload = JSON.parse(text);
        indexKnownAssetPayload(parsedPayload);
      } catch {
        // Continue with the generic response index below.
      }
    }
    if (!/scene_video_urls|sceneVideoUrls/.test(text)) {
      if (/transcoded_video|transcodedVideo/.test(text)
        || (hasFreshVideoContext() && /download_url|downloadUrl/.test(text))) {
        try {
          indexPayloadAsync(parsedPayload || JSON.parse(text));
        } catch {
          // Only valid JSON protocol responses are inspected.
        }
      }
      return;
    }
    const scenePattern = /"(?:scene_video_urls|sceneVideoUrls)"\s*:/g;
    let sceneMatch;
    let indexed = 0;
    while ((sceneMatch = scenePattern.exec(text)) && indexed < 300) {
      const before = text.slice(Math.max(0, sceneMatch.index - 20_000), sceneMatch.index);
      const after = text.slice(sceneMatch.index, sceneMatch.index + 8_000);
      const previewPattern = /"(?:video_url|videoUrl|link)"\s*:\s*"((?:\\.|[^"\\])*)"/g;
      let previewMatch;
      let nearestPreview = null;
      while ((previewMatch = previewPattern.exec(before))) nearestPreview = previewMatch;
      const downloadMatch = after.match(/"(?:download_url|downloadUrl)"\s*:\s*"((?:\\.|[^"\\])*)"/);
      if (!nearestPreview || !downloadMatch) continue;
      const previewUrl = decodeJsonString(nearestPreview[1]);
      const downloadUrl = clean(decodeJsonString(downloadMatch[1]));
      if (/^https?:\/\//i.test(previewUrl) && /^https?:\/\//i.test(downloadUrl)) {
        rememberOriginal(downloadUrl, [previewUrl], "jimeng-sceneVideoUrls-text-response");
        indexed += 1;
      }
    }
    try {
      indexPayloadAsync(parsedPayload || JSON.parse(text));
    } catch {
      // The fast text index above still works for non-JSON response bodies.
    }
  }

  function findCard(video) {
    let node = video;
    let cardFallback = null;
    while (node && node !== document.body) {
      const className = String(node.className || "");
      if (className.includes("record-box-wrapper-")) return node;
      if (!cardFallback && (
        className.includes("video-card-wrapper-")
        || className.includes("video-card-container-")
      )) cardFallback = node;
      node = node.parentElement;
    }
    return cardFallback || video.parentElement;
  }

  function collectReactRoots(video) {
    const card = findCard(video);
    const ancestorNodes = [];
    let ancestor = video;
    for (let depth = 0; ancestor && ancestor !== document.body && depth < 28; depth += 1) {
      ancestorNodes.push(ancestor);
      ancestor = ancestor.parentElement;
    }
    const nodes = card
      ? [
          ...ancestorNodes,
          card,
          ...card.querySelectorAll("*")
        ].slice(0, 1600)
      : ancestorNodes;
    const roots = [];
    const visitedNodes = new Set();
    const visitedFibers = new Set();

    for (const node of nodes) {
      if (!node || visitedNodes.has(node)) continue;
      visitedNodes.add(node);
      let ownKeys;
      try {
        ownKeys = Object.getOwnPropertyNames(node);
      } catch {
        continue;
      }
      for (const key of ownKeys) {
        if (/^__reactProps/.test(key)) {
          try {
            roots.push({ contextKey: "reactProps", value: node[key] });
          } catch {
            // Ignore detached or guarded React nodes.
          }
        }
        if (!/^__reactFiber/.test(key)) continue;
        let fiber;
        try {
          fiber = node[key];
        } catch {
          continue;
        }
        for (let level = 0; level < 60 && fiber; level += 1, fiber = fiber.return) {
          if (visitedFibers.has(fiber)) continue;
          visitedFibers.add(fiber);
          roots.push(
            { contextKey: "memoizedProps", value: fiber.memoizedProps },
            { contextKey: "pendingProps", value: fiber.pendingProps },
            { contextKey: "memoizedState", value: fiber.memoizedState }
          );
        }
      }
    }
    return roots;
  }

  function getObjectEntries(value, limit = 600) {
    const entries = [];
    const keys = [];
    try {
      keys.push(...Object.getOwnPropertyNames(value));
    } catch {
      return entries;
    }
    try {
      keys.push(...Object.getOwnPropertySymbols(value));
    } catch {
      // String keys are still usable.
    }
    const priorityPattern = /scene.?video|video.?info|material|subject.?data|summary.?data|content|entity|record|common.?attr|items?/i;
    keys.sort((first, second) => {
      const firstPriority = priorityPattern.test(String(first)) ? 0 : 1;
      const secondPriority = priorityPattern.test(String(second)) ? 0 : 1;
      return firstPriority - secondPriority;
    });
    const seen = new Set();
    for (const key of keys) {
      if (seen.has(key) || entries.length >= limit) continue;
      seen.add(key);
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
      } catch {
        continue;
      }
      if (!descriptor || !("value" in descriptor)) continue;
      entries.push([String(key), descriptor.value]);
    }
    return entries;
  }

  function findOriginalInReact(video, expectedPreviewKey) {
    const urgent = [];
    const normal = collectReactRoots(video).map((root) => ({
      contextKey: root.contextKey,
      depth: 0,
      value: root.value
    }));
    const visited = new Set();
    let normalIndex = 0;
    let inspected = 0;
    let cardFallbackUrl = "";

    while ((urgent.length || normalIndex < normal.length) && inspected < 14000) {
      const current = urgent.pop() || normal[normalIndex++];
      const value = current.value;
      if (!value || (typeof value !== "object" && typeof value !== "function") || visited.has(value) || current.depth > 22) continue;
      visited.add(value);
      inspected += 1;

      const model = getVideoModel(value, current.contextKey);
      if (model?.previewKeys.includes(expectedPreviewKey)) return model.downloadUrl;
      if (model?.downloadUrl && !cardFallbackUrl) cardFallbackUrl = model.downloadUrl;

      let entries;
      try {
        entries = getObjectEntries(value);
      } catch {
        continue;
      }
      for (const [key, entry] of entries) {
        if (!entry || typeof entry !== "object") continue;
        const next = { contextKey: key, depth: current.depth + 1, value: entry };
        if (/scene.?video|video.?info|material|subject.?data|summary.?data|content|entity|record|common.?attr|items?/i.test(key)) urgent.push(next);
        else normal.push(next);
      }
    }
    return cardFallbackUrl;
  }

  function resolveOriginalUrl(video, contextUrls = []) {
    const previewUrl = clean(video?.currentSrc || video?.src);
    const lookupUrls = [...new Set([previewUrl, ...contextUrls].map(clean).filter(Boolean))];
    if (!lookupUrls.length) return "";
    for (const lookupUrl of lookupUrls) {
      const exactMatch = originalByPreviewUrl.get(normalizeComparableUrl(lookupUrl));
      if (exactMatch) return exactMatch;
      const lookupKey = mediaKey(lookupUrl);
      if (lookupKey && originalByPreviewKey.has(lookupKey)) {
        return originalByPreviewKey.get(lookupKey);
      }
      for (const alias of mediaAliases(lookupUrl)) {
        const aliasMatch = originalByAlias.get(alias);
        if (aliasMatch) return aliasMatch;
      }
    }
    return findOriginalInReact(video, mediaKey(previewUrl))
      || "";
  }

  function dispatchResolveResult(requestId, result = {}) {
    window.dispatchEvent(new CustomEvent(RESOLVE_RESULT_EVENT, {
      detail: {
        error: String(result.error || ""),
        filename: String(result.filename || ""),
        requestId,
        source: String(result.source || ""),
        url: clean(result.url),
        verified: Boolean(result.verified)
      }
    }));
  }

  async function resolveCapturedOriginal(video, requestId, contextUrls = [], forceRefresh = false) {
    if (!forceRefresh) {
      for (const waitMs of [0, 80, 220]) {
        if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
        const indexedUrl = resolveOriginalUrl(video, contextUrls);
        if (!indexedUrl) continue;
        const candidate = originalCandidates.find((item) => item.url === indexedUrl);
        dispatchResolveResult(requestId, {
          source: candidate?.hint || "jimeng-indexed-response",
          url: indexedUrl,
          verified: Boolean(candidate?.verified)
        });
        return;
      }
    }
    await replayMetadataRequests();
    for (const waitMs of [0, 80, 220]) {
      if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      const indexedUrl = resolveOriginalUrl(video, contextUrls);
      if (!indexedUrl) continue;
      const candidate = originalCandidates.find((item) => item.url === indexedUrl);
      dispatchResolveResult(requestId, {
        source: candidate?.hint || "jimeng-indexed-response",
        url: indexedUrl,
        verified: Boolean(candidate?.verified)
      });
      return;
    }
    dispatchResolveResult(requestId, {
      error: "即梦素材接口没有返回这张卡片的原片 URL。请刷新即梦页面后重试爱心收藏。"
    });
  }

  window.addEventListener(RECORDED_ORIGINAL_EVENT, (event) => {
    const url = clean(event.detail?.url);
    const previewUrl = clean(event.detail?.previewUrl);
    const contextUrls = Array.isArray(event.detail?.contextUrls)
      ? event.detail.contextUrls.map(clean).filter(Boolean).slice(0, 30)
      : [];
    if (!/^https?:\/\//i.test(url) || !/^https?:\/\//i.test(previewUrl)) return;
    rememberOriginal(url, [previewUrl, ...contextUrls], "jimeng-webrequest-recording");
    const requestId = String(event.detail?.requestId || "");
    if (requestId && automaticNativeCapture?.requestId === requestId) {
      finishAutomaticNativeCapture({
        filename: String(event.detail?.filename || ""),
        source: "jimeng-webrequest-recording",
        url,
        verified: true
      });
      return;
    }
    if (requestId) dispatchResolveResult(requestId, {
      filename: String(event.detail?.filename || ""),
      source: "jimeng-webrequest-recording",
      url,
      verified: true
    });
  });

  window.addEventListener(AUTOMATIC_NATIVE_EVENT, (event) => {
    if (automaticNativeCapture) {
      finishAutomaticNativeCapture({ error: "录制的即梦下载操作已被新的请求替换。" });
    }
    const requestId = String(event.detail?.requestId || "");
    const previewUrl = clean(event.detail?.previewUrl);
    if (!requestId || !previewUrl) return;
    const contextUrls = Array.isArray(event.detail?.contextUrls)
      ? event.detail.contextUrls.map(clean).filter(Boolean).slice(0, 30)
      : [];
    recentVideoContext = { observedAt: Date.now(), previewUrl };
    const capture = {
      contextUrls,
      previewUrl,
      requestId,
      timer: 0
    };
    automaticNativeCapture = capture;
    capture.timer = window.setTimeout(() => {
      if (automaticNativeCapture === capture) {
        finishAutomaticNativeCapture({
          error: "已执行录制的下载操作，但没有观察到原片请求。请重新录制一次官方下载按钮。"
        });
      }
    }, 10000);
  });

  window.addEventListener(RESOLVE_EVENT, (event) => {
    const requestId = String(event.detail?.requestId || "");
    const previewUrl = clean(event.detail?.previewUrl);
    const contextUrls = Array.isArray(event.detail?.contextUrls)
      ? event.detail.contextUrls.map(clean).filter((url) => /^https?:\/\//i.test(url)).slice(0, 30)
      : [];
    const forceRefresh = Boolean(event.detail?.forceRefresh);
    if (!requestId || !previewUrl) return;
    const previewKey = mediaKey(previewUrl);
    const video = [...document.querySelectorAll("video")].find((candidate) => {
      const candidateUrl = clean(candidate.currentSrc || candidate.src);
      return candidateUrl === previewUrl || (previewKey && mediaKey(candidateUrl) === previewKey);
    });
    resolveCapturedOriginal(video, requestId, [previewUrl, ...contextUrls], forceRefresh).catch((error) => {
      dispatchResolveResult(requestId, {
        error: `读取即梦原片失败：${error?.message || String(error)}`
      });
    });
  });

  function getRequestUrl(input) {
    if (typeof input === "string") return clean(input);
    if (input instanceof URL) return input.href;
    return clean(input?.url);
  }

  function looksLikeVideoRequest(url) {
    if (!/^https?:\/\//i.test(url)) return false;
    try {
      const parsed = new URL(url);
      return /\.(?:mp4|mov|webm|m4v)(?:$|[?#])/i.test(parsed.href)
        || (/(?:^|\.)(?:vlabvod|byteimg|ibytedtos|bytecdn)\.com$/i.test(parsed.hostname)
          || /(?:^|\.)jimeng\.com$/i.test(parsed.hostname))
          && /video|tos|obj|media|download/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function hasFreshVideoContext() {
    return Boolean(recentVideoContext && Date.now() - recentVideoContext.observedAt < 5000);
  }

  function observeProtocolRequest(url, hint) {
    if (!looksLikeVideoRequest(url)) return;
    if (!hasFreshVideoContext()) return;
    rememberProtocolOriginal(url, { hint });
  }

  function findClickedVideo(target, clientX, clientY) {
    let node = typeof Element !== "undefined" && target instanceof Element ? target : target?.parentElement;
    for (let depth = 0; node && node !== document.body && depth < 16; depth += 1, node = node.parentElement) {
      if (node.matches?.(".pixmax-jimeng-like,.pixmax-jimeng-eagle")) return null;
      const video = node.matches?.("video") ? node : node.querySelector?.("video");
      if (video) return video;
    }
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    return [...document.querySelectorAll("video")]
      .map((video) => ({ rect: video.getBoundingClientRect(), video }))
      .filter(({ rect }) => clientX >= rect.left && clientX <= rect.right
        && clientY >= rect.top && clientY <= rect.bottom)
      .sort((first, second) => first.rect.width * first.rect.height - second.rect.width * second.rect.height)[0]?.video
      || null;
  }

  function isJimengMetadataRequest(url) {
    try {
      const parsed = new URL(clean(url), location.href);
      return parsed.origin === location.origin
        && /\/(?:get_asset_list|get_history|get_history_by_ids|mget_item_info)(?:[/?#]|$)/i.test(parsed.href);
    } catch {
      return false;
    }
  }

  function installProtocolTraceControl() {
    window.addEventListener(TRACE_START_EVENT, (event) => {
      const detail = event.detail && typeof event.detail === "object" ? event.detail : {};
      if (protocolTraceSession?.timer) window.clearTimeout(protocolTraceSession.timer);
      const expiresAt = Number(detail.expiresAt) || Date.now() + 24000;
      const session = {
        contextUrls: (Array.isArray(detail.contextUrls) ? detail.contextUrls : []).map(clean).filter(Boolean),
        expiresAt,
        previewUrl: clean(detail.previewUrl),
        timer: 0,
        traceId: String(detail.traceId || "")
      };
      protocolTraceSession = session;
      session.timer = window.setTimeout(() => {
        if (protocolTraceSession === session) protocolTraceSession = null;
      }, Math.max(1000, expiresAt - Date.now()));
      emitProtocolTraceEvent({
        phase: "page-trace-start",
        requestId: session.traceId,
        url: location.href
      });
      window.setTimeout(() => {
        if (protocolTraceSession === session) replayMetadataRequests().catch(() => {});
      }, 0);
    });
  }

  function hasActiveProtocolTrace() {
    if (!protocolTraceSession) return false;
    if (protocolTraceSession.expiresAt > Date.now()) return true;
    window.clearTimeout(protocolTraceSession.timer);
    protocolTraceSession = null;
    return false;
  }

  function nextProtocolTraceRequestId(prefix = "page") {
    protocolTraceRequestSequence += 1;
    return `${prefix}-${Date.now()}-${protocolTraceRequestSequence}`;
  }

  function emitProtocolTraceEvent(rawEvent) {
    if (!hasActiveProtocolTrace()) return;
    window.dispatchEvent(new CustomEvent(TRACE_EVENT, {
      detail: {
        ...rawEvent,
        traceId: protocolTraceSession.traceId
      }
    }));
  }

  function serializeProtocolTraceHeaders(rawHeaders) {
    try {
      return Object.fromEntries(new Headers(rawHeaders || {}).entries());
    } catch {
      if (!rawHeaders || typeof rawHeaders !== "object") return {};
      return Object.fromEntries(Object.entries(rawHeaders).map(([key, value]) => [key, String(value)]));
    }
  }

  async function serializeProtocolTraceBody(input, init, method) {
    if (/^(?:GET|HEAD)$/i.test(method)) return { body: "", bodyEncoding: "none" };
    const body = init?.body;
    if (typeof body === "string") return { body, bodyEncoding: "string" };
    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return { body: body.toString(), bodyEncoding: "url-search-params" };
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const entries = [];
      for (const [name, value] of body.entries()) {
        entries.push([name, typeof value === "string"
          ? value
          : { name: value.name, size: value.size, type: value.type }]);
      }
      return { body: JSON.stringify(entries), bodyEncoding: "form-data-summary" };
    }
    if (body != null) {
      return {
        body: `[${body.constructor?.name || typeof body}; binary body omitted]`,
        bodyEncoding: "binary-summary"
      };
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        return { body: await input.clone().text(), bodyEncoding: "request-clone-text" };
      } catch {
        return { body: "[streamed request body unavailable]", bodyEncoding: "unavailable" };
      }
    }
    return { body: "", bodyEncoding: "none" };
  }

  async function captureFetchTraceRequest(input, init, requestId, url) {
    if (!hasActiveProtocolTrace()) return;
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const body = await serializeProtocolTraceBody(input, init, method);
    emitProtocolTraceEvent({
      ...body,
      headers: serializeProtocolTraceHeaders(init?.headers || input?.headers),
      method,
      phase: "fetch-request",
      requestId,
      url
    });
  }

  async function captureFetchTraceResponse(response, requestId, startedAt, requestUrl) {
    if (!hasActiveProtocolTrace()) return;
    const headers = serializeProtocolTraceHeaders(response.headers);
    const contentType = response.headers.get("content-type") || "";
    const event = {
      contentType,
      durationMs: Math.max(0, performance.now() - startedAt),
      phase: "fetch-response",
      requestId,
      responseHeaders: headers,
      responseUrl: clean(response.url),
      status: response.status,
      statusText: response.statusText,
      url: requestUrl
    };
    if (/json|text|javascript|xml|x-www-form-urlencoded/i.test(contentType)) {
      try {
        const text = await response.clone().text();
        event.body = text.slice(0, 512000);
        event.bodyEncoding = "response-text";
        event.bodyTruncated = text.length > 512000;
      } catch (error) {
        event.error = `response clone failed: ${error?.message || error}`;
      }
    } else {
      event.body = "[binary response body omitted]";
      event.bodyEncoding = "binary-summary";
    }
    emitProtocolTraceEvent(event);
  }

  function parseXhrResponseHeaders(xhr) {
    const output = {};
    try {
      for (const line of String(xhr.getAllResponseHeaders?.() || "").split(/\r?\n/)) {
        const index = line.indexOf(":");
        if (index <= 0) continue;
        output[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      }
    } catch {
      // Some network failures expose no response headers.
    }
    return output;
  }

  function rememberMetadataRequest(templates, template) {
    if (!template?.url || !isJimengMetadataRequest(template.url)) return;
    const normalized = {
      body: typeof template.body === "string" ? template.body : undefined,
      headers: template.headers && typeof template.headers === "object" ? template.headers : {},
      method: String(template.method || "GET").toUpperCase(),
      url: new URL(template.url, location.href).href
    };
    const signature = `${normalized.method}\n${normalized.url}\n${normalized.body || ""}`;
    const existingIndex = templates.findIndex((item) => item.signature === signature);
    if (existingIndex >= 0) templates.splice(existingIndex, 1);
    templates.unshift({ ...normalized, signature });
    if (templates.length > 8) templates.length = 8;
  }

  async function captureFetchMetadataRequest(templates, input, init = {}) {
    const url = getRequestUrl(input);
    if (!isJimengMetadataRequest(url)) return;
    let method = String(init?.method || input?.method || "GET").toUpperCase();
    let body = typeof init?.body === "string" ? init.body : undefined;
    let headers = {};
    try {
      headers = Object.fromEntries(new Headers(init?.headers || input?.headers || {}).entries());
    } catch {
      // Replaying with same-origin cookies is normally sufficient.
    }
    if (body === undefined && typeof Request !== "undefined" && input instanceof Request && method !== "GET") {
      try {
        body = await input.clone().text();
      } catch {
        // Ignore streamed bodies that cannot be cloned.
      }
    }
    rememberMetadataRequest(templates, { body, headers, method, url });
  }

  function installProtocolCapture() {
    const metadataRequestTemplates = [];
    const rememberClickedCard = (event) => {
      const video = findClickedVideo(event.target, event.clientX, event.clientY);
      if (video) {
        recentVideoContext = {
          observedAt: Date.now(),
          previewUrl: clean(video.currentSrc || video.src)
        };
      }
      const anchor = typeof Element !== "undefined" && event.target instanceof Element
        ? event.target.closest?.("a[href]")
        : null;
      const anchorUrl = clean(anchor?.href);
      if (anchorUrl && looksLikeVideoRequest(anchorUrl) && (video || hasFreshVideoContext())) {
        rememberProtocolOriginal(anchorUrl, { hint: "jimeng-native-download-anchor" });
      }
    };
    document.addEventListener?.("pointerdown", rememberClickedCard, true);
    document.addEventListener?.("click", rememberClickedCard, true);

    window.addEventListener(MEDIA_CANDIDATE_REQUEST_EVENT, dispatchCandidates);

    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = async function (...args) {
        const requestUrl = getRequestUrl(args[0]);
        const traceRequestId = nextProtocolTraceRequestId("fetch");
        const traceStartedAt = performance.now();
        captureFetchTraceRequest(args[0], args[1], traceRequestId, requestUrl).catch(() => {});
        captureFetchMetadataRequest(metadataRequestTemplates, args[0], args[1]).catch(() => {});
        observeProtocolRequest(requestUrl, "jimeng-native-download-fetch");
        let response;
        try {
          response = await Reflect.apply(originalFetch, this, args);
        } catch (error) {
          emitProtocolTraceEvent({
            durationMs: Math.max(0, performance.now() - traceStartedAt),
            error: String(error?.message || error),
            phase: "fetch-error",
            requestId: traceRequestId,
            url: requestUrl
          });
          throw error;
        }
        captureFetchTraceResponse(response, traceRequestId, traceStartedAt, requestUrl).catch(() => {});
        try {
          const contentType = response.headers.get("content-type") || "";
          if (/json|text/i.test(contentType)) {
            response.clone().text().then(indexResponseText).catch(() => {});
          }
        } catch {
          // Never affect Jimeng's own request path.
        }
        return response;
      };
      replayMetadataRequests = async () => {
        for (const template of metadataRequestTemplates.slice(0, 4)) {
          const traceRequestId = nextProtocolTraceRequestId("metadata-replay");
          const traceStartedAt = performance.now();
          try {
            emitProtocolTraceEvent({
              body: template.body || "",
              bodyEncoding: "captured-template",
              headers: template.headers,
              method: template.method,
              phase: "fetch-request",
              requestId: traceRequestId,
              url: template.url
            });
            const response = await Reflect.apply(originalFetch, window, [template.url, {
              body: template.method === "GET" || template.method === "HEAD" ? undefined : template.body,
              credentials: "include",
              headers: template.headers,
              method: template.method
            }]);
            captureFetchTraceResponse(response, traceRequestId, traceStartedAt, template.url).catch(() => {});
            const text = await response.clone().text();
            indexResponseText(text);
          } catch (error) {
            emitProtocolTraceEvent({
              durationMs: Math.max(0, performance.now() - traceStartedAt),
              error: String(error?.message || error),
              phase: "fetch-error",
              requestId: traceRequestId,
              url: template.url
            });
            // One stale pagination request must not block the other captured requests.
          }
        }
      };
    }

    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__pixmaxJimengUrl = getRequestUrl(url);
      this.__pixmaxJimengMethod = String(method || "GET").toUpperCase();
      this.__pixmaxJimengHeaders = {};
      this.__pixmaxJimengTraceId = nextProtocolTraceRequestId("xhr");
      return Reflect.apply(xhrOpen, this, [method, url, ...rest]);
    };
    const xhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    if (typeof xhrSetRequestHeader === "function") {
      XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (this.__pixmaxJimengHeaders) this.__pixmaxJimengHeaders[String(name)] = String(value);
        return Reflect.apply(xhrSetRequestHeader, this, [name, value]);
      };
    }
    const xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      const traceStartedAt = performance.now();
      emitProtocolTraceEvent({
        body: typeof args[0] === "string"
          ? args[0]
          : args[0] == null ? "" : `[${args[0].constructor?.name || typeof args[0]}; binary body omitted]`,
        bodyEncoding: typeof args[0] === "string" ? "string" : args[0] == null ? "none" : "binary-summary",
        headers: this.__pixmaxJimengHeaders,
        method: this.__pixmaxJimengMethod,
        phase: "xhr-request",
        requestId: this.__pixmaxJimengTraceId,
        url: this.__pixmaxJimengUrl
      });
      rememberMetadataRequest(metadataRequestTemplates, {
        body: typeof args[0] === "string" ? args[0] : undefined,
        headers: this.__pixmaxJimengHeaders,
        method: this.__pixmaxJimengMethod,
        url: this.__pixmaxJimengUrl
      });
      observeProtocolRequest(this.__pixmaxJimengUrl, "jimeng-native-download-xhr");
      this.addEventListener("load", () => {
        try {
          if (this.responseType === "json" && this.response) indexPayloadAsync(this.response);
          else if (typeof this.responseText === "string") indexResponseText(this.responseText);
        } catch {
          // Binary and restricted XHR responses do not expose responseText.
        }
      }, { once: true });
      this.addEventListener("loadend", () => {
        const contentType = String(this.getResponseHeader?.("content-type") || "");
        let body = "[binary response body omitted]";
        let bodyEncoding = "binary-summary";
        let bodyTruncated = false;
        try {
          if (this.responseType === "json") {
            body = JSON.stringify(this.response);
            bodyEncoding = "json";
          } else if (!this.responseType || this.responseType === "text") {
            body = String(this.responseText || "");
            bodyEncoding = "response-text";
          }
          if (body.length > 512000) {
            body = body.slice(0, 512000);
            bodyTruncated = true;
          }
        } catch {
          body = "[response body unavailable]";
          bodyEncoding = "unavailable";
        }
        emitProtocolTraceEvent({
          body,
          bodyEncoding,
          bodyTruncated,
          contentType,
          durationMs: Math.max(0, performance.now() - traceStartedAt),
          phase: "xhr-response",
          requestId: this.__pixmaxJimengTraceId,
          responseHeaders: parseXhrResponseHeaders(this),
          responseUrl: clean(this.responseURL),
          status: this.status,
          statusText: this.statusText,
          url: this.__pixmaxJimengUrl
        });
      }, { once: true });
      return Reflect.apply(xhrSend, this, args);
    };
  }
})();
