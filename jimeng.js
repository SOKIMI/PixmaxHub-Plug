(() => {
  "use strict";

  if (window.__pixmaxHubJimengLikes) return;
  window.__pixmaxHubJimengLikes = true;

  const MESSAGE = {
    EAGLE_IMPORT_URL: "pixmax-cloner:eagle-import-url",
    GET_LIKE_STATE: "pixmax-cloner:get-external-like-state",
    REFRESH_LIKED_ITEMS: "pixmax-cloner:refresh-external-liked-items",
    TOGGLE_LIKE: "pixmax-cloner:toggle-external-like",
    UPLOAD_PROGRESS: "pixmax-cloner:jimeng-upload-progress"
  };
  const BUTTON_CLASS = "pixmax-jimeng-like";
  const EAGLE_BUTTON_CLASS = "pixmax-jimeng-eagle";
  const HOST_CLASS = "pixmax-jimeng-like-host";
  const STYLE_ID = "pixmax-jimeng-like-style";
  const TOAST_ID = "pixmax-jimeng-like-toast";
  const QUEUE_ID = "pixmax-jimeng-upload-queue";
  const QUEUE_LIST_CLASS = "pixmax-jimeng-upload-list";
  const MAX_CONCURRENT_UPLOADS = 1;
  const LIKE_STATE_CACHE_KEY = "pixmaxJimengLikeStateCache";
  const MEDIA_CANDIDATE_EVENT = "pixmax-hub:jimeng-media-candidates";
  const MEDIA_CANDIDATE_REQUEST_EVENT = "pixmax-hub:jimeng-request-media-candidates";
  const ORIGINAL_RESOLVE_EVENT = "pixmax-hub:jimeng-resolve-original";
  const ORIGINAL_RESULT_EVENT = "pixmax-hub:jimeng-resolve-original-result";
  const BUILD_VERSION = "2.0.28";
  const DEFAULT_COLOR = "#ff3864";
  const likedKeys = new Set();
  let likeColor = DEFAULT_COLOR;
  let scanScheduled = false;
  let stateRefreshTimer = 0;
  let scannedLikeKeySignature = "";
  let syncedLinkSignature = "";
  let mediaCandidates = [];
  let mediaCandidateSignature = "";
  let lastCapturedProtocolUrl = "";
  let activeUploadCount = 0;
  let originalResolutionGate = Promise.resolve();
  let uploadQueueCollapsed = false;
  const uploadJobs = new Map();

  init();

  function init() {
    document.documentElement.dataset.pixmaxHubVersion = BUILD_VERSION;
    installStyles();
    loadCachedLikedState();
    for (const button of document.querySelectorAll(".pixmax-jimeng-record-download")) button.remove();
    scanVideoCards();

    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["src"],
      childList: true,
      subtree: true
    });
    window.addEventListener("resize", scheduleScan, { passive: true });
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== MESSAGE.UPLOAD_PROGRESS) return false;
      updateUploadJobFromBackground(message);
      return false;
    });
    window.addEventListener(MEDIA_CANDIDATE_EVENT, (event) => {
      mediaCandidates = Array.isArray(event.detail) ? event.detail.slice(0, 200) : [];
      const nextCandidateSignature = mediaCandidates
        .map((candidate) => `${candidate?.contextKey || ""}\n${candidate?.url || ""}`)
        .sort()
        .join("\n---\n");
      if (nextCandidateSignature && nextCandidateSignature !== mediaCandidateSignature) {
        mediaCandidateSignature = nextCandidateSignature;
        scheduleLikedStateRefresh();
      }
      const captured = mediaCandidates.find((candidate) =>
        /native-download|download-protocol|download-response/i.test(String(candidate?.hint || ""))
        && normalizeUrl(candidate?.url)
      );
      const capturedUrl = normalizeUrl(captured?.url);
      if (capturedUrl && capturedUrl !== lastCapturedProtocolUrl) {
        lastCapturedProtocolUrl = capturedUrl;
        showToast("已捕获当前卡片的原片链接，现在可直接存 Eagle 或点爱心收藏。");
      }
    });
    window.dispatchEvent(new CustomEvent(MEDIA_CANDIDATE_REQUEST_EVENT));
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
      .${BUTTON_CLASS}[data-placement="action-bar"] {
        position: relative;
        top: auto;
        right: auto;
        z-index: auto;
        width: 36px;
        height: 36px;
        flex: none;
        border: 0;
        border-radius: 8px;
        background: var(--pixmax-jimeng-action-background, rgb(35 36 43 / 96%));
        box-shadow: none;
        font-size: 20px;
        backdrop-filter: none;
      }
      .${BUTTON_CLASS}[data-placement="action-bar"]:hover {
        transform: none;
        filter: brightness(1.12);
      }
      .${BUTTON_CLASS}[data-placement="action-bar"][data-liked="true"] {
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
      #${QUEUE_ID} {
        position: fixed;
        right: 24px;
        top: 72px;
        bottom: auto;
        z-index: 2147483646;
        width: min(390px, calc(100vw - 32px));
        max-height: min(520px, calc(100vh - 48px));
        overflow: hidden;
        border: 1px solid rgb(255 255 255 / 14%);
        border-radius: 14px;
        background: rgb(18 19 22 / 96%);
        color: #f7f7f8;
        box-shadow: 0 18px 58px rgb(0 0 0 / 48%);
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(16px);
      }
      #${QUEUE_ID}[hidden] { display: none !important; }
      #${QUEUE_ID}[data-collapsed="true"] { width: min(300px, calc(100vw - 32px)); }
      #${QUEUE_ID}[data-collapsed="true"] .${QUEUE_LIST_CLASS} { display: none; }
      #${QUEUE_ID} .pixmax-jimeng-queue-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px 10px;
        border-bottom: 1px solid rgb(255 255 255 / 9%);
      }
      #${QUEUE_ID} .pixmax-jimeng-queue-title { font-size: 13px; font-weight: 650; }
      #${QUEUE_ID} .pixmax-jimeng-queue-count { color: rgb(255 255 255 / 58%); }
      #${QUEUE_ID} .pixmax-jimeng-queue-summary {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      #${QUEUE_ID} .pixmax-jimeng-queue-toggle {
        border: 1px solid rgb(255 255 255 / 14%);
        border-radius: 7px;
        padding: 4px 7px;
        background: rgb(255 255 255 / 6%);
        color: rgb(255 255 255 / 76%);
        cursor: pointer;
        font: inherit;
      }
      #${QUEUE_ID} .pixmax-jimeng-queue-toggle:hover { background: rgb(255 255 255 / 11%); }
      #${QUEUE_ID} .${QUEUE_LIST_CLASS} {
        display: grid;
        gap: 8px;
        max-height: min(450px, calc(100vh - 108px));
        overflow: auto;
        padding: 10px;
      }
      #${QUEUE_ID} .pixmax-jimeng-upload-job {
        display: grid;
        grid-template-columns: 58px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        border: 1px solid rgb(255 255 255 / 9%);
        border-radius: 10px;
        padding: 8px;
        background: rgb(255 255 255 / 4%);
      }
      #${QUEUE_ID} .pixmax-jimeng-upload-job[data-state="failed"] {
        border-color: rgb(255 75 75 / 70%);
        background: rgb(126 22 22 / 28%);
      }
      #${QUEUE_ID} .pixmax-jimeng-upload-job[data-state="success"] {
        border-color: rgb(57 201 122 / 52%);
        background: rgb(24 111 66 / 24%);
      }
      #${QUEUE_ID} .pixmax-jimeng-job-poster {
        width: 58px;
        height: 42px;
        border-radius: 7px;
        object-fit: cover;
        background: #090a0c;
      }
      #${QUEUE_ID} .pixmax-jimeng-job-poster-fallback {
        display: grid;
        width: 58px;
        height: 42px;
        place-items: center;
        border-radius: 7px;
        background: linear-gradient(135deg, #262936, #121318);
        color: rgb(255 255 255 / 50%);
        font-size: 17px;
      }
      #${QUEUE_ID} .pixmax-jimeng-job-main { min-width: 0; }
      #${QUEUE_ID} .pixmax-jimeng-job-name {
        overflow: hidden;
        margin-bottom: 3px;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${QUEUE_ID} .pixmax-jimeng-job-status {
        overflow: hidden;
        color: rgb(255 255 255 / 62%);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${QUEUE_ID} [data-state="failed"] .pixmax-jimeng-job-status { color: #ff8c83; }
      #${QUEUE_ID} [data-state="success"] .pixmax-jimeng-job-status { color: #67dfa0; }
      #${QUEUE_ID} .pixmax-jimeng-job-progress {
        height: 3px;
        margin-top: 7px;
        overflow: hidden;
        border-radius: 999px;
        background: rgb(255 255 255 / 10%);
      }
      #${QUEUE_ID} .pixmax-jimeng-job-progress > span {
        display: block;
        width: var(--pixmax-job-progress, 4%);
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #8d6bff, #4ecbff);
        transition: width .22s ease;
      }
      #${QUEUE_ID} [data-state="failed"] .pixmax-jimeng-job-progress > span { background: #ff5f57; }
      #${QUEUE_ID} [data-state="success"] .pixmax-jimeng-job-progress > span { background: #42d887; }
      #${QUEUE_ID} .pixmax-jimeng-job-retry {
        border: 1px solid rgb(255 116 106 / 65%);
        border-radius: 7px;
        padding: 5px 8px;
        background: rgb(255 83 73 / 15%);
        color: #ffaaa3;
        cursor: pointer;
        font: inherit;
      }
      #${QUEUE_ID} .pixmax-jimeng-job-retry:hover { background: rgb(255 83 73 / 25%); }
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
    const actionBar = findVideoActionBar(video);
    const target = actionBar || host;
    const existing = actionBar?.querySelector(`:scope > .${BUTTON_CLASS}`)
      || (host.__pixmaxJimengLikeButton?.isConnected
        ? host.__pixmaxJimengLikeButton
        : host.querySelector(`:scope > .${BUTTON_CLASS}`));
    if (existing) {
      existing.__pixmaxJimengVideo = video;
      existing.__pixmaxJimengHost = host;
      existing.dataset.placement = actionBar ? "action-bar" : "overlay";
      existing.dataset.likeKey = getJimengLikeKey(video.currentSrc || video.src);
      if (existing.parentElement !== target) target.append(existing);
      host.__pixmaxJimengLikeButton = existing;
      renderButton(existing);
      const eagleButton = mountEagleButton(video, host, actionBar);
      arrangeActionButtons(actionBar, eagleButton, existing);
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.__pixmaxJimengVideo = video;
    button.__pixmaxJimengHost = host;
    button.dataset.placement = actionBar ? "action-bar" : "overlay";
    button.dataset.likeKey = getJimengLikeKey(video.currentSrc || video.src);
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleVideoLike(button.__pixmaxJimengVideo || video, button)
        .catch((error) => showToast(error.message || String(error), true));
    });
    target.append(button);
    host.__pixmaxJimengLikeButton = button;
    renderButton(button);
    const eagleButton = mountEagleButton(video, host, actionBar);
    arrangeActionButtons(actionBar, eagleButton, button);
  }

  function mountEagleButton(video, host, actionBar = findVideoActionBar(video)) {
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
      return existing;
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
    return button;
  }

  function arrangeActionButtons(actionBar, eagleButton, likeButton) {
    if (!actionBar || !eagleButton?.isConnected || !likeButton?.isConnected) return;
    const computed = getComputedStyle(eagleButton);
    const height = Math.round(eagleButton.getBoundingClientRect().height);
    if (height > 0) {
      likeButton.style.width = `${height}px`;
      likeButton.style.height = `${height}px`;
    }
    likeButton.style.borderRadius = computed.borderRadius;
    likeButton.style.setProperty("--pixmax-jimeng-action-background", computed.backgroundColor);
    const alreadyArranged = likeButton.previousElementSibling === eagleButton
      && likeButton.nextElementSibling === null;
    if (!alreadyArranged) actionBar.append(eagleButton, likeButton);
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
    renderEagleButtonLabel(button, "读取原片…");
    try {
      const beforeDownloadItem = buildJimengLikeItem(video);
      const original = await captureOfficialOriginalUrl(video, { allowIndexedOriginal: true });
      renderEagleButtonLabel(button, "导入 Eagle…");
      const refreshedVideo = video.isConnected
        ? video
        : findVideoByLikeKey(beforeDownloadItem.likeKey);
      const item = refreshedVideo
        ? mergeJimengMetadataSnapshot(beforeDownloadItem, buildJimengLikeItem(refreshedVideo))
        : beforeDownloadItem;
      assertJimengMetadataCaptured(item);
      item.url = original.url;
      item.originalUrl = original.url;
      item.originalVerified = original.verified === true;
      item.sourceUrlIssuedAt = getSourceUrlIssuedAt(original.url);
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
        return record?.querySelector?.('[class*="record-bottom-slots-"]') ? record : node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function findMetadataRecord(video) {
    const actionRecord = findResultRecord(video);
    let node = actionRecord || video.parentElement;
    let fallback = actionRecord;
    for (let depth = 0; node && node !== document.body && depth < 12; depth += 1) {
      const hasPrompt = Boolean(findPromptElement(node));
      const hasReferences = Boolean(node.querySelector?.('[class*="reference-image-"] img'));
      const hasLabels = Boolean(node.querySelector?.('[class^="labels-"], [class*=" labels-"]'));
      // The Jimeng reference strip and prompt editor can be sibling regions.
      // Never stop at the first thumbnail-only wrapper: keep climbing until the
      // complete prompt is inside the same metadata scope.
      if (hasPrompt) return node;
      if ((hasReferences || hasLabels) && fallback === actionRecord) fallback = node;
      node = node.parentElement;
    }
    return fallback;
  }

  function findVideoActionBar(video) {
    const record = findResultRecord(video);
    const selector = '[class*="record-bottom-slots-"],[class*="bottom-slots-"]';
    const findCandidates = (root) => [...(root?.querySelectorAll?.(selector) || [])]
      .filter((element) => element.querySelector("button")
        || /(?:再次生成|重新编辑)/.test(String(element.innerText || "")));
    const recordCandidates = findCandidates(record);
    if (recordCandidates.length === 1) return recordCandidates[0];

    const videoRect = video.getBoundingClientRect();
    let ancestor = video.parentElement;
    for (let depth = 0; ancestor && ancestor !== document.body && depth < 18; depth += 1, ancestor = ancestor.parentElement) {
      const candidates = findCandidates(ancestor);
      if (!candidates.length) continue;
      return candidates
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const centerDistance = Math.abs(
            (rect.left + rect.width / 2) - (videoRect.left + videoRect.width / 2)
          );
          const verticalDistance = Math.abs(rect.top - videoRect.bottom);
          const abovePenalty = rect.bottom < videoRect.top ? 100000 : 0;
          return { element, score: centerDistance + verticalDistance * 0.5 + abovePenalty };
        })
        .sort((first, second) => first.score - second.score)[0]?.element || null;
    }
    return recordCandidates
      .map((element) => ({
        element,
        distance: Math.abs(element.getBoundingClientRect().top - videoRect.bottom)
      }))
      .sort((first, second) => first.distance - second.distance)[0]?.element || null;
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
    refreshLikedVideoLinks(response.likedKeys).catch(() => {});
  }

  async function refreshLikedVideoLinks(rawKeys) {
    const keys = new Set((Array.isArray(rawKeys) ? rawKeys : [])
      .map(normalizeJimengLikeKey)
      .filter(Boolean));
    const items = [];
    for (const video of document.querySelectorAll("video")) {
      const likeKey = getJimengLikeKey(video.currentSrc || video.src);
      if (!keys.has(likeKey)) continue;
      try {
        const previewUrl = normalizeUrl(video.currentSrc || video.src);
        const candidate = findCapturedOriginalCandidate(previewUrl);
        const item = buildJimengLikeItem(video);
        // Prompt/reference metadata can be refreshed without asking Jimeng for
        // another expiring original URL. Background keeps an archived Pixmax
        // URL intact when this is a metadata-only refresh.
        if (candidate?.verified) {
          const originalUrl = candidate.url;
          item.url = originalUrl;
          item.originalUrl = originalUrl;
          item.originalVerified = true;
          item.sourceUrlIssuedAt = getSourceUrlIssuedAt(originalUrl);
        }
        items.push(item);
      } catch {
        // The video may still be loading; a later scan will retry it.
      }
    }
    if (!items.length) return;
    const signature = items
      .map((item) => JSON.stringify([
        item.likeKey,
        item.url,
        item.annotation,
        item.promptContent,
        item.referenceImages
      ]))
      .sort()
      .join("\n---\n");
    if (signature === syncedLinkSignature) return;
    const response = await sendRuntimeMessage({ type: MESSAGE.REFRESH_LIKED_ITEMS, items });
    if (!response?.ok) throw new Error(response?.error || "无法刷新即梦视频链接。");
    syncedLinkSignature = signature;
  }

  async function toggleVideoLike(video, button) {
    if (button.dataset.liked !== "true") {
      enqueueUploadJob(video, button);
      return;
    }

    button.disabled = true;
    try {
      const item = buildJimengLikeItem(video);
      const response = await sendRuntimeMessage({ type: MESSAGE.TOGGLE_LIKE, item });
      if (!response?.ok) throw new Error(response?.error || "收藏失败。");
      likedKeys.delete(item.likeKey);
      likeColor = normalizeColor(response.color);
      persistLikedStateCache();
      renderAllButtons();
      showToast("已从 Pixmax 共享画布 Review Board 移除。");
    } finally {
      button.disabled = false;
    }
  }

  function enqueueUploadJob(video, button) {
    const item = buildJimengLikeItem(video);
    const existing = uploadJobs.get(item.likeKey);
    if (existing && existing.state !== "failed") {
      showToast("这个视频已经在 Pixmax 上传队列里。");
      return;
    }
    if (existing?.removeTimer) window.clearTimeout(existing.removeTimer);
    const job = existing || {
      attempt: 0,
      createdAt: Date.now(),
      id: item.likeKey,
      removeTimer: 0
    };
    Object.assign(job, {
      attempt: job.attempt + 1,
      button,
      error: "",
      item: mergeJimengMetadataSnapshot(job.item, item),
      progress: 4,
      state: "queued",
      status: activeUploadCount >= MAX_CONCURRENT_UPLOADS ? "等待上传" : "准备获取即梦原片",
      video
    });
    uploadJobs.set(job.id, job);
    button.disabled = true;
    renderUploadQueue();
    pumpUploadQueue();
  }

  function mergeJimengMetadataSnapshot(previous, current) {
    if (!previous) return current;
    return {
      ...previous,
      ...current,
      annotation: current.annotation || previous.annotation || "",
      poster: current.poster || previous.poster || "",
      promptContent: current.promptContent?.length ? current.promptContent : previous.promptContent || [],
      referenceImages: current.referenceImages?.length ? current.referenceImages : previous.referenceImages || []
    };
  }

  function assertJimengMetadataCaptured(item) {
    const promptLength = String(item?.annotation || "").replace(/\s+/g, "").length;
    const referenceCount = Array.isArray(item?.referenceImages) ? item.referenceImages.length : 0;
    if (!promptLength) {
      throw new Error("没有读取到当前视频的完整提示词，已停止存入 Eagle/Pixmax，避免再生成空记录。");
    }
    return `已读取提示词 ${promptLength} 字 · 参考图 ${referenceCount} 张`;
  }

  function pumpUploadQueue() {
    while (activeUploadCount < MAX_CONCURRENT_UPLOADS) {
      const job = [...uploadJobs.values()]
        .filter((candidate) => candidate.state === "queued")
        .sort((first, second) => first.createdAt - second.createdAt)[0];
      if (!job) break;
      activeUploadCount += 1;
      runUploadJob(job).finally(() => {
        activeUploadCount = Math.max(0, activeUploadCount - 1);
        renderUploadQueue();
        pumpUploadQueue();
      });
    }
    renderUploadQueue();
  }

  async function runUploadJob(job) {
    try {
      updateUploadJob(job, {
        progress: 10,
        state: "resolving",
        status: "正在获取即梦官方原片"
      });
      const currentVideo = job.video?.isConnected ? job.video : findVideoByLikeKey(job.id);
      if (!currentVideo) throw new Error("当前页面已找不到这个视频卡片，请刷新即梦页面后重试。");
      job.video = currentVideo;
      job.item = mergeJimengMetadataSnapshot(job.item, buildJimengLikeItem(currentVideo));
      const original = await withOriginalResolutionLock(() => captureOfficialOriginalUrl(currentVideo));
      if (!original?.url || original.verified !== true) {
        throw new Error("没有拿到通过校验的即梦官方原片链接。");
      }
      // This matches the proven 2.0.19 order: Jimeng's official download
      // action materializes the complete prompt/reference DOM, so capture the
      // card again after that action and merge it with the pre-action snapshot.
      const refreshedVideo = currentVideo.isConnected
        ? currentVideo
        : findVideoByLikeKey(job.id);
      if (refreshedVideo) {
        job.video = refreshedVideo;
        job.item = mergeJimengMetadataSnapshot(job.item, buildJimengLikeItem(refreshedVideo));
      }
      const metadataSummary = assertJimengMetadataCaptured(job.item);
      Object.assign(job.item, {
        originalUrl: original.url,
        originalVerified: true,
        sourceUrlIssuedAt: getSourceUrlIssuedAt(original.url),
        url: original.url
      });
      updateUploadJob(job, {
        progress: 24,
        state: "uploading",
        status: `${metadataSummary}，正在传入 Pixmax`
      });
      const response = await sendRuntimeMessage({
        type: MESSAGE.TOGGLE_LIKE,
        item: job.item,
        jobId: job.id
      });
      if (!response?.ok) throw new Error(response?.error || "收藏失败。");
      if (!response.liked) throw new Error("Review Board 没有保留这条收藏，请重试。");
      likedKeys.add(job.id);
      likeColor = normalizeColor(response.color);
      persistLikedStateCache();
      renderAllButtons();
      updateUploadJob(job, {
        progress: 100,
        state: "success",
        status: "已上传 Pixmax 并写入 Review Board"
      });
      job.button.disabled = false;
      job.removeTimer = window.setTimeout(() => {
        if (uploadJobs.get(job.id) !== job || job.state !== "success") return;
        uploadJobs.delete(job.id);
        renderUploadQueue();
      }, 2600);
    } catch (error) {
      updateUploadJob(job, {
        error: error?.message || String(error),
        progress: Math.max(6, Number(job.progress) || 0),
        state: "failed",
        status: error?.message || String(error)
      });
      if (job.button) job.button.disabled = false;
    }
  }

  async function withOriginalResolutionLock(task) {
    const previous = originalResolutionGate.catch(() => {});
    let release;
    originalResolutionGate = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  function findVideoByLikeKey(likeKey) {
    return [...document.querySelectorAll("video")].find((video) =>
      getJimengLikeKey(video.currentSrc || video.src) === likeKey
    ) || null;
  }

  function updateUploadJobFromBackground(message) {
    const job = uploadJobs.get(String(message.jobId || message.likeKey || ""));
    if (!job || job.state === "success" || job.state === "failed") return;
    updateUploadJob(job, {
      progress: Number(message.progress) || job.progress,
      state: String(message.state || job.state),
      status: String(message.status || job.status)
    });
  }

  function updateUploadJob(job, values) {
    Object.assign(job, values);
    renderUploadQueue();
  }

  function retryUploadJob(jobId) {
    const job = uploadJobs.get(jobId);
    if (!job || job.state !== "failed") return;
    const currentVideo = findVideoByLikeKey(job.id) || job.video;
    const currentButton = [...document.querySelectorAll(`.${BUTTON_CLASS}`)].find((button) =>
      button.dataset.likeKey === job.id
    ) || job.button;
    if (!currentVideo || !currentButton) {
      job.status = "页面已找不到该卡片，请刷新后重新点爱心";
      renderUploadQueue();
      return;
    }
    enqueueUploadJob(currentVideo, currentButton);
  }

  function ensureUploadQueue() {
    let root = document.getElementById(QUEUE_ID);
    if (root) return root;
    root = document.createElement("section");
    root.id = QUEUE_ID;
    root.hidden = true;
    const header = document.createElement("header");
    header.className = "pixmax-jimeng-queue-header";
    const title = document.createElement("span");
    title.className = "pixmax-jimeng-queue-title";
    title.textContent = "Pixmax 上传队列";
    const summary = document.createElement("span");
    summary.className = "pixmax-jimeng-queue-summary";
    const count = document.createElement("span");
    count.className = "pixmax-jimeng-queue-count";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "pixmax-jimeng-queue-toggle";
    toggle.addEventListener("click", () => {
      uploadQueueCollapsed = !uploadQueueCollapsed;
      renderUploadQueue();
    });
    summary.append(count, toggle);
    header.append(title, summary);
    const list = document.createElement("div");
    list.className = QUEUE_LIST_CLASS;
    root.append(header, list);
    document.documentElement.append(root);
    return root;
  }

  function renderUploadQueue() {
    const root = ensureUploadQueue();
    const jobs = [...uploadJobs.values()].sort((first, second) => first.createdAt - second.createdAt);
    root.hidden = jobs.length === 0;
    root.dataset.collapsed = uploadQueueCollapsed ? "true" : "false";
    document.documentElement.classList.toggle("pixmax-jimeng-queue-visible", jobs.length > 0);
    root.querySelector(".pixmax-jimeng-queue-count").textContent = jobs.length
      ? `${jobs.length} 个任务 · ${activeUploadCount} 个进行中`
      : "";
    const toggle = root.querySelector(".pixmax-jimeng-queue-toggle");
    toggle.textContent = uploadQueueCollapsed ? "展开" : "收起";
    toggle.title = uploadQueueCollapsed ? "展开上传队列" : "收起上传队列";
    const list = root.querySelector(`.${QUEUE_LIST_CLASS}`);
    list.textContent = "";
    for (const job of jobs) list.append(renderUploadJob(job));
  }

  function renderUploadJob(job) {
    const row = document.createElement("article");
    row.className = "pixmax-jimeng-upload-job";
    row.dataset.state = job.state;
    const posterUrl = normalizeUrl(job.item?.poster);
    let poster;
    if (posterUrl) {
      poster = document.createElement("img");
      poster.className = "pixmax-jimeng-job-poster";
      poster.src = posterUrl;
      poster.alt = "";
    } else {
      poster = document.createElement("span");
      poster.className = "pixmax-jimeng-job-poster-fallback";
      poster.textContent = "▶";
    }
    const main = document.createElement("div");
    main.className = "pixmax-jimeng-job-main";
    const name = document.createElement("div");
    name.className = "pixmax-jimeng-job-name";
    name.textContent = job.item?.name || "即梦视频";
    const status = document.createElement("div");
    status.className = "pixmax-jimeng-job-status";
    status.textContent = job.status || "等待上传";
    status.title = job.error || job.status || "";
    const progress = document.createElement("div");
    progress.className = "pixmax-jimeng-job-progress";
    const progressValue = document.createElement("span");
    progressValue.style.setProperty("--pixmax-job-progress", `${Math.min(100, Math.max(4, Number(job.progress) || 4))}%`);
    progress.append(progressValue);
    main.append(name, status, progress);
    const action = document.createElement("span");
    if (job.state === "failed") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "pixmax-jimeng-job-retry";
      retry.textContent = "重试";
      retry.addEventListener("click", () => retryUploadJob(job.id));
      action.append(retry);
    }
    row.append(poster, main, action);
    return row;
  }

  function buildJimengLikeItem(video) {
    const previewUrl = normalizeUrl(video.currentSrc || video.src);
    const likeKey = getJimengLikeKey(previewUrl);
    const originalUrl = resolveOriginalVideoUrl(previewUrl, video);
    const url = originalUrl;
    if (!url || !likeKey) throw new Error("这个即梦视频没有可收藏的公开链接。");

    const record = findMetadataRecord(video);
    const promptElement = findPromptElementForVideo(video, record);
    const referenceImages = extractReferenceImages(record, video, promptElement);
    const promptContent = extractPromptContent(record, referenceImages, promptElement);
    const prompt = promptContentToText(promptContent) || extractPrompt(record, promptElement);
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
      originalVerified: false,
      poster,
      previewUrl,
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

  function installNativeProtocolRecorder() {
    document.addEventListener("pointerdown", (event) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      if (event.target.closest(`.${BUTTON_CLASS},.${EAGLE_BUTTON_CLASS},.${RECORD_BUTTON_CLASS}`)) return;
      const video = findVideoForRecordedClick(event.target, event.clientX, event.clientY);
      if (!video) return;
      const root = findResultRecord(video) || findVideoCardHost(video);
      const clickable = findRecordedClickable(event.target, root);
      const recipe = buildRecordedElementRecipe(clickable, root);
      if (!recipe) return;
      const previewUrl = normalizeUrl(video.currentSrc || video.src);
      const contextUrls = getOriginalLookupUrls(video);
      const activeSession = recordingSession?.expiresAt > Date.now()
        && getJimengLikeKey(recordingSession.video?.currentSrc || recordingSession.video?.src) === getJimengLikeKey(previewUrl)
        ? recordingSession
        : null;
      pendingElementCapture = {
        contextUrls,
        expiresAt: Date.now() + 12000,
        explicit: Boolean(activeSession),
        previewUrl,
        recipe,
        recordButton: activeSession?.button || null
      };
      if (activeSession) showToast("已识别官方下载元素，正在等待即梦返回原片链接…");
      sendRuntimeMessage({
        type: MESSAGE.JIMENG_ARM_PROTOCOL_CAPTURE,
        automatic: false,
        contextUrls,
        previewUrl,
        recipe,
        requestId: ""
      }).catch(() => {});
    }, true);
  }

  function completePendingElementRecording(candidate) {
    const pending = pendingElementCapture;
    if (!pending || pending.expiresAt < Date.now()) {
      pendingElementCapture = null;
      return false;
    }
    const url = normalizeUrl(candidate?.url);
    const relatedUrls = [candidate?.contextPreviewUrl, ...(candidate?.previewUrls || [])]
      .map(normalizeUrl)
      .filter(Boolean);
    const previewKey = getJimengLikeKey(pending.previewUrl);
    const matchesCard = relatedUrls.includes(pending.previewUrl)
      || relatedUrls.some((value) => getJimengLikeKey(value) === previewKey)
      || candidate?.contextKey === previewKey;
    if (!url || !matchesCard) return false;

    pendingElementCapture = null;
    if (recordingSession?.timer) window.clearTimeout(recordingSession.timer);
    recordingSession = null;
    hasDownloadRecipe = true;
    lastRecordedRecipeUrl = url;
    lastCapturedProtocolUrl = url;
    chrome.storage.local.set({ [DOWNLOAD_RECIPE_STORAGE_KEY]: pending.recipe }, () => {
      if (chrome.runtime.lastError) {
        hasDownloadRecipe = false;
        renderAllRecordButtons();
        showToast(`录制保存失败：${chrome.runtime.lastError.message}`, true);
        return;
      }
      renderAllRecordButtons();
      showToast("录制完成：已保存官方下载元素和原片协议；以后点爱心或存 Eagle 会自动复用。");
    });
    renderAllRecordButtons();
    return true;
  }

  function findVideoForRecordedClick(target, clientX, clientY) {
    let node = target;
    for (let depth = 0; node && node !== document.body && depth < 18; depth += 1, node = node.parentElement) {
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

  function findRecordedClickable(target, root) {
    let node = target;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      if (node.matches?.("button,a,[role='button'],[class*='card-icon-button-'],[class*='operation-']")) {
        return root?.contains(node) ? node : null;
      }
      if (node === root) break;
    }
    return null;
  }

  function buildRecordedElementRecipe(element, root) {
    if (!element || !root || element === root) return null;
    const path = getRecordedElementPath(element, root);
    if (!path?.length) return null;
    const video = root.querySelector?.("video");
    const videoRect = video?.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    return {
      ariaLabel: String(element.getAttribute("aria-label") || "").trim(),
      classNames: [...element.classList].filter((name) =>
        name && name !== BUTTON_CLASS && name !== EAGLE_BUTTON_CLASS && name !== RECORD_BUTTON_CLASS
      ).slice(0, 12),
      path,
      rootKind: findResultRecord(root.querySelector?.("video")) === root ? "record" : "card",
      tagName: element.tagName,
      text: String(element.textContent || "").trim().slice(0, 200),
      title: String(element.getAttribute("title") || "").trim(),
      videoPosition: videoRect?.width && videoRect?.height ? {
        x: (elementRect.left + elementRect.width / 2 - videoRect.left) / videoRect.width,
        y: (elementRect.top + elementRect.height / 2 - videoRect.top) / videoRect.height
      } : null
    };
  }

  function getRecordedElementPath(element, root) {
    if (!element || !root || element === root) return null;
    const path = [];
    let node = element;
    while (node && node !== root && path.length < 30) {
      const parent = node.parentElement;
      if (!parent) return null;
      const index = [...parent.children].indexOf(node);
      if (index < 0) return null;
      path.unshift(index);
      node = parent;
    }
    return node === root ? path : null;
  }

  function readLocalStorageValue(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get({ [key]: null }, (result) => resolve(result[key]));
    });
  }

  function locateRecordedElement(video, recipe) {
    if (!recipe || !Array.isArray(recipe.path)) return null;
    const root = recipe.rootKind === "card"
      ? findVideoCardHost(video)
      : findResultRecord(video) || findVideoCardHost(video);
    let element = root;
    for (const rawIndex of recipe.path) {
      const index = Number(rawIndex);
      if (!Number.isInteger(index) || index < 0 || !element?.children?.[index]) {
        element = null;
        break;
      }
      element = element.children[index];
    }
    if (matchesRecordedElement(element, recipe)) return element;
    return locateRecordedElementBySignature(root, video, recipe);
  }

  function matchesRecordedElement(element, recipe) {
    if (!element || element.tagName !== String(recipe.tagName || "").toUpperCase()) return false;
    if (element.closest(`.${BUTTON_CLASS},.${EAGLE_BUTTON_CLASS},.${RECORD_BUTTON_CLASS}`)) return false;
    const recipeClasses = (Array.isArray(recipe.classNames) ? recipe.classNames : []).filter(Boolean);
    const classMatch = recipeClasses.some((name) => element.classList.contains(name));
    const labelMatch = [
      [recipe.ariaLabel, element.getAttribute("aria-label")],
      [recipe.title, element.getAttribute("title")],
      [recipe.text, String(element.textContent || "").trim()]
    ].some(([expected, actual]) => expected && expected === String(actual || "").trim());
    return !recipeClasses.length || classMatch || labelMatch;
  }

  function locateRecordedElementBySignature(root, video, recipe) {
    const tagName = String(recipe.tagName || "").toLowerCase();
    if (!tagName || !root?.querySelectorAll) return null;
    const recipeClasses = (Array.isArray(recipe.classNames) ? recipe.classNames : []).filter(Boolean);
    const recipePath = (Array.isArray(recipe.path) ? recipe.path : []).map(Number);
    const videoRect = video?.getBoundingClientRect();
    const candidates = [...root.querySelectorAll(tagName)]
      .filter((element) => matchesRecordedElement(element, recipe))
      .map((element) => {
        const path = getRecordedElementPath(element, root) || [];
        const classMatches = recipeClasses.filter((name) => element.classList.contains(name)).length;
        const labelMatch = [
          [recipe.ariaLabel, element.getAttribute("aria-label")],
          [recipe.title, element.getAttribute("title")],
          [recipe.text, String(element.textContent || "").trim()]
        ].some(([expected, actual]) => expected && expected === String(actual || "").trim());
        const alignedDistance = recordedPathDistance(recipePath, path, false);
        const suffixDistance = recordedPathDistance(recipePath, path, true);
        let positionDistance = 0;
        if (recipe.videoPosition && videoRect?.width && videoRect?.height) {
          const rect = element.getBoundingClientRect();
          const x = (rect.left + rect.width / 2 - videoRect.left) / videoRect.width;
          const y = (rect.top + rect.height / 2 - videoRect.top) / videoRect.height;
          positionDistance = Math.hypot(x - Number(recipe.videoPosition.x), y - Number(recipe.videoPosition.y));
        }
        return {
          element,
          score: classMatches * 100 + (labelMatch ? 300 : 0)
            - Math.min(alignedDistance, suffixDistance) * 8
            - positionDistance * 200
        };
      })
      .sort((first, second) => second.score - first.score);
    if (!candidates.length || candidates[0].score < 60) return null;
    if (candidates[1] && candidates[0].score === candidates[1].score) return null;
    return candidates[0].element;
  }

  function recordedPathDistance(expected, actual, alignSuffix) {
    const maxLength = Math.max(expected.length, actual.length);
    const offsetExpected = alignSuffix ? maxLength - expected.length : 0;
    const offsetActual = alignSuffix ? maxLength - actual.length : 0;
    let distance = Math.abs(expected.length - actual.length) * 3;
    for (let index = 0; index < maxLength; index += 1) {
      const expectedValue = expected[index - offsetExpected];
      const actualValue = actual[index - offsetActual];
      if (expectedValue == null || actualValue == null) continue;
      distance += Math.abs(expectedValue - actualValue);
    }
    return distance;
  }

  async function invokeRecordedNativeDownload(video, requestId) {
    const recipe = await readLocalStorageValue(DOWNLOAD_RECIPE_STORAGE_KEY);
    if (!recipe) return false;
    const hoverTargets = [...new Set([video, findVideoCardHost(video), findResultRecord(video)].filter(Boolean))];
    for (const hoverTarget of hoverTargets) {
      for (const type of ["pointerover", "mouseover", "mouseenter", "mousemove"]) {
        hoverTarget.dispatchEvent(new MouseEvent(type, { bubbles: true, view: window }));
      }
    }
    let element = null;
    for (const waitMs of [80, 120, 200, 300]) {
      await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      element = locateRecordedElement(video, recipe);
      if (element) break;
    }
    if (!element) return false;
    const previewUrl = normalizeUrl(video.currentSrc || video.src);
    const contextUrls = getOriginalLookupUrls(video);
    const response = await sendRuntimeMessage({
      type: MESSAGE.JIMENG_ARM_PROTOCOL_CAPTURE,
      automatic: true,
      contextUrls,
      previewUrl,
      recipe,
      requestId
    });
    if (!response?.ok) return false;
    window.dispatchEvent(new CustomEvent(AUTOMATIC_NATIVE_EVENT, {
      detail: { contextUrls, previewUrl, requestId }
    }));
    element.click();
    return true;
  }

  function captureOfficialOriginalUrl(video, { allowIndexedOriginal = false } = {}) {
    const previewUrl = normalizeUrl(video.currentSrc || video.src);
    const likeKey = getJimengLikeKey(previewUrl);
    const contextUrls = getOriginalLookupUrls(video);
    if (!previewUrl || !likeKey) return Promise.reject(new Error("这个即梦视频还没有可用的播放器链接。"));
    const requestId = `jimeng-original-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener(ORIGINAL_RESULT_EVENT, onResult);
        reject(new Error("等待即梦素材协议返回原片 URL 超时。"));
      }, 18000);
      const onResult = async (event) => {
        if (event.detail?.requestId !== requestId) return;
        const url = normalizeUrl(event.detail?.url);
        if (!url) {
          window.clearTimeout(timer);
          window.removeEventListener(ORIGINAL_RESULT_EVENT, onResult);
          const resolverError = String(event.detail?.error || "即梦视频数据没有返回原片链接。");
          reject(new Error(`${resolverError} 已停止使用录制按钮兜底，不会把预览小样存入 Eagle。`));
          return;
        }
        const verified = Boolean(event.detail?.verified)
          && isVerifiedOfficialOriginalUrl(url, previewUrl);
        if (!verified) {
          window.clearTimeout(timer);
          window.removeEventListener(ORIGINAL_RESULT_EVENT, onResult);
          reject(new Error(
            "取得的地址没有通过即梦官方原片校验，已阻止把预览小样存入 Eagle。"
          ));
          return;
        }
        window.clearTimeout(timer);
        window.removeEventListener(ORIGINAL_RESULT_EVENT, onResult);
        mediaCandidates = [{
          contextKey: likeKey,
          contextPreviewUrl: previewUrl,
          hint: "jimeng-native-download",
          observedAt: Date.now(),
          previewUrls: contextUrls,
          url
        }, ...mediaCandidates.filter((item) => item?.url !== url)].slice(0, 200);
        resolve({
          filename: String(event.detail?.filename || ""),
          source: String(event.detail?.source || ""),
          url,
          verified: true
        });
      };
      window.addEventListener(ORIGINAL_RESULT_EVENT, onResult);
      window.dispatchEvent(new CustomEvent(ORIGINAL_RESOLVE_EVENT, {
        detail: {
          contextUrls,
          forceRefresh: Boolean(allowIndexedOriginal),
          likeKey,
          previewUrl,
          requestId
        }
      }));
    });
  }

  function isVerifiedOfficialOriginalUrl(originalUrl, previewUrl) {
    if (!originalUrl || originalUrl === previewUrl) return false;
    try {
      const original = new URL(originalUrl);
      const preview = new URL(previewUrl);
      const originalBitrate = Number(original.searchParams.get("br") || original.searchParams.get("bt"));
      const previewBitrate = Number(preview.searchParams.get("br") || preview.searchParams.get("bt"));
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

  function getOriginalLookupUrls(video) {
    const urls = [
      video?.currentSrc,
      video?.src,
      video?.poster,
      ...[...(findVideoCardHost(video)?.querySelectorAll("img") || [])]
        .map((image) => image.currentSrc || image.src)
    ]
      .map(normalizeUrl)
      .filter(Boolean);
    return [...new Set(urls)].slice(0, 30);
  }

  function resolveOriginalVideoUrl(previewUrl, video) {
    const previewKey = getJimengLikeKey(previewUrl);
    window.dispatchEvent(new CustomEvent(MEDIA_CANDIDATE_REQUEST_EVENT, {
      detail: { likeKey: previewKey, previewUrl }
    }));
    return findCapturedOriginalUrl(previewUrl) || previewUrl;
  }

  function findCapturedOriginalUrl(previewUrl) {
    return findCapturedOriginalCandidate(previewUrl)?.url || "";
  }

  function findCapturedOriginalCandidate(previewUrl) {
    const previewKey = getJimengLikeKey(previewUrl);
    const ranked = mediaCandidates
      .map((candidate) => {
        const url = normalizeUrl(candidate?.url);
        const relatedPreviewUrls = [candidate?.contextPreviewUrl, ...(candidate?.previewUrls || [])]
          .map(normalizeUrl)
          .filter(Boolean);
        const matchesPreview = candidate?.contextKey === previewKey
          || relatedPreviewUrls.includes(previewUrl)
          || relatedPreviewUrls.some((value) => getJimengLikeKey(value) === previewKey);
        if (!url || !matchesPreview) return null;
        const hint = String(candidate?.hint || "").toLowerCase();
        const lowerUrl = url.toLowerCase();
        let score = 0;
        if (url === previewUrl) score -= 80;
        if (getJimengLikeKey(url) === previewKey) score += 80;
        if (/download|original|origin|source|no_watermark|without_watermark|unwatermark|原片|原视频|下载/.test(hint)) score += 120;
        if (/scenevideourls|scene_video_urls/.test(hint)) score += 100;
        if (/download|original|origin|source|no_watermark|without_watermark|unwatermark/.test(lowerUrl)) score += 70;
        if (/preview|play|transcode|low|watermark/.test(`${hint} ${lowerUrl}`)) score -= 45;
        if (hint.includes("react")) score += 25;
        const protocolHint = /native-download|download-protocol|webrequest-recording/i.test(hint);
        const verified = protocolHint && isVerifiedOfficialOriginalUrl(url, previewUrl);
        return { score: score + (verified ? 200 : 0), url, verified };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 70 ? ranked[0] : null;
  }

  function extractPrompt(record, promptElement = null) {
    return cleanJimengPromptText((promptElement || findPromptElement(record))?.innerText || "");
  }

  function findPromptElementForVideo(video, record) {
    const localPrompt = findPromptElement(record);
    if (cleanJimengPromptText(localPrompt?.innerText || "").length >= 20) return localPrompt;

    const videoRect = video.getBoundingClientRect();
    const videoCard = findVideoCardHost(video);
    const candidates = new Set();
    for (const element of document.querySelectorAll('[class*="prompt-"]')) candidates.add(element);
    for (const image of document.querySelectorAll("img")) {
      if (videoCard?.contains(image)) continue;
      let node = image.parentElement;
      for (let depth = 0; node && node !== document.body && depth < 7; depth += 1) {
        if (node.querySelector("video")) break;
        const text = cleanJimengPromptText(node.innerText || "");
        if (text.length >= 20) candidates.add(node);
        node = node.parentElement;
      }
    }

    return [...candidates]
      .map((element) => {
        if (!element?.isConnected || element.querySelector("video")) return null;
        const text = cleanJimengPromptText(element.innerText || "");
        if (text.length < 20) return null;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const horizontalGap = rect.right < videoRect.left
          ? videoRect.left - rect.right
          : rect.left > videoRect.right
            ? rect.left - videoRect.right
            : 0;
        const verticalGap = rect.bottom < videoRect.top
          ? videoRect.top - rect.bottom
          : rect.top > videoRect.bottom
            ? rect.top - videoRect.bottom
            : 0;
        const abovePenalty = rect.bottom < videoRect.top ? 350 : 0;
        const inlineImageBonus = Math.min(12, element.querySelectorAll("img").length) * 18;
        return {
          element,
          score: verticalGap * 2 + horizontalGap + abovePenalty - inlineImageBonus
        };
      })
      .filter(Boolean)
      .sort((first, second) => first.score - second.score)[0]?.element || null;
  }

  function findPromptElement(record) {
    if (!record) return null;
    const allPromptElements = [...record.querySelectorAll('[class*="prompt-"]')];
    const exactCandidates = allPromptElements
      .filter((element) => [...element.classList].some((name) => /^prompt-[A-Z0-9_]/.test(name)))
      .map((element) => ({ element, text: String(element.innerText || "").trim() }))
      .filter(({ text }) => text && !text.includes("Seedance") && text !== "详细信息")
      .sort((first, second) => first.text.length - second.text.length);
    if (exactCandidates.length) return exactCandidates[0].element;

    const classFallback = allPromptElements
      .map((element) => ({
        element,
        imageCount: element.querySelectorAll("img").length,
        text: String(element.innerText || "").trim()
      }))
      .filter(({ element, text }) => {
        if (!text || text === "详细信息") return false;
        return ![...element.classList].some((name) => /(?:header|label|title|button|toolbar)/i.test(name));
      })
      .sort((first, second) => second.imageCount - first.imageCount
        || second.text.length - first.text.length)[0]?.element;
    if (classFallback) return classFallback;

    // Jimeng occasionally changes the generated class name on the prompt
    // editor. A prompt with inline reference chips still has a stable shape:
    // meaningful text (often mixed with the Seedance label), without a nested
    // video. The current compact Jimeng layout can keep a details button in
    // this same region, so a nested button is not a reason to reject it.
    if (record.querySelectorAll("video").length > 2) return null;
    return [...record.querySelectorAll("div,section,article,p,span")]
      .map((element) => ({
        element,
        imageCount: element.querySelectorAll("img").length,
        text: String(element.innerText || "").trim()
      }))
      .filter(({ element, imageCount, text }) =>
        text.length >= 20
        && !element.querySelector("video")
        && !element.closest(`.${BUTTON_CLASS},.${EAGLE_BUTTON_CLASS},#${QUEUE_ID}`)
        && (imageCount > 0 || !/^(?:重新编辑|再次生成|存\s*Eagle|详细信息)/.test(text))
      )
      .sort((first, second) => Number(second.imageCount > 0) - Number(first.imageCount > 0)
        || first.text.length - second.text.length)[0]?.element || null;
  }

  function extractLabels(record) {
    const labels = record?.querySelector('[class^="labels-"]');
    return String(labels?.innerText || "")
      .replace(/\s+/g, " ")
      .replace(/\s*详细信息\s*$/, "")
      .trim();
  }

  function extractReferenceImages(record, video, promptElement = null) {
    const urls = [];
    const videoCard = findVideoCardHost(video);
    const promptScope = findPromptMediaScope(promptElement);
    const metadataImages = [...(record?.querySelectorAll("img") || [])]
      .filter((image) => !videoCard?.contains(image));
    const images = [
      ...(record?.querySelectorAll('[class*="reference-image-"] img') || []),
      ...(record?.querySelectorAll('[class*="reference-"] img,[class*="material-"] img') || []),
      ...(promptElement?.querySelectorAll("img") || []),
      ...(promptScope?.querySelectorAll("img") || []),
      ...metadataImages
    ];
    for (const image of images) {
      const url = normalizeUrl(image.currentSrc || image.src);
      if (url && !urls.includes(url)) urls.push(url);
    }
    return urls.map((url, index) => ({ name: `参考图 ${index + 1}`, url }));
  }

  function findPromptMediaScope(promptElement) {
    let node = promptElement;
    let scope = promptElement;
    for (let depth = 0; node && node !== document.body && depth < 5; depth += 1) {
      if (node.querySelector("video")) break;
      const text = cleanJimengPromptText(node.innerText || "");
      if (text.length >= 20) scope = node;
      node = node.parentElement;
    }
    return scope;
  }

  function extractPromptContent(record, referenceImages, promptElement = null) {
    const prompt = promptElement || findPromptElement(record);
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
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (segment.type !== "text") continue;
      const markerIndex = String(segment.text || "").search(/\s*即梦\s+Seedance\b/i);
      if (markerIndex < 0) continue;
      segment.text = segment.text.slice(0, markerIndex);
      segments.splice(index + 1);
      break;
    }
    const firstText = segments.find((segment) => segment.type === "text");
    const lastText = [...segments].reverse().find((segment) => segment.type === "text");
    if (firstText) firstText.text = firstText.text.replace(/^\s+/, "");
    if (lastText) lastText.text = lastText.text.replace(/\s+$/, "");
    return segments.filter((segment) => segment.type === "image" || segment.text);
  }

  function promptContentToText(promptContent) {
    return cleanJimengPromptText(promptContent.map((segment) => segment.type === "image"
      ? `@${segment.name || "参考图"}`
      : segment.text || ""
    ).join(""));
  }

  function cleanJimengPromptText(value) {
    return String(value || "")
      .replace(/\s*即梦\s+Seedance\b[\s\S]*$/i, "")
      .replace(/\s*详细信息\s*$/i, "")
      .trim();
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
    toast.textContent = error ? `[PixmaxHub ${BUILD_VERSION}] ${message}` : message;
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
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) reject(normalizeRuntimeMessageError(runtimeError));
          else resolve(response);
        });
      } catch (error) {
        reject(normalizeRuntimeMessageError(error));
      }
    });
  }

  function normalizeRuntimeMessageError(error) {
    const message = String(error?.message || error || "扩展通信失败。");
    if (!/Extension context invalidated/i.test(message)) return new Error(message);
    const reloadKey = "pixmaxHubInvalidatedReloadAt";
    const previousReload = Number(sessionStorage.getItem(reloadKey) || 0);
    if (Date.now() - previousReload > 5000) {
      sessionStorage.setItem(reloadKey, String(Date.now()));
      window.setTimeout(() => location.reload(), 120);
    }
    return new Error("扩展刚刚重载，即梦页面的旧脚本已失效，正在自动刷新页面后恢复。");
  }
})();
