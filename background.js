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
  TOGGLE_EXTERNAL_LIKE: "pixmax-cloner:toggle-external-like",
  UPLOAD_PROGRESS: "pixmax-cloner:jimeng-upload-progress"
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
const JIMENG_ARCHIVE_IDENTITY_STORAGE_KEY = "pixmaxJimengArchiveIdentityV1";
const PIXMAX_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const PIXMAX_UPLOAD_POLL_INTERVAL_MS = 3000;
const PIXMAX_UPLOAD_POLL_LIMIT = 20;
const JIMENG_ARCHIVE_WORKSPACE_UUID = "3bba9785-24d6-4b1f-84c1-895d85db4bbe";
const JIMENG_ARCHIVE_FILE_UUID = "1f17948c-7f24-6472-8b47-2979ca759811";
const JIMENG_ARCHIVE_CANVAS_URL = `${PIXMAX_API_ORIGIN}/workspace/${JIMENG_ARCHIVE_WORKSPACE_UUID}?file=${JIMENG_ARCHIVE_FILE_UUID}`;
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
const jimengPixmaxUploadJobs = new Map();
const pixmaxCanvasMutationLocks = new Map();
let jimengArchiveIdentityStorageGate = Promise.resolve();

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
    const reportProgress = createJimengUploadProgressReporter(sender, message);
    toggleExternalLike(message.item, reportProgress)
      .then((result) => {
        if (result.liked) reportProgress("success", 100, "已上传 Pixmax 并写入 Review Board");
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        reportProgress("failed", 100, friendlyExternalError(error));
        sendResponse({ ok: false, error: friendlyExternalError(error) });
      });
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

function createJimengUploadProgressReporter(sender, message) {
  const tabId = Number(sender?.tab?.id);
  const jobId = String(message?.jobId || message?.item?.likeKey || "").trim();
  if (!Number.isInteger(tabId) || tabId < 0 || !jobId) return () => {};
  let lastSignature = "";
  return (state, progress, status) => {
    const payload = {
      type: MESSAGE.UPLOAD_PROGRESS,
      jobId,
      likeKey: String(message?.item?.likeKey || jobId),
      progress: Math.min(100, Math.max(0, Math.round(Number(progress) || 0))),
      state: String(state || "uploading"),
      status: String(status || "")
    };
    const signature = JSON.stringify([payload.state, payload.progress, payload.status]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    chrome.tabs.sendMessage(tabId, payload, () => void chrome.runtime.lastError);
  };
}

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
  item = await ensureJimengArchiveIdentity(item);
  if (!options.eagleFolderId) {
    throw new Error("请先点击扩展图标，设置 Eagle 目标目录。");
  }

  const website = /^https?:\/\//i.test(item?.website || "")
    ? item.website
    : "https://app.pixmax.cn/";
  const isJimengItem = /^https:\/\/jimeng\.jianying\.com\//i.test(website)
    || String(item?.source || "").toLowerCase() === "jimeng";
  const isPixmaxArchivedJimeng = Boolean(
    isJimengItem
    && (item?.storageProvider === "pixmax" || item?.pixmaxAssetUuid)
  );
  const url = normalizeAssetUrl(isJimengItem ? item?.originalUrl : item?.url);
  if (!url) {
    throw new Error(isJimengItem
      ? "没有取得即梦原生下载操作返回的原片 URL，已阻止把预览视频存入 Eagle。"
      : "当前节点没有可导入 Eagle 的素材链接。");
  }
  if (isJimengItem && !isPixmaxArchivedJimeng && (
    item?.originalVerified !== true
    || !isVerifiedJimengOriginalUrl(url, normalizeAssetUrl(item?.previewUrl))
  )) {
    throw new Error("原片地址没有通过官方协议校验，已阻止把预览小样存入 Eagle。");
  }

  const name = buildEagleItemName(item, url);
  const referer = isJimengItem && !isPixmaxArchivedJimeng
    ? website
    : "https://app.pixmax.cn/";
  const eagleItem = {
    annotation: buildEagleAnnotation(item),
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

function buildEagleAnnotation(item) {
  const prompt = String(item?.annotation || "").trim();
  const referenceLines = (Array.isArray(item?.referenceImages) ? item.referenceImages : [])
    .map((image, index) => {
      const url = normalizeAssetUrl(image?.url);
      if (!url) return "";
      const name = String(image?.name || `参考图 ${index + 1}`).trim();
      return `${index + 1}. ${name}：${url}`;
    })
    .filter(Boolean);
  if (!referenceLines.length) return prompt;
  return [prompt, `参考图片链接：\n${referenceLines.join("\n")}`]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
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
  const jimengArchiveCode = normalizeJimengArchiveCode(item?.archiveCode);
  if (jimengArchiveCode) return jimengArchiveCode;
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
  withPixmaxCanvasMutationLock(JIMENG_ARCHIVE_FILE_UUID, () =>
    repairJimengArchiveNodesFromLikes(items, 4)
  ).catch(() => {});

  return {
    color: normalizeLikeColor(options.sharedLikesColor),
    likedKeys: items.map(getLikeKey).filter((key) => key && (!keys.size || keys.has(key))),
    shared: true,
    storageTarget: "pixmax-canvas"
  };
}

async function toggleExternalLike(rawItem, reportProgress = () => {}) {
  let item = normalizeExternalLikeItem(rawItem);
  item = await ensureJimengArchiveIdentity(item);
  const options = await getStoredSharedLikeOptions();
  validateJimengCanvasOptions(options);
  reportProgress("preparing", 28, "正在检查 Pixmax Review Board");
  return withPixmaxCanvasMutationLock(options.sharedLikesFileUuid, () =>
    toggleSharedExternalLike(item, options, 4, null, reportProgress)
  );
}

function withPixmaxCanvasMutationLock(fileUuid, task) {
  const key = String(fileUuid || "").trim();
  if (!key) return Promise.resolve().then(task);
  const previous = pixmaxCanvasMutationLocks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  pixmaxCanvasMutationLocks.set(key, current);
  return current.finally(() => {
    if (pixmaxCanvasMutationLocks.get(key) === current) pixmaxCanvasMutationLocks.delete(key);
  });
}

async function refreshExternalLikedItems(rawItems) {
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map(normalizeExternalLikeItem)
    .slice(0, 100);
  if (!items.length) return { updated: 0 };
  const options = await getStoredSharedLikeOptions();
  validateJimengCanvasOptions(options);
  return withPixmaxCanvasMutationLock(options.sharedLikesFileUuid, () =>
    refreshSharedExternalLikedItems(items, options, 4)
  );
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
    const hasPixmaxArchive = Boolean(current.pixmaxAssetUuid || current.storageProvider === "pixmax");
    const hasVerifiedFreshOriginal = Boolean(
      freshItem.originalVerified === true
      && isVerifiedJimengOriginalUrl(
        normalizeAssetUrl(freshItem.originalUrl || freshItem.url),
        normalizeAssetUrl(freshItem.previewUrl)
      )
    );
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
    if (!hasPixmaxArchive && !hasVerifiedFreshOriginal) {
      next.linkMayExpire = current.linkMayExpire;
      next.originalUrl = current.originalUrl || current.url || "";
      next.originalVerified = current.originalVerified === true;
      next.sourceUrlIssuedAt = current.sourceUrlIssuedAt || "";
      next.url = current.url || current.originalUrl || "";
    }
    if (hasPixmaxArchive) {
      next.archiveCode = current.archiveCode || "";
      next.assetUuid = current.assetUuid || current.pixmaxAssetUuid || "";
      next.fileUuid = current.fileUuid || JIMENG_ARCHIVE_FILE_UUID;
      next.linkMayExpire = false;
      next.name = normalizeJimengArchiveCode(current.archiveCode)
        || normalizeJimengArchiveCode(current.name)
        || current.name
        || freshItem.name;
      next.nodeId = current.nodeId || "";
      next.originalUrl = current.originalUrl || current.pixmaxUrl || current.url || "";
      next.pixmaxAssetUuid = current.pixmaxAssetUuid || current.assetUuid || "";
      next.pixmaxAssetName = current.pixmaxAssetName || current.name || "";
      next.pixmaxCanvasUrl = current.pixmaxCanvasUrl || JIMENG_ARCHIVE_CANVAS_URL;
      next.pixmaxPreviewUrl = current.pixmaxPreviewUrl || "";
      next.pixmaxUrl = current.pixmaxUrl || current.originalUrl || current.url || "";
      next.sourceUrlIssuedAt = "";
      next.storageProvider = "pixmax";
      next.url = current.url || current.pixmaxUrl || current.originalUrl || "";
    }
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

async function toggleSharedExternalLike(
  item,
  options,
  retryCount = 1,
  desiredLiked = null,
  reportProgress = () => {}
) {
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
  const existingItem = existingIndex >= 0 ? items[existingIndex] : null;
  const existingNeedsPixmaxArchive = Boolean(
    existingItem
    && (existingItem.source === "jimeng" || String(existingItem.likeKey || "").startsWith("jimeng:"))
    && !existingItem.pixmaxAssetUuid
    && existingItem.storageProvider !== "pixmax"
  );
  const shouldLike = desiredLiked === null
    ? existingIndex < 0 || existingNeedsPixmaxArchive
    : desiredLiked;
  const shouldReplaceLegacyArchive = Boolean(
    shouldLike
    && existingItem
    && existingNeedsPixmaxArchive
    && (desiredLiked === null || item.pixmaxAssetUuid)
  );
  if (shouldLike && existingIndex >= 0 && !shouldReplaceLegacyArchive) {
    return { color, liked: true, shared: true, storageTarget: "pixmax-canvas" };
  }
  if (!shouldLike && existingIndex < 0) {
    return { color, liked: false, shared: true, storageTarget: "pixmax-canvas" };
  }

  const liked = shouldLike;
  if (!shouldLike) {
    items.splice(existingIndex, 1);
  } else if (shouldReplaceLegacyArchive) {
    item = item.pixmaxAssetUuid
      ? item
      : await archiveJimengLikeInPixmax(existingItem, reportProgress);
    items.splice(existingIndex, 1, {
      ...existingItem,
      ...item,
      likedAt: existingItem.likedAt || new Date().toISOString(),
      likedBy: options.sharedLikesOwnerName,
      likedByColor: color
    });
  } else {
    item = await archiveJimengLikeInPixmax(item, reportProgress);
    items.unshift({
      ...item,
      likedAt: new Date().toISOString(),
      likedBy: options.sharedLikesOwnerName,
      likedByColor: color
    });
  }

  if (liked) reportProgress("saving", 94, "正在写入 Pixmax Review Board");
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
      return toggleSharedExternalLike(item, options, retryCount - 1, shouldLike, reportProgress);
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

async function archiveJimengLikeInPixmax(item, reportProgress = () => {}) {
  if (item?.source !== "jimeng") return item;
  item = await ensureJimengArchiveIdentity(item);
  if (item.pixmaxAssetUuid && normalizeAssetUrl(item.pixmaxUrl || item.url)) return item;

  const sourceUrl = normalizeAssetUrl(item.originalUrl || item.url);
  if (
    !sourceUrl
    || item.originalVerified !== true
    || !isVerifiedJimengOriginalUrl(sourceUrl, normalizeAssetUrl(item.previewUrl))
  ) {
    throw new Error("即梦原片没有通过官方协议校验，已停止上传 Pixmax，且不会保存预览小样。");
  }

  const archiveCode = normalizeJimengArchiveCode(item.archiveCode) || buildJimengArchiveCode();
  const archiveItem = { ...item, archiveCode };
  const jobKey = String(item.likeKey || sourceUrl);
  let job = jimengPixmaxUploadJobs.get(jobKey);
  if (!job) {
    job = ensureJimengOriginalInPixmaxCanvas(archiveItem, sourceUrl, reportProgress)
      .finally(() => jimengPixmaxUploadJobs.delete(jobKey));
    jimengPixmaxUploadJobs.set(jobKey, job);
  } else {
    reportProgress("queued", 32, "相同原片正在上传，等待现有任务完成");
  }
  const asset = await job;
  const resolvedArchiveCode = asset.archiveCode || archiveCode;
  const resolvedItem = await ensureJimengArchiveIdentity({
    ...archiveItem,
    archiveCode: resolvedArchiveCode
  });
  return {
    ...resolvedItem,
    archiveCode: resolvedArchiveCode,
    assetUuid: asset.assetUuid,
    linkMayExpire: false,
    fileUuid: asset.fileUuid,
    nodeId: asset.nodeId,
    // Eagle, the Pixmax asset/node, and Review Board share one persisted code.
    name: resolvedArchiveCode,
    originalUrl: asset.url,
    pixmaxAssetUuid: asset.assetUuid,
    pixmaxCanvasUrl: asset.canvasUrl,
    pixmaxPreviewUrl: asset.previewUrl,
    pixmaxAssetName: asset.displayName || buildJimengArchiveDisplayName(resolvedItem, resolvedArchiveCode),
    pixmaxUrl: asset.url,
    sourceUrlIssuedAt: "",
    storageProvider: "pixmax",
    url: asset.url
  };
}

async function ensureJimengOriginalInPixmaxCanvas(item, sourceUrl, reportProgress = () => {}) {
  reportProgress("preparing", 32, "正在读取 Pixmax 归档画布");
  const canvas = await fetchPixmaxCanvas(JIMENG_ARCHIVE_FILE_UUID);
  let existingNode = findJimengArchiveNode(canvas.nodes ?? [], item.likeKey);
  if (existingNode) {
    existingNode = await updateJimengArchiveNodeMetadata(canvas, existingNode, item);
    const existingMetaData = parsePixmaxNodeMetaData(existingNode);
    const existingArchiveCode = normalizeJimengArchiveCode(existingMetaData?.data?.archiveCode)
      || normalizeJimengArchiveCode(item.archiveCode)
      || buildJimengArchiveCode();
    const existingDisplayName = String(existingMetaData?.data?.label || "").trim()
      || buildJimengArchiveDisplayName(item, existingArchiveCode);
    const existingAsset = normalizePixmaxUploadAsset(existingNode.defaultAsset || {
      assetUuid: existingNode.defaultAssetUuid
    });
    if (existingAsset.assetUuid) {
      const refreshed = await refreshPixmaxAssetLink(existingAsset);
      const existingUrl = resolvePixmaxAssetUrl(refreshed);
      if (existingUrl) {
        reportProgress("saving", 90, "已找到 Pixmax 原片，正在更新 Review Board");
        return {
          ...refreshed,
          archiveCode: existingArchiveCode,
          assetUuid: existingAsset.assetUuid,
          canvasUrl: JIMENG_ARCHIVE_CANVAS_URL,
          displayName: existingDisplayName,
          fileUuid: JIMENG_ARCHIVE_FILE_UUID,
          nodeId: String(existingNode.uuid || ""),
          previewUrl: resolvePixmaxAssetPreviewUrl(refreshed),
          url: existingUrl
        };
      }
    }
  }

  const uploadedAsset = await uploadJimengOriginalToPixmax(item, sourceUrl, reportProgress);
  reportProgress("processing", 84, "Pixmax 已接收原片，正在创建画布节点");
  const [asset, node] = await Promise.all([
    refreshPixmaxAssetLink(uploadedAsset),
    withPixmaxCanvasMutationLock(JIMENG_ARCHIVE_FILE_UUID, () =>
      createJimengArchiveVideoNode(item, uploadedAsset, 4)
    )
  ]);
  const url = resolvePixmaxAssetUrl(asset);
  if (!url) throw new Error("Pixmax 资产已创建，但没有返回可播放链接，已停止写入 Review Board。");
  const archiveCode = normalizeJimengArchiveCode(item.archiveCode) || buildJimengArchiveCode();
  const displayName = buildJimengArchiveDisplayName(item, archiveCode);
  return {
    ...asset,
    archiveCode,
    canvasUrl: JIMENG_ARCHIVE_CANVAS_URL,
    displayName,
    fileUuid: JIMENG_ARCHIVE_FILE_UUID,
    nodeId: node.uuid,
    previewUrl: resolvePixmaxAssetPreviewUrl(asset),
    url
  };
}

async function uploadJimengOriginalToPixmax(item, sourceUrl, reportProgress = () => {}) {
  reportProgress("downloading", 36, "正在读取即梦官方原片");
  let sourceResponse;
  try {
    sourceResponse = await fetch(sourceUrl, {
      cache: "no-store",
      credentials: "omit",
      referrer: normalizeAssetUrl(item.website) || "https://jimeng.jianying.com/",
      referrerPolicy: "strict-origin-when-cross-origin"
    });
  } catch (error) {
    throw new Error(`读取即梦原片失败：${error?.message || String(error)}`);
  }
  if (!sourceResponse.ok) {
    throw new Error(`读取即梦原片失败：HTTP ${sourceResponse.status}。请在即梦页面重试爱心以刷新原片地址。`);
  }

  const responseType = String(sourceResponse.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (/^(?:text\/|application\/(?:json|xml|xhtml\+xml))/.test(responseType)) {
    throw new Error(`即梦原片返回了错误内容（${responseType}），已停止上传 Pixmax。`);
  }
  const contentType = responseType.startsWith("video/") ? responseType : "video/mp4";
  const fileName = buildPixmaxVideoFileName(item.name, sourceUrl, contentType, item.archiveCode);
  const declaredSize = Number(sourceResponse.headers.get("content-length") || 0);
  if (declaredSize > PIXMAX_UPLOAD_MAX_BYTES) {
    sourceResponse.body?.cancel?.().catch(() => {});
    throw new Error(`即梦原片大小为 ${formatBytes(declaredSize)}，超过 Pixmax 单文件 100 MB 限制。`);
  }
  if (declaredSize > 0 && sourceResponse.body?.tee) {
    reportProgress("authorizing", 44, `正在获取 Pixmax 上传授权 · ${formatBytes(declaredSize)}`);
    const authorize = await requestPixmaxUploadAuthorization(fileName, declaredSize, contentType);
    validatePixmaxUploadAuthorization(authorize);
    const [uploadStream, fallbackStream] = sourceResponse.body.tee();
    let uploadResult;
    try {
      // Stream Jimeng -> Pixmax directly. This overlaps the source download and
      // OSS upload instead of waiting for the whole video to be buffered first.
      const progressStream = monitorReadableStreamProgress(
        uploadStream,
        declaredSize,
        (loaded, total) => reportProgress(
          "uploading",
          48 + Math.round((loaded / total) * 30),
          `正在传入 Pixmax · ${formatBytes(loaded)} / ${formatBytes(total)}`
        )
      );
      uploadResult = await putPixmaxOssObject(progressStream, authorize.data, contentType, true);
      void fallbackStream.cancel().catch(() => {});
    } catch (streamError) {
      // Some OSS regions/proxies may reject chunked request bodies. Keep a
      // byte-for-byte fallback so those accounts still use the proven Blob path.
      await uploadStream.cancel(streamError).catch(() => {});
      reportProgress("downloading", 50, "流式传输不可用，正在缓冲原片后重试");
      const sourceBlob = await new Response(fallbackStream, {
        headers: { "Content-Type": contentType }
      }).blob();
      validateJimengSourceBlob(sourceBlob);
      let fallbackAuthorize = authorize;
      if (sourceBlob.size !== declaredSize) {
        fallbackAuthorize = await requestPixmaxUploadAuthorization(fileName, sourceBlob.size, contentType);
        validatePixmaxUploadAuthorization(fallbackAuthorize);
      }
      reportProgress("uploading", 62, `正在重试上传 Pixmax · ${formatBytes(sourceBlob.size)}`);
      uploadResult = await putPixmaxOssObject(sourceBlob, fallbackAuthorize.data, contentType);
      reportProgress("processing", 80, "Pixmax 已接收原片，正在处理视频");
      return finalizePixmaxUploadAsset(uploadResult, fallbackAuthorize.data);
    }
    reportProgress("processing", 80, "Pixmax 已接收原片，正在处理视频");
    return finalizePixmaxUploadAsset(uploadResult, authorize.data);
  }

  reportProgress("downloading", 42, "正在缓冲即梦原片");
  const sourceBlob = await sourceResponse.blob();
  validateJimengSourceBlob(sourceBlob);
  reportProgress("authorizing", 48, `正在获取 Pixmax 上传授权 · ${formatBytes(sourceBlob.size)}`);
  const authorize = await requestPixmaxUploadAuthorization(fileName, sourceBlob.size, contentType);
  validatePixmaxUploadAuthorization(authorize);
  reportProgress("uploading", 58, `正在上传 Pixmax · ${formatBytes(sourceBlob.size)}`);
  const uploadResult = await putPixmaxOssObject(sourceBlob, authorize.data, contentType);
  reportProgress("processing", 80, "Pixmax 已接收原片，正在处理视频");
  return finalizePixmaxUploadAsset(uploadResult, authorize.data);
}

function monitorReadableStreamProgress(stream, totalBytes, onProgress) {
  if (!stream?.getReader || !(totalBytes > 0)) return stream;
  const reader = stream.getReader();
  let loadedBytes = 0;
  let lastReportedAt = 0;
  return new ReadableStream({
    async pull(controller) {
      const result = await reader.read();
      if (result.done) {
        onProgress(totalBytes, totalBytes);
        controller.close();
        return;
      }
      const chunk = result.value;
      loadedBytes += Number(chunk?.byteLength || chunk?.length || 0);
      const now = Date.now();
      if (now - lastReportedAt >= 220 || loadedBytes >= totalBytes) {
        lastReportedAt = now;
        onProgress(Math.min(loadedBytes, totalBytes), totalBytes);
      }
      controller.enqueue(chunk);
    },
    cancel(reason) {
      return reader.cancel(reason);
    }
  });
}

function validateJimengSourceBlob(sourceBlob) {
  if (!sourceBlob.size) throw new Error("即梦返回的原片为空，已停止上传 Pixmax。");
  if (sourceBlob.size > PIXMAX_UPLOAD_MAX_BYTES) {
    throw new Error(`即梦原片大小为 ${formatBytes(sourceBlob.size)}，超过 Pixmax 单文件 100 MB 限制。`);
  }
}

function validatePixmaxUploadAuthorization(authorize) {
  if (!authorize.success || !authorize.data) {
    throw new Error(authorize.errMessage || authorize.errCode || "Pixmax 没有返回上传授权，请确认 Pixmax 已登录。");
  }
}

async function finalizePixmaxUploadAsset(uploadResult, authorization) {
  let asset = normalizePixmaxUploadAsset(uploadResult, authorization);
  if (!asset.assetUuid && authorization.sessionId) {
    asset = await pollPixmaxUploadAsset(authorization.sessionId, authorization);
  }
  if (!asset.assetUuid) throw new Error("Pixmax 已接收视频，但没有返回 assetUuid，已停止写入 Review Board。");

  return {
    ...asset,
    assetUuid: asset.assetUuid
  };
}

function requestPixmaxUploadAuthorization(fileName, fileSize, contentType) {
  return pixmaxApiPost("/assets/oss/authorize", {
    fileName,
    fileSize,
    contentType
  });
}

async function refreshPixmaxAssetLink(asset, authorization = {}) {
  if (!asset?.assetUuid) return asset;
  const linkResult = await pixmaxApiPost("/assets/getAssetsLink", {
    assetUuids: [asset.assetUuid]
  });
  if (!linkResult.success || !Array.isArray(linkResult.data) || !linkResult.data.length) return asset;
  const linked = linkResult.data.find((candidate) =>
    String(candidate?.assetsUuid || candidate?.assetUuid || "") === asset.assetUuid
  ) || linkResult.data[0];
  return normalizePixmaxUploadAsset(linked, authorization, asset);
}

async function createJimengArchiveVideoNode(item, asset, retryCount = 4, initialCanvas = null) {
  const canvas = initialCanvas || await fetchPixmaxCanvas(JIMENG_ARCHIVE_FILE_UUID);
  const existingNode = findJimengArchiveNode(canvas.nodes ?? [], item.likeKey);
  if (existingNode) return existingNode;

  const position = getJimengArchiveNodePosition(canvas.nodes ?? []);
  const size = getJimengArchiveNodeSize(asset, item);
  const archiveCode = normalizeJimengArchiveCode(item.archiveCode) || buildJimengArchiveCode();
  const displayName = buildJimengArchiveDisplayName(item, archiveCode);
  const node = {
    uuid: crypto.randomUUID(),
    type: "BASE_VIDEO",
    defaultAssetUuid: asset.assetUuid,
    metaData: JSON.stringify({
      data: {
        annotation: String(item.annotation || "").slice(0, 12000),
        archiveCode,
        description: String(item.annotation || "").slice(0, 12000),
        label: displayName,
        pixmaxHubLikeKey: String(item.likeKey || "").slice(0, 1200),
        pixmaxHubSource: "jimeng",
        prompt: String(item.annotation || "").slice(0, 12000),
        promptContent: Array.isArray(item.promptContent) ? item.promptContent.slice(0, 200) : [],
        referenceImages: Array.isArray(item.referenceImages) ? item.referenceImages.slice(0, 20) : [],
        sourceUrl: String(item.website || "").slice(0, 2000)
      },
      position,
      measured: size,
      width: size.width,
      height: size.height
    })
  };
  const result = await pixmaxApiPost("/canvas/node/batch", {
    fileUuid: JIMENG_ARCHIVE_FILE_UUID,
    baseRevision: canvas.revision,
    create: [node],
    update: [],
    delete: []
  });
  if (!result.success) {
    if (result.errCode === CANVAS_REVISION_CONFLICT && retryCount > 0) {
      return createJimengArchiveVideoNode(item, asset, retryCount - 1);
    }
    throw new Error(result.errMessage || result.errCode || "视频已上传 Pixmax，但写入指定画布失败。");
  }
  return node;
}

async function updateJimengArchiveNodeMetadata(canvas, node, item, retryCount = 1) {
  const nextMetaData = buildJimengArchiveNodeMetaData(node, item);
  if (nextMetaData === String(node.metaData || "")) return node;

  const result = await pixmaxApiPost("/canvas/node/batch", {
    fileUuid: JIMENG_ARCHIVE_FILE_UUID,
    baseRevision: canvas.revision,
    create: [],
    update: [{ uuid: node.uuid, metaData: nextMetaData }],
    delete: []
  });
  if (!result.success) {
    if (result.errCode === CANVAS_REVISION_CONFLICT && retryCount > 0) {
      const nextCanvas = await fetchPixmaxCanvas(JIMENG_ARCHIVE_FILE_UUID);
      const nextNode = findJimengArchiveNode(nextCanvas.nodes ?? [], item.likeKey);
      if (!nextNode) throw new Error("Pixmax 归档节点在更新提示词时消失，请重试。");
      return updateJimengArchiveNodeMetadata(nextCanvas, nextNode, item, retryCount - 1);
    }
    throw new Error(result.errMessage || result.errCode || "无法给 Pixmax 归档节点补充提示词和命名代码。");
  }
  return { ...node, metaData: nextMetaData };
}

function buildJimengArchiveNodeMetaData(node, item) {
  const previous = parsePixmaxNodeMetaData(node);
  const archiveCode = normalizeJimengArchiveCode(previous?.data?.archiveCode)
    || normalizeJimengArchiveCode(item.archiveCode)
    || buildJimengArchiveCode();
  const next = {
    ...previous,
    data: {
      ...(previous.data || {}),
      annotation: String(item.annotation || previous?.data?.annotation || "").slice(0, 12000),
      archiveCode,
      description: String(item.annotation || previous?.data?.description || "").slice(0, 12000),
      label: buildJimengArchiveDisplayName(item, archiveCode),
      pixmaxHubLikeKey: String(item.likeKey || previous?.data?.pixmaxHubLikeKey || "").slice(0, 1200),
      pixmaxHubSource: "jimeng",
      prompt: String(item.annotation || previous?.data?.prompt || "").slice(0, 12000),
      promptContent: Array.isArray(item.promptContent) && item.promptContent.length
        ? item.promptContent.slice(0, 200)
        : previous?.data?.promptContent || [],
      referenceImages: Array.isArray(item.referenceImages) && item.referenceImages.length
        ? item.referenceImages.slice(0, 20)
        : previous?.data?.referenceImages || [],
      sourceUrl: String(item.website || previous?.data?.sourceUrl || "").slice(0, 2000)
    }
  };
  return JSON.stringify(next);
}

async function repairJimengArchiveNodesFromLikes(items, retryCount = 1) {
  const candidates = (items || []).filter((item) =>
    (item?.storageProvider === "pixmax" || item?.pixmaxAssetUuid)
    && (item?.nodeId || item?.likeKey)
  );
  if (!candidates.length) return { updated: 0 };
  const canvas = await fetchPixmaxCanvas(JIMENG_ARCHIVE_FILE_UUID);
  const updates = [];
  for (const item of candidates) {
    const node = (canvas.nodes || []).find((candidate) => candidate?.uuid === item.nodeId)
      || findJimengArchiveNode(canvas.nodes ?? [], item.likeKey);
    if (!node) continue;
    const metaData = buildJimengArchiveNodeMetaData(node, item);
    if (metaData !== String(node.metaData || "")) updates.push({ uuid: node.uuid, metaData });
  }
  if (!updates.length) return { updated: 0 };
  const result = await pixmaxApiPost("/canvas/node/batch", {
    fileUuid: JIMENG_ARCHIVE_FILE_UUID,
    baseRevision: canvas.revision,
    create: [],
    update: updates,
    delete: []
  });
  if (!result.success) {
    if (result.errCode === CANVAS_REVISION_CONFLICT && retryCount > 0) {
      return repairJimengArchiveNodesFromLikes(items, retryCount - 1);
    }
    throw new Error(result.errMessage || result.errCode || "无法批量修复 Pixmax 归档节点信息。");
  }
  return { updated: updates.length };
}

function findJimengArchiveNode(nodes, likeKey) {
  const targetKey = String(likeKey || "");
  if (!targetKey) return null;
  return (nodes || []).find((node) => {
    try {
      const metaData = parsePixmaxNodeMetaData(node);
      return metaData?.data?.pixmaxHubSource === "jimeng"
        && metaData?.data?.pixmaxHubLikeKey === targetKey;
    } catch {
      return false;
    }
  }) || null;
}

function parsePixmaxNodeMetaData(node) {
  try {
    return JSON.parse(node?.metaData || "{}");
  } catch {
    return {};
  }
}

function getJimengArchiveNodePosition(nodes) {
  let rightEdge = -80;
  let top = 0;
  let found = false;
  for (const node of nodes || []) {
    try {
      const metaData = JSON.parse(node?.metaData || "{}");
      const x = Number(metaData?.position?.x);
      const y = Number(metaData?.position?.y);
      const width = Number(metaData?.width || metaData?.measured?.width || 320);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      rightEdge = Math.max(rightEdge, x + (Number.isFinite(width) ? width : 320));
      if (!found) top = y;
      else top = Math.min(top, y);
      found = true;
    } catch {
      // Ignore malformed legacy node metadata when choosing a free position.
    }
  }
  return { x: Math.round(rightEdge + 80), y: Math.round(found ? top : 0) };
}

function getJimengArchiveNodeSize(asset, item) {
  const sourceWidth = Number(asset?.width || item?.videoWidth || 0);
  const sourceHeight = Number(asset?.height || item?.videoHeight || 0);
  if (!(sourceWidth > 0 && sourceHeight > 0)) return { width: 480, height: 270 };
  const scale = Math.min(480 / sourceWidth, 480 / sourceHeight, 1);
  return {
    width: Math.max(180, Math.round(sourceWidth * scale)),
    height: Math.max(120, Math.round(sourceHeight * scale))
  };
}

async function putPixmaxOssObject(body, authorization, contentType, streaming = false) {
  const requiredFields = [
    "endpoint",
    "bucketName",
    "accessKeyId",
    "accessKeySecret",
    "securityToken",
    "objectKey",
    "callbackUrl",
    "callbackBody"
  ];
  const missing = requiredFields.filter((field) => !String(authorization?.[field] || "").trim());
  if (missing.length) throw new Error(`Pixmax 上传授权缺少字段：${missing.join(", ")}`);

  const endpoint = normalizeOssEndpoint(authorization.endpoint);
  const objectPath = encodeOssObjectName(authorization.objectKey);
  const isIpEndpoint = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(endpoint.hostname);
  const bucketPrefix = `${authorization.bucketName}.`;
  const hostname = isIpEndpoint || endpoint.hostname.startsWith(bucketPrefix)
    ? endpoint.hostname
    : `${bucketPrefix}${endpoint.hostname}`;
  const basePath = endpoint.pathname.replace(/\/+$/, "");
  const requestPath = isIpEndpoint
    ? `${basePath}/${encodeURIComponent(authorization.bucketName)}/${objectPath}`
    : `${basePath}/${objectPath}`;
  const uploadUrl = `${endpoint.protocol}//${hostname}${endpoint.port ? `:${endpoint.port}` : ""}${requestPath}`;

  const callbackConfig = {
    callbackUrl: encodeURI(String(authorization.callbackUrl)),
    callbackBody: String(authorization.callbackBody)
  };
  if (authorization.callbackBodyType) {
    callbackConfig.callbackBodyType = String(authorization.callbackBodyType);
  }
  const callbackHeader = utf8ToBase64(JSON.stringify(callbackConfig));
  const ossDate = new Date().toUTCString();
  const ossHeaders = {
    "x-oss-callback": callbackHeader,
    "x-oss-date": ossDate,
    "x-oss-security-token": String(authorization.securityToken)
  };
  const canonicalHeaders = Object.entries(ossHeaders)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([name, value]) => `${name}:${String(value).trim()}`)
    .join("\n");
  const canonicalResource = `/${authorization.bucketName}/${objectPath}`;
  const stringToSign = [
    "PUT",
    "",
    contentType,
    ossDate,
    canonicalHeaders,
    canonicalResource
  ].join("\n");
  const signature = await hmacSha1Base64(authorization.accessKeySecret, stringToSign);

  let response;
  try {
    const requestOptions = {
      method: "PUT",
      credentials: "omit",
      headers: {
        Authorization: `OSS ${authorization.accessKeyId}:${signature}`,
        "Content-Type": contentType,
        ...ossHeaders
      },
      body
    };
    if (streaming) requestOptions.duplex = "half";
    response = await fetch(uploadUrl, requestOptions);
  } catch (error) {
    throw new Error(`上传 Pixmax OSS 失败：${error?.message || String(error)}`);
  }
  const responseText = await response.text();
  if (!response.ok && response.status !== 203) {
    const ossError = extractOssError(responseText);
    throw new Error(`上传 Pixmax OSS 失败：HTTP ${response.status}${ossError ? `（${ossError}）` : ""}`);
  }
  return parseJsonObject(responseText);
}

async function pollPixmaxUploadAsset(sessionId, authorization) {
  for (let index = 0; index < PIXMAX_UPLOAD_POLL_LIMIT; index += 1) {
    const result = await pixmaxApiPost("/assets/oss/check", { sessionId });
    if (!result.success) throw new Error(result.errMessage || result.errCode || "Pixmax 上传状态查询失败。");
    const state = result.data || {};
    if (state.status === "FAILED") {
      throw new Error(state.errorMessage || "Pixmax 处理上传视频失败。");
    }
    if (state.status === "COMPLETED") {
      return normalizePixmaxUploadAsset(state.asset || state, authorization);
    }
    await delay(PIXMAX_UPLOAD_POLL_INTERVAL_MS);
  }
  throw new Error("Pixmax 处理视频超时，请稍后重试爱心收藏。");
}

function normalizePixmaxUploadAsset(value, authorization = {}, fallback = {}) {
  const rawSource = value && typeof value === "object" ? value : {};
  const source = rawSource.data && typeof rawSource.data === "object"
    ? { ...rawSource, ...rawSource.data }
    : rawSource;
  return {
    ...fallback,
    ...source,
    assetUuid: String(
      source.assetUuid
      || source.assetsUuid
      || fallback.assetUuid
      || fallback.assetsUuid
      || ""
    ).trim(),
    height: Number(source.height || fallback.height || 0) || 0,
    ossDomain: String(source.ossDomain || fallback.ossDomain || "").trim(),
    ossSynced: source.ossSynced ?? fallback.ossSynced ?? false,
    previewPath: source.previewPath || source.previewWebUrl || fallback.previewPath || fallback.previewWebUrl || "",
    relativePath: source.relativePath || source.webUrl || fallback.relativePath || fallback.webUrl || authorization.webUrl || "",
    thumbnailPath: source.thumbnailPath || source.thumbnailWebUrl || fallback.thumbnailPath || fallback.thumbnailWebUrl || "",
    width: Number(source.width || fallback.width || 0) || 0
  };
}

function resolvePixmaxAssetUrl(asset) {
  return resolvePixmaxAssetPath(asset, asset?.relativePath || asset?.webUrl);
}

function resolvePixmaxAssetPreviewUrl(asset) {
  return resolvePixmaxAssetPath(asset, asset?.previewPath || asset?.previewWebUrl || asset?.thumbnailPath);
}

function resolvePixmaxAssetPath(asset, rawPath) {
  const path = String(rawPath || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const domain = String(asset?.ossDomain || "").trim().replace(/\/+$/, "");
  if (asset?.ossSynced && /^https?:\/\//i.test(domain)) {
    return `${domain}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return "";
}

function normalizeOssEndpoint(value) {
  const raw = String(value || "").trim();
  const endpoint = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!/^https?:$/.test(endpoint.protocol)) throw new Error("Pixmax 返回了无效的 OSS endpoint。");
  return endpoint;
}

function encodeOssObjectName(value) {
  return String(value || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function hmacSha1Base64(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64(new Uint8Array(signature));
}

function utf8ToBase64(value) {
  return bytesToBase64(new TextEncoder().encode(String(value)));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function extractOssError(value) {
  const text = String(value || "");
  const code = text.match(/<Code>([^<]+)<\/Code>/i)?.[1] || "";
  const message = text.match(/<Message>([^<]+)<\/Message>/i)?.[1] || "";
  return [code, message].filter(Boolean).join(": ").slice(0, 300);
}

function buildPixmaxVideoFileName(name, sourceUrl, contentType, archiveCode = "") {
  let extension = contentType === "video/quicktime" ? ".mov" : ".mp4";
  try {
    const match = new URL(sourceUrl).pathname.match(/\.(mp4|mov|m4v|webm)$/i);
    if (match) extension = `.${match[1].toLowerCase()}`;
  } catch {
    // Keep the MIME-derived extension.
  }
  const code = normalizeJimengArchiveCode(archiveCode) || buildJimengArchiveCode();
  const base = sanitizeFilename(String(name || "").replace(/\.(mp4|mov|m4v|webm)$/i, ""));
  if (!base || normalizeJimengArchiveCode(base) === code) return `${code}${extension}`;
  return `${code} ${base}${extension}`;
}

function buildJimengArchiveDisplayName(item, archiveCode = "") {
  const code = normalizeJimengArchiveCode(archiveCode) || buildJimengArchiveCode();
  return code;
}

function buildJimengArchiveCode(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const timestamp = [
    "JM-",
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const randomCode = [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
  return `${timestamp}-${randomCode}`;
}

function normalizeJimengArchiveCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^JM-\d{8}-\d{6}(?:-[A-Z2-9]{4})?$/.test(code) ? code : "";
}

async function ensureJimengArchiveIdentity(item) {
  if (!item || typeof item !== "object") return item;
  const website = String(item.website || "");
  const isJimeng = String(item.source || "").toLowerCase() === "jimeng"
    || /^https:\/\/jimeng\.jianying\.com\//i.test(website)
    || String(item.likeKey || "").startsWith("jimeng:");
  if (!isJimeng) return item;

  const likeKey = normalizeJimengLikeKey(item.likeKey || item.originalUrl || item.url);
  const suppliedCode = normalizeJimengArchiveCode(item.archiveCode);
  const archiveCode = likeKey
    ? await withJimengArchiveIdentityStorageLock(async () => {
        const stored = await getChromeLocalValue(JIMENG_ARCHIVE_IDENTITY_STORAGE_KEY, {});
        const identities = stored && typeof stored === "object" ? { ...stored } : {};
        const existingCode = normalizeJimengArchiveCode(identities[likeKey]?.archiveCode);
        const code = suppliedCode || existingCode || buildJimengArchiveCode();
        if (existingCode !== code) {
          identities[likeKey] = {
            archiveCode: code,
            createdAt: identities[likeKey]?.createdAt || new Date().toISOString()
          };
          const recentEntries = Object.entries(identities)
            .sort((first, second) => String(second[1]?.createdAt || "").localeCompare(String(first[1]?.createdAt || "")))
            .slice(0, 1200);
          await setChromeLocalValue(JIMENG_ARCHIVE_IDENTITY_STORAGE_KEY, Object.fromEntries(recentEntries));
        }
        return code;
      })
    : suppliedCode || buildJimengArchiveCode();
  const rawName = String(item.name || "").trim();
  const sourceName = String(item.sourceName || "").trim()
    || (rawName && rawName !== "即梦视频" && !normalizeJimengArchiveCode(rawName) ? rawName : "");
  return {
    ...item,
    archiveCode,
    name: archiveCode,
    sourceName
  };
}

function withJimengArchiveIdentityStorageLock(task) {
  const operation = jimengArchiveIdentityStorageGate.catch(() => {}).then(task);
  jimengArchiveIdentityStorageGate = operation.then(() => undefined, () => undefined);
  return operation;
}

function getChromeLocalValue(key, fallback) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [key]: fallback }, (result) => resolve(result?.[key] ?? fallback));
  });
}

function setChromeLocalValue(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  if (/读取即梦原片|上传 Pixmax|Pixmax 上传|写入指定画布/.test(error?.message || "")) {
    return error.message;
  }
  if (/Failed to fetch|NetworkError|fetch/i.test(error?.message || "")) {
    return "无法连接 Pixmax Review Board，请确认 Pixmax 已登录后重试。";
  }
  return error?.message || String(error);
}
