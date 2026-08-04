"use strict";

const MESSAGE = {
  EAGLE_IMPORT_URL: "pixmax-cloner:eagle-import-url",
  EAGLE_LIST_FOLDERS: "pixmax-cloner:eagle-list-folders",
  JIMENG_ARM_PROTOCOL_CAPTURE: "pixmax-cloner:jimeng-arm-protocol-capture",
  JIMENG_PROTOCOL_CAPTURED: "pixmax-cloner:jimeng-protocol-captured",
  JIMENG_TRACE_COMPLETE: "pixmax-cloner:jimeng-trace-complete",
  JIMENG_TRACE_PAGE_EVENT: "pixmax-cloner:jimeng-trace-page-event",
  JIMENG_TRACE_START: "pixmax-cloner:jimeng-trace-start",
  OPEN_REVIEW_BOARD: "pixmax-cloner:open-review-board",
  GET_EXTERNAL_LIKE_STATE: "pixmax-cloner:get-external-like-state",
  REFRESH_EXTERNAL_LIKED_ITEMS: "pixmax-cloner:refresh-external-liked-items",
  TOGGLE_EXTERNAL_LIKE: "pixmax-cloner:toggle-external-like"
};

const LIKES_STORAGE_KEY = "pixmaxLikedItems";
const JIMENG_DOWNLOAD_RECIPE_KEY = "pixmaxJimengDownloadRecipe";
const JIMENG_LAST_PROTOCOL_KEY = "pixmaxJimengLastProtocol";
const JIMENG_LAST_TRACE_KEY = "pixmaxJimengLastFullTrace";
const JIMENG_TRACE_HISTORY_KEY = "pixmaxJimengProtocolTraceHistory";
const PIXMAX_API_ORIGIN = "https://app.pixmax.cn";
const SHARED_LIKES_MARKER = "PIXMAX_CANVAS_CLONER_LIKES_V1";
const CANVAS_REVISION_CONFLICT = "Canvas.Revision.Conflict";
const DEFAULT_LIKE_COLOR = "#ff3864";
const SHARED_LIKE_OPTIONS_DEFAULTS = {
  sharedLikesEnabled: true,
  sharedLikesFileUuid: "",
  sharedLikesOwnerName: "",
  sharedLikesColor: DEFAULT_LIKE_COLOR
};

const DEFAULT_OPTIONS = {
  eagleApiUrl: "http://localhost:41595",
  eagleFolderId: "",
  eagleFolderName: ""
};

const jimengProtocolCaptures = new Map();
const jimengFullTraces = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === MESSAGE.JIMENG_ARM_PROTOCOL_CAPTURE) {
    const tabId = Number(sender?.tab?.id);
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: "无法识别当前即梦标签页。" });
      return false;
    }
    armJimengProtocolCapture(tabId, message);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === MESSAGE.JIMENG_TRACE_START) {
    const tabId = Number(sender?.tab?.id);
    if (!Number.isInteger(tabId) || tabId < 0) {
      sendResponse({ ok: false, error: "无法识别当前即梦标签页。" });
      return false;
    }
    const trace = startJimengFullTrace(tabId, message);
    sendResponse({ ok: true, expiresAt: trace.expiresAt, traceId: trace.traceId });
    return false;
  }

  if (message.type === MESSAGE.JIMENG_TRACE_PAGE_EVENT) {
    const tabId = Number(sender?.tab?.id);
    const trace = jimengFullTraces.get(tabId);
    if (!trace) {
      sendResponse({ ok: false, error: "没有正在进行的即梦协议录制。" });
      return false;
    }
    appendJimengTraceEvent(trace, normalizeJimengPageTraceEvent(message.event));
    if (isJimengTraceCompletionSignal(message.event, trace)) scheduleJimengTraceFinish(tabId, trace);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === MESSAGE.EAGLE_LIST_FOLDERS) {
    listEagleFolders()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: friendlyError(error) }));
    return true;
  }

  if (message.type === MESSAGE.EAGLE_IMPORT_URL) {
    importUrlToEagle(message.item)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: friendlyError(error) }));
    return true;
  }

  if (message.type === MESSAGE.OPEN_REVIEW_BOARD) {
    openReviewBoard()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: friendlyError(error) }));
    return true;
  }

  if (message.type === MESSAGE.GET_EXTERNAL_LIKE_STATE) {
    getExternalLikeState(message.keys)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: friendlyExternalError(error) }));
    return true;
  }

  if (message.type === MESSAGE.TOGGLE_EXTERNAL_LIKE) {
    toggleExternalLike(message.item)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: friendlyExternalError(error) }));
    return true;
  }

  if (message.type === MESSAGE.REFRESH_EXTERNAL_LIKED_ITEMS) {
    refreshExternalLikedItems(message.items)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: friendlyExternalError(error) }));
    return true;
  }

  return false;
});

const JIMENG_TRACE_DURATION_MS = 24000;
const JIMENG_TRACE_SETTLE_MS = 4500;
const JIMENG_TRACE_MAX_EVENTS = 1200;
const JIMENG_TRACE_MAX_TEXT = 512000;
const JIMENG_TRACE_MAX_BODY_TOTAL = 4000000;

function startJimengFullTrace(tabId, message) {
  const previous = jimengFullTraces.get(tabId);
  if (previous) finishJimengFullTrace(tabId, previous, "replaced");
  const now = Date.now();
  const trace = {
    bodyBytes: 0,
    contextUrls: (Array.isArray(message.contextUrls) ? message.contextUrls : [])
      .map(normalizeAssetUrl)
      .filter(Boolean)
      .slice(0, 40),
    droppedEvents: 0,
    events: [],
    expiresAt: now + JIMENG_TRACE_DURATION_MS,
    finishTimer: 0,
    pageUrl: normalizeAssetUrl(message.pageUrl),
    previewUrl: normalizeAssetUrl(message.previewUrl),
    startedAt: new Date(now).toISOString(),
    tabId,
    timeoutTimer: 0,
    traceId: `jimeng-trace-${now}-${Math.random().toString(36).slice(2, 10)}`,
    workspace: String(message.workspace || "").trim().slice(0, 100)
  };
  jimengFullTraces.set(tabId, trace);
  appendJimengTraceEvent(trace, {
    phase: "trace-start",
    source: "extension",
    url: trace.pageUrl
  });
  trace.timeoutTimer = setTimeout(() => finishJimengFullTrace(tabId, trace, "timeout"), JIMENG_TRACE_DURATION_MS);
  return trace;
}

function scheduleJimengTraceFinish(tabId, trace) {
  if (jimengFullTraces.get(tabId) !== trace) return;
  clearTimeout(trace.finishTimer);
  trace.finishTimer = setTimeout(() => finishJimengFullTrace(tabId, trace, "download-observed"), JIMENG_TRACE_SETTLE_MS);
}

function finishJimengFullTrace(tabId, trace, reason) {
  if (jimengFullTraces.get(tabId) !== trace) return;
  jimengFullTraces.delete(tabId);
  clearTimeout(trace.timeoutTimer);
  clearTimeout(trace.finishTimer);
  appendJimengTraceEvent(trace, {
    phase: "trace-finish",
    reason,
    source: "extension"
  });
  const document = buildJimengTraceDocument(trace, reason);
  chrome.storage.local.get({ [JIMENG_TRACE_HISTORY_KEY]: [] }, (result) => {
    const history = Array.isArray(result[JIMENG_TRACE_HISTORY_KEY])
      ? result[JIMENG_TRACE_HISTORY_KEY]
      : [];
    document.comparison = compareJimengTraceSummaries([document.summary, ...history]);
    const nextHistory = [document.summary, ...history
      .filter((item) => item?.traceId !== document.summary.traceId)]
      .slice(0, 20);
    chrome.storage.local.set({
      [JIMENG_LAST_TRACE_KEY]: document,
      [JIMENG_TRACE_HISTORY_KEY]: nextHistory
    }, () => {
      chrome.tabs.sendMessage(tabId, {
        type: MESSAGE.JIMENG_TRACE_COMPLETE,
        document,
        filename: buildJimengTraceFilename(document)
      }, () => void chrome.runtime.lastError);
    });
  });
}

function appendJimengTraceEvent(trace, event) {
  if (!trace || !event) return;
  if (trace.events.length >= JIMENG_TRACE_MAX_EVENTS) {
    trace.droppedEvents += 1;
    return;
  }
  let normalizedEvent = event;
  if (typeof event.body === "string") {
    const remaining = Math.max(0, JIMENG_TRACE_MAX_BODY_TOTAL - trace.bodyBytes);
    if (event.body.length > remaining) {
      normalizedEvent = {
        ...event,
        body: remaining
          ? `${event.body.slice(0, remaining)}\n[TRUNCATED BY TRACE TOTAL LIMIT]`
          : "[OMITTED: TRACE BODY LIMIT REACHED]",
        bodyTruncated: true
      };
    }
    trace.bodyBytes += Math.min(event.body.length, remaining);
  }
  trace.events.push({
    ...normalizedEvent,
    capturedAt: new Date().toISOString(),
    sequence: trace.events.length + 1
  });
}

function normalizeJimengPageTraceEvent(rawEvent) {
  const event = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
  return {
    body: truncateJimengTraceText(event.body),
    bodyEncoding: String(event.bodyEncoding || "").slice(0, 80),
    bodyTruncated: Boolean(event.bodyTruncated),
    contentType: String(event.contentType || "").slice(0, 300),
    durationMs: Number.isFinite(Number(event.durationMs)) ? Number(event.durationMs) : undefined,
    error: String(event.error || "").slice(0, 1000),
    filename: String(event.filename || "").slice(0, 500),
    headers: redactJimengTraceHeaders(event.headers),
    method: String(event.method || "").toUpperCase().slice(0, 20),
    phase: String(event.phase || "page-event").slice(0, 100),
    requestId: String(event.requestId || "").slice(0, 200),
    responseHeaders: redactJimengTraceHeaders(event.responseHeaders),
    responseUrl: normalizeAssetUrl(event.responseUrl),
    source: "page",
    status: Number.isFinite(Number(event.status)) ? Number(event.status) : undefined,
    statusText: String(event.statusText || "").slice(0, 300),
    url: normalizeAssetUrl(event.url)
  };
}

function redactJimengTraceHeaders(rawHeaders) {
  const entries = [];
  if (Array.isArray(rawHeaders)) {
    for (const entry of rawHeaders) {
      if (!entry) continue;
      entries.push([String(entry.name || entry[0] || ""), String(entry.value || entry[1] || "")]);
    }
  } else if (rawHeaders && typeof rawHeaders === "object") {
    for (const [name, value] of Object.entries(rawHeaders)) entries.push([name, String(value ?? "")]);
  }
  return entries
    .map(([rawName, rawValue]) => {
      const name = String(rawName || "").trim();
      if (!name) return null;
      const sensitive = /^(?:authorization|cookie|proxy-authorization|set-cookie|x-csrf-token|x-tt-token|x-bd-ticket-guard)/i.test(name);
      return {
        name,
        value: sensitive ? `[REDACTED ${rawValue.length} chars]` : truncateJimengTraceText(rawValue, 16000)
      };
    })
    .filter(Boolean)
    .slice(0, 200);
}

function truncateJimengTraceText(value, limit = JIMENG_TRACE_MAX_TEXT) {
  const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}\n[TRUNCATED ${text.length - limit} chars]` : text;
}

function isJimengTraceCompletionSignal(rawEvent, trace) {
  const event = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
  if (event.phase === "native-download-helper") return true;
  const url = normalizeAssetUrl(event.responseUrl || event.url);
  return url && isLikelyJimengOriginalTraceUrl(url, trace);
}

function isLikelyJimengOriginalTraceUrl(url, trace) {
  const normalized = normalizeAssetUrl(url);
  if (!normalized || normalized === trace.previewUrl || trace.contextUrls.includes(normalized)) return false;
  try {
    const parsed = new URL(normalized);
    const videoPath = /\.(?:mp4|mov|webm|m4v)(?:$|[?#])/i.test(parsed.href)
      || /(?:video|media|download|tos|obj)/i.test(parsed.pathname);
    const signed = [...parsed.searchParams.keys()].some((name) =>
      /(?:auth|sign|signature|token|expire|timestamp|x-amz)/i.test(name)
    );
    return videoPath && signed;
  } catch {
    return false;
  }
}

function buildJimengTraceDocument(trace, reason) {
  const downloadUrls = [];
  const jimengApiUrls = [];
  for (const event of trace.events) {
    const url = normalizeAssetUrl(event.responseUrl || event.url);
    if (!url) continue;
    if (event.phase === "native-download-helper" || isLikelyJimengOriginalTraceUrl(url, trace)) {
      if (!downloadUrls.includes(url)) downloadUrls.push(url);
    }
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "jimeng.jianying.com" && /(?:mweb|asset|history|video|download|generate)/i.test(parsed.pathname)) {
        if (!jimengApiUrls.includes(url)) jimengApiUrls.push(url);
      }
    } catch {
      // Ignore malformed URLs already excluded by normalizeAssetUrl.
    }
  }
  const expiryMarkers = downloadUrls.flatMap(analyzeJimengUrlExpiry);
  const finishedAt = new Date().toISOString();
  const version = chrome.runtime.getManifest?.().version || "unknown";
  const summary = {
    capturedBodyChars: trace.bodyBytes,
    downloadUrls,
    droppedEvents: trace.droppedEvents,
    eventCount: trace.events.length,
    expiryMarkers,
    extensionVersion: version,
    finishedAt,
    jimengApiUrls,
    pageUrl: trace.pageUrl,
    previewUrl: trace.previewUrl,
    reason,
    startedAt: trace.startedAt,
    traceId: trace.traceId,
    workspace: trace.workspace
  };
  return {
    events: trace.events,
    privacy: "Cookie、Authorization、CSRF 等账户凭据已脱敏；下载 URL 和响应正文被保留用于协议分析。",
    schema: "pixmax-jimeng-protocol-trace",
    schemaVersion: 1,
    summary
  };
}

function analyzeJimengUrlExpiry(rawUrl) {
  const markers = [];
  try {
    const url = new URL(rawUrl);
    let issuedAtSeconds = 0;
    for (const [name, value] of url.searchParams) {
      if (!/(?:auth|sign|signature|token|expire|timestamp|x-amz)|^(?:dy_q|ft|l)$/i.test(name)) continue;
      const marker = { host: url.hostname, name, value };
      const directTimestamp = Number(value);
      if (Number.isFinite(directTimestamp) && directTimestamp > 1_000_000_000) {
        const milliseconds = directTimestamp > 10_000_000_000 ? directTimestamp : directTimestamp * 1000;
        marker.timestampIso = new Date(milliseconds).toISOString();
      }
      if (/^auth_key$/i.test(name)) {
        const timestamp = Number(value.split("-")[0]);
        if (Number.isFinite(timestamp) && timestamp > 1_000_000_000) {
          marker.embeddedTimestampIso = new Date(timestamp * 1000).toISOString();
        }
      }
      if (/^dy_q$/i.test(name) && Number.isFinite(directTimestamp)) issuedAtSeconds = directTimestamp;
      markers.push(marker);
    }
    const segments = url.pathname.split("/").filter(Boolean);
    for (const [index, segment] of segments.entries()) {
      if (!/^[0-9a-f]{8}$/i.test(segment)) continue;
      const timestamp = Number.parseInt(segment, 16);
      const date = new Date(timestamp * 1000);
      if (timestamp < 1_500_000_000 || timestamp > 2_500_000_000) continue;
      markers.push({
        host: url.hostname,
        index,
        name: "path_hex_timestamp",
        timestampIso: date.toISOString(),
        validForSecondsFromDyQ: issuedAtSeconds ? timestamp - issuedAtSeconds : undefined,
        value: segment
      });
    }
  } catch {
    // The caller only supplies normalized HTTP(S) URLs.
  }
  return markers;
}

function buildJimengTraceFilename(document) {
  const date = String(document?.summary?.startedAt || new Date().toISOString())
    .replace(/[:.]/g, "-");
  const workspace = String(document?.summary?.workspace || "workspace").replace(/[^0-9a-z_-]+/gi, "-");
  return `PixmaxHub-Jimeng-Protocol-${workspace}-${date}.json`;
}

function compareJimengTraceSummaries(summaries) {
  const urls = summaries
    .map((summary) => normalizeAssetUrl(summary?.downloadUrls?.[0]))
    .filter(Boolean)
    .slice(0, 20);
  const parsedUrls = urls.map((url) => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }).filter(Boolean);
  const parameterNames = [...new Set(parsedUrls.flatMap((url) => [...url.searchParams.keys()]))].sort();
  const parameters = parameterNames.map((name) => {
    const values = parsedUrls.map((url) => url.searchParams.get(name)).filter((value) => value != null);
    const distinctValues = [...new Set(values)];
    return {
      appearsIn: values.length,
      distinctValueCount: distinctValues.length,
      likelyTemporary: /(?:auth|sign|signature|token|expire|timestamp|x-amz)|^(?:dy_q|ft|l|feature_id)$/i.test(name),
      name,
      stableAcrossSamples: values.length === parsedUrls.length && distinctValues.length === 1,
      values: distinctValues.slice(0, 20)
    };
  });
  const hosts = [...new Set(parsedUrls.map((url) => url.hostname))];
  return {
    canGuessCompleteSignedUrl: false,
    commonParameterNames: parameters
      .filter((item) => item.appearsIn === parsedUrls.length)
      .map((item) => item.name),
    hosts,
    note: "稳定的域名/路径/素材 ID 可以归纳；签名和过期字段仍必须由即梦服务端签发。",
    parameters,
    sampleCount: parsedUrls.length
  };
}

function decodeJimengRequestBody(requestBody) {
  if (!requestBody) return { body: "", bodyEncoding: "", bodyTruncated: false };
  if (requestBody.formData) {
    return {
      body: truncateJimengTraceText(requestBody.formData),
      bodyEncoding: "formData",
      bodyTruncated: false
    };
  }
  const rawParts = Array.isArray(requestBody.raw) ? requestBody.raw : [];
  if (!rawParts.length) return { body: "", bodyEncoding: "", bodyTruncated: false };
  let text = "";
  let totalBytes = 0;
  for (const part of rawParts) {
    const bytes = part?.bytes ? new Uint8Array(part.bytes) : null;
    if (!bytes) continue;
    totalBytes += bytes.byteLength;
    if (text.length < JIMENG_TRACE_MAX_TEXT) text += new TextDecoder().decode(bytes);
  }
  return {
    body: truncateJimengTraceText(text),
    bodyEncoding: "raw-utf8",
    bodyTruncated: totalBytes > JIMENG_TRACE_MAX_TEXT
  };
}

function recordJimengWebRequestPhase(phase, details, extra = {}) {
  const trace = jimengFullTraces.get(details?.tabId);
  if (!trace) return;
  const url = normalizeAssetUrl(details.url);
  if (!url) return;
  const event = {
    documentUrl: normalizeAssetUrl(details.documentUrl),
    frameId: details.frameId,
    fromCache: Boolean(details.fromCache),
    initiator: normalizeAssetUrl(details.initiator),
    ip: String(details.ip || ""),
    method: String(details.method || "").toUpperCase(),
    phase,
    requestId: String(details.requestId || ""),
    source: "webRequest",
    status: Number.isFinite(Number(details.statusCode)) ? Number(details.statusCode) : undefined,
    statusLine: String(details.statusLine || "").slice(0, 500),
    type: String(details.type || ""),
    url,
    ...extra
  };
  appendJimengTraceEvent(trace, event);
  if ((phase === "beforeRequest" || phase === "beforeRedirect") && isLikelyJimengOriginalTraceUrl(url, trace)) {
    scheduleJimengTraceFinish(details.tabId, trace);
  }
}

function armJimengProtocolCapture(tabId, message) {
  const previous = jimengProtocolCaptures.get(tabId);
  if (previous?.timer) clearTimeout(previous.timer);
  const contextUrls = (Array.isArray(message.contextUrls) ? message.contextUrls : [])
    .map(normalizeAssetUrl)
    .filter(Boolean)
    .slice(0, 30);
  const state = {
    automatic: Boolean(message.automatic),
    candidates: [],
    contextUrls,
    expiresAt: Date.now() + 12000,
    previewUrl: normalizeAssetUrl(message.previewUrl),
    recipe: normalizeJimengElementRecipe(message.recipe),
    requestId: String(message.requestId || ""),
    timer: 0
  };
  jimengProtocolCaptures.set(tabId, state);
  state.timer = setTimeout(() => {
    if (jimengProtocolCaptures.get(tabId) === state) jimengProtocolCaptures.delete(tabId);
  }, 12500);
}

function normalizeJimengElementRecipe(rawRecipe) {
  if (!rawRecipe || typeof rawRecipe !== "object") return null;
  const path = (Array.isArray(rawRecipe.path) ? rawRecipe.path : [])
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < 2000)
    .slice(0, 30);
  const classNames = (Array.isArray(rawRecipe.classNames) ? rawRecipe.classNames : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!path.length || !String(rawRecipe.tagName || "").trim()) return null;
  const rawPosition = rawRecipe.videoPosition;
  const videoPosition = rawPosition
    && Number.isFinite(Number(rawPosition.x))
    && Number.isFinite(Number(rawPosition.y))
    ? { x: Number(rawPosition.x), y: Number(rawPosition.y) }
    : null;
  return {
    ariaLabel: String(rawRecipe.ariaLabel || "").trim().slice(0, 200),
    classNames,
    path,
    rootKind: String(rawRecipe.rootKind || "record").trim().slice(0, 40),
    tagName: String(rawRecipe.tagName || "").trim().toUpperCase().slice(0, 30),
    text: String(rawRecipe.text || "").trim().slice(0, 200),
    title: String(rawRecipe.title || "").trim().slice(0, 200),
    videoPosition
  };
}

function isJimengProtocolVideoRequest(details) {
  const url = normalizeAssetUrl(details?.url);
  if (!url || String(details?.method || "GET").toUpperCase() !== "GET") return false;
  try {
    const parsed = new URL(url);
    const supportedHost = /(?:^|\.)(?:vlabvod|vlabstatic|byteimg|ibytedtos|bytecdn)\.com$/i.test(parsed.hostname)
      || /(?:^|\.)jimeng\.com$/i.test(parsed.hostname)
      || /(?:^|\.)bytecdn\.cn$/i.test(parsed.hostname)
      || /(?:^|\.)(?:volces|volccdn)\.com$/i.test(parsed.hostname);
    const videoPath = /\.(?:mp4|mov|webm|m4v)(?:$|[?#])/i.test(parsed.href)
      || /(?:video|media|download|tos|obj)/i.test(parsed.pathname);
    return supportedHost && videoPath && !/\.(?:m3u8|ts)(?:$|[?#])/i.test(parsed.href);
  } catch {
    return false;
  }
}

function scoreJimengProtocolRequest(details, state) {
  const url = String(details.url || "");
  let score = 0;
  if (details.type === "xmlhttprequest") score += 100;
  else if (details.type === "other") score += 70;
  else if (details.type === "media") score += 25;
  if (/\.(?:mp4|mov|webm|m4v)(?:$|[?#])/i.test(url)) score += 60;
  if (/download|original|origin|source|no_watermark|unwatermark/i.test(url)) score += 70;
  if (url !== state.previewUrl) score += 20;
  if (state.contextUrls.includes(url)) score -= 120;
  return score;
}

function finishJimengProtocolCapture(tabId, state) {
  if (jimengProtocolCaptures.get(tabId) !== state || !state.candidates.length) return;
  const best = state.candidates.sort((first, second) => second.score - first.score)[0];
  jimengProtocolCaptures.delete(tabId);
  clearTimeout(state.timer);
  const payload = {
    automatic: state.automatic,
    capturedAt: new Date().toISOString(),
    contextUrls: state.contextUrls,
    method: String(best.details.method || "GET"),
    previewUrl: state.previewUrl,
    recipe: state.recipe,
    requestId: state.requestId,
    requestType: String(best.details.type || ""),
    url: String(best.details.url || "")
  };
  const storageUpdate = { [JIMENG_LAST_PROTOCOL_KEY]: payload };
  if (state.recipe) storageUpdate[JIMENG_DOWNLOAD_RECIPE_KEY] = state.recipe;
  chrome.storage.local.set(storageUpdate);
  chrome.tabs.sendMessage(tabId, {
    type: MESSAGE.JIMENG_PROTOCOL_CAPTURED,
    ...payload
  }, () => void chrome.runtime.lastError);
}

if (chrome.webRequest?.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener((details) => {
    const state = jimengProtocolCaptures.get(details.tabId);
    if (!state) return;
    if (Date.now() > state.expiresAt) {
      jimengProtocolCaptures.delete(details.tabId);
      clearTimeout(state.timer);
      return;
    }
    if (!isJimengProtocolVideoRequest(details)) return;
    state.candidates.push({
      details: {
        method: details.method,
        type: details.type,
        url: details.url
      },
      score: scoreJimengProtocolRequest(details, state)
    });
    clearTimeout(state.timer);
    state.timer = setTimeout(() => finishJimengProtocolCapture(details.tabId, state), 260);
  }, {
    urls: [
      "https://*.vlabvod.com/*",
      "https://*.vlabstatic.com/*",
      "https://*.byteimg.com/*",
      "https://*.jimeng.com/*",
      "https://*.ibytedtos.com/*",
      "https://*.bytecdn.cn/*",
      "https://*.bytecdn.com/*",
      "https://*.volces.com/*",
      "https://*.volccdn.com/*"
    ]
  });
}

const JIMENG_TRACE_URL_FILTER = {
  urls: [
    "https://jimeng.jianying.com/*",
    "https://*.jianying.com/*",
    "https://*.jimeng.com/*",
    "https://*.vlabvod.com/*",
    "https://*.vlabstatic.com/*",
    "https://*.byteimg.com/*",
    "https://*.ibytedtos.com/*",
    "https://*.bytecdn.cn/*",
    "https://*.bytecdn.com/*",
    "https://*.volces.com/*",
    "https://*.volccdn.com/*"
  ]
};

if (chrome.webRequest?.onBeforeRequest) {
  chrome.webRequest.onBeforeRequest.addListener((details) => {
    const body = decodeJimengRequestBody(details.requestBody);
    recordJimengWebRequestPhase("beforeRequest", details, body);
  }, JIMENG_TRACE_URL_FILTER, ["requestBody"]);
}

if (chrome.webRequest?.onBeforeSendHeaders) {
  const listener = (details) => recordJimengWebRequestPhase("beforeSendHeaders", details, {
    headers: redactJimengTraceHeaders(details.requestHeaders)
  });
  try {
    chrome.webRequest.onBeforeSendHeaders.addListener(listener, JIMENG_TRACE_URL_FILTER, ["requestHeaders", "extraHeaders"]);
  } catch {
    chrome.webRequest.onBeforeSendHeaders.addListener(listener, JIMENG_TRACE_URL_FILTER, ["requestHeaders"]);
  }
}

if (chrome.webRequest?.onHeadersReceived) {
  const listener = (details) => recordJimengWebRequestPhase("headersReceived", details, {
    responseHeaders: redactJimengTraceHeaders(details.responseHeaders)
  });
  try {
    chrome.webRequest.onHeadersReceived.addListener(listener, JIMENG_TRACE_URL_FILTER, ["responseHeaders", "extraHeaders"]);
  } catch {
    chrome.webRequest.onHeadersReceived.addListener(listener, JIMENG_TRACE_URL_FILTER, ["responseHeaders"]);
  }
}

if (chrome.webRequest?.onBeforeRedirect) {
  chrome.webRequest.onBeforeRedirect.addListener((details) => {
    recordJimengWebRequestPhase("beforeRedirect", details, {
      redirectUrl: normalizeAssetUrl(details.redirectUrl),
      responseHeaders: redactJimengTraceHeaders(details.responseHeaders)
    });
  }, JIMENG_TRACE_URL_FILTER, ["responseHeaders"]);
}

if (chrome.webRequest?.onCompleted) {
  chrome.webRequest.onCompleted.addListener((details) => {
    recordJimengWebRequestPhase("completed", details, {
      encodedDataLength: Number(details.encodedDataLength) || 0,
      responseHeaders: redactJimengTraceHeaders(details.responseHeaders)
    });
  }, JIMENG_TRACE_URL_FILTER, ["responseHeaders"]);
}

if (chrome.webRequest?.onErrorOccurred) {
  chrome.webRequest.onErrorOccurred.addListener((details) => {
    recordJimengWebRequestPhase("error", details, {
      error: String(details.error || "").slice(0, 1000)
    });
  }, JIMENG_TRACE_URL_FILTER);
}

async function openReviewBoard() {
  const tab = await chrome.tabs.create({
    active: true,
    url: chrome.runtime.getURL("likes.html")
  });
  return { tabId: tab?.id };
}

async function listEagleFolders() {
  const options = await getStoredOptions();
  let result;

  try {
    result = await eagleFetch(
      options.eagleApiUrl,
      "/api/v2/folder/get?limit=1000",
      null,
      "GET"
    );
  } catch (_error) {
    result = await eagleFetch(options.eagleApiUrl, "/api/folder/list", null, "GET");
  }

  return {
    folders: flattenEagleFolders(extractEagleArrayData(result))
  };
}

async function importUrlToEagle(item) {
  const options = await getStoredOptions();
  if (!options.eagleFolderId) {
    throw new Error("请先点击扩展图标，设置 Eagle 目标目录。");
  }

  const website = /^https?:\/\//i.test(item?.website || "")
    ? item.website
    : "https://app.pixmax.cn/";
  const isJimengItem = /^https:\/\/jimeng\.jianying\.com\//i.test(website)
    || String(item?.source || "").toLowerCase() === "jimeng";
  const url = normalizeAssetUrl(isJimengItem ? item?.originalUrl : item?.url);
  if (!url) {
    throw new Error(isJimengItem
      ? "没有取得即梦原生下载操作返回的原片 URL，已阻止把预览视频存入 Eagle。"
      : "当前节点没有可导入 Eagle 的素材链接。");
  }
  if (isJimengItem && (
    item?.originalVerified !== true
    || !isVerifiedJimengOriginalUrl(url, normalizeAssetUrl(item?.previewUrl))
  )) {
    throw new Error("原片地址没有通过官方协议校验，已阻止把预览小样存入 Eagle。");
  }

  const name = buildEagleItemName(item, url);
  const referer = isJimengItem
    ? website
    : "https://app.pixmax.cn/";
  const eagleItem = {
    annotation: String(item?.annotation || "").trim(),
    folderId: options.eagleFolderId,
    name,
    website
  };
  const result = await eagleFetch(options.eagleApiUrl, "/api/item/addFromURL", {
    ...eagleItem,
    headers: isJimengItem
      ? {
          Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
          Referer: referer
        }
      : { Referer: referer },
    url
  });

  return {
    folderName: options.eagleFolderName || options.eagleFolderId,
    name,
    result
  };
}

function isVerifiedJimengOriginalUrl(originalUrl, previewUrl) {
  if (!originalUrl || originalUrl === previewUrl) return false;
  try {
    const original = new URL(originalUrl);
    const preview = previewUrl ? new URL(previewUrl) : null;
    const originalBitrate = Number(original.searchParams.get("br") || original.searchParams.get("bt"));
    const previewBitrate = Number(preview?.searchParams.get("br") || preview?.searchParams.get("bt"));
    if (originalBitrate > 0 && previewBitrate > 0 && originalBitrate <= previewBitrate * 1.2) return false;
    const officialHost = /(?:^|\.)jimeng\.com$/i.test(original.hostname);
    const highBitrate = originalBitrate > 0
      && (!previewBitrate || originalBitrate > previewBitrate * 1.2);
    const videoPath = /(?:video|tos|obj|media)/i.test(original.pathname)
      && /video_mp4|\.mp4(?:$|[?#])/i.test(`${original.search} ${original.pathname}`);
    return videoPath && (officialHost || highBitrate);
  } catch {
    return false;
  }
}

async function eagleFetch(apiUrl, path, body, method = "POST") {
  const response = await fetch(`${normalizeEagleApiUrl(apiUrl)}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    method
  });

  if (!response.ok) {
    throw new Error(`Eagle API 请求失败：HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result && result.status && result.status !== "success") {
    throw new Error(result.message || "Eagle API 返回失败。");
  }

  return result;
}

function normalizeEagleApiUrl(value) {
  const url = String(value || DEFAULT_OPTIONS.eagleApiUrl).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) {
    throw new Error("Eagle API 地址只能是本机 localhost，例如 http://localhost:41595。");
  }
  return url;
}

function normalizeAssetUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function extractEagleArrayData(result) {
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.data)) return result.data.data;
  return [];
}

function flattenEagleFolders(folders, prefix = "") {
  const output = [];

  for (const folder of folders) {
    const name = prefix ? `${prefix} / ${folder.name}` : folder.name;
    output.push({
      id: folder.id,
      name
    });

    if (Array.isArray(folder.children) && folder.children.length) {
      output.push(...flattenEagleFolders(folder.children, name));
    }
  }

  return output;
}

function filenameFromUrl(value) {
  try {
    return decodeURIComponent(new URL(value).pathname.split("/").pop() || "");
  } catch {
    return "";
  }
}

function buildEagleItemName(item, url) {
  const baseName = sanitizeFilename(item?.name || filenameFromUrl(url) || "pixmax-asset");
  if (!isVideoAsset(item, url)) return baseName;
  const downloadCode = getDownloadCode(item);
  return downloadCode ? appendCodeToName(baseName, downloadCode) : baseName;
}

function isVideoAsset(item, url) {
  const haystack = [
    item?.mediaType,
    item?.type,
    item?.mimeType,
    item?.mime,
    item?.contentType,
    item?.name,
    filenameFromUrl(url),
    url
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return /(^|\b)video(\b|\/)|视频|\.mp4(\?|#|$)|\.webm(\?|#|$)|\.mov(\?|#|$)|\.m4v(\?|#|$)|\.avi(\?|#|$)|\.mkv(\?|#|$)/i.test(haystack);
}

function getDownloadCode(item) {
  const explicitCode = sanitizeCode(item?.downloadCode || item?.eagleCode);
  if (explicitCode) return explicitCode;
  const assetCode = compactId(item?.assetUuid);
  const nodeCode = compactId(item?.nodeId);
  return assetCode && nodeCode ? `${assetCode}-${nodeCode}` : assetCode || nodeCode;
}

function sanitizeCode(value) {
  const text = String(value || "").trim();
  return /^[0-9a-z]{12}-[0-9a-z]{12}$/i.test(text) ? text : "";
}

function compactId(value, length = 12) {
  return String(value || "").replace(/[^0-9a-z]/gi, "").slice(0, length);
}

function appendCodeToName(name, code) {
  if (name.includes(code)) return name;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < name.length - 1) {
    return `${name.slice(0, dotIndex)} ${code}${name.slice(dotIndex)}`;
  }
  return `${name} ${code}`;
}

function sanitizeFilename(value) {
  return String(value || "pixmax-asset")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim()
    .slice(0, 180) || "pixmax-asset";
}

function getStoredOptions() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_OPTIONS, resolve);
  });
}

function friendlyError(error) {
  if (/Failed to fetch|NetworkError|fetch/i.test(error?.message || "")) {
    return "无法连接 Eagle。请先打开 Eagle App。";
  }
  return error?.message || String(error);
}

async function getExternalLikeState(rawKeys) {
  const keys = new Set((Array.isArray(rawKeys) ? rawKeys : []).map(String).filter(Boolean));
  const options = await getStoredSharedLikeOptions();
  validateJimengCanvasOptions(options);
  const canvas = await fetchPixmaxCanvas(options.sharedLikesFileUuid);
  const items = getSharedOwnerItems(canvas, options.sharedLikesOwnerName);

  return {
    color: normalizeLikeColor(options.sharedLikesColor),
    likedKeys: items.map(getLikeKey).filter((key) => key && (!keys.size || keys.has(key))),
    shared: true,
    storageTarget: "pixmax-canvas"
  };
}

async function toggleExternalLike(rawItem) {
  const item = normalizeExternalLikeItem(rawItem);
  const options = await getStoredSharedLikeOptions();
  validateJimengCanvasOptions(options);
  return toggleSharedExternalLike(item, options);
}

async function refreshExternalLikedItems(rawItems) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map(normalizeExternalLikeItem)
    .slice(0, 100);
  if (!items.length) return { updated: 0 };
  const options = await getStoredSharedLikeOptions();
  validateJimengCanvasOptions(options);
  return refreshSharedExternalLikedItems(items, options);
}

async function refreshSharedExternalLikedItems(freshItems, options, retryCount = 1) {
  const canvas = await fetchPixmaxCanvas(options.sharedLikesFileUuid);
  const ownerNode = findSharedLikesOwnerNode(canvas.nodes ?? [], options.sharedLikesOwnerName);
  if (!ownerNode) {
    throw new Error(`共享画布里找不到名字为「${options.sharedLikesOwnerName}」的文字节点。`);
  }

  const parsed = parseSharedLikeText(getRawNodeText(ownerNode));
  const color = normalizeLikeColor(options.sharedLikesColor || parsed?.color);
  const items = parsed?.items ? [...parsed.items] : [];
  let updated = 0;
  for (const freshItem of freshItems) {
    const targetKey = getLikeKey(freshItem);
    const existingIndex = items.findIndex((candidate) => getLikeKey(candidate) === targetKey);
    if (existingIndex < 0) continue;
    const current = items[existingIndex];
    const next = {
      ...current,
      ...freshItem,
      annotation: freshItem.annotation || current.annotation || "",
      duration: freshItem.duration || current.duration || 0,
      name: freshItem.name !== "即梦视频" ? freshItem.name : current.name || freshItem.name,
      poster: freshItem.poster || current.poster || "",
      promptContent: freshItem.promptContent.length
        ? freshItem.promptContent
        : current.promptContent || [],
      referenceImages: freshItem.referenceImages.length
        ? freshItem.referenceImages
        : current.referenceImages || [],
      videoHeight: freshItem.videoHeight || current.videoHeight || 0,
      videoWidth: freshItem.videoWidth || current.videoWidth || 0
    };
    if (JSON.stringify(current) === JSON.stringify(next)) continue;
    items[existingIndex] = next;
    updated += 1;
  }
  if (!updated) return { updated: 0, shared: true, storageTarget: "pixmax-canvas" };

  const result = await pixmaxApiPost("/canvas/node/batch", {
    fileUuid: options.sharedLikesFileUuid,
    baseRevision: canvas.revision,
    create: [],
    update: [
      {
        uuid: ownerNode.uuid,
        metaData: ownerNode.metaData || "{}",
        nodeText: buildSharedLikeText(
          options.sharedLikesOwnerName,
          items,
          color,
          parsed?.settings || {}
        )
      }
    ],
    delete: []
  });

  if (!result.success) {
    if (result.errCode === CANVAS_REVISION_CONFLICT && retryCount > 0) {
      return refreshSharedExternalLikedItems(freshItems, options, retryCount - 1);
    }
    throw new Error(result.errMessage || result.errCode || "即梦视频链接刷新失败。");
  }

  return { updated, shared: true, storageTarget: "pixmax-canvas" };
}

async function toggleSharedExternalLike(item, options, retryCount = 1) {
  const canvas = await fetchPixmaxCanvas(options.sharedLikesFileUuid);
  const ownerNode = findSharedLikesOwnerNode(canvas.nodes ?? [], options.sharedLikesOwnerName);
  if (!ownerNode) {
    throw new Error(`共享画布里找不到名字为「${options.sharedLikesOwnerName}」的文字节点。`);
  }

  const parsed = parseSharedLikeText(getRawNodeText(ownerNode));
  const color = normalizeLikeColor(options.sharedLikesColor || parsed?.color);
  const items = parsed?.items ? [...parsed.items] : [];
  const targetKey = getLikeKey(item);
  const existingIndex = items.findIndex((candidate) => getLikeKey(candidate) === targetKey);
  let liked;
  if (existingIndex >= 0) {
    items.splice(existingIndex, 1);
    liked = false;
  } else {
    items.unshift({
      ...item,
      likedAt: new Date().toISOString(),
      likedBy: options.sharedLikesOwnerName,
      likedByColor: color
    });
    liked = true;
  }

  const result = await pixmaxApiPost("/canvas/node/batch", {
    fileUuid: options.sharedLikesFileUuid,
    baseRevision: canvas.revision,
    create: [],
    update: [
      {
        uuid: ownerNode.uuid,
        metaData: ownerNode.metaData || "{}",
        nodeText: buildSharedLikeText(
          options.sharedLikesOwnerName,
          items,
          color,
          parsed?.settings || {}
        )
      }
    ],
    delete: []
  });

  if (!result.success) {
    if (result.errCode === CANVAS_REVISION_CONFLICT && retryCount > 0) {
      return toggleSharedExternalLike(item, options, retryCount - 1);
    }
    throw new Error(result.errMessage || result.errCode || "共享收藏写入失败。");
  }

  return { color, liked, shared: true, storageTarget: "pixmax-canvas" };
}

async function fetchPixmaxCanvas(fileUuid) {
  const result = await pixmaxApiPost("/canvas/get", { fileUuid });
  if (!result.success) {
    throw new Error(result.errMessage || result.errCode || "无法读取 Pixmax Review Board 数据库。");
  }
  return result.data;
}

async function pixmaxApiPost(path, body) {
  const response = await fetch(`${PIXMAX_API_ORIGIN}/user/api${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Pixmax API 返回了无法解析的响应（HTTP ${response.status}）。`);
  }
  if (!response.ok) {
    throw new Error(result.errMessage || result.errCode || `Pixmax API 请求失败：HTTP ${response.status}`);
  }
  return result;
}

function getSharedOwnerItems(canvas, ownerName) {
  const node = findSharedLikesOwnerNode(canvas.nodes ?? [], ownerName);
  return node ? parseSharedLikeText(getRawNodeText(node))?.items || [] : [];
}

function findSharedLikesOwnerNode(nodes, ownerName) {
  const textNodes = (nodes || []).filter((node) => typeof node?.nodeText === "string");
  const marked = textNodes.find((node) => parseSharedLikeText(getRawNodeText(node))?.ownerName === ownerName);
  if (marked) return marked;

  const byLabel = textNodes.find((node) => getRawNodeLabel(node) === ownerName);
  if (byLabel) return byLabel;

  return textNodes.find((node) => {
    const text = getRawNodeText(node).trim();
    return text === ownerName || text.split(/\r?\n/, 1)[0]?.trim() === ownerName;
  });
}

function parseSharedLikeText(value) {
  const text = String(value || "");
  const markerIndex = text.indexOf(SHARED_LIKES_MARKER);
  if (markerIndex < 0) return null;
  const jsonStart = text.indexOf("{", markerIndex + SHARED_LIKES_MARKER.length);
  if (jsonStart < 0) return null;
  try {
    const data = JSON.parse(text.slice(jsonStart).trim());
    if (!data || data.version !== 1 || !Array.isArray(data.items)) return null;
    return {
      color: normalizeLikeColor(data.color),
      ownerName: String(data.ownerName || "").trim(),
      settings: data.settings && typeof data.settings === "object" ? data.settings : {},
      items: data.items.filter((item) => item && typeof item === "object")
    };
  } catch {
    return null;
  }
}

function buildSharedLikeText(ownerName, items, color, settings = {}) {
  return [
    ownerName,
    SHARED_LIKES_MARKER,
    JSON.stringify(
      {
        version: 1,
        ownerName,
        color: normalizeLikeColor(color),
        settings,
        updatedAt: new Date().toISOString(),
        items
      },
      null,
      2
    )
  ].join("\n");
}

function getRawNodeText(node) {
  return typeof node?.nodeText === "string" ? node.nodeText : "";
}

function getRawNodeLabel(node) {
  try {
    const metaData = JSON.parse(node?.metaData || "{}");
    return String(metaData.data?.label || "").trim();
  } catch {
    return "";
  }
}

function normalizeExternalLikeItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object") throw new Error("没有读取到即梦视频信息。");
  const submittedUrl = normalizeAssetUrl(rawItem.url);
  const originalUrl = normalizeAssetUrl(rawItem.originalUrl) || submittedUrl;
  const url = originalUrl;
  const likeKey = String(rawItem.likeKey || "").trim().slice(0, 1200);
  if (!url || !likeKey || !likeKey.startsWith("jimeng:")) {
    throw new Error("即梦视频缺少稳定的公开链接。");
  }
  const referenceImages = (Array.isArray(rawItem.referenceImages) ? rawItem.referenceImages : [])
    .map((image, index) => ({
      name: String(image?.name || `参考图 ${index + 1}`).trim().slice(0, 120),
      url: normalizeAssetUrl(image?.url)
    }))
    .filter((image) => image.url)
    .slice(0, 20);
  const promptContent = (Array.isArray(rawItem.promptContent) ? rawItem.promptContent : [])
    .map((segment) => {
      if (segment?.type === "text") {
        const text = String(segment.text || "").slice(0, 12000);
        return text ? { type: "text", text } : null;
      }
      if (segment?.type === "image") {
        const referenceIndex = Number(segment.referenceIndex);
        if (!Number.isInteger(referenceIndex) || referenceIndex < 0 || referenceIndex >= referenceImages.length) {
          return null;
        }
        return {
          type: "image",
          referenceIndex,
          name: String(segment.name || referenceImages[referenceIndex].name).trim().slice(0, 120)
        };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 200);
  return {
    annotation: String(rawItem.annotation || "").trim().slice(0, 12000),
    duration: normalizePositiveNumber(rawItem.duration),
    likeKey,
    linkMayExpire: Boolean(rawItem.linkMayExpire),
    mediaType: "video",
    name: String(rawItem.name || "即梦视频").trim().slice(0, 300),
    originalUrl,
    originalVerified: Boolean(rawItem.originalVerified),
    poster: normalizeAssetUrl(rawItem.poster),
    previewUrl: normalizeAssetUrl(rawItem.previewUrl),
    promptContent,
    referenceImages,
    source: "jimeng",
    sourceUrlIssuedAt: String(rawItem.sourceUrlIssuedAt || "").trim().slice(0, 80),
    sourceWorkspace: String(rawItem.sourceWorkspace || "").trim().slice(0, 120),
    url,
    videoHeight: normalizePositiveNumber(rawItem.videoHeight),
    videoWidth: normalizePositiveNumber(rawItem.videoWidth),
    website: normalizeAssetUrl(rawItem.website) || "https://jimeng.jianying.com/"
  };
}

function getLikeKey(item) {
  if (item?.source === "jimeng" || String(item?.likeKey || "").startsWith("jimeng:")) {
    return normalizeJimengLikeKey(item?.likeKey || item?.url);
  }
  return item?.likeKey || item?.nodeId || item?.url || "";
}

function normalizeJimengLikeKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let payload = raw.startsWith("jimeng:") ? raw.slice("jimeng:".length) : raw;
  try {
    if (/^https?:\/\//i.test(payload)) payload = new URL(payload).pathname;
  } catch {
    // Fall through to path parsing for malformed legacy values.
  }
  const path = payload.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const resourceId = path.split("/").filter(Boolean).pop() || "";
  return resourceId ? `jimeng:${resourceId}` : "";
}

function normalizePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1000) / 1000 : 0;
}

function normalizeLikeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_LIKE_COLOR;
}

function validateSharedLikeOptions(options) {
  if (!options.sharedLikesFileUuid) throw new Error("请先在扩展设置里配置共享 Likes 数据库链接。");
  if (!options.sharedLikesOwnerName) throw new Error("请先在扩展设置里填写你的共享 Likes 名字。");
}

function validateJimengCanvasOptions(options) {
  if (!options.sharedLikesEnabled) {
    throw new Error("即梦爱心需要写入 Pixmax 画布：请先在扩展设置中开启「共享 Likes」。");
  }
  try {
    validateSharedLikeOptions(options);
  } catch {
    throw new Error("即梦爱心需要写入 Pixmax 画布：请先在扩展设置中配置共享 Likes 数据库链接和你的名字。");
  }
}

function getStoredSharedLikeOptions() {
  return new Promise((resolve) => chrome.storage.sync.get(SHARED_LIKE_OPTIONS_DEFAULTS, resolve));
}

function getLocalLikedItems() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [LIKES_STORAGE_KEY]: [] }, (result) => {
      resolve(Array.isArray(result[LIKES_STORAGE_KEY]) ? result[LIKES_STORAGE_KEY] : []);
    });
  });
}

function setLocalLikedItems(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [LIKES_STORAGE_KEY]: items }, () => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) reject(new Error(runtimeError.message));
      else resolve();
    });
  });
}

function friendlyExternalError(error) {
  if (/Failed to fetch|NetworkError|fetch/i.test(error?.message || "")) {
    return "无法连接 Pixmax Review Board，请确认 Pixmax 已登录后重试。";
  }
  return error?.message || String(error);
}
