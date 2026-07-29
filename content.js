(() => {
  if (window.__pixmaxCanvasClonerUi) return;
  window.__pixmaxCanvasClonerUi = true;

  const REQUEST_EVENT = "pixmax-canvas-cloner:request";
  const RESPONSE_SOURCE = "pixmax-canvas-cloner:bridge";
  const EXTENSION_REQUEST_EVENT = "pixmax-canvas-cloner:extension-request";
  const EXTENSION_RESPONSE_EVENT = "pixmax-canvas-cloner:extension-response";
  const NODE_SELECTOR = ".svelte-flow__node[data-id]";
  const TOOLBAR_SELECTOR = ".svelte-flow__node-toolbar";
  const FOCUS_PARAM = "pixmaxClonerFocus";
  const FOCUS_RECT_PARAM = "pixmaxClonerFocusRect";
  const FOCUS_ZOOM_PARAM = "pixmaxClonerFocusZoom";
  const ACTIONS_CLASS = "pixmax-canvas-cloner-actions";
  const CONTEXT_PASTE_CLASS = "pixmax-canvas-cloner-context-paste";
  const PROMPT_TOOLS_CLASS = "pixmax-canvas-cloner-prompt-tools";
  const PROMPT_EDITOR_CLASS = "pixmax-canvas-cloner-prompt-editor";
  const PROMPT_TOOLS_HOST_CLASS = "pixmax-canvas-cloner-prompt-tools-host";
  const STYLE_ID = "pixmax-canvas-cloner-style";
  const OFFICIAL_FOCUS_STYLE_ID = "collab-remote-focus-styles";
  const LIVE_FOCUS_STYLE_ID = "pixmax-canvas-cloner-live-focus-colors";
  const LIVE_SELECTION_STYLE_ID = "pixmax-canvas-cloner-live-selection-color";
  const STYLE_VERSION = "1.4.34";
  const TOAST_ID = "pixmax-canvas-cloner-toast";
  const LIVE_TOGGLE_ID = "pixmax-canvas-cloner-live-toggle";
  const OPEN_LIKES_BUTTON_ID = "pixmax-canvas-cloner-open-likes";
  const PERFORMANCE_BUTTON_ID = "pixmax-canvas-cloner-performance-toggle";
  const VIDEO_HISTORY_BUTTON_ID = "pixmax-canvas-cloner-video-history-button";
  const VIDEO_HISTORY_PANEL_ID = "pixmax-canvas-cloner-video-history-panel";
  const FOCUS_COMPLETE_EVENT = "pixmax-canvas-cloner:focus-complete";
  const LIVE_CURSOR_LAYER_ID = "pixmax-canvas-cloner-live-cursors";
  const LIKES_STORAGE_KEY = "pixmaxLikedItems";
  const PERFORMANCE_MODE_STORAGE_KEY = "pixmaxCanvasPerformanceMode";
  const VIDEO_HISTORY_STORAGE_KEY = "pixmaxCanvasVideoHistory";
  const VIDEO_HISTORY_PAGE_SIZE = 10;
  const WATCHED_VIDEO_STORAGE_KEY = "pixmaxWatchedVideoKeys";
  const WATCHED_VIDEO_CANVAS_BASELINES_KEY = "pixmaxWatchedVideoCanvasBaselines";
  const KNOWN_VIDEO_CANVAS_MODEL_KEY = "pixmaxKnownVideoCanvasModelAt";
  const LIVE_IDENTITY_STORAGE_KEY = "pixmaxHubLiveIdentity";
  const UPDATE_CHECK_STORAGE_KEY = "pixmaxHubUpdateReminder";
  const DEFAULT_GITHUB_UPDATE_URL = "https://github.com/171896542/PixmaxHub-Plug/tree/main";
  const UPDATE_REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const DEFAULT_LIKE_COLOR = "#ff3864";
  const LIVE_CURSOR_SEND_INTERVAL_MS = 45;
  const LIVE_FOCUS_SEND_INTERVAL_MS = 120;
  const LIVE_REMOTE_CURSOR_TTL_MS = 2600;
  const LIVE_FOCUS_HEARTBEAT_MS = 1800;
  const LIVE_REMOTE_FOCUS_STALE_MS = 45000;
  const LIVE_REVISION_POLL_INTERVAL_MS = 300;
  const LIVE_SYNC_TRIGGER_INTERVAL_MS = 120;
  const LIVE_REVISION_CHECK_DELAY_MS = 180;
  const LIVE_REMOTE_BROADCAST_PULL_DELAY_MS = 20;
  const LIVE_REMOTE_ACTIVITY_GRACE_MS = 2500;
  const LIVE_FALLBACK_COLORS = [
    "#ff3864",
    "#ffd500",
    "#4ce2f3",
    "#6d7cff",
    "#35d07f",
    "#ff8a3d",
    "#b85cff",
    "#ff66b3"
  ];
  const SHARED_OPTIONS_DEFAULTS = {
    sharedLikesEnabled: true,
    sharedLikesFileUuid: "",
    sharedLikesOwnerName: "",
    sharedLikesColor: DEFAULT_LIKE_COLOR,
    liveCollabEnabled: true
  };
  const requests = new Map();
  const extensionRequests = new Map();
  const pendingToolbarRoots = new Set();
  const pendingPromptToolRoots = new Set();
  let likedKeys = new Set();
  let ownLikedKeys = new Set();
  let likedColors = new Map();
  let watchedVideoKeys = new Set();
  let knownVideoKeys = new Set();
  let unreadVideoKeys = new Set();
  let watchedVideoOptions = null;
  let videoWatchStateReady = false;
  let toolbarSyncScheduled = false;
  let contextPasteSyncScheduled = false;
  let promptToolsSyncScheduled = false;
  let legacyCleanupScheduled = false;
  let videoHistoryItems = [];
  let videoHistoryVisibleCount = VIDEO_HISTORY_PAGE_SIZE;
  let videoHistoryOpen = false;
  let videoHistoryLoading = false;
  let videoHistoryEntryScheduled = false;
  let videoHistoryHasLoadedOnce = false;
  let videoHistoryRefreshTimer = 0;
  let videoHistoryPanelElement = null;
  let videoHistoryRenderedKey = "";
  let videoHistoryTabsContainer = null;
  let videoHistoryPanelShell = null;
  let videoHistoryLayoutObserver = null;
  let videoHistoryObservedContainer = null;
  let videoHistoryObservedShell = null;
  let videoHistoryMediaObserver = null;
  let videoHistoryPositionScheduled = false;
  let officialViewportPersistTimers = new Set();
  let performanceModeEnabled = false;
  let performanceUpdateScheduled = false;
  let performanceUpdateTimer = 0;
  let performanceRefreshInterval = 0;
  let performanceInteractionTimer = 0;
  let performancePointerDownInFlow = false;
  let performanceCanvasIsMoving = false;
  let canvasNodeDragActive = false;
  let performanceCacheDirty = true;
  let performanceNodesCache = [];
  let performanceEdgesCache = [];
  let performanceEdgeEndpoints = new WeakMap();
  let performanceNodeRects = new WeakMap();
  let performanceSelectedNodeIds = new Set();
  let performanceLastSignature = "";
  let performanceLastEdgeSignature = "";
  let toastTimer = 0;
  let lastContextMenuPoint = null;
  let liveReconnectTimer = 0;
  let liveRevisionTimer = 0;
  let liveCursorCleanupTimer = 0;
  let liveFocusBroadcastTimer = 0;
  let liveSyncTriggerTimer = 0;
  let liveSocket = null;
  let liveSocketReconnectAttempt = 0;
  let liveSocketStatus = "idle";
  let liveSocketLastError = "";
  let liveSocketLastOpenAt = 0;
  let liveSocketLastMessageAt = 0;
  let liveSocketLastSentAt = 0;
  let liveLastCursorSentAt = 0;
  let liveLastFocusBroadcastAt = 0;
  let liveLastFocusHeartbeatAt = 0;
  let liveLastFocusSignature = "";
  let liveLastSyncTriggeredAt = 0;
  let liveLastLocalActivityAt = 0;
  let liveRemoteActivityUntil = 0;
  let liveLastKnownRevision = null;
  let liveOfficialFileUuid = "";
  let liveLastRawMessage = null;
  let liveLastIncomingPayload = null;
  let liveLastDroppedPayload = null;
  let liveLastSentPayload = null;
  let liveLastProfileBroadcastKey = "";
  let liveLastProfileBroadcastAt = 0;
  let liveOfficialClientId = "";
  let liveOfficialUserId = "";
  let liveSyncInFlight = false;
  let liveSyncQueued = false;
  let liveOptions = null;
  let liveOfficialSyncAvailable = false;
  let liveOfficialSyncWarned = false;
  let livePresencePeerCount = 1;
  let liveDomPeerCount = 1;
  let liveMultiUserSyncNotified = false;
  let liveConnectionKey = "";
  let liveSessionId = "";
  let livePresenceAppearanceScheduled = false;
  const livePendingNodeIds = new Set();
  const liveRemoteCursors = new Map();
  const liveRemoteFocuses = new Map();
  const livePeerProfiles = new Map();
  let liveFocusSessions = [];

  function createRequestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function requestBridge(action, payload = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const requestId = createRequestId();
      const timer = window.setTimeout(() => {
        requests.delete(requestId);
        reject(new Error("页面响应超时，请刷新后重试。"));
      }, timeout);

      requests.set(requestId, { resolve, reject, timer });
      window.dispatchEvent(
        new CustomEvent(REQUEST_EVENT, {
          detail: JSON.stringify({ requestId, action, payload })
        })
      );
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.source !== RESPONSE_SOURCE) return;

    if (event.data.notification === "paste-repair-complete") {
      showToast(
        `已粘贴带连线副本，并修复 ${event.data.payload.rewrittenMentionCount} 个 @节点 引用。`
      );
      return;
    }

    if (event.data.notification === "paste-repair-error") {
      showToast(event.data.payload?.error ?? "粘贴修复失败。", true);
      return;
    }

    if (event.data.notification === "shared-like-index-error") {
      showToast(`收藏已保存，但索引同步失败：${event.data.payload?.error || "未知错误"}`, true);
      return;
    }

    if (event.data.notification === "official-presence-message") {
      handleLiveSocketMessage(JSON.stringify(event.data.payload || {}));
      return;
    }

    const pending = requests.get(event.data.requestId);
    if (!pending) return;

    window.clearTimeout(pending.timer);
    requests.delete(event.data.requestId);
    if (event.data.ok) pending.resolve(event.data.payload);
    else pending.reject(new Error(event.data.payload?.error ?? "操作失败。"));
  });

  window.addEventListener("pixmax-canvas-cloner:live-debug", () => {
    window.dispatchEvent(
      new CustomEvent("pixmax-canvas-cloner:live-debug-response", {
        detail: JSON.stringify({
          enabled: Boolean(liveOptions?.enabled),
          fileUuid: liveOptions?.fileUuid || "",
          ownerName: liveOptions?.ownerName || "",
          ownerNameSource: liveOptions?.ownerNameSource || "",
          officialClientId: liveOfficialClientId,
          officialUserId: liveOfficialUserId,
          connectionKey: liveConnectionKey,
          sessionId: liveSessionId,
          socketReadyState: liveSocket?.readyState ?? null,
          socketStatus: liveSocketStatus,
          socketLastError: liveSocketLastError,
          socketLastOpenAt: liveSocketLastOpenAt,
          socketLastMessageAt: liveSocketLastMessageAt,
          socketLastSentAt: liveSocketLastSentAt,
          sideRoom: getLiveSideRoom(),
          officialFileUuid: liveOfficialFileUuid,
          acceptedFileUuids: [...getLiveAcceptedFileUuids()],
          lastSentPayload: liveLastSentPayload,
          lastRawMessage: liveLastRawMessage,
          lastIncomingPayload: liveLastIncomingPayload,
          lastDroppedPayload: liveLastDroppedPayload,
          peerProfiles: [...livePeerProfiles.values()],
          focusSessions: liveFocusSessions,
          remoteCursorCount: liveRemoteCursors.size,
          remoteActivityUntil: liveRemoteActivityUntil,
          peerCount: livePresencePeerCount,
          domPeerCount: liveDomPeerCount,
          officialSyncAvailable: liveOfficialSyncAvailable
        })
      })
    );
  });

  window.addEventListener(EXTENSION_RESPONSE_EVENT, (event) => {
    let response;
    try {
      response = JSON.parse(event.detail);
    } catch {
      return;
    }

    const pending = extensionRequests.get(response.requestId);
    if (!pending) return;

    window.clearTimeout(pending.timer);
    extensionRequests.delete(response.requestId);
    if (response.ok) pending.resolve(response.payload);
    else pending.reject(new Error(response.payload?.error ?? "扩展后台响应失败。"));
  });

  function ensureStyle() {
    const existing = document.getElementById(STYLE_ID);
    if (existing?.dataset.pixmaxClonerStyleVersion === STYLE_VERSION) return;
    existing?.remove();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.pixmaxClonerStyleVersion = STYLE_VERSION;
    style.textContent = `
      .${ACTIONS_CLASS} {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-right: 4px;
        padding-right: 4px;
        border-right: 1px solid rgb(255 255 255 / 18%);
      }
      .${ACTIONS_CLASS} button {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 28px;
        border: 0;
        border-radius: 6px;
        padding: 0 8px;
        background: rgb(255 255 255 / 10%);
        color: #f5f5f5;
        cursor: pointer;
        font: 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
      }
      .${ACTIONS_CLASS} button:hover { background: rgb(255 255 255 / 20%); }
      .${ACTIONS_CLASS} button:disabled { cursor: wait; opacity: .55; }
      .${ACTIONS_CLASS} [data-pixmax-cloner-action="toggle-like"] {
        width: 28px;
        justify-content: center;
        padding: 0;
        font-size: 16px;
        line-height: 1;
      }
      .${ACTIONS_CLASS} [data-pixmax-cloner-action="toggle-like"][data-liked="true"] {
        background: var(--pixmax-cloner-like-color, #ff3864);
        color: #fff;
      }
      ${NODE_SELECTOR}.pixmax-canvas-cloner-liked {
        border-radius: 8px;
        box-shadow:
          0 0 0 3px var(--pixmax-cloner-like-color, #ff3864),
          0 0 0 7px var(--pixmax-cloner-like-glow, rgb(255 56 100 / 22%)) !important;
      }
      ${NODE_SELECTOR}.pixmax-canvas-cloner-liked::after {
        content: "♥";
        position: absolute;
        top: -12px;
        right: -12px;
        z-index: 5;
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 2px solid #fff;
        border-radius: 999px;
        background: var(--pixmax-cloner-like-color, #ff3864);
        color: #fff;
        font: 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
      ${NODE_SELECTOR}.pixmax-canvas-cloner-unwatched-video::before {
        content: "";
        position: absolute;
        top: -7px;
        left: -7px;
        z-index: 6;
        display: block;
        width: 14px;
        height: 14px;
        border: 2px solid #0f1012;
        border-radius: 999px;
        background: #ffd500;
        box-shadow: 0 0 0 1px rgb(255 255 255 / 72%), 0 6px 14px rgb(0 0 0 / 42%);
        pointer-events: none;
      }
      ${NODE_SELECTOR}.pixmax-canvas-cloner-focus {
        animation: pixmax-canvas-cloner-focus 1.25s ease-out 2;
      }
      .svelte-flow__viewport.pixmax-canvas-cloner-moving {
        transition: transform 260ms cubic-bezier(.2, .8, .2, 1);
        will-change: transform;
      }
      @keyframes pixmax-canvas-cloner-focus {
        0% { filter: brightness(1); box-shadow: 0 0 0 3px var(--pixmax-cloner-like-color, #ff3864), 0 0 0 7px var(--pixmax-cloner-like-glow, rgb(255 56 100 / 22%)); }
        40% { filter: brightness(1.28); box-shadow: 0 0 0 4px var(--pixmax-cloner-like-color, #ff3864), 0 0 0 14px var(--pixmax-cloner-like-glow-strong, rgb(255 56 100 / 34%)); }
        100% { filter: brightness(1); box-shadow: 0 0 0 3px var(--pixmax-cloner-like-color, #ff3864), 0 0 0 7px var(--pixmax-cloner-like-glow, rgb(255 56 100 / 22%)); }
      }
      .${CONTEXT_PASTE_CLASS} { color: #75e9f4 !important; }
      .${PROMPT_EDITOR_CLASS}::selection {
        background: #ffd84d;
        color: #151515;
      }
      .${PROMPT_TOOLS_CLASS} {
        position: relative;
        z-index: 30;
        display: inline-flex;
        align-items: center;
        width: auto;
        margin-left: 8px;
        color: #dfe4eb;
        pointer-events: none;
        vertical-align: middle;
        font: 11px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .${PROMPT_TOOLS_CLASS}[data-open="true"] {
        width: auto;
      }
      .${PROMPT_TOOLS_CLASS} .pixmax-prompt-tools-toggle {
        display: flex;
        min-width: 0;
        height: 30px;
        margin-left: auto;
        align-items: center;
        gap: 6px;
        border: 1px solid rgb(255 255 255 / 16%);
        border-radius: 999px;
        padding: 0 12px;
        background: rgb(31 34 39 / 88%);
        color: #d9dee6;
        box-shadow: 0 5px 18px rgb(0 0 0 / 28%);
        backdrop-filter: blur(10px);
        pointer-events: auto;
      }
      .${PROMPT_TOOLS_CLASS} .pixmax-prompt-tools-toggle svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-width: 1.8;
      }
      .${PROMPT_TOOLS_CLASS}[data-open="true"] .pixmax-prompt-tools-toggle {
        border-color: rgb(117 233 244 / 48%);
        background: rgb(39 43 49 / 96%);
        color: #75e9f4;
      }
      .${PROMPT_TOOLS_CLASS} .pixmax-prompt-tools-panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        display: none;
        grid-template-columns: minmax(150px, 1fr) 52px 52px 62px 62px;
        gap: 6px;
        width: min(560px, calc(100vw - 48px));
        padding: 8px;
        border: 1px solid rgb(255 255 255 / 14%);
        border-radius: 10px;
        background: rgb(24 27 31 / 96%);
        box-shadow: 0 12px 32px rgb(0 0 0 / 42%);
        box-sizing: border-box;
        backdrop-filter: blur(14px);
        pointer-events: auto;
      }
      .${PROMPT_TOOLS_CLASS}[data-open="true"] .pixmax-prompt-tools-panel {
        display: grid;
      }
      .${PROMPT_TOOLS_CLASS} input {
        min-width: 0;
        height: 27px;
        border: 1px solid #3a3e45;
        border-radius: 6px;
        padding: 0 7px;
        outline: none;
        background: #202328;
        color: #f5f7fa;
        box-sizing: border-box;
        font: inherit;
      }
      .${PROMPT_TOOLS_CLASS} input:focus {
        border-color: #ffd84d;
        box-shadow: 0 0 0 2px rgb(255 216 77 / 14%);
      }
      .${PROMPT_TOOLS_CLASS} button {
        min-width: 27px;
        height: 27px;
        border: 1px solid #3a3e45;
        border-radius: 6px;
        padding: 0 7px;
        background: #292d33;
        color: #e7ebf0;
        cursor: pointer;
        white-space: nowrap;
        font: inherit;
      }
      .${PROMPT_TOOLS_CLASS} button:hover {
        border-color: #656b75;
        background: #343941;
      }
      .${PROMPT_TOOLS_CLASS} button:disabled {
        cursor: default;
        opacity: .42;
      }
      .${PROMPT_TOOLS_CLASS} .pixmax-prompt-replace-input {
        grid-column: 1 / 3;
      }
      .${PROMPT_TOOLS_CLASS} .pixmax-prompt-match-count {
        display: inline-flex;
        min-width: 38px;
        align-items: center;
        justify-content: center;
        color: #ffd84d;
        white-space: nowrap;
      }
      #${TOAST_ID} {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 2147483647;
        max-width: 360px;
        border: 1px solid #3f4248;
        border-radius: 9px;
        padding: 10px 12px;
        background: #141416f2;
        color: #75e9f4;
        box-shadow: 0 10px 30px #0009;
        font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${TOAST_ID}.error { color: #ff9a92; }
      #${TOAST_ID}.persistent {
        border-color: #f8d66d;
        background: #211c10f5;
        color: #f8d66d;
      }
      #${LIVE_TOGGLE_ID} {
        position: fixed;
        right: 22px;
        bottom: 74px;
        z-index: 2147483646;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 34px;
        border: 1px solid #3f4248;
        border-radius: 8px;
        padding: 0 10px;
        background: #141416f2;
        color: #a9adb5;
        box-shadow: 0 10px 30px #0006;
        cursor: pointer;
        font: 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${LIVE_TOGGLE_ID}[data-active="true"] {
        border-color: #75e9f4;
        color: #75e9f4;
      }
      #${LIVE_TOGGLE_ID}::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #777;
      }
      #${LIVE_TOGGLE_ID}[data-active="true"]::before {
        background: #75e9f4;
        box-shadow: 0 0 0 4px rgb(117 233 244 / 18%);
      }
      #${LIVE_CURSOR_LAYER_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        pointer-events: none;
      }
      .pixmax-canvas-cloner-live-cursor {
        position: absolute;
        left: 0;
        top: 0;
        display: flex;
        align-items: flex-start;
        gap: 4px;
        opacity: 1;
        transform: translate3d(var(--pixmax-live-x, -9999px), var(--pixmax-live-y, -9999px), 0);
        transition: transform 70ms linear, opacity 180ms ease;
        will-change: transform, opacity;
      }
      .pixmax-canvas-cloner-live-cursor[data-stale="true"] {
        opacity: 0;
      }
      .pixmax-canvas-cloner-live-cursor-icon {
        width: 0;
        height: 0;
        border-top: 15px solid var(--pixmax-live-color, #75e9f4);
        border-right: 10px solid transparent;
        filter: drop-shadow(0 2px 5px rgb(0 0 0 / 65%));
      }
      .pixmax-canvas-cloner-live-cursor-name {
        margin-top: 10px;
        max-width: 160px;
        border: 1px solid rgb(255 255 255 / 20%);
        border-radius: 7px;
        padding: 4px 7px;
        background: color-mix(in srgb, var(--pixmax-live-color, #75e9f4) 22%, #111 78%);
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-shadow: 0 6px 16px rgb(0 0 0 / 45%);
        font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${OPEN_LIKES_BUTTON_ID} {
        cursor: pointer;
      }
      #${PERFORMANCE_BUTTON_ID},
      #${OPEN_LIKES_BUTTON_ID} {
        cursor: pointer;
      }
      #${PERFORMANCE_BUTTON_ID}[data-active="true"] {
        border-color: #75e9f4 !important;
        color: #75e9f4 !important;
        box-shadow: 0 0 0 1px rgb(117 233 244 / 25%), 0 10px 30px rgb(0 0 0 / 35%);
      }
      #${PERFORMANCE_BUTTON_ID} svg,
      #${OPEN_LIKES_BUTTON_ID} svg {
        fill: none;
        color: inherit;
        opacity: .82;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.75;
      }
      #${PERFORMANCE_BUTTON_ID} svg:not([class]),
      #${OPEN_LIKES_BUTTON_ID} svg:not([class]) {
        width: 24px;
        height: 24px;
      }
      html.pixmax-canvas-cloner-performance-mode .svelte-flow__edge[aria-label] {
        display: none !important;
        pointer-events: none !important;
      }
      html.pixmax-canvas-cloner-performance-mode .svelte-flow__edge[aria-label].pixmax-canvas-cloner-perf-visible-edge {
        display: inline !important;
        pointer-events: auto !important;
      }
      html.pixmax-canvas-cloner-performance-mode.pixmax-canvas-cloner-node-dragging .svelte-flow__edge[aria-label].pixmax-canvas-cloner-perf-visible-edge {
        display: none !important;
        pointer-events: none !important;
      }
      html.pixmax-canvas-cloner-performance-mode ${NODE_SELECTOR}.pixmax-canvas-cloner-perf-offscreen-node {
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
        content-visibility: visible !important;
        contain: none !important;
      }
      html.pixmax-canvas-cloner-performance-mode ${NODE_SELECTOR}.pixmax-canvas-cloner-perf-onscreen-node,
      html.pixmax-canvas-cloner-performance-mode ${NODE_SELECTOR}.selected,
      html.pixmax-canvas-cloner-performance-mode ${NODE_SELECTOR}[aria-selected="true"],
      html.pixmax-canvas-cloner-performance-mode ${NODE_SELECTOR}[data-selected="true"] {
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
        content-visibility: visible !important;
        contain: none !important;
      }
      #${VIDEO_HISTORY_BUTTON_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
      }
      #${VIDEO_HISTORY_BUTTON_ID}[data-active="true"] {
        color: #f5f8ff;
        box-shadow: inset 0 -3px 0 #75e9f4;
      }
      html.pixmax-canvas-cloner-video-history-open [data-pixmax-video-history-native-tab="true"] {
        color: #aab1bb !important;
        border-color: transparent !important;
        border-bottom-color: transparent !important;
        box-shadow: none !important;
        text-decoration-color: transparent !important;
      }
      html.pixmax-canvas-cloner-video-history-open [data-pixmax-video-history-native-tab="true"] *,
      html.pixmax-canvas-cloner-video-history-open [data-pixmax-video-history-native-tab="true"] *[class] {
        border-color: transparent !important;
        border-bottom-color: transparent !important;
        box-shadow: none !important;
        text-decoration-color: transparent !important;
        background-image: none !important;
      }
      html.pixmax-canvas-cloner-video-history-open [data-pixmax-video-history-native-tab="true"]::before,
      html.pixmax-canvas-cloner-video-history-open [data-pixmax-video-history-native-tab="true"]::after {
        content: none !important;
        display: none !important;
        opacity: 0 !important;
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
      }
      html.pixmax-canvas-cloner-video-history-open [data-pixmax-video-history-native-tab="true"] *::before,
      html.pixmax-canvas-cloner-video-history-open [data-pixmax-video-history-native-tab="true"] *::after {
        content: none !important;
        display: none !important;
        opacity: 0 !important;
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
      }
      #${VIDEO_HISTORY_BUTTON_ID}.pixmax-canvas-cloner-video-history-floating {
        display: none !important;
      }
      #${VIDEO_HISTORY_PANEL_ID} {
        position: absolute;
        inset: var(--pixmax-video-history-shell-top, 140px) 0 0 0;
        z-index: 2147483644;
        display: none;
        width: auto;
        height: auto;
        max-height: none;
        border: 0;
        border-radius: 0;
        background: #111317;
        color: #edf1f7;
        box-shadow: none;
        overflow: hidden;
        font: inherit;
      }
      #${VIDEO_HISTORY_PANEL_ID}[data-open="true"] {
        display: flex;
        flex-direction: column;
      }
      #${VIDEO_HISTORY_PANEL_ID}[data-embedded="true"] {
        position: absolute;
      }
      #${VIDEO_HISTORY_PANEL_ID}[data-embedded="false"] {
        display: none !important;
      }
      .pixmax-canvas-cloner-video-history-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 42px;
        border-bottom: 1px solid #2a2d34;
        padding: 0 12px;
      }
      .pixmax-canvas-cloner-video-history-title {
        overflow: hidden;
        color: #f5f8ff;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pixmax-canvas-cloner-video-history-actions {
        display: inline-flex;
        gap: 6px;
      }
      .pixmax-canvas-cloner-video-history-actions button,
      .pixmax-canvas-cloner-video-history-card button {
        min-height: 30px;
        border: 1px solid #3b4049;
        border-radius: 7px;
        padding: 0 10px;
        background: #20242b;
        color: #e9edf4;
        cursor: pointer;
        font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .pixmax-canvas-cloner-video-history-actions button:hover,
      .pixmax-canvas-cloner-video-history-card button:hover {
        border-color: #75e9f4;
        color: #75e9f4;
      }
      .pixmax-canvas-cloner-video-history-list {
        flex: 1;
        min-height: 220px;
        overflow: auto;
        padding: 24px 32px 32px;
      }
      #${VIDEO_HISTORY_PANEL_ID}[data-embedded="true"] .pixmax-canvas-cloner-video-history-list {
        min-height: 260px;
      }
      .pixmax-canvas-cloner-video-history-empty {
        padding: 38px 12px;
        color: #9aa2ad;
        text-align: center;
      }
      .pixmax-canvas-cloner-video-history-card {
        position: relative;
        contain: layout paint style;
        content-visibility: auto;
        contain-intrinsic-size: auto 360px;
        border: 1px solid #30343b;
        border-radius: 8px;
        margin-bottom: 12px;
        background: #1b1e24;
        overflow: hidden;
      }
      .pixmax-canvas-cloner-video-history-card[data-unwatched="true"]::before {
        content: "";
        position: absolute;
        top: 9px;
        left: 9px;
        z-index: 2;
        width: 12px;
        height: 12px;
        border: 2px solid #111318;
        border-radius: 999px;
        background: #ffd500;
        box-shadow: 0 0 0 1px rgb(255 255 255 / 75%);
      }
      .pixmax-canvas-cloner-video-history-card video {
        display: block;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #050608;
        object-fit: contain;
      }
      .pixmax-canvas-cloner-video-history-meta {
        display: grid;
        gap: 6px;
        padding: 10px;
      }
      .pixmax-canvas-cloner-video-history-time {
        color: #aab1bb;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pixmax-canvas-cloner-video-history-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 10px 10px;
      }
      .pixmax-canvas-cloner-video-history-card-actions .pixmax-canvas-cloner-video-history-like {
        display: inline-grid;
        width: 32px;
        min-width: 32px;
        place-items: center;
        padding: 0;
        font-size: 16px;
      }
      .pixmax-canvas-cloner-video-history-card-actions .pixmax-canvas-cloner-video-history-like[data-liked="true"] {
        border-color: var(--pixmax-cloner-like-color, #ff3864);
        background: var(--pixmax-cloner-like-color, #ff3864);
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureTopActionButtons() {
    const target = findCopyShareButton();
    if (!target?.parentElement) {
      document.getElementById(OPEN_LIKES_BUTTON_ID)?.remove();
      document.getElementById(PERFORMANCE_BUTTON_ID)?.remove();
      return;
    }

    const sourceClass = target.getAttribute("class") || "";
    let performanceButton = document.getElementById(PERFORMANCE_BUTTON_ID);
    if (!performanceButton || performanceButton.dataset.pixmaxSourceClass !== sourceClass) {
      performanceButton?.remove();
      performanceButton = createPerformanceButton(target, sourceClass);
    }
    let likesButton = document.getElementById(OPEN_LIKES_BUTTON_ID);
    if (!likesButton || likesButton.dataset.pixmaxSourceClass !== sourceClass) {
      likesButton?.remove();
      likesButton = createOpenLikesButton(target, sourceClass);
    }
    updatePerformanceButton();
    if (likesButton.nextElementSibling !== target) {
      target.parentElement.insertBefore(likesButton, target);
    }
    if (performanceButton.nextElementSibling !== likesButton) {
      target.parentElement.insertBefore(performanceButton, likesButton);
    }
  }

  function ensureOpenLikesButton() {
    ensureTopActionButtons();
  }

  function createPerformanceButton(target, sourceClass) {
    const button = target.cloneNode(false);
    button.id = PERFORMANCE_BUTTON_ID;
    button.dataset.pixmaxSourceClass = sourceClass || "";
    if (button instanceof HTMLButtonElement) button.type = "button";
    button.removeAttribute("href");
    button.removeAttribute("target");
    button.removeAttribute("rel");
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    button.querySelectorAll?.("[id]").forEach((element) => element.removeAttribute("id"));
    button.title = "开启画布性能模式：隐藏非选中连线和离屏节点";
    button.setAttribute("aria-label", "开启画布性能模式");
    button.innerHTML = createPerformanceSvg(target);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPerformanceModeEnabled(!performanceModeEnabled, { persist: true, toast: true });
    });
    return button;
  }

  function createOpenLikesButton(target, sourceClass) {
    const button = target.cloneNode(false);
    button.id = OPEN_LIKES_BUTTON_ID;
    button.dataset.pixmaxSourceClass = sourceClass || "";
    if (button instanceof HTMLButtonElement) button.type = "button";
    button.removeAttribute("href");
    button.removeAttribute("target");
    button.removeAttribute("rel");
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    button.querySelectorAll?.("[id]").forEach((element) => element.removeAttribute("id"));
    button.title = "打开 Pixmax Review Board";
    button.setAttribute("aria-label", "打开 Pixmax Review Board");
    button.innerHTML = createOpenLikesHeartSvg(target);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestExtension("open-review-board", {}, 5000).catch((error) => {
        showToast(error.message || "无法打开 Review Board。", true);
      });
    });
    return button;
  }

  function createPerformanceSvg(target) {
    const nativeSvgClass = target.querySelector?.("svg")?.getAttribute("class") || "";
    const classAttribute = nativeSvgClass ? ` class="${escapeHtmlAttribute(nativeSvgClass)}"` : "";
    return `
      <svg${classAttribute} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 2 4.8 13.1h6.4L10 22l9.2-12.2h-6.5L13 2Z"/>
      </svg>
    `;
  }

  function createOpenLikesHeartSvg(target) {
    const nativeSvgClass = target.querySelector?.("svg")?.getAttribute("class") || "";
    const classAttribute = nativeSvgClass ? ` class="${escapeHtmlAttribute(nativeSvgClass)}"` : "";
    return `
      <svg${classAttribute} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20.1S5.2 16.2 5.2 10.3a3.7 3.7 0 0 1 6.5-2.4l.3.4.3-.4a3.7 3.7 0 0 1 6.5 2.4c0 5.9-6.8 9.8-6.8 9.8Z"/>
      </svg>
    `;
  }

  function updatePerformanceButton() {
    const button = document.getElementById(PERFORMANCE_BUTTON_ID);
    if (!button) return;
    button.dataset.active = performanceModeEnabled ? "true" : "false";
    button.title = performanceModeEnabled
      ? "关闭画布性能模式"
      : "开启画布性能模式：隐藏非选中连线和离屏节点";
    button.setAttribute(
      "aria-label",
      performanceModeEnabled ? "关闭画布性能模式" : "开启画布性能模式"
    );
  }

  function setPerformanceModeEnabled(enabled, options = {}) {
    performanceModeEnabled = Boolean(enabled);
    document.documentElement.classList.toggle(
      "pixmax-canvas-cloner-performance-mode",
      performanceModeEnabled
    );
    updatePerformanceButton();
    if (performanceModeEnabled) {
      startPerformanceMode();
      schedulePerformanceUpdate(0);
    } else {
      stopPerformanceMode();
      clearPerformanceModeMarks();
    }
    if (options.persist) {
      storageSet({ [PERFORMANCE_MODE_STORAGE_KEY]: performanceModeEnabled }).catch(() => {});
    }
    if (options.toast) {
      showToast(performanceModeEnabled ? "画布性能模式已开启。" : "画布性能模式已关闭。");
    }
  }

  async function loadPerformanceModeSetting() {
    try {
      const result = await storageGet({ [PERFORMANCE_MODE_STORAGE_KEY]: false });
      setPerformanceModeEnabled(Boolean(result[PERFORMANCE_MODE_STORAGE_KEY]), { persist: false });
    } catch {
      updatePerformanceButton();
    }
  }

  function startPerformanceMode() {
    if (performanceRefreshInterval) return;
    performanceNodeRects = new WeakMap();
    markPerformanceCacheDirty();
    performanceLastSignature = "";
    performanceLastEdgeSignature = "";
    clearPerformanceModeMarks();
    updatePerformanceMode();
    performanceRefreshInterval = window.setInterval(() => {
      updatePerformanceMode();
    }, 100);
  }

  function stopPerformanceMode() {
    performanceNodeRects = new WeakMap();
    performanceNodesCache = [];
    performanceEdgesCache = [];
    performanceEdgeEndpoints = new WeakMap();
    performanceCacheDirty = true;
    performanceSelectedNodeIds = new Set();
    performanceLastSignature = "";
    performanceLastEdgeSignature = "";
    window.clearInterval(performanceRefreshInterval);
    window.clearTimeout(performanceUpdateTimer);
    window.clearTimeout(performanceInteractionTimer);
    performanceRefreshInterval = 0;
    performanceUpdateTimer = 0;
    performanceInteractionTimer = 0;
    performanceUpdateScheduled = false;
    performancePointerDownInFlow = false;
    setCanvasNodeDragState(false);
    setPerformanceMovingState(false);
    setPerformanceCompactState(false);
  }

  function clearPerformanceModeMarks() {
    for (const edge of document.querySelectorAll(".pixmax-canvas-cloner-perf-visible-edge")) {
      edge.classList.remove("pixmax-canvas-cloner-perf-visible-edge");
    }
    for (const media of document.querySelectorAll(
      ".pixmax-canvas-cloner-perf-offscreen-media, .pixmax-canvas-cloner-perf-onscreen-media"
    )) {
      media.classList.remove(
        "pixmax-canvas-cloner-perf-offscreen-media",
        "pixmax-canvas-cloner-perf-onscreen-media"
      );
    }
    for (const node of document.querySelectorAll(
      ".pixmax-canvas-cloner-perf-offscreen-node, .pixmax-canvas-cloner-perf-onscreen-node"
    )) {
      node.classList.remove(
        "pixmax-canvas-cloner-perf-offscreen-node",
        "pixmax-canvas-cloner-perf-onscreen-node"
      );
    }
  }

  function markPerformanceCacheDirty() {
    performanceCacheDirty = true;
    performanceLastSignature = "";
    performanceLastEdgeSignature = "";
  }

  function refreshPerformanceCaches() {
    if (!performanceCacheDirty) return;
    performanceNodesCache = [...document.querySelectorAll(NODE_SELECTOR)];
    performanceEdgesCache = [...document.querySelectorAll(".svelte-flow__edge[aria-label]")];
    performanceEdgeEndpoints = new WeakMap();
    performanceCacheDirty = false;
  }

  function schedulePerformanceUpdate(delay = 80) {
    if (!performanceModeEnabled) return;
    if (performanceUpdateScheduled) return;
    performanceUpdateScheduled = true;
    window.clearTimeout(performanceUpdateTimer);
    performanceUpdateTimer = window.setTimeout(() => {
      window.requestAnimationFrame(updatePerformanceMode);
    }, delay);
  }

  function markPerformanceInteraction(duration = 260) {
    if (!performanceModeEnabled) return;
    setPerformanceMovingState(true);
    schedulePerformanceUpdate(90);
    window.clearTimeout(performanceInteractionTimer);
    performanceInteractionTimer = window.setTimeout(() => {
      setPerformanceMovingState(false);
      performanceLastSignature = "";
      performanceLastEdgeSignature = "";
      schedulePerformanceUpdate(0);
    }, duration);
  }

  function setPerformanceMovingState(moving) {
    performanceCanvasIsMoving = Boolean(moving);
    document.documentElement.classList.toggle(
      "pixmax-canvas-cloner-performance-moving",
      performanceCanvasIsMoving
    );
  }

  function setCanvasNodeDragState(dragging) {
    canvasNodeDragActive = Boolean(dragging);
    document.documentElement.classList.toggle(
      "pixmax-canvas-cloner-node-dragging",
      canvasNodeDragActive
    );
  }

  function setPerformanceCompactState(compact) {
    document.documentElement.classList.toggle(
      "pixmax-canvas-cloner-performance-compact",
      Boolean(compact)
    );
  }

  function isPerformanceFlowEvent(event) {
    const target = event?.target;
    if (!(target instanceof Element)) return false;
    if (!target.closest(".svelte-flow")) return false;
    if (target.closest(`#${PERFORMANCE_BUTTON_ID}, #${OPEN_LIKES_BUTTON_ID}, .${ACTIONS_CLASS}, .${CONTEXT_PASTE_CLASS}, ${TOOLBAR_SELECTOR}`)) {
      return false;
    }
    return true;
  }

  function handlePerformancePointerDown(event) {
    const flowEvent = isPerformanceFlowEvent(event);
    if (flowEvent) cancelPendingOfficialWorkflowViewportPersist();
    const target = event?.target;
    setCanvasNodeDragState(Boolean(flowEvent && target instanceof Element && target.closest(NODE_SELECTOR)));
    performancePointerDownInFlow = Boolean(performanceModeEnabled && flowEvent);
    if (performancePointerDownInFlow) markPerformanceInteraction(360);
  }

  function handlePerformancePointerMove(event) {
    if (!performancePointerDownInFlow || !(event.buttons & 1)) return;
    markPerformanceInteraction(220);
  }

  function handlePerformancePointerUp() {
    const wasNodeDragActive = canvasNodeDragActive;
    setCanvasNodeDragState(false);
    performancePointerDownInFlow = false;
    if (performanceModeEnabled) {
      markPerformanceInteraction(180);
      if (wasNodeDragActive) {
        performanceLastEdgeSignature = "";
      }
      schedulePerformanceUpdate(0);
    }
    if (wasNodeDragActive && liveOptions?.enabled) {
      if (livePendingNodeIds.size || liveSyncQueued) scheduleLiveOfficialSync();
      scheduleLiveRevisionCheck("node-drag-end");
    }
  }

  function handlePerformanceWheel(event) {
    if (!isPerformanceFlowEvent(event)) return;
    cancelPendingOfficialWorkflowViewportPersist();
    markPerformanceInteraction(320);
  }

  function updatePerformanceMode() {
    performanceUpdateScheduled = false;
    if (!performanceModeEnabled) return;
    refreshPerformanceCaches();
    const viewport = getPerformanceViewport();
    setPerformanceCompactState(false);
    const selectedIds = new Set(getSelectedLiveNodeIds());
    const selectedSignature = [...selectedIds].join("|");
    const signature = [
      Math.round(viewport.x),
      Math.round(viewport.y),
      viewport.zoom.toFixed(3),
      selectedSignature,
      performanceNodesCache.length,
      performanceEdgesCache.length
    ].join("|");
    if (signature === performanceLastSignature) return;
    performanceLastSignature = signature;
    performanceSelectedNodeIds = selectedIds;
    const edgeSignature = `${selectedSignature}|${performanceEdgesCache.length}`;
    if (edgeSignature !== performanceLastEdgeSignature) {
      performanceLastEdgeSignature = edgeSignature;
      updatePerformanceEdges(selectedIds);
    }
    updatePerformanceNodes(viewport, selectedIds);
  }

  function updatePerformanceEdges(selectedIds = new Set(getSelectedLiveNodeIds())) {
    refreshPerformanceCaches();
    for (const edge of performanceEdgesCache) {
      const endpoints = getEdgeEndpoints(edge);
      const visible = Boolean(
        endpoints &&
          selectedIds.size &&
          (selectedIds.has(endpoints.source) || selectedIds.has(endpoints.target))
      );
      edge.classList.toggle("pixmax-canvas-cloner-perf-visible-edge", visible);
    }
  }

  function getEdgeEndpoints(edge) {
    const cached = performanceEdgeEndpoints.get(edge);
    if (cached) return cached;
    const label = String(edge.getAttribute("aria-label") || "");
    const match = label.match(/^Edge from\s+(.+?)\s+to\s+(.+)$/);
    if (!match) return null;
    const endpoints = {
      source: match[1].trim(),
      target: match[2].trim()
    };
    performanceEdgeEndpoints.set(edge, endpoints);
    return endpoints;
  }

  function updatePerformanceNodes(viewport, selectedIds) {
    refreshPerformanceCaches();
    for (const node of performanceNodesCache) {
      applyPerformanceNodeVisibility(node, true);
    }
  }

  function applyPerformanceNodeVisibility(node, visible) {
    const alreadyVisible = node.classList.contains("pixmax-canvas-cloner-perf-onscreen-node");
    if (alreadyVisible === visible && node.classList.contains("pixmax-canvas-cloner-perf-offscreen-node") !== visible) {
      return;
    }
    node.classList.toggle("pixmax-canvas-cloner-perf-offscreen-node", !visible);
    node.classList.toggle("pixmax-canvas-cloner-perf-onscreen-node", visible);
    for (const media of node.querySelectorAll("img, video, canvas")) {
      media.classList.toggle("pixmax-canvas-cloner-perf-offscreen-media", !visible);
      media.classList.toggle("pixmax-canvas-cloner-perf-onscreen-media", visible);
    }
  }

  function getPerformanceViewport() {
    const viewport = document.querySelector(".svelte-flow__viewport");
    return parseTransformToViewport(viewport?.style?.transform || getComputedStyle(viewport || document.body).transform);
  }

  function getPerformanceNodeRect(node, viewport) {
    const cached = performanceNodeRects.get(node);
    const transform = node.style?.transform || node.getAttribute("style") || "";
    const position = parseTransformPosition(transform) || cached || getVisibleNodeCanvasRect(node, viewport);
    const width = Number(cached?.width || node.style?.width?.replace("px", "") || node.offsetWidth || 360) || 360;
    const height = Number(cached?.height || node.style?.height?.replace("px", "") || node.offsetHeight || 280) || 280;
    const rect = {
      height,
      width,
      x: Number(position.x) || 0,
      y: Number(position.y) || 0
    };
    performanceNodeRects.set(node, rect);
    return rect;
  }

  function getVisibleNodeCanvasRect(node, viewport) {
    if (node.classList.contains("pixmax-canvas-cloner-perf-offscreen-node")) {
      return performanceNodeRects.get(node) || { x: 0, y: 0 };
    }
    const rect = node.getBoundingClientRect();
    return {
      x: (rect.left - viewport.x) / viewport.zoom,
      y: (rect.top - viewport.y) / viewport.zoom
    };
  }

  function parseTransformToViewport(transform) {
    const matrix = parseCssMatrix(transform);
    if (matrix) {
      return {
        x: matrix.e,
        y: matrix.f,
        zoom: matrix.a || 1
      };
    }
    const translated = parseTransformPosition(transform);
    const scale = String(transform || "").match(/scale\(\s*([-0-9.]+)\s*\)/);
    return {
      x: translated?.x || 0,
      y: translated?.y || 0,
      zoom: Number(scale?.[1]) || 1
    };
  }

  function parseTransformPosition(transform) {
    const text = String(transform || "");
    const matrix = parseCssMatrix(text);
    if (matrix) return { x: matrix.e, y: matrix.f };
    const translate = text.match(/translate(?:3d)?\(\s*([-0-9.]+)px(?:\s*,\s*|\s+)([-0-9.]+)px/i);
    if (translate) {
      return {
        x: Number(translate[1]) || 0,
        y: Number(translate[2]) || 0
      };
    }
    return null;
  }

  function parseCssMatrix(transform) {
    const match = String(transform || "").match(/matrix\(\s*([-0-9.eE]+),\s*([-0-9.eE]+),\s*([-0-9.eE]+),\s*([-0-9.eE]+),\s*([-0-9.eE]+),\s*([-0-9.eE]+)\s*\)/);
    if (!match) return null;
    return {
      a: Number(match[1]) || 1,
      d: Number(match[4]) || 1,
      e: Number(match[5]) || 0,
      f: Number(match[6]) || 0
    };
  }

  function escapeHtmlAttribute(value) {
    return String(value).replace(/[&<>"']/g, (char) => (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]
    ));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]
    ));
  }

  function getVideoHistoryCanvasKey() {
    return getCurrentFileUuid() || location.pathname;
  }

  function getVideoHistoryItemKey(item) {
    return String(item?.watchKey || item?.url || item?.nodeId || "").trim();
  }

  function normalizeVideoHistoryItem(item) {
    if (!item || typeof item !== "object") return null;
    const key = getVideoHistoryItemKey(item);
    const nodeId = String(item.nodeId || "").trim();
    const url = String(item.url || "").trim();
    if (!key || !nodeId || !url) return null;
    const timestamp = String(item.createdAt || item.discoveredAt || "").trim() || new Date().toISOString();
    const discoveredAt = String(item.discoveredAt || "").trim() || new Date().toISOString();
    return {
      assetUuid: String(item.assetUuid || "").trim(),
      createdAt: timestamp,
      discoveredAt,
      downloadCode: String(item.downloadCode || "").trim(),
      fileUuid: String(item.fileUuid || getCurrentFileUuid() || "").trim(),
      focusRect: item.focusRect && typeof item.focusRect === "object" ? item.focusRect : null,
      name: String(item.name || "视频生成节点").trim(),
      nodeId,
      poster: String(item.poster || "").trim(),
      prompt: String(item.prompt || "").trim(),
      url,
      watchKey: String(item.watchKey || key).trim()
    };
  }

  function sortVideoHistoryItems(items) {
    return [...items].sort((first, second) => {
      const firstTime = Date.parse(first.createdAt || first.discoveredAt || "") || 0;
      const secondTime = Date.parse(second.createdAt || second.discoveredAt || "") || 0;
      if (firstTime !== secondTime) return firstTime - secondTime;
      return String(first.nodeId).localeCompare(String(second.nodeId));
    });
  }

  function mergeVideoHistoryItems(existingItems, incomingItems) {
    const merged = new Map();
    for (const item of [...existingItems, ...incomingItems]) {
      const normalized = normalizeVideoHistoryItem(item);
      if (!normalized) continue;
      const key = getVideoHistoryItemKey(normalized);
      const previous = merged.get(key);
      merged.set(key, {
        ...(previous || {}),
        ...normalized,
        discoveredAt: previous?.discoveredAt || normalized.discoveredAt
      });
    }
    return sortVideoHistoryItems([...merged.values()]);
  }

  async function readVideoHistoryStore() {
    const result = await storageGet({ [VIDEO_HISTORY_STORAGE_KEY]: {} });
    const store = result[VIDEO_HISTORY_STORAGE_KEY];
    return store && typeof store === "object" && !Array.isArray(store) ? store : {};
  }

  async function writeVideoHistoryStore(items) {
    const key = getVideoHistoryCanvasKey();
    if (!key) return;
    const store = await readVideoHistoryStore();
    store[key] = sortVideoHistoryItems(items).slice(-300);
    await storageSet({ [VIDEO_HISTORY_STORAGE_KEY]: store });
  }

  async function loadCachedVideoHistory() {
    const key = getVideoHistoryCanvasKey();
    const store = await readVideoHistoryStore();
    videoHistoryItems = sortVideoHistoryItems(
      Array.isArray(store[key]) ? store[key].map(normalizeVideoHistoryItem).filter(Boolean) : []
    );
  }

  function getVisibleVideoHistoryItems() {
    return videoHistoryItems.slice(-Math.max(VIDEO_HISTORY_PAGE_SIZE, videoHistoryVisibleCount));
  }

  function formatVideoHistoryTime(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString();
  }

  function findCanvasTabsContainer() {
    if (videoHistoryTabsContainer?.isConnected) return videoHistoryTabsContainer;
    const elements = [...document.querySelectorAll("button, [role='tab'], div, span")];
    const canvasTab = elements.find((element) => (
      element.id !== VIDEO_HISTORY_BUTTON_ID &&
      element.textContent?.trim() === "画布" &&
      isVisibleVideoHistoryTabCandidate(element)
    ));
    if (!canvasTab) return null;
    for (const container of [canvasTab.parentElement, canvasTab.parentElement?.parentElement].filter(Boolean)) {
      const children = [...container.children];
      if (
        isVisibleVideoHistoryTabContainer(container) &&
        children.some((child) => child.textContent?.trim() === "节点" && isVisibleVideoHistoryTabCandidate(child))
      ) {
        videoHistoryTabsContainer = container;
        return container;
      }
    }
    videoHistoryTabsContainer = null;
    return null;
  }

  function isVisibleVideoHistoryTabCandidate(element) {
    const rect = element?.getBoundingClientRect?.();
    const style = element ? getComputedStyle(element) : null;
    return Boolean(
      rect &&
      rect.width >= 20 &&
      rect.height >= 20 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      style?.display !== "none" &&
      style?.visibility !== "hidden"
    );
  }

  function isVisibleVideoHistoryTabContainer(container) {
    const rect = container?.getBoundingClientRect?.();
    const style = container ? getComputedStyle(container) : null;
    return Boolean(
      rect &&
      rect.width >= 80 &&
      rect.height >= 20 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      style?.display !== "none" &&
      style?.visibility !== "hidden"
    );
  }

  function ensureVideoHistoryEntry() {
    videoHistoryEntryScheduled = false;
    let button = document.getElementById(VIDEO_HISTORY_BUTTON_ID);
    const container = findCanvasTabsContainer();
    if (!container) {
      if (button?.parentElement) button.remove();
      ensureVideoHistoryPanel();
      return;
    }
    if (!button) {
      const nodeTab = [...container.children].find((child) => child.textContent?.trim() === "节点");
      button = nodeTab ? nodeTab.cloneNode(false) : document.createElement("button");
      button.id = VIDEO_HISTORY_BUTTON_ID;
      button.type = "button";
      button.textContent = "视频";
      button.title = "打开视频节点";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleVideoHistoryPanel(true);
      });
    }
    const nodeTab = [...container.children].find((child) => child.textContent?.trim() === "节点");
    syncVideoHistoryTabButton(button, nodeTab);
    button.dataset.active = videoHistoryOpen ? "true" : "false";
    bindVideoHistoryTabContainer(container);
    markVideoHistoryNativeTabs(container);
    if (button.parentElement !== container) {
      nodeTab?.after(button);
      button.classList.remove("pixmax-canvas-cloner-video-history-floating");
    }
    ensureVideoHistoryPanel();
  }

  function syncVideoHistoryTabButton(button, sourceTab) {
    if (!button || !sourceTab) return;
    button.className = sourceTab.className || "";
    for (const attr of ["role", "tabindex", "aria-selected"]) {
      if (sourceTab.hasAttribute(attr)) {
        button.setAttribute(attr, attr === "aria-selected" ? String(videoHistoryOpen) : sourceTab.getAttribute(attr));
      } else {
        button.removeAttribute(attr);
      }
    }
  }

  function scheduleVideoHistoryEntrySync(delay = 300) {
    if (videoHistoryEntryScheduled) return;
    videoHistoryEntryScheduled = true;
    window.setTimeout(ensureVideoHistoryEntry, delay);
  }

  function bindVideoHistoryTabContainer(container) {
    if (!container || container.__pixmaxCanvasClonerVideoHistoryTabsBound) return;
    container.__pixmaxCanvasClonerVideoHistoryTabsBound = true;
    container.addEventListener("click", (event) => {
      const tab = event.target?.closest?.("button, [role='tab'], div, span");
      if (!tab || tab.id === VIDEO_HISTORY_BUTTON_ID || tab.closest?.(`#${VIDEO_HISTORY_BUTTON_ID}`)) return;
      const label = tab.textContent?.trim();
      if (label === "画布" || label === "节点") toggleVideoHistoryPanel(false);
    });
  }

  function markVideoHistoryNativeTabs(container) {
    for (const child of container.children) {
      const label = child.textContent?.trim();
      if (label === "画布" || label === "节点") {
        child.dataset.pixmaxVideoHistoryNativeTab = "true";
      }
    }
  }

  function updateVideoHistoryNativeTabIndicators(open = videoHistoryOpen) {
    restoreVideoHistoryNativeTabIndicators();
    if (!open) return;
    const container = findCanvasTabsContainer();
    const host = container?.parentElement;
    if (!container || !host) return;
    const tabRowRect = container.getBoundingClientRect();
    const nativeRects = [...container.querySelectorAll("[data-pixmax-video-history-native-tab='true']")]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!nativeRects.length) return;
    for (const element of host.querySelectorAll("*")) {
      if (element.id === VIDEO_HISTORY_BUTTON_ID || element.closest?.(`#${VIDEO_HISTORY_BUTTON_ID}, #${VIDEO_HISTORY_PANEL_ID}`)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 16 || rect.width > 140 || rect.height < 2 || rect.height > 10) continue;
      if (Math.abs(rect.bottom - tabRowRect.bottom) > 14 && Math.abs(rect.top - tabRowRect.bottom) > 14) continue;
      if (!nativeRects.some((nativeRect) => rect.left < nativeRect.right && rect.right > nativeRect.left)) continue;
      const style = getComputedStyle(element);
      if (!isVideoHistoryTabIndicatorStyle(style)) continue;
      element.dataset.pixmaxVideoHistoryNativeIndicator = "true";
      element.dataset.pixmaxVideoHistoryIndicatorOpacity = element.style.opacity || "";
      element.dataset.pixmaxVideoHistoryIndicatorVisibility = element.style.visibility || "";
      element.style.opacity = "0";
      element.style.visibility = "hidden";
    }
  }

  function restoreVideoHistoryNativeTabIndicators() {
    for (const element of document.querySelectorAll("[data-pixmax-video-history-native-indicator='true']")) {
      element.style.opacity = element.dataset.pixmaxVideoHistoryIndicatorOpacity || "";
      element.style.visibility = element.dataset.pixmaxVideoHistoryIndicatorVisibility || "";
      delete element.dataset.pixmaxVideoHistoryNativeIndicator;
      delete element.dataset.pixmaxVideoHistoryIndicatorOpacity;
      delete element.dataset.pixmaxVideoHistoryIndicatorVisibility;
    }
  }

  function isVideoHistoryTabIndicatorStyle(style) {
    const colors = [
      style.backgroundColor,
      style.borderColor,
      style.borderBottomColor,
      style.boxShadow
    ].join(" ");
    if (/75,\s*233,\s*244|117,\s*233,\s*244|#75e9f4/i.test(colors)) return true;
    return /rgb\(\s*(6\d|7\d|8\d|9\d|1[01]\d|12\d)\s*,\s*(19\d|2[0-5]\d)\s*,\s*(19\d|2[0-5]\d)\s*\)/i.test(colors);
  }

  function ensureVideoHistoryPanel() {
    let panel = videoHistoryPanelElement || document.getElementById(VIDEO_HISTORY_PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = VIDEO_HISTORY_PANEL_ID;
      panel.innerHTML = `<div class="pixmax-canvas-cloner-video-history-list"></div>`;
      panel.addEventListener("click", handleVideoHistoryPanelClick);
      panel.querySelector(".pixmax-canvas-cloner-video-history-list")?.addEventListener("scroll", handleVideoHistoryScroll);
    }
    videoHistoryPanelElement = panel;
    mountVideoHistoryPanel(panel);
    return panel;
  }

  function mountVideoHistoryPanel(panel) {
    const container = findCanvasTabsContainer();
    if (container?.isConnected) {
      const shell = videoHistoryPanelShell?.isConnected && videoHistoryPanelShell.contains(container)
        ? videoHistoryPanelShell
        : findVideoHistoryPanelShell(container, container.getBoundingClientRect());
      if (shell?.isConnected) {
        videoHistoryPanelShell = shell;
        prepareVideoHistoryPanelShell(shell);
        if (panel.parentElement !== shell) shell.appendChild(panel);
        panel.dataset.embedded = "true";
        observeVideoHistoryLayout(container, shell);
        if (videoHistoryOpen) scheduleVideoHistoryPanelPositioning();
      } else {
        panel.dataset.embedded = "false";
      }
      return;
    }
    panel.dataset.embedded = "false";
  }

  function toggleVideoHistoryPanel(forceOpen = null) {
    const nextOpen = forceOpen == null ? !videoHistoryOpen : Boolean(forceOpen);
    videoHistoryOpen = nextOpen;
    const panel = ensureVideoHistoryPanel();
    scheduleVideoHistoryPanelPositioning();
    panel.dataset.open = videoHistoryOpen ? "true" : "false";
    document.documentElement.classList.toggle("pixmax-canvas-cloner-video-history-open", videoHistoryOpen);
    document.getElementById(VIDEO_HISTORY_BUTTON_ID)?.setAttribute("data-active", videoHistoryOpen ? "true" : "false");
    updateVideoHistoryNativeTabIndicators(videoHistoryOpen);
    updateVideoHistoryEmbeddedContentVisibility();
    if (videoHistoryOpen) {
      videoHistoryVisibleCount = VIDEO_HISTORY_PAGE_SIZE;
      renderVideoHistoryPanel({ stickToBottom: true });
      refreshVideoHistory({ stickToBottom: true });
    } else {
      suspendVideoHistoryMedia(true);
    }
  }

  function renderVideoHistoryPanel(options = {}) {
    const panel = ensureVideoHistoryPanel();
    scheduleVideoHistoryPanelPositioning();
    updateVideoHistoryEmbeddedContentVisibility();
    const list = panel.querySelector(".pixmax-canvas-cloner-video-history-list");
    if (!list) return;
    const visibleItems = getVisibleVideoHistoryItems();
    const nextRenderKey = buildVideoHistoryRenderKey(visibleItems);
    if (!visibleItems.length) {
      if (videoHistoryRenderedKey !== nextRenderKey) {
        list.innerHTML = `<div class="pixmax-canvas-cloner-video-history-empty">${videoHistoryLoading ? "正在读取视频节点..." : "这个画布还没有记录到视频节点。"}</div>`;
        videoHistoryRenderedKey = nextRenderKey;
      }
      return;
    }
    if (videoHistoryRenderedKey !== nextRenderKey || !list.querySelector(".pixmax-canvas-cloner-video-history-card")) {
      suspendVideoHistoryMedia(true);
      videoHistoryMediaObserver?.disconnect();
      list.innerHTML = visibleItems.map(renderVideoHistoryCard).join("");
      videoHistoryRenderedKey = nextRenderKey;
      hydrateVideoHistoryCards(list);
    } else {
      updateVideoHistoryUnreadMarks();
      updateVideoHistoryLikeMarks();
    }
    if (options.stickToBottom) {
      window.requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    }
  }

  function buildVideoHistoryRenderKey(items) {
    if (!items.length) return `empty:${videoHistoryLoading ? "loading" : "ready"}`;
    return items
      .map((item) => [
        getVideoHistoryItemKey(item),
        item.url,
        item.poster,
        item.createdAt || item.discoveredAt,
        item.nodeId
      ].map((value) => String(value || "").replace(/[|\\]/g, "\\$&")).join("|"))
      .join("\\n");
  }

  function renderVideoHistoryCard(item) {
    const key = getVideoHistoryItemKey(item);
    const unwatched = Boolean(item.watchKey && unreadVideoKeys.has(item.watchKey));
    const liked = ownLikedKeys.has(item.nodeId);
    const color = likedColors.get(item.nodeId) || DEFAULT_LIKE_COLOR;
    return `
      <article class="pixmax-canvas-cloner-video-history-card" data-key="${escapeHtmlAttribute(key)}" data-watch-key="${escapeHtmlAttribute(item.watchKey)}" data-node-id="${escapeHtmlAttribute(item.nodeId)}" data-unwatched="${unwatched ? "true" : "false"}">
        <video data-src="${escapeHtmlAttribute(item.url)}" data-poster="${escapeHtmlAttribute(item.poster)}" controls playsinline preload="none"></video>
        <div class="pixmax-canvas-cloner-video-history-meta">
          <div class="pixmax-canvas-cloner-video-history-time">${escapeHtml(formatVideoHistoryTime(item.createdAt || item.discoveredAt))}</div>
        </div>
        <div class="pixmax-canvas-cloner-video-history-card-actions">
          <button type="button" class="pixmax-canvas-cloner-video-history-like" data-video-history-action="like" data-liked="${liked ? "true" : "false"}" style="--pixmax-cloner-like-color: ${escapeHtmlAttribute(color)}" aria-label="收藏">${liked ? "♥" : "♡"}</button>
          <button type="button" data-video-history-action="focus">定位到画布</button>
          <button type="button" data-video-history-action="eagle">存入 Eagle</button>
        </div>
      </article>
    `;
  }

  function positionVideoHistoryPanel() {
    const panel = document.getElementById(VIDEO_HISTORY_PANEL_ID);
    if (!panel) return;
    if (panel.dataset.embedded === "true") {
      const container = videoHistoryTabsContainer?.isConnected
        ? videoHistoryTabsContainer
        : findCanvasTabsContainer();
      const tabRect = container?.getBoundingClientRect?.();
      const shell = panel.parentElement !== document.body
        ? panel.parentElement
        : (videoHistoryPanelShell?.isConnected ? videoHistoryPanelShell : findVideoHistoryPanelShell(container, tabRect));
      const shellRect = shell?.getBoundingClientRect?.();
      if (!tabRect || !shellRect) return;
      const top = Math.max(0, Math.round(tabRect.bottom - shellRect.top));
      panel.style.setProperty("--pixmax-video-history-shell-top", `${top}px`);
      panel.style.removeProperty("height");
      return;
    }
    panel.style.removeProperty("height");
    panel.style.removeProperty("--pixmax-video-history-shell-top");
  }

  function scheduleVideoHistoryPanelPositioning() {
    if (!videoHistoryOpen || videoHistoryPositionScheduled) return;
    videoHistoryPositionScheduled = true;
    window.requestAnimationFrame(() => {
      videoHistoryPositionScheduled = false;
      positionVideoHistoryPanel();
    });
  }

  function observeVideoHistoryLayout(container, shell) {
    if (typeof ResizeObserver !== "function") return;
    if (videoHistoryObservedContainer === container && videoHistoryObservedShell === shell) return;
    videoHistoryLayoutObserver?.disconnect();
    videoHistoryLayoutObserver ||= new ResizeObserver(() => scheduleVideoHistoryPanelPositioning());
    videoHistoryLayoutObserver.observe(container);
    if (shell !== container) videoHistoryLayoutObserver.observe(shell);
    videoHistoryObservedContainer = container;
    videoHistoryObservedShell = shell;
  }

  function findVideoHistoryPanelShell(container, tabRect) {
    if (!container || !tabRect) return null;
    let shell = container.parentElement;
    let best = shell;
    let bestScore = -Infinity;
    while (shell && shell !== document.body) {
      const rect = shell.getBoundingClientRect();
      const style = getComputedStyle(shell);
      if (
        rect.width >= 260 &&
        rect.height >= 320 &&
        rect.left <= tabRect.left + 32 &&
        rect.right >= tabRect.right - 24 &&
        rect.top <= tabRect.top + 24
      ) {
        let score = 0;
        if (hasVideoHistoryPanelCloseButton(shell, tabRect)) score += 12;
        if (shell.querySelector?.("input, textarea")) score += 2;
        if (style.borderRadius !== "0px") score += 4;
        if (style.overflow !== "visible") score += 2;
        if (style.position !== "static") score += 2;
        if (rect.left <= 40) score += 2;
        score -= Math.max(0, rect.width - 820) / 80;
        score -= Math.abs(rect.left - Math.max(0, tabRect.left - 34)) / 120;
        if (score > bestScore) {
          bestScore = score;
          best = shell;
        }
      }
      shell = shell.parentElement;
    }
    return bestScore > -Infinity ? best : null;
  }

  function prepareVideoHistoryPanelShell(shell) {
    if (!shell || shell.dataset.pixmaxVideoHistoryShell === "true") return;
    shell.dataset.pixmaxVideoHistoryShell = "true";
    const style = getComputedStyle(shell);
    if (style.position === "static") {
      shell.dataset.pixmaxVideoHistoryPosition = shell.style.position || "";
      shell.style.position = "relative";
    }
  }

  function hasVideoHistoryPanelCloseButton(shell, tabRect) {
    if (!shell || !tabRect) return false;
    return [...shell.querySelectorAll("button, [role='button'], div, span")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element,
          label: element.textContent?.trim() || element.getAttribute("aria-label") || "",
          rect
        };
      })
      .some(({ label, rect }) => (
        (label === "×" || label === "关闭" || label.toLowerCase() === "close") &&
        rect.width > 12 &&
        rect.height > 12 &&
        rect.top < tabRect.top &&
        rect.left > tabRect.right
      ));
  }

  function updateVideoHistoryEmbeddedContentVisibility() {
    restoreVideoHistoryHiddenSiblings();
  }

  function restoreVideoHistoryHiddenSiblings() {
    for (const element of document.querySelectorAll("[data-pixmax-video-history-hidden='true']")) {
      element.style.display = element.dataset.pixmaxVideoHistoryDisplay || "";
      delete element.dataset.pixmaxVideoHistoryHidden;
      delete element.dataset.pixmaxVideoHistoryDisplay;
    }
  }

  function hydrateVideoHistoryCards(root) {
    if (!videoHistoryMediaObserver && typeof IntersectionObserver === "function") {
      videoHistoryMediaObserver = new IntersectionObserver(handleVideoHistoryMediaVisibility, {
        root: root.closest(".pixmax-canvas-cloner-video-history-list"),
        rootMargin: "160px 0px",
        threshold: 0.01
      });
    }
    for (const video of root.querySelectorAll("video")) {
      if (!video.__pixmaxCanvasClonerVideoHistoryLazyBound) {
        video.__pixmaxCanvasClonerVideoHistoryLazyBound = true;
        video.addEventListener("pointerdown", () => loadVideoHistoryVideo(video), { passive: true });
        video.addEventListener("keydown", (event) => {
          if (event.key === " " || event.key === "Enter") loadVideoHistoryVideo(video);
        });
        video.addEventListener("play", () => {
          suspendOtherVideoHistoryMedia(video);
          loadVideoHistoryVideo(video);
          markVideoHistoryItemWatchedFromElement(video);
        });
      }
      if (videoHistoryMediaObserver) {
        videoHistoryMediaObserver.observe(video);
      } else {
        loadVideoHistoryPoster(video);
      }
    }
  }

  function handleVideoHistoryMediaVisibility(entries) {
    for (const entry of entries) {
      const video = entry.target;
      if (entry.isIntersecting && videoHistoryOpen) {
        loadVideoHistoryPoster(video);
      } else {
        releaseVideoHistoryVideo(video, true);
      }
    }
  }

  function loadVideoHistoryPoster(video) {
    const poster = video?.dataset.poster || "";
    if (poster && video.getAttribute("poster") !== poster) video.setAttribute("poster", poster);
  }

  function loadVideoHistoryVideo(video) {
    if (!video || video.src) return;
    const src = video.dataset.src || "";
    if (!src) return;
    loadVideoHistoryPoster(video);
    video.src = src;
    video.preload = "metadata";
    try {
      video.load();
    } catch {
      // Native controls can retry loading on the next user gesture.
    }
  }

  function suspendOtherVideoHistoryMedia(activeVideo) {
    const panel = videoHistoryPanelElement;
    if (!panel) return;
    for (const video of panel.querySelectorAll("video")) {
      if (video !== activeVideo) releaseVideoHistoryVideo(video, true);
    }
  }

  function suspendVideoHistoryMedia(clearPosters = false) {
    const panel = videoHistoryPanelElement;
    if (!panel) return;
    for (const video of panel.querySelectorAll("video")) {
      releaseVideoHistoryVideo(video, true, clearPosters);
    }
  }

  function releaseVideoHistoryVideo(video, releaseSource = true, clearPoster = false) {
    if (!video) return;
    try {
      video.pause();
    } catch {
      // The element may have been detached while the history list rerendered.
    }
    if (releaseSource && video.getAttribute("src")) {
      video.removeAttribute("src");
      video.preload = "none";
      try {
        video.load();
      } catch {
        // Releasing the decoder is a best-effort optimization.
      }
    }
    if (clearPoster) video.removeAttribute("poster");
  }

  function handleVideoHistoryPanelClick(event) {
    const action = event.target?.closest?.("[data-video-history-action]")?.dataset.videoHistoryAction;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const card = event.target.closest(".pixmax-canvas-cloner-video-history-card");
    const item = videoHistoryItems.find((candidate) => getVideoHistoryItemKey(candidate) === card?.dataset.key);
    if (!item) return;
    if (action === "focus") {
      focusVideoHistoryItem(item);
      return;
    }
    if (action === "eagle") {
      importNodeAssetToEagle(item.nodeId, event.target.closest("button"));
      return;
    }
    if (action === "like") {
      toggleNodeLike(item.nodeId, event.target.closest("button"));
    }
  }

  function handleVideoHistoryScroll(event) {
    const list = event.currentTarget;
    if (!list || list.scrollTop > 8 || videoHistoryVisibleCount >= videoHistoryItems.length) return;
    const oldScrollHeight = list.scrollHeight;
    videoHistoryVisibleCount = Math.min(videoHistoryItems.length, videoHistoryVisibleCount + VIDEO_HISTORY_PAGE_SIZE);
    renderVideoHistoryPanel();
    window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight - oldScrollHeight + 8;
    });
  }

  function updateVideoHistoryUnreadMarks() {
    for (const card of document.querySelectorAll(".pixmax-canvas-cloner-video-history-card")) {
      const watchKey = card.dataset.watchKey || "";
      card.dataset.unwatched = watchKey && unreadVideoKeys.has(watchKey) ? "true" : "false";
    }
  }

  function updateVideoHistoryLikeMarks() {
    for (const card of document.querySelectorAll(".pixmax-canvas-cloner-video-history-card")) {
      const nodeId = card.dataset.nodeId || "";
      const button = card.querySelector('[data-video-history-action="like"]');
      if (!button) continue;
      setLikeButtonState(button, ownLikedKeys.has(nodeId), likedColors.get(nodeId));
    }
  }

  function markVideoHistoryItemWatchedFromElement(video) {
    const card = video?.closest?.(".pixmax-canvas-cloner-video-history-card");
    const watchKey = card?.dataset.watchKey || "";
    if (watchKey) {
      markVideoWatched(watchKey);
      updateVideoHistoryUnreadMarks();
    }
  }

  async function focusVideoHistoryItem(item) {
    if (!item?.nodeId) return;
    const rect = normalizeVideoHistoryFocusRect(item.focusRect) || await readVideoHistoryFocusRect(item.nodeId);
    if (rect && await centerFlowRectInCurrentCanvas(rect, 1.15, false)) {
      highlightFocusedNode(item.nodeId);
      return;
    }
    focusNode(item.nodeId);
  }

  async function readVideoHistoryFocusRect(nodeId) {
    try {
      const item = await requestBridge("get-node-like-asset", { nodeId }, 10000);
      return normalizeVideoHistoryFocusRect(item?.focusRect);
    } catch {
      return null;
    }
  }

  function normalizeVideoHistoryFocusRect(value) {
    if (!value || typeof value !== "object") return null;
    const rect = {
      height: Number(value.height),
      width: Number(value.width),
      x: Number(value.x),
      y: Number(value.y)
    };
    return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
      rect.width > 0 &&
      rect.height > 0
      ? rect
      : null;
  }

  async function centerFlowRectInCurrentCanvas(rect, targetScale = 1.15, smooth = true) {
    const viewport = document.querySelector(".svelte-flow__viewport");
    const pane = document.querySelector(".svelte-flow__pane") || document.querySelector(".svelte-flow");
    if (!viewport || !pane) return false;
    const paneRect = pane.getBoundingClientRect();
    if (!paneRect.width || !paneRect.height) return false;
    const current = getPerformanceViewport();
    const zoom = Math.min(Math.max(Number(targetScale) || current.zoom || 1, 0.7), 1.6);
    const nextX = paneRect.width / 2 - (rect.x + rect.width / 2) * zoom;
    const nextY = paneRect.height / 2 - (rect.y + rect.height / 2) * zoom;
    if (smooth) {
      viewport.classList.add("pixmax-canvas-cloner-moving");
      window.setTimeout(() => viewport.classList.remove("pixmax-canvas-cloner-moving"), 320);
    }
    viewport.style.transformOrigin = "0 0";
    viewport.style.transform = `translate(${nextX}px, ${nextY}px) scale(${zoom})`;
    const nextViewport = { x: nextX, y: nextY, zoom };
    scheduleOfficialWorkflowViewportPersist(nextViewport, {
      x: current.x,
      y: current.y,
      zoom: current.zoom
    });
    let bridgeApplied = false;
    try {
      const result = await requestBridge("set-flow-viewport", { rect, viewport: nextViewport }, 1600);
      bridgeApplied = Boolean(result?.applied);
    } catch {
      // DOM transform below is still a useful fallback when the page internals are not captured.
    }
    if (bridgeApplied) {
      window.setTimeout(() => scheduleOfficialWorkflowViewportPersist(nextViewport, nextViewport), 60);
    }
    window.dispatchEvent(new Event("resize"));
    return true;
  }

  function highlightFocusedNode(nodeId) {
    if (!nodeId) return;
    window.setTimeout(() => {
      const node = document.querySelector(`${NODE_SELECTOR}[data-id="${CSS.escape(nodeId)}"]`);
      if (!node) return;
      node.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
      node.classList.add("pixmax-canvas-cloner-focus");
      window.setTimeout(() => node.classList.remove("pixmax-canvas-cloner-focus"), 2600);
      showToast("已定位到视频节点。");
    }, 250);
  }

  async function refreshVideoHistory(options = {}) {
    if (videoHistoryLoading && !options.force) return;
    videoHistoryLoading = true;
    if (videoHistoryOpen) renderVideoHistoryPanel(options);
    try {
      const previousKeys = new Set(videoHistoryItems.map(getVideoHistoryItemKey).filter(Boolean));
      await loadCachedVideoHistory();
      if (videoHistoryOpen) renderVideoHistoryPanel(options);
      for (const item of videoHistoryItems) {
        previousKeys.add(getVideoHistoryItemKey(item));
      }
      const result = await requestBridge("get-canvas-video-history", {}, 10000);
      const incoming = Array.isArray(result?.items) ? result.items : [];
      videoHistoryItems = mergeVideoHistoryItems(videoHistoryItems, incoming);
      const newItems = videoHistoryItems.filter((item) => !previousKeys.has(getVideoHistoryItemKey(item)));
      await writeVideoHistoryStore(videoHistoryItems);
      if (videoHistoryHasLoadedOnce && newItems.length) {
        showToast(newItems.length === 1 ? "视频生成完成，已加入视频列表。" : `${newItems.length} 个视频生成完成，已加入视频列表。`);
        if (videoHistoryOpen) {
          videoHistoryVisibleCount = Math.max(videoHistoryVisibleCount, VIDEO_HISTORY_PAGE_SIZE);
          options.stickToBottom = true;
        }
      }
      videoHistoryHasLoadedOnce = true;
    } catch (error) {
      if (videoHistoryOpen) showToast(error.message || "读取历史视频节点失败。", true);
    } finally {
      videoHistoryLoading = false;
      if (videoHistoryOpen) renderVideoHistoryPanel(options);
    }
  }

  function scheduleVideoHistoryRefresh(delay = 1200) {
    window.clearTimeout(videoHistoryRefreshTimer);
    videoHistoryRefreshTimer = window.setTimeout(() => {
      refreshVideoHistory();
    }, delay);
  }

  function findCopyShareButton() {
    const candidates = getTopActionCandidates();
    const exact = candidates.find((candidate) => {
      const label = getElementLabel(candidate).replace(/\s+/g, "");
      return label.includes("复制分享链接") || (label.includes("复制") && label.includes("分享"));
    });
    if (exact) return exact;

    const squareButtons = candidates
      .filter((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const label = getElementLabel(candidate).trim();
        const isSingleLetterAvatar = /^[A-Za-z]$/.test(label);
        return (
          !isSingleLetterAvatar &&
          rect.width >= 40 &&
          rect.width <= 86 &&
          rect.height >= 40 &&
          rect.height <= 86
        );
      })
      .sort((first, second) => first.getBoundingClientRect().left - second.getBoundingClientRect().left);
    return squareButtons[1] || squareButtons[0] || null;
  }

  function getTopActionCandidates() {
    return [...document.querySelectorAll("button, [role='button'], a")]
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (
          element.id === OPEN_LIKES_BUTTON_ID ||
          element.id === PERFORMANCE_BUTTON_ID ||
          element.closest(`#${OPEN_LIKES_BUTTON_ID}, #${PERFORMANCE_BUTTON_ID}`)
        ) {
          return false;
        }
        if (element.closest(`.${ACTIONS_CLASS}, .${CONTEXT_PASTE_CLASS}, ${TOOLBAR_SELECTOR}`)) return false;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        if (rect.top < 0 || rect.top > 160) return false;
        if (rect.left < 120) return false;
        return true;
      });
  }

  function getElementLabel(element) {
    return [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-tooltip"),
      element.getAttribute("data-title"),
      element.textContent
    ]
      .filter(Boolean)
      .join(" ");
  }

  function cleanupLegacyCanvasUi() {
    document.getElementById("pixmax-canvas-cloner-page-toolbar")?.remove();
    for (const element of document.querySelectorAll(
      ".pixmax-canvas-cloner-node-eagle, .pixmax-canvas-cloner-node-prompt"
    )) {
      element.remove();
    }
    for (const node of document.querySelectorAll(".pixmax-canvas-cloner-media-node")) {
      node.classList.remove("pixmax-canvas-cloner-media-node");
    }
    for (const button of document.querySelectorAll(
      '[data-pixmax-cloner-action="eagle-import-batch"]'
    )) {
      button.remove();
    }
  }

  function scheduleLegacyCleanup() {
    if (legacyCleanupScheduled) return;
    legacyCleanupScheduled = true;
    window.requestAnimationFrame(() => {
      legacyCleanupScheduled = false;
      cleanupLegacyCanvasUi();
    });
  }

  function showToast(message, error = false, options = {}) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.toggle("persistent", Boolean(options.persistent));
    window.clearTimeout(toastTimer);
    if (!options.persistent) {
      toastTimer = window.setTimeout(() => toast.remove(), options.duration || 3500);
    }
  }

  async function runAction(action, button) {
    const buttons = [
      ...button.closest(`.${ACTIONS_CLASS}`).querySelectorAll("button")
    ];
    for (const item of buttons) item.disabled = true;

    try {
      const result = await requestBridge(
        action,
        {},
        action === "duplicate-neighbors" ? 15000 : 10000
      );

      if (action === "select-neighbors") {
        showToast(
          `已选中主节点和 ${result.directlyLinkedNodeCount} 个直接连线节点，共 ${result.selectedNodeCount} 个。`
        );
      }

      if (action === "duplicate-neighbors") {
        showToast(
          `已创建带连线副本，并修复 ${result.rewrittenMentionCount} 个 @节点 引用。`
        );
      }
    } catch (error) {
      showToast(error.message, true);
    } finally {
      for (const item of buttons) item.disabled = false;
    }
  }

  async function importSelectedAssetToEagle(button) {
    button.disabled = true;
    try {
      const item = await requestBridge("get-selected-eagle-asset");
      await importAssetToEagle(item);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function importNodeAssetToEagle(nodeId, button) {
    if (button) button.disabled = true;
    try {
      const item = await requestBridge("get-node-eagle-asset", { nodeId });
      await importAssetToEagle(item);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function importAssetToEagle(item) {
    showToast("正在将素材存入 Eagle...");
    const response = await requestExtension("eagle-import-url", { item });
    if (!response?.ok) throw new Error(response?.error || "Eagle 导入失败。");
    showToast(`已存入 Eagle：${response.name}`);
  }

  function getStorageArea() {
    return globalThis.chrome?.storage?.local ?? null;
  }

  function getSyncStorageArea() {
    return globalThis.chrome?.storage?.sync ?? null;
  }

  function storageGet(defaults) {
    return new Promise((resolve, reject) => {
      const storage = getStorageArea();
      if (!storage) {
        reject(new Error("Extension storage is unavailable. Refresh Pixmax and try again."));
        return;
      }

      storage.get(defaults, (result) => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else resolve(result);
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      const storage = getStorageArea();
      if (!storage) {
        reject(new Error("Extension storage is unavailable. Refresh Pixmax and try again."));
        return;
      }

      storage.set(values, () => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else resolve();
      });
    });
  }

  function syncStorageGet(defaults) {
    return new Promise((resolve, reject) => {
      const storage = getSyncStorageArea();
      if (!storage) {
        reject(new Error("Extension sync storage is unavailable. Refresh Pixmax and try again."));
        return;
      }

      storage.get(defaults, (result) => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else resolve(result);
      });
    });
  }

  function syncStorageSet(values) {
    return new Promise((resolve, reject) => {
      const storage = getSyncStorageArea();
      if (!storage) {
        reject(new Error("Extension sync storage is unavailable. Refresh Pixmax and try again."));
        return;
      }

      storage.set(values, () => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else resolve();
      });
    });
  }

  async function getSharedLikeOptions() {
    const options = await syncStorageGet(SHARED_OPTIONS_DEFAULTS);
    const fileUuid = String(options.sharedLikesFileUuid || "").trim();
    const ownerName = String(options.sharedLikesOwnerName || "").trim();
    return {
      color: normalizeColor(options.sharedLikesColor),
      enabled: Boolean(options.sharedLikesEnabled && fileUuid && ownerName),
      fileUuid,
      ownerName,
      sourceFileUuid: getCurrentFileUuid()
    };
  }

  function normalizeWatchedVideoKeys(value) {
    return [
      ...new Set(
        (Array.isArray(value) ? value : [])
          .map((key) => String(key || "").trim())
          .filter(Boolean)
      )
    ];
  }

  function normalizeWatchedVideoCanvasBaselines(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, timestamp]) => [String(key || "").trim(), String(timestamp || "").trim()])
        .filter(([key, timestamp]) => key && timestamp)
    );
  }

  function extractVideoWatchKeyFromUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    const resMatch = url.match(/RES-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (resMatch) return `res:${resMatch[0].toLowerCase()}`;
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      parsed.search = "";
      return `url:${parsed.href}`;
    } catch {
      return `url:${url.split(/[?#]/, 1)[0]}`;
    }
  }

  function getElementVideoWatchKey(video) {
    if (!video) return "";
    const directUrl = video.currentSrc || video.src || video.getAttribute?.("src") || "";
    const key = extractVideoWatchKeyFromUrl(directUrl);
    if (key) return key;
    for (const source of video.querySelectorAll?.("source") ?? []) {
      const sourceKey = extractVideoWatchKeyFromUrl(source.currentSrc || source.src || source.getAttribute("src"));
      if (sourceKey) return sourceKey;
    }
    return "";
  }

  function getNodeVideoWatchKey(node) {
    if (!node) return "";
    for (const video of node.querySelectorAll?.("video") ?? []) {
      const key = getElementVideoWatchKey(video);
      if (key) return key;
    }
    return "";
  }

  function applyNodeUnwatchedVideoState(node) {
    if (!node) return;
    const watchKey = getNodeVideoWatchKey(node);
    if (videoWatchStateReady && watchKey && !knownVideoKeys.has(watchKey)) {
      markVideoDiscovered(watchKey);
    }
    const unwatched = Boolean(watchKey && unreadVideoKeys.has(watchKey));
    node.classList.toggle("pixmax-canvas-cloner-unwatched-video", unwatched);
    if (unwatched) node.dataset.pixmaxClonerWatchKey = watchKey;
    else delete node.dataset.pixmaxClonerWatchKey;
  }

  function applyVisibleUnwatchedVideoMarks() {
    for (const node of document.querySelectorAll(NODE_SELECTOR)) {
      applyNodeUnwatchedVideoState(node);
    }
  }

  function getVisibleVideoWatchKeys() {
    return [
      ...new Set(
        [...document.querySelectorAll(NODE_SELECTOR)]
          .map(getNodeVideoWatchKey)
          .filter(Boolean)
      )
    ];
  }

  function applyUnwatchedVideoMarksInRoot(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    if (root.matches?.(NODE_SELECTOR)) applyNodeUnwatchedVideoState(root);
    for (const node of root.querySelectorAll?.(NODE_SELECTOR) ?? []) {
      applyNodeUnwatchedVideoState(node);
    }
    const parentNode = root.closest?.(NODE_SELECTOR);
    if (parentNode) applyNodeUnwatchedVideoState(parentNode);
  }

  async function refreshWatchedVideoState() {
    videoWatchStateReady = false;
    try {
      watchedVideoOptions = await getSharedLikeOptions();
      if (watchedVideoOptions.enabled) {
        const result = await requestBridge("get-watched-video-state", watchedVideoOptions, 8000);
        watchedVideoKeys = new Set(normalizeWatchedVideoKeys(result?.watchedVideoKeys));
        knownVideoKeys = new Set(normalizeWatchedVideoKeys(result?.knownVideoKeys));
        unreadVideoKeys = new Set(normalizeWatchedVideoKeys(result?.unreadVideoKeys));
      } else {
        const result = await storageGet({
          [WATCHED_VIDEO_STORAGE_KEY]: [],
          pixmaxKnownVideoKeys: [],
          pixmaxUnreadVideoKeys: [],
          [WATCHED_VIDEO_CANVAS_BASELINES_KEY]: {},
          [KNOWN_VIDEO_CANVAS_MODEL_KEY]: ""
        });
        const baselines = normalizeWatchedVideoCanvasBaselines(result[WATCHED_VIDEO_CANVAS_BASELINES_KEY]);
        const hasKnownModel = Boolean(result[KNOWN_VIDEO_CANVAS_MODEL_KEY]);
        const canvasKey = getCurrentFileUuid() || location.pathname;
        const nextWatchedKeys = new Set(normalizeWatchedVideoKeys(result[WATCHED_VIDEO_STORAGE_KEY]));
        const nextKnownKeys = new Set(normalizeWatchedVideoKeys(result.pixmaxKnownVideoKeys));
        const nextUnreadKeys = new Set(normalizeWatchedVideoKeys(result.pixmaxUnreadVideoKeys));
        if (!hasKnownModel || (canvasKey && !baselines[canvasKey])) {
          if (!hasKnownModel) nextUnreadKeys.clear();
          for (const key of getVisibleVideoWatchKeys()) nextKnownKeys.add(key);
          if (canvasKey) baselines[canvasKey] = new Date().toISOString();
          storageSet({
            [KNOWN_VIDEO_CANVAS_MODEL_KEY]: result[KNOWN_VIDEO_CANVAS_MODEL_KEY] || new Date().toISOString(),
            pixmaxKnownVideoKeys: [...nextKnownKeys],
            [WATCHED_VIDEO_CANVAS_BASELINES_KEY]: baselines
          }).catch(() => {});
        } else {
          for (const key of getVisibleVideoWatchKeys()) {
            if (nextKnownKeys.has(key)) continue;
            nextKnownKeys.add(key);
            if (!nextWatchedKeys.has(key)) nextUnreadKeys.add(key);
          }
          storageSet({
            pixmaxKnownVideoKeys: [...nextKnownKeys],
            pixmaxUnreadVideoKeys: [...nextUnreadKeys]
          }).catch(() => {});
        }
        watchedVideoKeys = nextWatchedKeys;
        knownVideoKeys = nextKnownKeys;
        unreadVideoKeys = nextUnreadKeys;
      }
      videoWatchStateReady = true;
      applyVisibleUnwatchedVideoMarks();
    } catch {
      videoWatchStateReady = true;
      applyVisibleUnwatchedVideoMarks();
    }
  }

  function markVideoWatched(watchKey) {
    if (!watchKey) return;
    if (watchedVideoKeys.has(watchKey) && !unreadVideoKeys.has(watchKey)) return;
    watchedVideoKeys.add(watchKey);
    knownVideoKeys.add(watchKey);
    unreadVideoKeys.delete(watchKey);
    applyVisibleUnwatchedVideoMarks();
    if (watchedVideoOptions?.enabled) {
      requestBridge("mark-video-watched", { ...watchedVideoOptions, watchKey }, 8000)
        .then((result) => {
          if (result?.watchedVideoKeys) {
            watchedVideoKeys = new Set(normalizeWatchedVideoKeys(result.watchedVideoKeys));
            knownVideoKeys = new Set(normalizeWatchedVideoKeys(result.knownVideoKeys));
            unreadVideoKeys = new Set(normalizeWatchedVideoKeys(result.unreadVideoKeys));
            applyVisibleUnwatchedVideoMarks();
          }
        })
        .catch(() => {});
      return;
    }
    storageSet({
      [KNOWN_VIDEO_CANVAS_MODEL_KEY]: new Date().toISOString(),
      [WATCHED_VIDEO_STORAGE_KEY]: [...watchedVideoKeys],
      pixmaxKnownVideoKeys: [...knownVideoKeys],
      pixmaxUnreadVideoKeys: [...unreadVideoKeys]
    }).catch(() => {});
  }

  function markVideoDiscovered(watchKey) {
    if (!watchKey || knownVideoKeys.has(watchKey)) return;
    knownVideoKeys.add(watchKey);
    if (!watchedVideoKeys.has(watchKey)) unreadVideoKeys.add(watchKey);
    if (watchedVideoOptions?.enabled) {
      requestBridge("mark-video-discovered", { ...watchedVideoOptions, watchKey }, 8000)
        .then((result) => {
          if (result?.knownVideoKeys) {
            watchedVideoKeys = new Set(normalizeWatchedVideoKeys(result.watchedVideoKeys));
            knownVideoKeys = new Set(normalizeWatchedVideoKeys(result.knownVideoKeys));
            unreadVideoKeys = new Set(normalizeWatchedVideoKeys(result.unreadVideoKeys));
            applyVisibleUnwatchedVideoMarks();
          }
        })
        .catch(() => {});
      return;
    }
    storageSet({
      [KNOWN_VIDEO_CANVAS_MODEL_KEY]: new Date().toISOString(),
      pixmaxKnownVideoKeys: [...knownVideoKeys],
      pixmaxUnreadVideoKeys: [...unreadVideoKeys]
    }).catch(() => {});
  }

  function handleVideoPlay(event) {
    const video = event.target;
    if (!video || String(video.tagName || "").toLowerCase() !== "video") return;
    const watchKey = getElementVideoWatchKey(video) || getNodeVideoWatchKey(video.closest?.(NODE_SELECTOR));
    markVideoWatched(watchKey);
    markVideoHistoryItemWatchedFromElement(video);
  }

  function handleVideoMetadata(event) {
    const video = event.target;
    if (!video || String(video.tagName || "").toLowerCase() !== "video") return;
    applyNodeUnwatchedVideoState(video.closest?.(NODE_SELECTOR));
    if (video.closest?.(NODE_SELECTOR)) {
      scheduleVideoHistoryRefresh(900);
    }
  }

  function getCurrentFileUuid() {
    try {
      return new URL(location.href).searchParams.get("file") || "";
    } catch {
      return "";
    }
  }

  function getLiveUserId(ownerName) {
    if (liveSessionId) return liveSessionId;
    try {
      liveSessionId = `pixmax-hub-tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return liveSessionId;
    } catch {
      liveSessionId = `pixmax-hub-${ownerName || "user"}-${Math.random().toString(36).slice(2)}`;
      return liveSessionId;
    }
  }

  function getLiveSocketUrl() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.host}/presence/ws`;
  }

  function getLiveSideRoom() {
    const fileUuid = getLiveRoomFileUuid();
    return fileUuid ? `${fileUuid}:pixmax-hub-live` : "";
  }

  function getLiveRoomFileUuid() {
    return liveOfficialFileUuid || liveOptions?.fileUuid || getCurrentFileUuid();
  }

  function getLiveAcceptedFileUuids() {
    return new Set(
      [liveOptions?.fileUuid, liveOfficialFileUuid, getCurrentFileUuid()]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    );
  }

  function isLivePayloadForThisCanvas(payload) {
    if (!payload || typeof payload !== "object") return false;
    const payloadFileUuid = String(payload.fileUuid || payload.roomFileUuid || "").trim();
    if (!payloadFileUuid) return true;
    return getLiveAcceptedFileUuids().has(payloadFileUuid);
  }

  async function getLiveCollabOptions() {
    const options = await syncStorageGet(SHARED_OPTIONS_DEFAULTS);
    const fileUuid = getCurrentFileUuid();
    const configuredOwnerName = String(options.sharedLikesOwnerName || "").trim();
    const fallbackIdentity = configuredOwnerName ? null : await getFallbackLiveIdentity();
    const ownerName = configuredOwnerName || fallbackIdentity.ownerName;
    return {
      color: configuredOwnerName ? normalizeColor(options.sharedLikesColor) : fallbackIdentity.color,
      enabled: Boolean(options.liveCollabEnabled && fileUuid && ownerName),
      fileUuid,
      ownerName,
      ownerNameSource: configuredOwnerName ? "configured" : "fallback",
      rawEnabled: Boolean(options.liveCollabEnabled)
    };
  }

  async function getFallbackLiveIdentity() {
    const values = await storageGet({ [LIVE_IDENTITY_STORAGE_KEY]: null });
    const existing = values[LIVE_IDENTITY_STORAGE_KEY];
    if (existing?.ownerName && /^#[0-9a-f]{6}$/i.test(existing.color || "")) {
      return {
        ownerName: String(existing.ownerName).slice(0, 40),
        color: normalizeColor(existing.color)
      };
    }

    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const color = LIVE_FALLBACK_COLORS[
      Math.floor(Math.random() * LIVE_FALLBACK_COLORS.length)
    ];
    const identity = {
      ownerName: `协作者 ${suffix}`,
      color
    };
    await storageSet({ [LIVE_IDENTITY_STORAGE_KEY]: identity }).catch(() => {});
    return identity;
  }

  function ensureLiveToggle() {
    let button = document.getElementById(LIVE_TOGGLE_ID);
    if (button) return button;

    button = document.createElement("button");
    button.id = LIVE_TOGGLE_ID;
    button.type = "button";
    button.title = "开启后显示协同鼠标，并自动监听云端版本变化。名字和颜色在扩展弹窗里设置。";
    button.addEventListener("click", toggleLiveCollabFromPage);
    document.body.appendChild(button);
    return button;
  }

  function updateLiveToggle() {
    const button = ensureLiveToggle();
    const active = Boolean(liveOptions?.enabled);
    button.dataset.active = active ? "true" : "false";
    const waitingForPeer = active && !hasConfirmedLiveRemotePeer();
    button.textContent = active
      ? waitingForPeer
        ? "实时协同 等待成员"
        : "实时协同 开"
      : "实时协同 关";
    scheduleOfficialPresenceAppearance();
  }

  async function toggleLiveCollabFromPage() {
    try {
      const nextEnabled = !Boolean(liveOptions?.rawEnabled);
      await syncStorageSet({ liveCollabEnabled: nextEnabled });
      showToast(nextEnabled ? "实时协同已开启。" : "实时协同已关闭。");
      await syncLiveCollabState();
    } catch (error) {
      showToast(error.message || String(error), true);
    }
  }

  async function syncLiveCollabState() {
    try {
      liveOptions = await getLiveCollabOptions();
      updateLiveToggle();
      if (liveOptions.enabled) {
        refreshOfficialLiveSyncStatus();
        startLiveCollab();
      }
      else stopLiveCollab();
    } catch (error) {
      stopLiveCollab();
      showToast(error.message || String(error), true);
    }
  }

  function startLiveCollab() {
    if (!liveOptions?.enabled) return;
    const nextConnectionKey = `${liveOptions.fileUuid}:${liveOptions.ownerName}:${liveOptions.color}`;
    if (liveConnectionKey && liveConnectionKey !== nextConnectionKey) {
      closeLiveSocket();
      liveLastKnownRevision = null;
    }
    liveConnectionKey = nextConnectionKey;
    liveSessionId = getLiveUserId(liveOptions.ownerName);
    ensureLiveCursorLayer();
    connectLiveSocket();
    document.addEventListener("pointermove", handleLivePointerMove, true);
    document.addEventListener("pointerleave", handleLivePointerLeave, true);
    document.addEventListener("pointerup", handleLiveLocalActivity, true);
    document.addEventListener("click", handleLiveLocalFocusActivity, true);
    document.addEventListener("keyup", handleLiveLocalFocusActivity, true);
    document.addEventListener("change", handleLiveLocalActivity, true);
    document.addEventListener("input", handleLiveLocalActivity, true);
    configureOfficialPresence();
    startLiveRevisionPolling();
    startLiveCursorCleanup();
    renderLiveSelectionColor();
  }

  function stopLiveCollab() {
    document.removeEventListener("pointermove", handleLivePointerMove, true);
    document.removeEventListener("pointerleave", handleLivePointerLeave, true);
    document.removeEventListener("pointerup", handleLiveLocalActivity, true);
    document.removeEventListener("click", handleLiveLocalFocusActivity, true);
    document.removeEventListener("keyup", handleLiveLocalFocusActivity, true);
    document.removeEventListener("change", handleLiveLocalActivity, true);
    document.removeEventListener("input", handleLiveLocalActivity, true);
    window.clearTimeout(liveReconnectTimer);
    window.clearTimeout(liveFocusBroadcastTimer);
    window.clearTimeout(liveSyncTriggerTimer);
    window.clearInterval(liveRevisionTimer);
    window.clearInterval(liveCursorCleanupTimer);
    liveRevisionTimer = 0;
    liveCursorCleanupTimer = 0;
    liveConnectionKey = "";
    liveOfficialFileUuid = "";
    liveOfficialClientId = "";
    liveOfficialUserId = "";
    liveLastRawMessage = null;
    liveLastIncomingPayload = null;
    liveLastDroppedPayload = null;
    liveLastSentPayload = null;
    liveLastProfileBroadcastKey = "";
    liveLastProfileBroadcastAt = 0;
    liveLastFocusBroadcastAt = 0;
    liveLastFocusHeartbeatAt = 0;
    liveLastFocusSignature = "";
    liveLastKnownRevision = null;
    liveSyncInFlight = false;
    liveSyncQueued = false;
    liveRemoteActivityUntil = 0;
    livePresencePeerCount = 1;
    liveDomPeerCount = 1;
    liveMultiUserSyncNotified = false;
    liveOfficialSyncAvailable = false;
    liveOfficialSyncWarned = false;
    livePendingNodeIds.clear();
    liveRemoteFocuses.clear();
    livePeerProfiles.clear();
    liveFocusSessions = [];
    restoreOfficialFocusColors();
    renderLiveFocusColors();
    renderLiveSelectionColor();
    clearLiveRemoteCursors();
    updateLiveToggle();
  }

  function connectLiveSocket() {
    if (!liveOptions?.enabled) return;
    if (liveSocket?.readyState === WebSocket.OPEN || liveSocket?.readyState === WebSocket.CONNECTING) return;
    const room = getLiveSideRoom();
    if (!room) return;

    closeLiveSocket({ reconnect: false });
    let socket;
    try {
      liveSocketStatus = "connecting";
      liveSocketLastError = "";
      socket = new WebSocket(getLiveSocketUrl());
    } catch {
      liveSocketStatus = "connect-error";
      liveSocketLastError = "constructor";
      scheduleLiveSocketReconnect();
      return;
    }

    liveSocket = socket;
    socket.addEventListener("open", () => {
      liveSocketStatus = "open";
      liveSocketLastOpenAt = Date.now();
      liveSocketReconnectAttempt = 0;
      socket.send(
        JSON.stringify({
          type: "join",
          room,
          color: liveOptions.color,
          profileColor: liveOptions.color,
          userId: liveSessionId,
          userName: liveOptions.ownerName
        })
      );
      window.setTimeout(() => broadcastLiveProfile("side-room-open"), 80);
    });
    socket.addEventListener("message", (event) => {
      liveSocketLastMessageAt = Date.now();
      handleLiveSocketMessage(String(event.data || ""));
    });
    socket.addEventListener("close", () => {
      if (liveSocket === socket) liveSocket = null;
      liveSocketStatus = "closed";
      if (!socket.__pixmaxHubLiveClosing) scheduleLiveSocketReconnect();
    });
    socket.addEventListener("error", () => {
      liveSocketStatus = "error";
      liveSocketLastError = "socket-error";
      if (!socket.__pixmaxHubLiveClosing) scheduleLiveSocketReconnect();
    });
  }

  function scheduleLiveSocketReconnect() {
    if (!liveOptions?.enabled) return;
    window.clearTimeout(liveReconnectTimer);
    const delay = Math.min(3000, 500 + liveSocketReconnectAttempt * 350);
    liveSocketReconnectAttempt += 1;
    liveReconnectTimer = window.setTimeout(() => {
      connectLiveSocket();
    }, delay);
  }

  function closeLiveSocket(options = {}) {
    window.clearTimeout(liveReconnectTimer);
    if (options.reconnect === false) {
      liveReconnectTimer = 0;
    }
    const socket = liveSocket;
    liveSocket = null;
    if (!socket) return;
    socket.__pixmaxHubLiveClosing = true;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }

  async function configureOfficialPresence() {
    if (!liveOptions?.enabled) return;
    liveSessionId = getLiveUserId(liveOptions.ownerName);
    try {
      const status = await requestBridge(
        "set-live-presence-identity",
        {
          color: liveOptions.color,
          ownerName: liveOptions.ownerName
        },
        4000
      );
      updateLivePresenceStatus(status);
      broadcastLiveProfile("official-presence");
      if (!status?.available && !liveOfficialSyncWarned) {
        liveOfficialSyncWarned = true;
        showToast("需要刷新 Pixmax 页面，才能把官方在线用户改成你的名字和颜色。", true, {
          duration: 5200
        });
      }
      scheduleOfficialPresenceAppearance();
    } catch {
      // Presence identity is cosmetic; keep live sync running.
    }
  }

  function broadcastLivePayload(payload) {
    const finalPayload = {
      ...payload,
      color: normalizeColor(payload.color || liveOptions?.color),
      fileUuid: getLiveRoomFileUuid(),
      officialClientId: liveOfficialClientId,
      officialUserId: liveOfficialUserId,
      ownerName: payload.ownerName || liveOptions?.ownerName || "",
      roomFileUuid: getLiveRoomFileUuid(),
      urlFileUuid: liveOptions?.fileUuid || "",
      senderId: liveSessionId,
      sentAt: Date.now()
    };
    liveLastSentPayload = finalPayload;
    if (liveSocket?.readyState === WebSocket.OPEN) {
      liveSocket.send(JSON.stringify({ type: "broadcast", payload: finalPayload }));
      liveSocketLastSentAt = Date.now();
    } else {
      connectLiveSocket();
    }
    return requestBridge(
      "broadcast-official-presence",
      finalPayload,
      2500
    ).catch(() => null);
  }

  function broadcastLiveProfile(reason) {
    if (!liveOptions?.enabled) return;
    const profileKey = [
      liveOptions.ownerName,
      liveOptions.color,
      liveOfficialClientId,
      liveOfficialUserId
    ].join("|");
    const now = Date.now();
    if (
      reason !== "force" &&
      profileKey === liveLastProfileBroadcastKey &&
      now - liveLastProfileBroadcastAt < 1500
    ) {
      return;
    }
    liveLastProfileBroadcastKey = profileKey;
    liveLastProfileBroadcastAt = now;
    rememberLivePeerProfile({
      color: liveOptions.color,
      officialClientId: liveOfficialClientId,
      officialUserId: liveOfficialUserId,
      ownerName: liveOptions.ownerName,
      senderId: liveSessionId
    });
    broadcastLivePayload({
      kind: "pixmax-live-profile",
      reason
    });
  }

  function handleLiveSocketMessage(value) {
    let message;
    try {
      message = JSON.parse(String(value || ""));
    } catch {
      return;
    }
    liveLastRawMessage = message;

    updateLivePresenceStatus(message);
    if (message.type === "room-session-focus" && Array.isArray(message.sessions)) {
      liveFocusSessions = message.sessions.filter((session) => session?.nodeId);
      broadcastLiveProfile("focus-session");
      renderLiveFocusColors();
    }

    const payload = message.payload && typeof message.payload === "object"
      ? message.payload
      : message.type === "broadcast" && message.data && typeof message.data === "object"
        ? message.data
        : String(message.kind || "").startsWith("pixmax-live-")
          ? message
        : null;
    if (!payload || payload.senderId === liveSessionId || !isLivePayloadForThisCanvas(payload)) {
      if (payload) liveLastDroppedPayload = payload;
      return;
    }

    liveLastIncomingPayload = payload;
    rememberLivePeerProfile(payload);
    markLiveRemoteActivity();

    if (payload.kind === "pixmax-live-profile") {
      scheduleOfficialPresenceAppearance();
      renderLiveFocusColors();
      return;
    }

    if (payload.kind === "pixmax-live-cursor") {
      renderRemoteLiveCursor(payload);
      return;
    }

    if (payload.kind === "pixmax-live-cursor-hide") {
      hideRemoteLiveCursor(payload.senderId);
      return;
    }

    if (payload.kind === "pixmax-live-focus") {
      renderRemoteLiveFocus(payload);
      return;
    }

    if (payload.kind === "pixmax-live-revision") {
      scheduleLiveRevisionCheck("remote-broadcast", payload.revision);
      return;
    }
  }

  function updateLivePresenceStatus(status = {}) {
    const previousClientId = liveOfficialClientId;
    const previousUserId = liveOfficialUserId;
    if (status.clientId) liveOfficialClientId = String(status.clientId || "");
    if (status.lastJoin?.userId) liveOfficialUserId = String(status.lastJoin.userId || "");
    if (Array.isArray(status.peers)) {
      for (const peer of status.peers) {
        rememberLivePeerProfile(peer);
        if (
          liveOfficialClientId &&
          peer?.clientId === liveOfficialClientId &&
          peer?.userId &&
          !liveOfficialUserId
        ) {
          liveOfficialUserId = String(peer.userId || "");
        }
        if (
          liveOptions?.ownerName &&
          String(peer?.userName || "").trim() === liveOptions.ownerName &&
          peer?.userId &&
          !liveOfficialUserId
        ) {
          liveOfficialUserId = String(peer.userId || "");
        }
      }
    }
    if (
      (liveOfficialClientId && liveOfficialClientId !== previousClientId) ||
      (liveOfficialUserId && liveOfficialUserId !== previousUserId)
    ) {
      broadcastLiveProfile("official-id-ready");
    }
    const nextPeerCount = Number.isFinite(Number(status.peerCount))
      ? Math.max(1, Number(status.peerCount))
      : Array.isArray(status.peers)
        ? Math.max(1, status.peers.length)
        : livePresencePeerCount;
    const hadRemotePeer = hasLiveRemotePeer();
    livePresencePeerCount = nextPeerCount;
    const hasRemotePeer = hasLiveRemotePeer();
    updateLiveToggle();
    renderLiveFocusColors();
    if (hasRemotePeer && !hadRemotePeer) {
      liveMultiUserSyncNotified = true;
      if (liveSyncQueued || Date.now() - liveLastLocalActivityAt < 15000) {
        scheduleLiveOfficialSync();
      }
      scheduleLiveRevisionCheck("peer-joined");
    }
  }

  function hasLiveRemotePeer() {
    return (
      hasConfirmedLiveRemotePeer() ||
      Date.now() < liveRemoteActivityUntil ||
      liveRemoteCursors.size > 0
    );
  }

  function hasConfirmedLiveRemotePeer() {
    return (
      livePresencePeerCount >= 2 ||
      hasCollaborationConflictDialog()
    );
  }

  function markLiveRemoteActivity() {
    const hadRemotePeer = hasLiveRemotePeer();
    liveRemoteActivityUntil = Date.now() + LIVE_REMOTE_ACTIVITY_GRACE_MS;
    if (livePresencePeerCount < 2) livePresencePeerCount = 2;
    updateLiveToggle();
    if (!hadRemotePeer && (liveSyncQueued || Date.now() - liveLastLocalActivityAt < 15000)) {
      scheduleLiveOfficialSync();
    }
  }

  function rememberLivePeerProfile(profile = {}) {
    const ownerName = String(profile.ownerName || profile.userName || "").trim();
    const color = normalizeOptionalColor(profile.color || profile.profileColor);
    const keys = [
      profile.senderId && `sender:${profile.senderId}`,
      profile.officialUserId && `user:${profile.officialUserId}`,
      profile.userId && `user:${profile.userId}`,
      profile.officialClientId && `client:${profile.officialClientId}`,
      profile.clientId && `client:${profile.clientId}`,
      ownerName && `name:${ownerName}`
    ].filter(Boolean);
    if (!keys.length || !ownerName) return;

    const existing =
      keys.map((key) => livePeerProfiles.get(key)).find(Boolean) || {};
    const next = {
      ...existing,
      color: color || existing.color || "",
      ownerName,
      senderId: profile.senderId || existing.senderId || "",
      officialUserId: profile.officialUserId || profile.userId || existing.officialUserId || "",
      officialClientId: profile.officialClientId || profile.clientId || existing.officialClientId || ""
    };
    for (const key of keys) livePeerProfiles.set(key, next);
  }

  function getLiveProfileForSession(session = {}) {
    const keys = [
      session.userId && `user:${session.userId}`,
      session.clientId && `client:${session.clientId}`,
      session.userName && `name:${session.userName}`,
      session.ownerName && `name:${session.ownerName}`
    ].filter(Boolean);
    for (const key of keys) {
      const profile = livePeerProfiles.get(key);
      if (profile) return profile;
    }
    const remoteProfiles = getLiveDisplayProfiles().filter((profile) => {
      if (liveSessionId && profile.senderId === liveSessionId) return false;
      if (liveOfficialClientId && profile.officialClientId === liveOfficialClientId) return false;
      if (liveOfficialUserId && profile.officialUserId === liveOfficialUserId) return false;
      return Boolean(profile.color);
    });
    if (remoteProfiles.length === 1) return remoteProfiles[0];
    return null;
  }

  function getLiveDisplayProfiles() {
    const profiles = new Map();
    if (liveOptions?.ownerName) {
      profiles.set(`own:${liveOptions.ownerName}`, {
        color: liveOptions.color,
        ownerName: liveOptions.ownerName,
        officialClientId: liveOfficialClientId,
        officialUserId: liveOfficialUserId,
        senderId: liveSessionId
      });
    }
    for (const profile of livePeerProfiles.values()) {
      const key =
        profile.officialUserId ||
        profile.officialClientId ||
        profile.senderId ||
        profile.ownerName;
      if (key) profiles.set(key, profile);
    }
    return [...profiles.values()];
  }

  function renderLiveFocusColors() {
    neutralizeOfficialFocusColors();
    let style = document.getElementById(LIVE_FOCUS_STYLE_ID);
    const grouped = new Map();
    for (const entry of liveRemoteFocuses.values()) {
      if (!entry.nodeIds.length) continue;
      for (const nodeId of entry.nodeIds) {
        const colors = grouped.get(nodeId) || [];
        if (!colors.includes(entry.color)) colors.push(entry.color);
        grouped.set(nodeId, colors);
      }
    }
    for (const session of liveFocusSessions) {
      const nodeId = String(session.nodeId || "").trim();
      if (!nodeId) continue;
      const profile = getLiveProfileForSession(session);
      const color = profile?.color;
      if (!color) continue;
      const colors = grouped.get(nodeId) || [];
      if (!colors.includes(color)) colors.push(color);
      grouped.set(nodeId, colors);
    }

    if (!grouped.size) {
      style?.remove();
      return;
    }

    if (!style) {
      style = document.createElement("style");
      style.id = LIVE_FOCUS_STYLE_ID;
      document.head.appendChild(style);
    }
    if (style.parentNode === document.head) document.head.appendChild(style);

    const rules = [];
    for (const [nodeId, colors] of grouped) {
      const escapedNodeId = window.CSS?.escape ? CSS.escape(nodeId) : nodeId.replace(/"/g, '\\"');
      const shadows = colors
        .map((color, index) => `0 0 0 ${2 + index * 2}px ${color}`)
        .join(", ");
      rules.push(
        `#app .svelte-flow__node[data-id="${escapedNodeId}"] { box-shadow: ${shadows} !important; border-radius: 12px; }`,
        `#app .svelte-flow__node[data-id="${escapedNodeId}"] .node-container,
         #app .svelte-flow__node[data-id="${escapedNodeId}"] [class*="node-container"] {
          border-color: ${colors[0]} !important;
          box-shadow: 0 0 0 1px ${colors[0]} !important;
        }`,
        `#app .svelte-flow__node[data-id="${escapedNodeId}"] [class*="border"],
         #app .svelte-flow__node[data-id="${escapedNodeId}"] [style*="border-color"] {
          border-color: ${colors[0]} !important;
        }`,
        `#app .svelte-flow__node[data-id="${escapedNodeId}"]::before {
          border-color: ${colors[0]} !important;
          box-shadow: ${shadows} !important;
        }`
      );
    }
    style.textContent = rules.join("\n");
  }

  function neutralizeOfficialFocusColors() {
    if (!liveOptions?.enabled) return;
    const style = document.getElementById(OFFICIAL_FOCUS_STYLE_ID);
    if (!style) return;
    style.dataset.pixmaxHubDisabledFocus = "true";
    style.disabled = true;
  }

  function restoreOfficialFocusColors() {
    const style = document.getElementById(OFFICIAL_FOCUS_STYLE_ID);
    if (!style || style.dataset.pixmaxHubDisabledFocus !== "true") return;
    style.disabled = false;
    delete style.dataset.pixmaxHubDisabledFocus;
  }

  function renderLiveSelectionColor() {
    let style = document.getElementById(LIVE_SELECTION_STYLE_ID);
    if (!liveOptions?.enabled || !liveOptions.color) {
      style?.remove();
      return;
    }

    const color = normalizeColor(liveOptions.color);
    const [red, green, blue] = hexToRgb(color);
    const soft = `rgb(${red} ${green} ${blue} / 22%)`;
    const glow = `rgb(${red} ${green} ${blue} / 46%)`;
    if (!style) {
      style = document.createElement("style");
      style.id = LIVE_SELECTION_STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
      #app .svelte-flow__node.selected,
      #app .svelte-flow__node[aria-selected="true"],
      #app .svelte-flow__node[data-selected="true"] {
        border-color: ${color} !important;
        border-radius: 12px !important;
        box-shadow: 0 0 0 2px ${color}, 0 0 0 6px ${soft} !important;
      }

      #app .svelte-flow__node.selected .node-container,
      #app .svelte-flow__node[aria-selected="true"] .node-container,
      #app .svelte-flow__node[data-selected="true"] .node-container,
      #app .svelte-flow__node.selected [class*="node-container"],
      #app .svelte-flow__node[aria-selected="true"] [class*="node-container"],
      #app .svelte-flow__node[data-selected="true"] [class*="node-container"] {
        border-color: ${color} !important;
        box-shadow: 0 0 0 1px ${color}, 0 0 0 5px ${soft} !important;
      }

      #app .svelte-flow__node.selected [class*="border"],
      #app .svelte-flow__node[aria-selected="true"] [class*="border"],
      #app .svelte-flow__node[data-selected="true"] [class*="border"],
      #app .svelte-flow__node.selected [style*="border-color"],
      #app .svelte-flow__node[aria-selected="true"] [style*="border-color"],
      #app .svelte-flow__node[data-selected="true"] [style*="border-color"] {
        border-color: ${color} !important;
      }

      #app .svelte-flow__node.selected::before,
      #app .svelte-flow__node[aria-selected="true"]::before,
      #app .svelte-flow__node[data-selected="true"]::before {
        border-color: ${color} !important;
        box-shadow: 0 0 12px ${glow} !important;
      }
    `;
  }

  function getFlowTransform() {
    const pane = document.querySelector(".svelte-flow__pane") || document.querySelector(".svelte-flow");
    const viewport = document.querySelector(".svelte-flow__viewport");
    if (!pane || !viewport || !window.DOMMatrix) return null;

    const paneRect = pane.getBoundingClientRect();
    const transform = getComputedStyle(viewport).transform;
    const matrix = transform && transform !== "none" ? new DOMMatrix(transform) : new DOMMatrix();
    const scale = matrix.a || 1;
    return { matrix, paneRect, scale };
  }

  function screenToFlowPoint(clientX, clientY) {
    const transform = getFlowTransform();
    if (!transform) return null;
    return {
      x: (clientX - transform.paneRect.left - transform.matrix.e) / transform.scale,
      y: (clientY - transform.paneRect.top - transform.matrix.f) / transform.scale
    };
  }

  function flowToScreenPoint(x, y) {
    const transform = getFlowTransform();
    if (!transform) return null;
    return {
      x: transform.paneRect.left + transform.matrix.e + x * transform.scale,
      y: transform.paneRect.top + transform.matrix.f + y * transform.scale
    };
  }

  function handleLivePointerMove(event) {
    if (!liveOptions?.enabled || event.pointerType === "touch") return;
    broadcastLiveProfile("pointer");
    scheduleLiveFocusBroadcast("pointer", 80);
    if (event.buttons && event.target?.closest?.(".svelte-flow")) {
      markLiveDirtyNodes(event.target);
      if (canvasNodeDragActive) {
        liveSyncQueued = true;
        window.clearTimeout(liveSyncTriggerTimer);
        window.clearTimeout(scheduleLiveRevisionCheck.timer);
      } else {
        scheduleLiveOfficialSync();
        scheduleLiveRevisionCheck("drag");
      }
    }
    const now = Date.now();
    if (now - liveLastCursorSentAt < LIVE_CURSOR_SEND_INTERVAL_MS) return;
    const point = screenToFlowPoint(event.clientX, event.clientY);
    if (!point) return;

    liveLastCursorSentAt = now;
    broadcastLivePayload({
      kind: "pixmax-live-cursor",
      color: liveOptions.color,
      ownerName: liveOptions.ownerName,
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.y * 10) / 10
    });
  }

  function handleLivePointerLeave() {
    if (!liveOptions?.enabled) return;
    broadcastLivePayload({
      kind: "pixmax-live-cursor-hide",
      ownerName: liveOptions.ownerName
    });
  }

  function handleLiveLocalFocusActivity() {
    if (!liveOptions?.enabled) return;
    scheduleLiveFocusBroadcast("focus-activity", 60);
  }

  function handleLiveLocalActivity() {
    if (!liveOptions?.enabled) return;
    broadcastLiveProfile("local-activity");
    scheduleLiveFocusBroadcast("local-activity", 80);
    liveLastLocalActivityAt = Date.now();
    scheduleLiveOfficialSync();
    scheduleLiveRevisionCheck("local-activity");
  }

  function scheduleLiveFocusBroadcast(reason, delay = 80) {
    window.clearTimeout(liveFocusBroadcastTimer);
    liveFocusBroadcastTimer = window.setTimeout(() => {
      broadcastLiveFocus(reason);
    }, delay);
  }

  function getSelectedLiveNodeIds() {
    const selectors = [
      `${NODE_SELECTOR}.selected`,
      `${NODE_SELECTOR}[aria-selected="true"]`,
      `${NODE_SELECTOR}[data-selected="true"]`
    ].join(",");
    return [...document.querySelectorAll(selectors)]
      .map((node) => node.dataset.id || node.getAttribute("data-id") || "")
      .map((id) => String(id || "").trim())
      .filter(Boolean)
      .sort();
  }

  function didSelectedClassChange(mutation) {
    if (!(mutation.target instanceof Element)) return false;
    const hadSelected = /\bselected\b/.test(String(mutation.oldValue || ""));
    const hasSelected = mutation.target.classList.contains("selected");
    return hadSelected !== hasSelected;
  }

  function broadcastLiveFocus(reason) {
    if (!liveOptions?.enabled) return;
    const now = Date.now();
    const nodeIds = getSelectedLiveNodeIds();
    const signature = nodeIds.join("|");
    if (
      signature === liveLastFocusSignature &&
      now - liveLastFocusBroadcastAt < LIVE_FOCUS_SEND_INTERVAL_MS
    ) {
      return;
    }
    liveLastFocusSignature = signature;
    liveLastFocusBroadcastAt = now;
    broadcastLiveProfile("focus");
    broadcastLivePayload({
      kind: "pixmax-live-focus",
      color: liveOptions.color,
      nodeIds,
      ownerName: liveOptions.ownerName,
      reason
    });
  }

  function maybeBroadcastLiveFocusHeartbeat(now) {
    if (!liveOptions?.enabled) return;
    if (now - liveLastFocusHeartbeatAt < LIVE_FOCUS_HEARTBEAT_MS) return;
    const nodeIds = getSelectedLiveNodeIds();
    if (!nodeIds.length) return;
    liveLastFocusHeartbeatAt = now;
    liveLastFocusSignature = "";
    broadcastLiveFocus("focus-heartbeat");
  }

  function renderRemoteLiveFocus(payload = {}) {
    const senderId = String(payload.senderId || "");
    if (!senderId) return;
    const nodeIds = Array.isArray(payload.nodeIds)
      ? payload.nodeIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    liveRemoteFocuses.set(senderId, {
      color: normalizeColor(payload.color),
      lastSeenAt: Date.now(),
      nodeIds,
      ownerName: String(payload.ownerName || "协作者").slice(0, 40)
    });
    renderLiveFocusColors();
  }

  async function refreshOfficialLiveSyncStatus() {
    try {
      const previousSideRoom = getLiveSideRoom();
      const status = await requestBridge("get-official-live-sync-status", {}, 4000);
      liveOfficialSyncAvailable = Boolean(status?.available);
      if (status?.fileUuid) {
        liveOfficialFileUuid = String(status.fileUuid || "").trim();
        const nextSideRoom = getLiveSideRoom();
        if (
          liveOptions?.enabled &&
          previousSideRoom &&
          nextSideRoom &&
          previousSideRoom !== nextSideRoom
        ) {
          closeLiveSocket({ reconnect: false });
          connectLiveSocket();
        }
      }
      if (!liveOfficialSyncAvailable && !liveOfficialSyncWarned) {
        liveOfficialSyncWarned = true;
        showToast("实时协同需要刷新 Pixmax 页面后捕获瑞云官方同步入口。", true, {
          duration: 5200
        });
      }
    } catch {
      liveOfficialSyncAvailable = false;
    }
  }

  function markLiveDirtyNodes(target) {
    liveLastLocalActivityAt = Date.now();
    const node = target?.closest?.(NODE_SELECTOR);
    if (node?.dataset.id) livePendingNodeIds.add(node.dataset.id);
    for (const selectedNode of document.querySelectorAll(`${NODE_SELECTOR}.selected`)) {
      if (selectedNode.dataset.id) livePendingNodeIds.add(selectedNode.dataset.id);
    }
  }

  function scheduleLiveOfficialSync() {
    if (!hasLiveRemotePeer()) {
      liveSyncQueued = true;
      window.clearTimeout(liveSyncTriggerTimer);
      return;
    }
    const now = Date.now();
    const delay = Math.max(0, LIVE_SYNC_TRIGGER_INTERVAL_MS - (now - liveLastSyncTriggeredAt));
    window.clearTimeout(liveSyncTriggerTimer);
    liveSyncTriggerTimer = window.setTimeout(() => {
      if (liveSyncInFlight) {
        liveSyncQueued = true;
        return;
      }
      liveSyncInFlight = true;
      liveSyncQueued = false;
      liveLastSyncTriggeredAt = Date.now();
      livePendingNodeIds.clear();
      requestBridge(
        "trigger-official-workspace-sync",
        { reason: "pixmax-hub-live" },
        12000
      )
        .then((result) => {
          liveOfficialSyncAvailable = Boolean(result?.available);
          if (!liveOfficialSyncAvailable && !liveOfficialSyncWarned) {
            liveOfficialSyncWarned = true;
            showToast("没有捕获到瑞云官方同步入口，请刷新 Pixmax 页面后再试。", true, {
              duration: 5200
            });
          }
          if (result?.revision) {
            liveLastKnownRevision = result.revision;
            broadcastLiveRevision("official-sync", result.revision);
          }
        })
        .then(() => scheduleLiveRevisionCheck("official-sync"))
        .catch(() => {})
        .finally(() => {
          liveSyncInFlight = false;
          if (liveSyncQueued || liveLastLocalActivityAt > liveLastSyncTriggeredAt) {
            liveSyncQueued = false;
            scheduleLiveOfficialSync();
          }
        });
    }, delay);
  }

  function ensureLiveCursorLayer() {
    let layer = document.getElementById(LIVE_CURSOR_LAYER_ID);
    if (layer) return layer;
    layer = document.createElement("div");
    layer.id = LIVE_CURSOR_LAYER_ID;
    document.body.appendChild(layer);
    return layer;
  }

  function renderRemoteLiveCursor(payload) {
    const point = flowToScreenPoint(Number(payload.x), Number(payload.y));
    if (!point) return;

    const senderId = String(payload.senderId || "");
    if (!senderId) return;
    const layer = ensureLiveCursorLayer();
    let cursor = liveRemoteCursors.get(senderId)?.element;
    if (!cursor) {
      cursor = document.createElement("div");
      cursor.className = "pixmax-canvas-cloner-live-cursor";
      cursor.innerHTML = `
        <span class="pixmax-canvas-cloner-live-cursor-icon"></span>
        <span class="pixmax-canvas-cloner-live-cursor-name"></span>
      `;
      layer.appendChild(cursor);
    }

    cursor.dataset.stale = "false";
    cursor.style.setProperty("--pixmax-live-x", `${point.x}px`);
    cursor.style.setProperty("--pixmax-live-y", `${point.y}px`);
    cursor.style.setProperty("--pixmax-live-color", normalizeColor(payload.color));
    cursor.querySelector(".pixmax-canvas-cloner-live-cursor-name").textContent =
      String(payload.ownerName || "协作者").slice(0, 40);
    liveRemoteCursors.set(senderId, {
      element: cursor,
      lastSeenAt: Date.now(),
      x: Number(payload.x),
      y: Number(payload.y)
    });
  }

  function hideRemoteLiveCursor(senderId) {
    const entry = liveRemoteCursors.get(String(senderId || ""));
    if (entry?.element) entry.element.dataset.stale = "true";
  }

  function clearLiveRemoteCursors() {
    for (const entry of liveRemoteCursors.values()) {
      entry.element?.remove();
    }
    liveRemoteCursors.clear();
    document.getElementById(LIVE_CURSOR_LAYER_ID)?.remove();
  }

  function startLiveCursorCleanup() {
    if (liveCursorCleanupTimer) return;
    liveCursorCleanupTimer = window.setInterval(() => {
      const now = Date.now();
      for (const [senderId, entry] of liveRemoteCursors) {
        const point = flowToScreenPoint(entry.x, entry.y);
        if (point) {
          entry.element.style.setProperty("--pixmax-live-x", `${point.x}px`);
          entry.element.style.setProperty("--pixmax-live-y", `${point.y}px`);
        }
        if (now - entry.lastSeenAt > LIVE_REMOTE_CURSOR_TTL_MS) {
          entry.element.dataset.stale = "true";
        }
        if (now - entry.lastSeenAt > LIVE_REMOTE_CURSOR_TTL_MS * 3) {
          entry.element.remove();
          liveRemoteCursors.delete(senderId);
        }
      }
      let focusChanged = false;
      for (const [senderId, entry] of liveRemoteFocuses) {
        if (now - entry.lastSeenAt > LIVE_REMOTE_FOCUS_STALE_MS) {
          liveRemoteFocuses.delete(senderId);
          focusChanged = true;
        }
      }
      if (focusChanged) renderLiveFocusColors();
      maybeBroadcastLiveFocusHeartbeat(now);
      updateLiveToggle();
    }, 250);
  }

  function startLiveRevisionPolling() {
    if (liveRevisionTimer) return;
    scheduleLiveRevisionCheck("start");
    liveRevisionTimer = window.setInterval(() => {
      scheduleLiveRevisionCheck("poll");
    }, LIVE_REVISION_POLL_INTERVAL_MS);
  }

  function scheduleLiveRevisionCheck(reason, hintedRevision = null) {
    if (!hasLiveRemotePeer() && reason !== "start" && reason !== "remote-broadcast") return;
    window.clearTimeout(scheduleLiveRevisionCheck.timer);
    scheduleLiveRevisionCheck.timer = window.setTimeout(() => {
      checkLiveRevision(reason, hintedRevision).catch(() => {});
    }, reason === "remote-broadcast" ? LIVE_REMOTE_BROADCAST_PULL_DELAY_MS : LIVE_REVISION_CHECK_DELAY_MS);
  }

  async function checkLiveRevision(reason, hintedRevision = null) {
    if (!liveOptions?.enabled) return;
    if (!hasLiveRemotePeer() && reason !== "remote-broadcast") return;
    if (reason === "remote-broadcast" && hintedRevision && hintedRevision !== liveLastKnownRevision) {
      liveLastKnownRevision = hintedRevision;
      pullOfficialLiveRemoteSnapshot(hintedRevision);
      return;
    }

    const result = await requestBridge("get-current-canvas-revision", {}, 8000);
    const revision = result?.revision ?? null;
    if (revision == null) return;

    if (liveLastKnownRevision == null) {
      liveLastKnownRevision = revision;
      return;
    }

    if (revision === liveLastKnownRevision) return;

    liveLastKnownRevision = revision;
    const isProbablyLocal = Date.now() - liveLastLocalActivityAt < 4500 && reason !== "remote-broadcast";
    if (isProbablyLocal) {
      broadcastLiveRevision(reason, revision);
      return;
    }

    showToast("检测到云端画布版本更新，正在通过瑞云官方入口拉取。", false, {
      duration: 2200
    });
    pullOfficialLiveRemoteSnapshot(hintedRevision || revision);
  }

  async function pullOfficialLiveRemoteSnapshot(revision) {
    try {
      const result = await requestBridge(
        "pull-official-remote-snapshot",
        { fileUuid: liveOptions?.fileUuid || "", revision },
        12000
      );
      liveOfficialSyncAvailable = Boolean(result?.available);
      if (result?.available && result.applied) {
        showToast("已通过瑞云官方同步入口应用云端版本。", false, {
          duration: 1800
        });
      } else if (!result?.available && !liveOfficialSyncWarned) {
        liveOfficialSyncWarned = true;
        showToast("没有捕获到瑞云官方拉取入口，请刷新 Pixmax 页面后再试。", true, {
          duration: 5200
        });
      }
    } catch (error) {
      showToast(error.message || String(error), true);
    }
  }

  function broadcastLiveRevision(reason, revision = liveLastKnownRevision) {
    if (!liveOptions?.enabled) return;
    broadcastLivePayload({
      kind: "pixmax-live-revision",
      ownerName: liveOptions.ownerName,
      reason,
      revision
    });
  }

  function scheduleOfficialPresenceAppearance() {
    if (livePresenceAppearanceScheduled) return;
    livePresenceAppearanceScheduled = true;
    window.setTimeout(() => {
      livePresenceAppearanceScheduled = false;
      applyOfficialPresenceAppearance();
    }, 120);
  }

  function applyOfficialPresenceAppearance() {
    if (!liveOptions?.enabled || !liveOptions.ownerName) return;
    const profiles = getLiveDisplayProfiles()
      .filter((profile) => profile?.ownerName && profile?.color)
      .map((profile) => ({
        ...profile,
        color: normalizeColor(profile.color),
        initial: String(profile.ownerName || "").trim().slice(0, 1).toUpperCase()
      }));
    if (!profiles.length) return;
    let visiblePresenceCount = 0;
    for (const element of document.querySelectorAll("div, span, button")) {
      const text = element.textContent?.trim();
      if (!text || text.length > 2) continue;
      const rect = element.getBoundingClientRect();
      if (
        rect.width < 20 ||
        rect.width > 72 ||
        rect.height < 20 ||
        rect.height > 72 ||
        rect.top > 140
      ) {
        continue;
      }
      const style = getComputedStyle(element);
      const radius = parseFloat(style.borderRadius) || 0;
      if (radius < Math.min(rect.width, rect.height) * 0.35) continue;
      visiblePresenceCount += 1;
      const existingKey = element.dataset.pixmaxHubPresenceKey || "";
      const profile =
        profiles.find((item) => getLivePresenceProfileKey(item) === existingKey) ||
        profiles.find((item) => text.toUpperCase() === item.initial);
      if (!profile) continue;
      const profileKey = getLivePresenceProfileKey(profile);
      const color = normalizeColor(profile.color);
      const [red, green, blue] = hexToRgb(color);
      if (
        element.dataset.pixmaxHubPresenceKey === profileKey &&
        element.dataset.pixmaxHubPresenceColor === color &&
        element.textContent === profile.initial
      ) {
        continue;
      }
      element.dataset.pixmaxHubPresenceKey = profileKey;
      element.dataset.pixmaxHubPresenceColor = color;
      element.textContent = profile.initial;
      element.style.setProperty("background", color, "important");
      element.style.setProperty("background-color", color, "important");
      element.style.setProperty("border-color", color, "important");
      element.style.setProperty("color", getReadableTextColor(red, green, blue), "important");
      element.style.setProperty(
        "box-shadow",
        `0 0 0 2px rgb(${red} ${green} ${blue} / 34%)`,
        "important"
      );
    }
    liveDomPeerCount = Math.max(1, visiblePresenceCount);
    if (visiblePresenceCount === 1 && livePresencePeerCount > 1 && !hasCollaborationConflictDialog()) {
      livePresencePeerCount = 1;
      liveRemoteActivityUntil = 0;
      updateLiveToggle();
    }
  }

  function getLivePresenceProfileKey(profile = {}) {
    return (
      profile.officialUserId ||
      profile.officialClientId ||
      profile.senderId ||
      profile.ownerName ||
      ""
    );
  }

  function getReadableTextColor(red, green, blue) {
    return red * 0.299 + green * 0.587 + blue * 0.114 > 145 ? "#111" : "#fff";
  }

  function autoResolveCollaborationConflict() {
    if (!liveOptions?.enabled) return;
    if (!hasCollaborationConflictDialog()) return;
    markLiveRemoteActivity();
    const button = [...document.querySelectorAll("button")].find((item) =>
      item.textContent.replace(/\s+/g, "").includes("覆盖云端版本")
    );
    if (!button) return;
    button.click();
    showToast("实时协同已自动选择覆盖云端版本。");
    scheduleLiveRevisionCheck("auto-conflict");
  }

  function hasCollaborationConflictDialog() {
    return Boolean(document.body?.textContent?.includes("文件版本冲突"));
  }

  function normalizeColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_LIKE_COLOR;
  }

  function normalizeOptionalColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "";
  }

  function normalizeGithubUpdateUrl(value) {
    const source = parseGithubUpdateUrl(value);
    if (!source) return DEFAULT_GITHUB_UPDATE_URL;

    const isDefaultRepository =
      source.owner === "171896542" && source.repo.toLowerCase() === "pixmaxhub-plug";
    const branch = isDefaultRepository && (!source.branch || source.branch === "master")
      ? "main"
      : source.branch;

    return branch
      ? `https://github.com/${source.owner}/${source.repo}/tree/${branch}`
      : `https://github.com/${source.owner}/${source.repo}`;
  }

  function parseGithubUpdateUrl(value) {
    const text = String(value || "")
      .trim()
      .replace(/^www\.github\.com\//i, "")
      .replace(/^github\.com\//i, "");
    if (!text) return null;

    let url;
    try {
      url = new URL(text.startsWith("http") ? text : `https://github.com/${text}`);
    } catch {
      return null;
    }

    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;

    const parts = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    const treeIndex = parts.indexOf("tree");
    const branch = treeIndex >= 0 ? parts.slice(treeIndex + 1).join("/") : "";
    if (!/^[0-9A-Za-z_.-]+$/.test(owner) || !/^[0-9A-Za-z_.-]+$/.test(repo)) return null;
    return { owner, repo, branch };
  }

  function githubRawManifestUrl(source) {
    return (
      `https://raw.githubusercontent.com/${encodeURIComponent(source.owner)}` +
      `/${encodeURIComponent(source.repo)}/${encodeGithubPath(source.branch || "main")}/manifest.json`
    );
  }

  function encodeGithubPath(path) {
    return String(path || "")
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  function isVersion(value) {
    return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(value || ""));
  }

  function compareVersions(first, second) {
    const firstParts = String(first || "").split(/[.+-]/).map((part) => Number(part) || 0);
    const secondParts = String(second || "").split(/[.+-]/).map((part) => Number(part) || 0);
    const length = Math.max(firstParts.length, secondParts.length, 3);
    for (let index = 0; index < length; index += 1) {
      const delta = (firstParts[index] || 0) - (secondParts[index] || 0);
      if (delta !== 0) return delta;
    }
    return 0;
  }

  function showUpdateRequiredToast(version) {
    showToast(
      `PixmaxHub Plug 有新版本 ${version}，请打开扩展弹窗安装更新后再继续使用。`,
      false,
      { persistent: true }
    );
  }

  async function maybeRemindAboutUpdate() {
    try {
      const state = await storageGet({ [UPDATE_CHECK_STORAGE_KEY]: { checkedAt: 0, version: "" } });
      const reminder = state[UPDATE_CHECK_STORAGE_KEY] || {};
      const currentVersion = globalThis.chrome?.runtime?.getManifest?.().version || "";
      if (isVersion(reminder.version) && compareVersions(reminder.version, currentVersion) > 0) {
        showUpdateRequiredToast(reminder.version);
        return;
      }

      const now = Date.now();
      if (now - (Number(reminder.checkedAt) || 0) < UPDATE_REMINDER_INTERVAL_MS) return;

      await storageSet({
        [UPDATE_CHECK_STORAGE_KEY]: {
          checkedAt: now,
          version: String(reminder.version || "")
        }
      });

      const options = await syncStorageGet({ githubUpdateUrl: DEFAULT_GITHUB_UPDATE_URL });
      const source = parseGithubUpdateUrl(normalizeGithubUpdateUrl(options.githubUpdateUrl));
      if (!source) return;

      const response = await fetch(
        `${githubRawManifestUrl({ ...source, branch: source.branch || "main" })}?pixmaxHubTs=${Date.now()}`
      );
      if (!response.ok) return;
      const manifest = await response.json();
      const latestVersion = String(manifest.version || "");
      if (!isVersion(latestVersion) || compareVersions(latestVersion, currentVersion) <= 0) return;

      await storageSet({
        [UPDATE_CHECK_STORAGE_KEY]: {
          checkedAt: now,
          version: latestVersion
        }
      });
      showUpdateRequiredToast(latestVersion);
    } catch {
      // 收藏动作不应该被更新提醒影响。
    }
  }

  function hexToRgb(color) {
    const normalized = normalizeColor(color).slice(1);
    return [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16)
    ];
  }

  function setElementLikeColor(element, color) {
    if (!element) return;
    const normalized = normalizeColor(color);
    const [red, green, blue] = hexToRgb(normalized);
    element.style.setProperty("--pixmax-cloner-like-color", normalized);
    element.style.setProperty(
      "--pixmax-cloner-like-glow",
      `rgb(${red} ${green} ${blue} / 22%)`
    );
    element.style.setProperty(
      "--pixmax-cloner-like-glow-strong",
      `rgb(${red} ${green} ${blue} / 34%)`
    );
  }

  function getLikeKey(item) {
    return item?.nodeId || item?.url || "";
  }

  function getToolbarNodeId(toolbar) {
    return toolbar.closest(NODE_SELECTOR)?.dataset.id || "";
  }

  function setLikeButtonState(button, liked, color = DEFAULT_LIKE_COLOR) {
    button.dataset.liked = liked ? "true" : "false";
    button.textContent = liked ? "♥" : "♡";
    button.title = liked
      ? "Remove this Pixmax result from local Likes"
      : "Save this Pixmax result to local Likes";
    if (liked) {
      setElementLikeColor(button, color);
    } else {
      button.style.removeProperty("--pixmax-cloner-like-color");
      button.style.removeProperty("--pixmax-cloner-like-glow");
      button.style.removeProperty("--pixmax-cloner-like-glow-strong");
    }
  }

  function applyNodeElementLikedState(node, liked, color = DEFAULT_LIKE_COLOR) {
    if (!node) return;
    node.classList.toggle("pixmax-canvas-cloner-liked", liked);
    if (liked) setElementLikeColor(node, color);
  }

  function applyNodeLikedState(nodeId, liked, color = DEFAULT_LIKE_COLOR) {
    if (!nodeId) return;
    applyNodeElementLikedState(
      document.querySelector(`${NODE_SELECTOR}[data-id="${CSS.escape(nodeId)}"]`),
      liked,
      color
    );
  }

  function applyToolbarLikedState(toolbar) {
    const button = toolbar.querySelector('[data-pixmax-cloner-action="toggle-like"]');
    if (!button) return;
    const nodeId = getToolbarNodeId(toolbar);
    setLikeButtonState(button, ownLikedKeys.has(nodeId), likedColors.get(nodeId));
  }

  function applyVisibleLikedMarks() {
    for (const node of document.querySelectorAll(NODE_SELECTOR)) {
      applyNodeElementLikedState(
        node,
        likedKeys.has(node.dataset.id),
        likedColors.get(node.dataset.id)
      );
      applyNodeUnwatchedVideoState(node);
    }
    for (const toolbar of document.querySelectorAll(TOOLBAR_SELECTOR)) {
      applyToolbarLikedState(toolbar);
    }
    updateVideoHistoryLikeMarks();
  }

  function applyLikedMarksInRoot(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;

    if (root.matches?.(NODE_SELECTOR)) {
      applyNodeElementLikedState(
        root,
        likedKeys.has(root.dataset.id),
        likedColors.get(root.dataset.id)
      );
      applyNodeUnwatchedVideoState(root);
    }

    for (const node of root.querySelectorAll?.(NODE_SELECTOR) ?? []) {
      applyNodeElementLikedState(
        node,
        likedKeys.has(node.dataset.id),
        likedColors.get(node.dataset.id)
      );
      applyNodeUnwatchedVideoState(node);
    }

    const parentNode = root.closest?.(NODE_SELECTOR);
    if (parentNode) {
      applyNodeElementLikedState(
        parentNode,
        likedKeys.has(parentNode.dataset.id),
        likedColors.get(parentNode.dataset.id)
      );
      applyNodeUnwatchedVideoState(parentNode);
    }
  }

  function getFocusNodeId() {
    try {
      return new URL(location.href).searchParams.get(FOCUS_PARAM) || "";
    } catch {
      return "";
    }
  }

  function getFlowViewport(node) {
    return (
      node.closest(".svelte-flow")?.querySelector(".svelte-flow__viewport") ||
      document.querySelector(".svelte-flow__viewport")
    );
  }

  function getFlowPane(node) {
    return (
      node.closest(".svelte-flow")?.querySelector(".svelte-flow__pane") ||
      node.closest(".svelte-flow") ||
      document.querySelector(".svelte-flow__pane")
    );
  }

  function centerNodeInFlow(node, smooth = true) {
    const viewport = getFlowViewport(node);
    const pane = getFlowPane(node);
    if (!viewport || !pane || !window.DOMMatrix) return false;

    const nodeRect = node.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    if (!nodeRect.width || !nodeRect.height || !paneRect.width || !paneRect.height) return false;

    const transform = getComputedStyle(viewport).transform;
    const matrix = transform && transform !== "none" ? new DOMMatrix(transform) : new DOMMatrix();
    const scaleX = matrix.a || 1;
    const scaleY = matrix.d || scaleX;
    const previousViewport = {
      x: matrix.e,
      y: matrix.f,
      zoom: scaleX
    };
    const targetScale = Math.min(Math.max(scaleX, 0.9), 1.35);
    const nodeCenterX = nodeRect.left + nodeRect.width / 2;
    const nodeCenterY = nodeRect.top + nodeRect.height / 2;
    const flowCenterX = (nodeCenterX - paneRect.left - matrix.e) / scaleX;
    const flowCenterY = (nodeCenterY - paneRect.top - matrix.f) / scaleY;
    const nextX = paneRect.width / 2 - flowCenterX * targetScale;
    const nextY = paneRect.height / 2 - flowCenterY * targetScale;

    if (smooth) {
      viewport.classList.add("pixmax-canvas-cloner-moving");
      window.setTimeout(() => {
        viewport.classList.remove("pixmax-canvas-cloner-moving");
      }, 320);
    }

    viewport.style.transformOrigin = "0 0";
    viewport.style.transform = `translate(${nextX}px, ${nextY}px) scale(${targetScale})`;
    scheduleOfficialWorkflowViewportPersist({
      x: nextX,
      y: nextY,
      zoom: targetScale
    }, previousViewport);
    return true;
  }

  function isCloseViewport(first, second) {
    if (!first || !second) return false;
    return (
      Math.abs(Number(first.x) - Number(second.x)) < 2 &&
      Math.abs(Number(first.y) - Number(second.y)) < 2 &&
      Math.abs(Number(first.zoom) - Number(second.zoom)) < 0.002
    );
  }

  function getOfficialViewportStorageKeys(fileUuid, previousViewport) {
    const prefix = "pixmax.genNodeHabit.v1:";
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      keys.push(key);
    }
    const matchingKeys = keys.filter((key) => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || "{}");
        return isCloseViewport(data.workflowViewports?.[fileUuid], previousViewport);
      } catch {
        return false;
      }
    });
    return matchingKeys.length ? matchingKeys : keys.length ? keys : [`${prefix}_guest`];
  }

  function persistOfficialWorkflowViewport(viewport, previousViewport) {
    const fileUuid = getCurrentFileUuid();
    if (!fileUuid || !viewport) return;
    for (const key of getOfficialViewportStorageKeys(fileUuid, previousViewport)) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || "{}");
        if (!data || typeof data !== "object") continue;
        data.workflowViewports = data.workflowViewports && typeof data.workflowViewports === "object"
          ? data.workflowViewports
          : {};
        data.workflowViewports[fileUuid] = {
          x: viewport.x,
          y: viewport.y,
          zoom: viewport.zoom
        };
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        // Ignore local Pixmax viewport persistence failures; DOM focus still works.
      }
    }
  }

  function cancelPendingOfficialWorkflowViewportPersist() {
    for (const timer of officialViewportPersistTimers) {
      window.clearTimeout(timer);
    }
    officialViewportPersistTimers = new Set();
  }

  function scheduleOfficialWorkflowViewportPersist(viewport, previousViewport) {
    cancelPendingOfficialWorkflowViewportPersist();
    persistOfficialWorkflowViewport(viewport, previousViewport);
    for (const delay of [80, 260]) {
      const timer = window.setTimeout(() => {
        officialViewportPersistTimers.delete(timer);
        persistOfficialWorkflowViewport(viewport, previousViewport);
      }, delay);
      officialViewportPersistTimers.add(timer);
    }
  }

  function clearFocusParam() {
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has(FOCUS_PARAM)) return;
      url.searchParams.delete(FOCUS_PARAM);
      url.searchParams.delete(FOCUS_RECT_PARAM);
      url.searchParams.delete(FOCUS_ZOOM_PARAM);
      history.replaceState(history.state, "", url.href);
    } catch {
      // Ignore URL cleanup failures.
    }
  }

  function focusNode(nodeId, deadline = Date.now() + 10000) {
    if (!nodeId) return;
    const node = document.querySelector(`${NODE_SELECTOR}[data-id="${CSS.escape(nodeId)}"]`);

    if (!node) {
      if (Date.now() < deadline) {
        window.setTimeout(() => focusNode(nodeId, deadline), 350);
      } else {
        showToast("Could not find the liked Pixmax node on this canvas.", true);
      }
      return;
    }

    centerNodeInFlow(node, false);
    clearFocusParam();
    window.dispatchEvent(new CustomEvent(FOCUS_COMPLETE_EVENT));
    document.dispatchEvent(new CustomEvent(FOCUS_COMPLETE_EVENT));
    window.setTimeout(() => {
      node.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
      node.classList.add("pixmax-canvas-cloner-focus");
      window.setTimeout(() => node.classList.remove("pixmax-canvas-cloner-focus"), 2600);
      showToast("Focused liked Pixmax result.");
    }, 300);
  }

  async function getLikedItems() {
    const result = await storageGet({ [LIKES_STORAGE_KEY]: [] });
    return Array.isArray(result[LIKES_STORAGE_KEY]) ? result[LIKES_STORAGE_KEY] : [];
  }

  async function getVisibleLikedState() {
    const sharedOptions = await getSharedLikeOptions();
    if (sharedOptions.enabled) {
      const result = await requestBridge(
        "get-shared-liked-items",
        {
          fileUuid: sharedOptions.fileUuid,
          ownerName: sharedOptions.ownerName,
          color: sharedOptions.color,
          lightweight: true
        },
        15000
      );
      const allKeys = Array.isArray(result.allKeys)
        ? result.allKeys
        : (Array.isArray(result.allItems) ? result.allItems : []).map(getLikeKey).filter(Boolean);
      const ownKeys = Array.isArray(result.ownKeys)
        ? result.ownKeys
        : (Array.isArray(result.ownItems) ? result.ownItems : []).map(getLikeKey).filter(Boolean);
      return {
        shared: true,
        allKeys,
        ownKeys,
        colorByKey: result.colorByKey || {}
      };
    }

    const localItems = await getLikedItems();
    return {
      shared: false,
      allItems: localItems,
      ownItems: localItems
    };
  }

  function buildColorMap(state) {
    const colorByKey = state.colorByKey || {};
    if (colorByKey && typeof colorByKey === "object") {
      return new Map(
        Object.entries(colorByKey)
          .map(([key, color]) => [key, normalizeColor(color)])
          .filter(([key]) => key)
      );
    }

    const items = Array.isArray(state.allItems) ? state.allItems : [];
    return new Map(
      items
        .map((item) => [getLikeKey(item), normalizeColor(item.likedByColor)])
        .filter(([key]) => key)
    );
  }

  async function refreshLikedState() {
    try {
      const state = await getVisibleLikedState();
      likedKeys = new Set(
        Array.isArray(state.allKeys)
          ? state.allKeys
          : state.allItems.map(getLikeKey).filter(Boolean)
      );
      ownLikedKeys = new Set(
        Array.isArray(state.ownKeys)
          ? state.ownKeys
          : state.ownItems.map(getLikeKey).filter(Boolean)
      );
      likedColors = buildColorMap(state);
      applyVisibleLikedMarks();
      scheduleToolbarSync(document.body);
    } catch {
      likedKeys = new Set();
      ownLikedKeys = new Set();
      likedColors = new Map();
    }
  }

  async function saveLikedItems(items) {
    await storageSet({ [LIKES_STORAGE_KEY]: items });
  }

  async function toggleSelectedLike(button) {
    try {
      const item = await requestBridge("get-selected-like-asset");
      await toggleLikeItem(item, button);
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function toggleNodeLike(nodeId, button) {
    try {
      const item = await requestBridge("get-node-like-asset", { nodeId });
      await toggleLikeItem(item, button);
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function toggleLikeItem(item, button) {
    if (button) button.disabled = true;
    try {
      const likeKey = getLikeKey(item);
      if (!likeKey) throw new Error("Selected Pixmax item has no stable Like key.");

      const sharedOptions = await getSharedLikeOptions();
      if (sharedOptions.enabled) {
        const result = await requestBridge(
          "toggle-shared-like",
          {
            fileUuid: sharedOptions.fileUuid,
            ownerName: sharedOptions.ownerName,
            color: sharedOptions.color,
            item,
            lightweight: true
          },
          20000
        );
        if (result.partialState) {
          if (result.liked) {
            likedKeys.add(likeKey);
            ownLikedKeys.add(likeKey);
            likedColors.set(likeKey, sharedOptions.color);
          } else {
            likedKeys.delete(likeKey);
            ownLikedKeys.delete(likeKey);
            likedColors.delete(likeKey);
          }
          if (button) setLikeButtonState(button, result.liked, sharedOptions.color);
          applyNodeLikedState(item.nodeId, result.liked, sharedOptions.color);
          updateVideoHistoryLikeMarks();
          window.setTimeout(refreshLikedState, 2200);
        } else {
          const allKeys = Array.isArray(result.allKeys)
            ? result.allKeys
            : (Array.isArray(result.allItems) ? result.allItems : []).map(getLikeKey).filter(Boolean);
          const ownKeys = Array.isArray(result.ownKeys)
            ? result.ownKeys
            : (Array.isArray(result.ownItems) ? result.ownItems : []).map(getLikeKey).filter(Boolean);
          likedKeys = new Set(allKeys);
          ownLikedKeys = new Set(ownKeys);
          likedColors = buildColorMap(result);
          if (button) setLikeButtonState(button, ownLikedKeys.has(likeKey), likedColors.get(likeKey));
          applyVisibleLikedMarks();
        }
        showToast(result.liked ? "Added to shared Likes." : "Removed from shared Likes.");
        window.setTimeout(maybeRemindAboutUpdate, 800);
        return;
      }

      const likedItems = await getLikedItems();
      const existingIndex = likedItems.findIndex((likedItem) => getLikeKey(likedItem) === likeKey);

      if (existingIndex >= 0) {
        likedItems.splice(existingIndex, 1);
        await saveLikedItems(likedItems);
        likedKeys.delete(likeKey);
        ownLikedKeys.delete(likeKey);
        likedColors.delete(likeKey);
        if (button) setLikeButtonState(button, false);
        applyNodeLikedState(item.nodeId, false);
        updateVideoHistoryLikeMarks();
        showToast("Removed from Likes.");
        window.setTimeout(maybeRemindAboutUpdate, 800);
        return;
      }

      await saveLikedItems([
        {
          ...item,
          likedAt: new Date().toISOString()
        },
        ...likedItems
      ]);
      likedKeys.add(likeKey);
      ownLikedKeys.add(likeKey);
      likedColors.set(likeKey, DEFAULT_LIKE_COLOR);
      if (button) setLikeButtonState(button, true, DEFAULT_LIKE_COLOR);
      applyNodeLikedState(item.nodeId, true, DEFAULT_LIKE_COLOR);
      updateVideoHistoryLikeMarks();
      showToast("Added to Likes.");
      window.setTimeout(maybeRemindAboutUpdate, 800);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function requestExtension(action, payload, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const requestId = createRequestId();
      const timer = window.setTimeout(() => {
        extensionRequests.delete(requestId);
        reject(new Error("扩展后台响应超时，请刷新 Pixmax 页面后重试。"));
      }, timeout);

      extensionRequests.set(requestId, { resolve, reject, timer });
      window.dispatchEvent(
        new CustomEvent(EXTENSION_REQUEST_EVENT, {
          detail: JSON.stringify({
            action,
            payload,
            requestId
          })
        })
      );
    });
  }

  function createEagleButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.pixmaxClonerAction = "eagle-import";
    button.title = "将当前素材直接导入已设置的 Eagle 目录";
    button.textContent = "存入 Eagle";
    return button;
  }

  function createLikeButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.pixmaxClonerAction = "toggle-like";
    setLikeButtonState(button, false);
    return button;
  }

  function createActions(includeEagle) {
    const actions = document.createElement("span");
    actions.className = ACTIONS_CLASS;
    actions.innerHTML = `
      <button type="button" data-pixmax-cloner-action="select-neighbors" title="只多选主节点和直接连线节点">选中</button>
      <button type="button" data-pixmax-cloner-action="duplicate-neighbors" title="官方快捷键：复制后保留连线粘贴">创建副本</button>
    `;
    if (includeEagle) {
      actions.append(createLikeButton());
      actions.append(createEagleButton());
    }

    actions.addEventListener("pointerdown", (event) => event.stopPropagation());
    actions.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-pixmax-cloner-action]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.pixmaxClonerAction === "eagle-import") {
        importSelectedAssetToEagle(button);
        return;
      }
      if (button.dataset.pixmaxClonerAction === "toggle-like") {
        toggleSelectedLike(button);
        return;
      }
      runAction(button.dataset.pixmaxClonerAction, button);
    });

    return actions;
  }

  function isTextAreaPromptEditor(editor) {
    return editor instanceof HTMLTextAreaElement;
  }

  function getPromptEditorValue(editor) {
    return isTextAreaPromptEditor(editor) ? editor.value : (editor.textContent || "");
  }

  function dispatchPromptEditorInput(editor, inputType = "insertReplacementText") {
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType,
        data: null
      })
    );
  }

  function getPromptEditorTextNodes(editor) {
    const nodes = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    return nodes;
  }

  function getPromptEditorDomPoint(editor, offset) {
    let remaining = Math.max(0, offset);
    const nodes = getPromptEditorTextNodes(editor);
    for (const node of nodes) {
      const length = node.nodeValue?.length || 0;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
    }
    const last = nodes.at(-1);
    if (last) return { node: last, offset: last.nodeValue?.length || 0 };
    return { node: editor, offset: 0 };
  }

  function selectPromptEditorRange(editor, start, end, focusEditor = true) {
    if (isTextAreaPromptEditor(editor)) {
      editor.setSelectionRange(start, end);
      if (focusEditor) editor.focus({ preventScroll: true });
      return;
    }

    const selection = window.getSelection();
    if (!selection) return;
    const startPoint = getPromptEditorDomPoint(editor, start);
    const endPoint = getPromptEditorDomPoint(editor, end);
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    if (focusEditor) editor.focus({ preventScroll: true });
  }

  function setPromptEditorValue(editor, value, selectionStart = value.length, selectionEnd = selectionStart) {
    if (isTextAreaPromptEditor(editor)) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      if (descriptor?.set) descriptor.set.call(editor, value);
      else editor.value = value;
      dispatchPromptEditorInput(editor);
      selectPromptEditorRange(editor, selectionStart, selectionEnd);
      return;
    }

    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const replaced = document.execCommand?.("insertText", false, value);
    if (!replaced) {
      editor.textContent = value;
      dispatchPromptEditorInput(editor);
    }
    selectPromptEditorRange(editor, selectionStart, selectionEnd);
  }

  function replacePromptEditorRange(editor, start, end, replacement) {
    if (isTextAreaPromptEditor(editor)) {
      const value = getPromptEditorValue(editor);
      const nextValue = value.slice(0, start) + replacement + value.slice(end);
      setPromptEditorValue(editor, nextValue, start, start + replacement.length);
      return;
    }

    selectPromptEditorRange(editor, start, end);
    const replaced = document.execCommand?.("insertText", false, replacement);
    if (!replaced) {
      const value = getPromptEditorValue(editor);
      setPromptEditorValue(
        editor,
        value.slice(0, start) + replacement + value.slice(end),
        start,
        start + replacement.length
      );
    }
  }

  function isProtectedPromptRichElement(element) {
    return Boolean(
      element.matches?.("img, video, audio, [contenteditable='false'], [data-mention], [data-type*='mention']") ||
      element.querySelector?.("img, video, audio, [contenteditable='false'], [data-mention], [data-type*='mention']")
    );
  }

  function isBlankPromptLineElement(element) {
    if (!(element instanceof HTMLElement) || isProtectedPromptRichElement(element)) return false;
    const text = (element.innerText || element.textContent || "")
      .replace(/[\u00a0\u200b\ufeff]/g, "")
      .trim();
    if (text) return false;
    return /^(P|DIV|LI)$/i.test(element.tagName);
  }

  function removeEmptyLinesFromRichPromptEditor(editor) {
    let removedCount = 0;
    let changed = false;
    const lineCandidates = [...editor.querySelectorAll("p, div, li")].filter(
      (element) => !element.querySelector("p, div, li")
    );

    for (const line of [...lineCandidates].reverse()) {
      if (!line.isConnected || !isBlankPromptLineElement(line)) continue;
      line.remove();
      removedCount += 1;
      changed = true;
    }

    let previousBreak = null;
    for (const breakElement of [...editor.querySelectorAll("br")]) {
      if (!breakElement.isConnected) continue;
      if (!previousBreak?.isConnected) {
        previousBreak = breakElement;
        continue;
      }

      const betweenRange = document.createRange();
      betweenRange.setStartAfter(previousBreak);
      betweenRange.setEndBefore(breakElement);
      const betweenFragment = betweenRange.cloneContents();
      const betweenText = (betweenFragment.textContent || "")
        .replace(/[\u00a0\u200b\ufeff]/g, "")
        .trim();
      const containsProtectedReference = Boolean(
        betweenFragment.querySelector?.(
          "img, video, audio, [contenteditable='false'], [data-mention], [data-type*='mention']"
        )
      );
      if (betweenText || containsProtectedReference) {
        previousBreak = breakElement;
        continue;
      }

      breakElement.remove();
      removedCount += 1;
      changed = true;
    }

    for (const textNode of getPromptEditorTextNodes(editor)) {
      if (!textNode.nodeValue?.includes("\n")) continue;
      if (textNode.parentElement?.closest("[contenteditable='false'], [data-mention], [data-type*='mention']")) {
        continue;
      }
      let nodeRemovedCount = 0;
      const nextValue = textNode.nodeValue.replace(
        /\r?\n[\t \u00a0\u200b\ufeff]*(?=\r?\n)/g,
        () => {
          nodeRemovedCount += 1;
          return "";
        }
      );
      if (!nodeRemovedCount) continue;
      textNode.nodeValue = nextValue;
      removedCount += nodeRemovedCount;
      changed = true;
    }

    if (changed) dispatchPromptEditorInput(editor, "deleteContentBackward");
    return removedCount;
  }

  function getPromptMatches(text, query) {
    const needle = query.toLocaleLowerCase();
    if (!needle) return [];
    const haystack = text.toLocaleLowerCase();
    const matches = [];
    let position = 0;
    while (position <= haystack.length - needle.length) {
      const index = haystack.indexOf(needle, position);
      if (index < 0) break;
      matches.push({ start: index, end: index + query.length });
      position = index + Math.max(query.length, 1);
    }
    return matches;
  }

  function createPromptTools(editor) {
    const tools = document.createElement("div");
    tools.className = PROMPT_TOOLS_CLASS;
    tools.dataset.open = "false";
    tools.innerHTML = `
      <button type="button" class="pixmax-prompt-tools-toggle" data-prompt-action="toggle" title="打开提示词查找与整理工具">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"></circle><path d="m12.5 12.5 4 4"></path></svg>
        <span>查找</span>
      </button>
      <div class="pixmax-prompt-tools-panel">
        <input type="search" class="pixmax-prompt-search-input" placeholder="搜索提示词" aria-label="搜索提示词文字">
        <button type="button" data-prompt-action="search" title="开始搜索">搜索</button>
        <span class="pixmax-prompt-match-count" aria-live="polite">待搜索</span>
        <button type="button" data-prompt-action="previous" title="上一个匹配">↑</button>
        <button type="button" data-prompt-action="next" title="下一个匹配">↓</button>
        <input type="text" class="pixmax-prompt-replace-input" placeholder="替换为…" aria-label="替换文字">
        <button type="button" data-prompt-action="replace" title="替换当前高亮匹配">替换</button>
        <button type="button" data-prompt-action="replace-all" title="替换所有匹配">全部替换</button>
        <button type="button" class="pixmax-prompt-remove-empty-lines" data-prompt-action="remove-empty-lines" title="删除只含空格的行">删除空行</button>
      </div>
    `;

    const searchInput = tools.querySelector(".pixmax-prompt-search-input");
    const replaceInput = tools.querySelector(".pixmax-prompt-replace-input");
    const count = tools.querySelector(".pixmax-prompt-match-count");
    let currentIndex = -1;
    let activeQuery = "";

    const setResultButtonsDisabled = (disabled) => {
      for (const button of tools.querySelectorAll('[data-prompt-action="previous"], [data-prompt-action="next"]')) {
        button.disabled = disabled;
      }
    };

    const syncQueryActionButtons = () => {
      const disabled = !searchInput.value;
      for (const button of tools.querySelectorAll('[data-prompt-action="search"], [data-prompt-action="replace"], [data-prompt-action="replace-all"]')) {
        button.disabled = disabled;
      }
    };

    const refresh = (direction = 0, selectMatch = true, focusEditor = true) => {
      const editorValue = getPromptEditorValue(editor);
      const matches = getPromptMatches(editorValue, activeQuery);
      if (!matches.length) {
        currentIndex = -1;
        count.textContent = "0/0";
        setResultButtonsDisabled(true);
        return matches;
      }

      if (direction) currentIndex = (currentIndex + direction + matches.length) % matches.length;
      else {
        if (isTextAreaPromptEditor(editor)) {
          const selectionStart = editor.selectionStart;
          const containingIndex = matches.findIndex(
            (match) => selectionStart >= match.start && selectionStart <= match.end
          );
          currentIndex = containingIndex >= 0 ? containingIndex : 0;
        } else {
          currentIndex = Math.min(Math.max(currentIndex, 0), matches.length - 1);
        }
      }
      count.textContent = `${currentIndex + 1}/${matches.length}`;
      setResultButtonsDisabled(false);
      if (selectMatch) {
        const match = matches[currentIndex];
        selectPromptEditorRange(editor, match.start, match.end, focusEditor);
      }
      return matches;
    };

    const startSearch = (direction = 1, focusEditor = true) => {
      activeQuery = searchInput.value;
      currentIndex = direction < 0 ? 0 : -1;
      if (!activeQuery) {
        count.textContent = "待搜索";
        setResultButtonsDisabled(true);
        syncQueryActionButtons();
        searchInput.focus({ preventScroll: true });
        return [];
      }
      return refresh(direction, true, focusEditor);
    };

    const ensureCurrentSearch = () => {
      if (activeQuery === searchInput.value && activeQuery) return refresh(0, false);
      return startSearch(1, false);
    };

    const replaceCurrent = () => {
      const matches = ensureCurrentSearch();
      if (!matches.length) return;
      const match = matches[currentIndex];
      const replacement = replaceInput.value;
      replacePromptEditorRange(editor, match.start, match.end, replacement);
      refresh(0);
    };

    const replaceAll = () => {
      activeQuery = searchInput.value;
      const editorValue = getPromptEditorValue(editor);
      const matches = getPromptMatches(editorValue, activeQuery);
      if (!matches.length) return;
      const replacement = replaceInput.value;
      if (isTextAreaPromptEditor(editor)) {
        let nextValue = "";
        let lastEnd = 0;
        for (const match of matches) {
          nextValue += editorValue.slice(lastEnd, match.start) + replacement;
          lastEnd = match.end;
        }
        nextValue += editorValue.slice(lastEnd);
        setPromptEditorValue(editor, nextValue);
      } else {
        for (const match of [...matches].reverse()) {
          replacePromptEditorRange(editor, match.start, match.end, replacement);
        }
      }
      refresh(0, false);
      showToast(`已替换 ${matches.length} 处文字。`);
    };

    const removeEmptyLines = () => {
      try {
        let removedCount = 0;
        if (isTextAreaPromptEditor(editor)) {
          const lines = editor.value.split(/\r?\n/);
          const keptLines = lines.filter((line) => line.trim() !== "");
          removedCount = lines.length - keptLines.length;
          if (removedCount) setPromptEditorValue(editor, keptLines.join("\n"));
        } else {
          removedCount = removeEmptyLinesFromRichPromptEditor(editor);
        }
        if (!removedCount) {
          showToast("提示词里没有检测到可删除的空行。");
          return;
        }
        refresh(0, false);
        showToast(`已删除 ${removedCount} 个空行，引用内容保持不变。`);
      } catch (error) {
        showToast(`删除空行失败：${error.message || "编辑器结构无法识别"}`, true);
      }
    };

    searchInput.addEventListener("input", () => {
      activeQuery = "";
      currentIndex = -1;
      count.textContent = searchInput.value ? "待搜索" : "—";
      setResultButtonsDisabled(true);
      syncQueryActionButtons();
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      startSearch(event.shiftKey ? -1 : 1);
    });
    replaceInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) replaceAll();
      else replaceCurrent();
    });
    tools.addEventListener("pointerdown", (event) => event.stopPropagation());
    tools.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-prompt-action]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.promptAction;
      if (action === "toggle") {
        const willOpen = tools.dataset.open !== "true";
        tools.dataset.open = String(willOpen);
        button.querySelector("span").textContent = willOpen ? "收起" : "查找";
        if (willOpen) searchInput.focus({ preventScroll: true });
        return;
      }
      if (action === "search") startSearch(1);
      if (action === "previous") refresh(-1);
      if (action === "next") refresh(1);
      if (action === "replace") replaceCurrent();
      if (action === "replace-all") replaceAll();
      if (action === "remove-empty-lines") removeEmptyLines();
    });
    tools.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Escape") return;
      tools.dataset.open = "false";
      tools.querySelector(".pixmax-prompt-tools-toggle span").textContent = "查找";
      tools.querySelector(".pixmax-prompt-tools-toggle").focus({ preventScroll: true });
    });
    tools.addEventListener("keyup", (event) => event.stopPropagation());
    editor.addEventListener("input", () => {
      if (activeQuery) refresh(0, false);
    });
    setResultButtonsDisabled(true);
    syncQueryActionButtons();
    return tools;
  }

  function findPromptToolsTabAnchor(node) {
    const matchingElements = [...node.querySelectorAll("button, [role='tab'], [role='button'], div, span")]
      .filter((element) => element.textContent?.trim() === "首尾帧");
    if (!matchingElements.length) return null;

    let anchor = matchingElements.find(
      (element) => element.matches("button, [role='tab'], [role='button']")
    ) || matchingElements.at(-1);
    while (
      anchor.parentElement &&
      anchor.parentElement !== node &&
      anchor.parentElement.textContent?.trim() === "首尾帧"
    ) {
      anchor = anchor.parentElement;
    }
    return anchor;
  }

  function isPromptEditor(editor) {
    const isContentEditable = editor instanceof HTMLElement && editor.isContentEditable;
    const label = [
      editor.getAttribute?.("aria-label"),
      editor.getAttribute?.("data-placeholder"),
      editor.getAttribute?.("placeholder"),
      editor.className
    ]
      .filter((value) => typeof value === "string")
      .join(" ");
    const rect = editor.getBoundingClientRect?.() || { height: 0 };
    return (
      (isTextAreaPromptEditor(editor) || isContentEditable) &&
      Boolean(editor.closest(NODE_SELECTOR)) &&
      !editor.closest(`.${PROMPT_TOOLS_CLASS}, #${VIDEO_HISTORY_PANEL_ID}`) &&
      (
        isTextAreaPromptEditor(editor) ||
        editor.getAttribute("aria-multiline") === "true" ||
        /prosemirror|prompt|提示|描述|输入/i.test(label) ||
        rect.height >= 60
      )
    );
  }

  function syncPromptTools() {
    promptToolsSyncScheduled = false;
    const candidates = new Set();
    const roots = [...pendingPromptToolRoots];
    pendingPromptToolRoots.clear();
    for (const root of roots) {
      if (root?.matches?.('textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) {
        candidates.add(root);
      }
      for (const editor of root?.querySelectorAll?.('textarea, [contenteditable="true"], [contenteditable="plaintext-only"]') ?? []) {
        candidates.add(editor);
      }
      const containingNode = root?.closest?.(NODE_SELECTOR);
      for (const editor of containingNode?.querySelectorAll?.('textarea, [contenteditable="true"], [contenteditable="plaintext-only"]') ?? []) {
        candidates.add(editor);
      }
    }
    for (const editor of candidates) {
      if (!isPromptEditor(editor) || editor.dataset.pixmaxPromptToolsMounted === "true") continue;
      const host = editor.closest(NODE_SELECTOR);
      if (!host) continue;
      const tabAnchor = findPromptToolsTabAnchor(host);
      if (!tabAnchor) continue;
      editor.dataset.pixmaxPromptToolsMounted = "true";
      editor.classList.add(PROMPT_EDITOR_CLASS);
      host.classList.add(PROMPT_TOOLS_HOST_CLASS);
      tabAnchor.insertAdjacentElement("afterend", createPromptTools(editor));
    }
  }

  function schedulePromptToolsSync(root = document.body) {
    if (root) pendingPromptToolRoots.add(root);
    if (promptToolsSyncScheduled) return;
    promptToolsSyncScheduled = true;
    window.requestAnimationFrame(syncPromptTools);
  }

  function hasNativeDownloadAction(toolbar) {
    return [...toolbar.querySelectorAll("button")].some(
      (button) =>
        !button.closest(`.${ACTIONS_CLASS}`) &&
        button.textContent.trim() === "下载"
    );
  }

  function mountToolbarActions(toolbar) {
    const existingActions = toolbar.querySelector(`.${ACTIONS_CLASS}`);
    if (existingActions) {
      if (
        hasNativeDownloadAction(toolbar) &&
        !existingActions.querySelector('[data-pixmax-cloner-action="toggle-like"]')
      ) {
        existingActions.append(createLikeButton());
      }
      if (
        hasNativeDownloadAction(toolbar) &&
        !existingActions.querySelector('[data-pixmax-cloner-action="eagle-import"]')
      ) {
        existingActions.append(createEagleButton());
      }
      applyToolbarLikedState(toolbar);
      return;
    }
    if (!toolbar.querySelector("button")) return;

    const actions = createActions(hasNativeDownloadAction(toolbar));
    const target = toolbar.firstElementChild ?? toolbar;
    target.prepend(actions);
    applyToolbarLikedState(toolbar);
  }

  function isNativePasteWithLinksButton(button) {
    return (
      !button.classList.contains(CONTEXT_PASTE_CLASS) &&
      button.textContent.replace(/\s+/g, "").includes("粘贴（保留连线）")
    );
  }

  async function runContextPasteRepair(nativeButton, customButton, fallbackPoint) {
    customButton.disabled = true;
    try {
      await requestBridge("prepare-paste-repair", {}, 3000);
      const point = lastContextMenuPoint ?? fallbackPoint;
      nativeButton.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: point.x,
          clientY: point.y
        })
      );
      showToast("正在粘贴带连线副本，并修复 @节点 引用...");
    } catch (error) {
      showToast(error.message, true);
      customButton.disabled = false;
    }
  }

  function mountContextPasteAction(nativeButton) {
    if (nativeButton.parentElement?.querySelector(`.${CONTEXT_PASTE_CLASS}`)) return;

    const customButton = nativeButton.cloneNode(true);
    customButton.classList.add(CONTEXT_PASTE_CLASS);
    customButton.removeAttribute("id");
    customButton.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    customButton.textContent = "粘贴（保留连线并修复 @）";
    customButton.title = "保留官方连线粘贴行为，并将提示词里的 @节点 指向新副本";
    customButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      runContextPasteRepair(nativeButton, customButton, {
        x: event.clientX,
        y: event.clientY
      });
    });
    nativeButton.after(customButton);
  }

  function syncContextPasteActions() {
    for (const button of document.querySelectorAll("button")) {
      if (isNativePasteWithLinksButton(button)) {
        mountContextPasteAction(button);
      }
    }
  }

  function syncToolbars() {
    toolbarSyncScheduled = false;
    ensureStyle();
    const roots = [...pendingToolbarRoots];
    pendingToolbarRoots.clear();

    for (const root of roots) {
      if (!root || root.nodeType !== Node.ELEMENT_NODE) continue;
      applyLikedMarksInRoot(root);
      const parentToolbar = root.closest?.(TOOLBAR_SELECTOR);
      if (parentToolbar) {
        mountToolbarActions(parentToolbar);
      }
      if (root.matches?.(TOOLBAR_SELECTOR)) {
        mountToolbarActions(root);
      }
      for (const toolbar of root.querySelectorAll?.(TOOLBAR_SELECTOR) ?? []) {
        mountToolbarActions(toolbar);
      }
    }
  }

  function scheduleToolbarSync(root = document.body) {
    if (root) pendingToolbarRoots.add(root);
    if (toolbarSyncScheduled) return;
    toolbarSyncScheduled = true;
    window.requestAnimationFrame(syncToolbars);
  }

  function scheduleContextPasteSync() {
    if (contextPasteSyncScheduled) return;
    contextPasteSyncScheduled = true;
    window.setTimeout(() => {
      contextPasteSyncScheduled = false;
      syncContextPasteActions();
    }, 50);
  }

  function scheduleOpenLikesButtonRetries() {
    for (const delay of [250, 800, 1600, 3200]) {
      window.setTimeout(() => {
        ensureOpenLikesButton();
        ensureVideoHistoryEntry();
      }, delay);
    }
  }

  function mount() {
    if (!document.body) return;
    cleanupLegacyCanvasUi();
    ensureStyle();
    ensureTopActionButtons();
    ensureVideoHistoryEntry();
    scheduleOpenLikesButtonRetries();
    loadPerformanceModeSetting();
    loadCachedVideoHistory()
      .then(() => renderVideoHistoryPanel())
      .catch(() => {});
    refreshLikedState();
    syncLiveCollabState();
    focusNode(getFocusNodeId());
    globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === "local" && changes[LIKES_STORAGE_KEY]) {
        const items = Array.isArray(changes[LIKES_STORAGE_KEY].newValue)
          ? changes[LIKES_STORAGE_KEY].newValue
          : [];
        likedKeys = new Set(items.map(getLikeKey).filter(Boolean));
        ownLikedKeys = new Set(items.map(getLikeKey).filter(Boolean));
        likedColors = buildColorMap({ allItems: items });
        applyVisibleLikedMarks();
        updateVideoHistoryLikeMarks();
      }
      if (areaName === "local" && changes[PERFORMANCE_MODE_STORAGE_KEY]) {
        setPerformanceModeEnabled(Boolean(changes[PERFORMANCE_MODE_STORAGE_KEY].newValue), {
          persist: false
        });
      }
      if (areaName === "local" && changes[WATCHED_VIDEO_STORAGE_KEY]) {
        watchedVideoKeys = new Set(normalizeWatchedVideoKeys(changes[WATCHED_VIDEO_STORAGE_KEY].newValue));
        applyVisibleUnwatchedVideoMarks();
        updateVideoHistoryUnreadMarks();
      }
      if (areaName === "local" && (changes.pixmaxKnownVideoKeys || changes.pixmaxUnreadVideoKeys)) {
        if (changes.pixmaxKnownVideoKeys) {
          knownVideoKeys = new Set(normalizeWatchedVideoKeys(changes.pixmaxKnownVideoKeys.newValue));
        }
        if (changes.pixmaxUnreadVideoKeys) {
          unreadVideoKeys = new Set(normalizeWatchedVideoKeys(changes.pixmaxUnreadVideoKeys.newValue));
        }
        applyVisibleUnwatchedVideoMarks();
        updateVideoHistoryUnreadMarks();
      }
      if (areaName === "local" && changes[VIDEO_HISTORY_STORAGE_KEY]) {
        loadCachedVideoHistory()
          .then(() => {
            if (videoHistoryOpen) renderVideoHistoryPanel();
          })
          .catch(() => {});
      }
      if (
        areaName === "sync" &&
        (changes.sharedLikesEnabled ||
          changes.sharedLikesFileUuid ||
          changes.sharedLikesOwnerName ||
          changes.sharedLikesColor)
      ) {
        refreshLikedState();
        refreshWatchedVideoState();
      }
      if (
        areaName === "sync" &&
        (changes.liveCollabEnabled || changes.sharedLikesOwnerName || changes.sharedLikesColor)
      ) {
        syncLiveCollabState();
      }
    });
    scheduleToolbarSync(document.body);
    schedulePromptToolsSync(document.body);
    refreshWatchedVideoState();
    document.addEventListener("play", handleVideoPlay, true);
    document.addEventListener("loadedmetadata", handleVideoMetadata, true);
    document.addEventListener("pointerdown", handlePerformancePointerDown, true);
    document.addEventListener("pointermove", handlePerformancePointerMove, true);
    document.addEventListener("pointerup", handlePerformancePointerUp, true);
    document.addEventListener("pointercancel", handlePerformancePointerUp, true);
    document.addEventListener("keydown", () => schedulePerformanceUpdate(0), true);
    document.addEventListener("keyup", () => schedulePerformanceUpdate(0), true);
    window.addEventListener("wheel", handlePerformanceWheel, { passive: true, capture: true });
    window.addEventListener("resize", () => {
      schedulePerformanceUpdate(0);
      if (videoHistoryOpen) scheduleVideoHistoryPanelPositioning();
    });
    window.addEventListener("focus", refreshWatchedVideoState);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshWatchedVideoState();
    });
    document.addEventListener(
      "contextmenu",
      (event) => {
        lastContextMenuPoint = {
          x: event.clientX,
          y: event.clientY
        };
        scheduleContextPasteSync();
      },
      true
    );
    new MutationObserver((mutations) => {
      scheduleLegacyCleanup();
      ensureTopActionButtons();
      scheduleVideoHistoryEntrySync();
      autoResolveCollaborationConflict();
      scheduleOfficialPresenceAppearance();
      neutralizeOfficialFocusColors();
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;
        const addedElements = [...mutation.addedNodes].filter((node) => node.nodeType === Node.ELEMENT_NODE);
        if (
          addedElements.some((element) =>
            !element.closest?.(`#${VIDEO_HISTORY_PANEL_ID}`) &&
            (
              element.matches?.(`${NODE_SELECTOR}, video`) ||
              element.querySelector?.(`${NODE_SELECTOR}, video`)
            )
          )
        ) {
          scheduleVideoHistoryRefresh(videoHistoryOpen ? 1400 : 2600);
          break;
        }
      }
      if (performanceModeEnabled) {
        let shouldRefreshPerformance = false;
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            markPerformanceCacheDirty();
            shouldRefreshPerformance = true;
          }
          if (
            mutation.type === "attributes" &&
            (mutation.attributeName === "aria-selected" || mutation.attributeName === "data-selected")
          ) {
            shouldRefreshPerformance = true;
          }
        }
        if (shouldRefreshPerformance) schedulePerformanceUpdate(80);
      }
      if (liveOptions?.enabled) {
        for (const mutation of mutations) {
          if (
            mutation.type === "attributes" &&
            (mutation.attributeName === "aria-selected" ||
              mutation.attributeName === "data-selected" ||
              (mutation.attributeName === "class" && didSelectedClassChange(mutation)))
          ) {
            scheduleLiveFocusBroadcast("selection-mutation", 80);
            break;
          }
        }
      }
      for (const mutation of mutations) {
        scheduleToolbarSync(mutation.target);
        schedulePromptToolsSync(mutation.target);
        for (const node of mutation.addedNodes) {
          scheduleToolbarSync(node);
          schedulePromptToolsSync(node);
        }
      }
    }).observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "aria-selected", "data-selected", "src", "poster"],
      attributeOldValue: true,
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
