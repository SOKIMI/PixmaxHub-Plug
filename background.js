"use strict";

const MESSAGE = {
  EAGLE_IMPORT_URL: "pixmax-cloner:eagle-import-url",
  EAGLE_LIST_FOLDERS: "pixmax-cloner:eagle-list-folders",
  OPEN_REVIEW_BOARD: "pixmax-cloner:open-review-board",
  GET_EXTERNAL_LIKE_STATE: "pixmax-cloner:get-external-like-state",
  REFRESH_EXTERNAL_LIKED_ITEMS: "pixmax-cloner:refresh-external-liked-items",
  TOGGLE_EXTERNAL_LIKE: "pixmax-cloner:toggle-external-like"
};

const LIKES_STORAGE_KEY = "pixmaxLikedItems";
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;

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

  const url = normalizeAssetUrl(item?.url);
  if (!url) {
    throw new Error("当前节点没有可导入 Eagle 的素材链接。");
  }

  const name = buildEagleItemName(item, url);
  const website = /^https?:\/\//i.test(item?.website || "")
    ? item.website
    : "https://app.pixmax.cn/";
  const referer = /^https:\/\/jimeng\.jianying\.com\//i.test(website)
    ? "https://jimeng.jianying.com/"
    : "https://app.pixmax.cn/";
  const result = await eagleFetch(options.eagleApiUrl, "/api/item/addFromURL", {
    annotation: String(item?.annotation || "").trim(),
    folderId: options.eagleFolderId,
    headers: {
      referer
    },
    name,
    url,
    website
  });

  return {
    folderName: options.eagleFolderName || options.eagleFolderId,
    name,
    result
  };
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
  const url = normalizeAssetUrl(rawItem.url);
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
    originalUrl: normalizeAssetUrl(rawItem.originalUrl) || url,
    poster: normalizeAssetUrl(rawItem.poster),
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
