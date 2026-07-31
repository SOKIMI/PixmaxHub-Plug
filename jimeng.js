(() => {
  "use strict";

  if (window.__pixmaxHubJimengLikes) return;
  window.__pixmaxHubJimengLikes = true;

  const MESSAGE = {
    EAGLE_IMPORT_URL: "pixmax-cloner:eagle-import-url",
    GET_LIKE_STATE: "pixmax-cloner:get-external-like-state",
    TOGGLE_LIKE: "pixmax-cloner:toggle-external-like"
  };
  const BUTTON_CLASS = "pixmax-jimeng-like";
  const EAGLE_BUTTON_CLASS = "pixmax-jimeng-eagle";
  const HOST_CLASS = "pixmax-jimeng-like-host";
  const STYLE_ID = "pixmax-jimeng-like-style";
  const TOAST_ID = "pixmax-jimeng-like-toast";
  const LIKE_STATE_CACHE_KEY = "pixmaxJimengLikeStateCache";
  const DEFAULT_COLOR = "#ff3864";
  const likedKeys = new Set();
  let likeColor = DEFAULT_COLOR;
  let scanScheduled = false;
  let stateRefreshTimer = 0;
  let scannedLikeKeySignature = "";

  init();

  function init() {
    installStyles();
    loadCachedLikedState();
    scanVideoCards();

    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["src"],
      childList: true,
      subtree: true
    });
    window.addEventListener("resize", scheduleScan, { passive: true });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" && areaName !== "sync") return;
      if (areaName === "local" && changes[LIKE_STATE_CACHE_KEY]) return;
      scheduleLikedStateRefresh();
    });
  }

  function loadCachedLikedState() {
    chrome.storage.local.get({ [LIKE_STATE_CACHE_KEY]: null }, (result) => {
      const cache = result[LIKE_STATE_CACHE_KEY];
      if (!cache || typeof cache !== "object") return;
      for (const key of Array.isArray(cache.keys) ? cache.keys : []) {
        const normalizedKey = normalizeJimengLikeKey(key);
        if (normalizedKey) likedKeys.add(normalizedKey);
      }
      likeColor = normalizeColor(cache.color);
      renderAllButtons();
    });
  }

  function persistLikedStateCache() {
    chrome.storage.local.set({
      [LIKE_STATE_CACHE_KEY]: {
        color: likeColor,
        keys: [...likedKeys],
        updatedAt: new Date().toISOString()
      }
    });
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${HOST_CLASS} { position: relative !important; }
      .${BUTTON_CLASS} {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 40;
        display: grid;
        width: 34px;
        height: 34px;
        box-sizing: border-box;
        place-items: center;
        border: 1px solid rgb(255 255 255 / 34%);
        border-radius: 999px;
        padding: 0;
        background: rgb(15 16 18 / 82%);
        color: #fff;
        box-shadow: 0 8px 22px rgb(0 0 0 / 38%);
        cursor: pointer;
        font: 21px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(8px);
      }
      .${BUTTON_CLASS}:hover { transform: scale(1.06); background: rgb(30 31 35 / 94%); }
      .${BUTTON_CLASS}[data-liked="true"] {
        border-color: var(--pixmax-jimeng-like-color, ${DEFAULT_COLOR});
        background: var(--pixmax-jimeng-like-color, ${DEFAULT_COLOR});
      }
      .${BUTTON_CLASS}:disabled { cursor: wait; opacity: .62; }
      .${EAGLE_BUTTON_CLASS} {
        position: relative;
        z-index: 2;
        display: inline-flex;
        min-width: 0;
        height: 48px;
        box-sizing: border-box;
        border: 0;
        border-radius: 12px;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 0 18px;
        background: rgb(35 36 43 / 96%);
        color: rgb(255 255 255 / 92%);
        cursor: pointer;
        font: 12px/20px "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
        appearance: none;
      }
      .${EAGLE_BUTTON_CLASS}:hover { filter: brightness(1.12); }
      .${EAGLE_BUTTON_CLASS}:disabled { cursor: wait; opacity: .68; }
      .${EAGLE_BUTTON_CLASS} svg {
        width: 16px;
        height: 16px;
        flex: none;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.8;
      }
      .${EAGLE_BUTTON_CLASS}[data-placement="overlay"] {
        position: absolute;
        top: 52px;
        right: 10px;
        z-index: 40;
        min-width: 72px;
        height: 30px;
        border-radius: 999px;
        padding: 0 10px;
        background: rgb(15 16 18 / 86%);
        box-shadow: 0 8px 22px rgb(0 0 0 / 38%);
        font-size: 12px;
        backdrop-filter: blur(8px);
      }
      .${EAGLE_BUTTON_CLASS}[data-placement="action-bar"] {
        position: relative;
        z-index: auto;
        margin: 0;
        flex: none;
      }
      #${TOAST_ID} {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483647;
        max-width: 360px;
        border: 1px solid #3e424a;
        border-radius: 9px;
        padding: 10px 13px;
        background: rgb(20 20 23 / 96%);
        color: #fff;
        box-shadow: 0 14px 40px rgb(0 0 0 / 48%);
        font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${TOAST_ID}[data-error="true"] { color: #ffaaa2; }
    `;
    document.documentElement.append(style);
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    window.requestAnimationFrame(() => {
      scanScheduled = false;
      scanVideoCards();
    });
  }

  function scanVideoCards() {
    const videos = [...document.querySelectorAll("video")];
    for (const video of videos) mountLikeButton(video);
    for (const button of document.querySelectorAll(`.${EAGLE_BUTTON_CLASS}`)) {
      if (button.__pixmaxJimengHost && !button.__pixmaxJimengHost.isConnected) button.remove();
    }
    const signature = [...new Set(videos.map((video) =>
      getJimengLikeKey(video.currentSrc || video.src)
    ).filter(Boolean))].sort().join("\n");
    if (signature && signature !== scannedLikeKeySignature) {
      scannedLikeKeySignature = signature;
      scheduleLikedStateRefresh();
    }
  }

  function scheduleLikedStateRefresh() {
    window.clearTimeout(stateRefreshTimer);
    stateRefreshTimer = window.setTimeout(() => refreshLikedState().catch(() => {}), 250);
  }

  function mountLikeButton(video) {
    const host = findVideoCardHost(video);
    if (!host) return;
    host.classList.add(HOST_CLASS);
    const existing = host.querySelector(`:scope > .${BUTTON_CLASS}`);
    if (existing) {
      existing.__pixmaxJimengVideo = video;
      existing.dataset.likeKey = getJimengLikeKey(video.currentSrc || video.src);
      renderButton(existing);
      mountEagleButton(video, host);
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.__pixmaxJimengVideo = video;
    button.dataset.likeKey = getJimengLikeKey(video.currentSrc || video.src);
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleVideoLike(button.__pixmaxJimengVideo || video, button)
        .catch((error) => showToast(error.message || String(error), true));
    });
    host.append(button);
    renderButton(button);
    mountEagleButton(video, host);
  }

  function mountEagleButton(video, host) {
    const actionBar = findVideoActionBar(video);
    const target = actionBar || host;
    const existing = actionBar?.querySelector(`:scope > .${EAGLE_BUTTON_CLASS}`)
      || (host.__pixmaxJimengEagleButton?.isConnected
        ? host.__pixmaxJimengEagleButton
        : host.querySelector(`:scope > .${EAGLE_BUTTON_CLASS}`));
    if (existing) {
      existing.__pixmaxJimengVideo = video;
      existing.__pixmaxJimengHost = host;
      existing.__pixmaxJimengActionBar = actionBar;
      existing.dataset.placement = actionBar ? "action-bar" : "overlay";
      if (existing.parentElement !== target) target.append(existing);
      if (actionBar) styleEagleButtonLikeNative(existing, actionBar);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = EAGLE_BUTTON_CLASS;
    button.__pixmaxJimengVideo = video;
    button.__pixmaxJimengHost = host;
    button.__pixmaxJimengActionBar = actionBar;
    button.dataset.placement = actionBar ? "action-bar" : "overlay";
    renderEagleButtonLabel(button, "存 Eagle");
    button.title = "把这个即梦视频存入 Eagle";
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      importVideoToEagle(button.__pixmaxJimengVideo || video, button)
        .catch((error) => showToast(error.message || String(error), true));
    });
    target.append(button);
    host.__pixmaxJimengEagleButton = button;
    if (actionBar) styleEagleButtonLikeNative(button, actionBar);
  }

  function renderEagleButtonLabel(button, label) {
    let icon = button.querySelector("svg");
    let text = button.querySelector("span");
    if (!icon) {
      icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const tray = document.createElementNS("http://www.w3.org/2000/svg", "path");
      tray.setAttribute("d", "M4 15.5v2.75A1.75 1.75 0 0 0 5.75 20h12.5A1.75 1.75 0 0 0 20 18.25V15.5");
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      arrow.setAttribute("d", "M12 4v11m0 0 4-4m-4 4-4-4");
      icon.append(tray, arrow);
      button.append(icon);
    }
    if (!text) {
      text = document.createElement("span");
      button.append(text);
    }
    text.textContent = label;
  }

  function styleEagleButtonLikeNative(button, actionBar) {
    const candidates = [...actionBar.children].filter((element) => element !== button);
    const sourceContainer = candidates.find((element) => String(element.innerText || "").includes("再次生成"))
      || candidates.find((element) => String(element.innerText || "").includes("重新编辑"));
    if (!sourceContainer) return;
    const source = sourceContainer.querySelector('[class*="card-bottom-button-view-"]')
      || (sourceContainer.matches("button") ? sourceContainer : sourceContainer.querySelector("button"))
      || sourceContainer;
    const computed = getComputedStyle(source);
    const rect = source.getBoundingClientRect();
    for (const className of source.classList) button.classList.add(className);
    if (rect.width > 0) button.style.width = `${Math.round(rect.width)}px`;
    if (rect.height > 0) button.style.height = `${Math.round(rect.height)}px`;
    for (const property of [
      "alignItems",
      "backgroundColor",
      "borderBottomColor",
      "borderBottomStyle",
      "borderBottomWidth",
      "borderLeftColor",
      "borderLeftStyle",
      "borderLeftWidth",
      "borderRadius",
      "borderRightColor",
      "borderRightStyle",
      "borderRightWidth",
      "borderTopColor",
      "borderTopStyle",
      "borderTopWidth",
      "boxShadow",
      "color",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "justifyContent",
      "lineHeight",
      "paddingBottom",
      "paddingLeft",
      "paddingRight",
      "paddingTop"
    ]) {
      button.style[property] = computed[property];
    }
    button.style.display = "flex";
    button.style.gap = computed.gap;
    button.style.minWidth = "0";
  }

  async function importVideoToEagle(video, button) {
    button.disabled = true;
    renderEagleButtonLabel(button, "存入中…");
    try {
      const item = buildJimengLikeItem(video);
      item.url = item.originalUrl || item.url;
      const response = await sendRuntimeMessage({ type: MESSAGE.EAGLE_IMPORT_URL, item });
      if (!response?.ok) throw new Error(response?.error || "存入 Eagle 失败。");
      renderEagleButtonLabel(button, "已存入");
      showToast(response.folderName ? `已存入 Eagle：${response.folderName}` : "已存入 Eagle。");
    } finally {
      window.setTimeout(() => {
        renderEagleButtonLabel(button, "存 Eagle");
        button.disabled = false;
      }, 1600);
    }
  }

  function findVideoCardHost(video) {
    let node = video.parentElement;
    while (node && node !== document.body) {
      const className = String(node.className || "");
      if (className.includes("video-card-wrapper-") || className.includes("video-card-container-")) {
        return node;
      }
      node = node.parentElement;
    }
    return video.parentElement;
  }

  function findResultRecord(video) {
    let node = video.parentElement;
    while (node && node !== document.body) {
      if (String(node.className || "").includes("record-box-wrapper-")) {
        const record = node.parentElement;
        return record && String(record.innerText || "").includes("Seedance") ? record : node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function findVideoActionBar(video) {
    const record = findResultRecord(video);
    if (!record) return null;
    return [...record.querySelectorAll('[class*="record-bottom-slots-"]')]
      .find((element) => element.querySelector("button") || String(element.innerText || "").includes("再次生成"))
      || null;
  }

  async function refreshLikedState() {
    const keys = [...new Set([...document.querySelectorAll("video")].map((video) =>
      getJimengLikeKey(video.currentSrc || video.src)
    ).filter(Boolean))];
    if (!keys.length) return;
    const response = await sendRuntimeMessage({ type: MESSAGE.GET_LIKE_STATE, keys });
    if (!response?.ok) throw new Error(response?.error || "无法读取收藏状态。");
    for (const key of keys) likedKeys.delete(key);
    for (const key of response.likedKeys || []) {
      const normalizedKey = normalizeJimengLikeKey(key);
      if (normalizedKey) likedKeys.add(normalizedKey);
    }
    likeColor = normalizeColor(response.color);
    persistLikedStateCache();
    renderAllButtons();
  }

  async function toggleVideoLike(video, button) {
    button.disabled = true;
    try {
      const item = buildJimengLikeItem(video);
      const response = await sendRuntimeMessage({ type: MESSAGE.TOGGLE_LIKE, item });
      if (!response?.ok) throw new Error(response?.error || "收藏失败。");
      if (response.liked) likedKeys.add(item.likeKey);
      else likedKeys.delete(item.likeKey);
      likeColor = normalizeColor(response.color);
      persistLikedStateCache();
      renderAllButtons();
      showToast(response.liked
        ? "已写入 Pixmax 共享画布 Review Board。"
        : "已从 Pixmax 共享画布 Review Board 移除。");
    } finally {
      button.disabled = false;
    }
  }

  function buildJimengLikeItem(video) {
    const originalUrl = normalizeUrl(video.currentSrc || video.src);
    const url = canonicalizeVideoUrl(originalUrl);
    const likeKey = getJimengLikeKey(originalUrl);
    if (!url || !likeKey) throw new Error("这个即梦视频没有可收藏的公开链接。");

    const record = findResultRecord(video);
    const referenceImages = extractReferenceImages(record);
    const promptContent = extractPromptContent(record, referenceImages);
    const prompt = promptContentToText(promptContent) || extractPrompt(record);
    const labels = extractLabels(record);
    const poster = normalizeUrl(
      video.poster || findVideoCardHost(video)?.querySelector('img[class*="video-skeleton-img-"]')?.currentSrc || ""
    );
    const sourceUrlIssuedAt = getSourceUrlIssuedAt(originalUrl);
    const workspace = new URL(location.href).searchParams.get("workspace") || "";

    return {
      annotation: prompt,
      duration: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) / 1000 : 0,
      likeKey,
      linkMayExpire: true,
      mediaType: "video",
      name: labels || "即梦视频",
      originalUrl,
      poster,
      promptContent,
      referenceImages,
      source: "jimeng",
      sourceUrlIssuedAt,
      sourceWorkspace: workspace,
      url,
      videoHeight: Number(video.videoHeight) || 0,
      videoWidth: Number(video.videoWidth) || 0,
      website: location.href
    };
  }

  function extractPrompt(record) {
    return String(findPromptElement(record)?.innerText || "").trim();
  }

  function findPromptElement(record) {
    if (!record) return null;
    const candidates = [...record.querySelectorAll('[class^="prompt-"]')]
      .filter((element) => [...element.classList].some((name) => /^prompt-[A-Z0-9_]/.test(name)))
      .map((element) => ({ element, text: String(element.innerText || "").trim() }))
      .filter(({ text }) => text && !text.includes("Seedance") && text !== "详细信息")
      .sort((first, second) => first.text.length - second.text.length);
    return candidates[0]?.element || null;
  }

  function extractLabels(record) {
    const labels = record?.querySelector('[class^="labels-"]');
    return String(labels?.innerText || "")
      .replace(/\s+/g, " ")
      .replace(/\s*详细信息\s*$/, "")
      .trim();
  }

  function extractReferenceImages(record) {
    const urls = [];
    const images = [
      ...(record?.querySelectorAll('[class*="reference-image-"] img') || []),
      ...(findPromptElement(record)?.querySelectorAll("img") || [])
    ];
    for (const image of images) {
      const url = normalizeUrl(image.currentSrc || image.src);
      if (url && !urls.includes(url)) urls.push(url);
    }
    return urls.map((url, index) => ({ name: `参考图 ${index + 1}`, url }));
  }

  function extractPromptContent(record, referenceImages) {
    const prompt = findPromptElement(record);
    if (!prompt) return [];
    const segments = [];

    const appendText = (value) => {
      const text = String(value || "");
      if (!text) return;
      const previous = segments.at(-1);
      if (previous?.type === "text") previous.text += text;
      else segments.push({ type: "text", text });
    };

    const visit = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        appendText(node.nodeValue);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node;
      if (element.tagName === "IMG") {
        const url = normalizeUrl(element.currentSrc || element.getAttribute("src"));
        const referenceIndex = referenceImages.findIndex((image) => image.url === url);
        if (referenceIndex >= 0) {
          segments.push({
            type: "image",
            referenceIndex,
            name: referenceImages[referenceIndex].name
          });
        }
        return;
      }
      if (element.tagName === "BR") {
        appendText("\n");
        return;
      }
      for (const child of element.childNodes) visit(child);
    };

    for (const child of prompt.childNodes) visit(child);
    const firstText = segments.find((segment) => segment.type === "text");
    const lastText = [...segments].reverse().find((segment) => segment.type === "text");
    if (firstText) firstText.text = firstText.text.replace(/^\s+/, "");
    if (lastText) lastText.text = lastText.text.replace(/\s+$/, "");
    return segments.filter((segment) => segment.type === "image" || segment.text);
  }

  function promptContentToText(promptContent) {
    return promptContent.map((segment) => segment.type === "image"
      ? `@${segment.name || "参考图"}`
      : segment.text || ""
    ).join("").trim();
  }

  function canonicalizeVideoUrl(value) {
    const url = normalizeUrl(value);
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (/(^|\.)vlabvod\.com$/i.test(parsed.hostname)) {
        parsed.search = "";
        parsed.hash = "";
      }
      return parsed.href;
    } catch {
      return url;
    }
  }

  function getJimengLikeKey(value) {
    const url = normalizeUrl(value);
    if (!url) return "";
    try {
      const parsed = new URL(url);
      return normalizeJimengLikeKey(`jimeng:${parsed.pathname}`);
    } catch {
      return normalizeJimengLikeKey(`jimeng:${url.split(/[?#]/, 1)[0]}`);
    }
  }

  function normalizeJimengLikeKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const payload = raw.startsWith("jimeng:") ? raw.slice("jimeng:".length) : raw;
    const path = payload.split(/[?#]/, 1)[0].replace(/\/+$/, "");
    const resourceId = path.split("/").filter(Boolean).pop() || "";
    return resourceId ? `jimeng:${resourceId}` : "";
  }

  function getSourceUrlIssuedAt(value) {
    try {
      const seconds = Number(new URL(value).searchParams.get("dy_q"));
      return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : "";
    } catch {
      return "";
    }
  }

  function renderAllButtons() {
    for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) renderButton(button);
  }

  function renderButton(button) {
    const liked = likedKeys.has(button.dataset.likeKey || "");
    button.dataset.liked = liked ? "true" : "false";
    button.style.setProperty("--pixmax-jimeng-like-color", likeColor);
    button.textContent = liked ? "♥" : "♡";
    button.title = liked ? "从 Pixmax Review Board 移除" : "存入 Pixmax Review Board";
    button.setAttribute("aria-label", button.title);
  }

  function showToast(message, error = false) {
    document.getElementById(TOAST_ID)?.remove();
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.dataset.error = error ? "true" : "false";
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), error ? 4200 : 2300);
  }

  function normalizeUrl(value) {
    const url = String(value || "").trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }

  function normalizeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_COLOR;
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else resolve(response);
      });
    });
  }
})();
