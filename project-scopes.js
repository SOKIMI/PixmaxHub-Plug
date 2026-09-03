"use strict";

(() => {
  const LEGACY_PROJECT_ID = "project-haiyue";
  const LEGACY_PROJECT_NAME = "海悦";
  const TEAM_PROJECT_PRESETS = Object.freeze([
    Object.freeze({
      acceptLegacyData: true,
      canvasUrl: "https://app.pixmax.cn/workspace/3bba9785-24d6-4b1f-84c1-895d85db4bbe?file=1f14fa50-bdeb-6eaf-9168-47138a4a9766",
      id: LEGACY_PROJECT_ID,
      name: LEGACY_PROJECT_NAME
    }),
    Object.freeze({
      canvasUrl: "https://app.pixmax.cn/workspace/987f2296-e6cd-4a9d-bd12-9567a0247066?file=1f19b0ce-e717-62fd-bc8f-b3a87e586bc1",
      name: "iQOO"
    })
  ]);

  function extractWorkspaceId(value) {
    try {
      const url = new URL(String(value || ""));
      const match = url.pathname.match(/\/workspace\/([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]).trim() : "";
    } catch {
      return "";
    }
  }

  function extractFileUuid(value) {
    try {
      return new URL(String(value || "")).searchParams.get("file")?.trim() || "";
    } catch {
      return "";
    }
  }

  function getStableProjectId(value = {}, workspaceId = "", fileUuid = "", fallbackId = "") {
    const suppliedId = String(value.id || "").trim();
    if (suppliedId === LEGACY_PROJECT_ID) return LEGACY_PROJECT_ID;
    if (fileUuid) return `project-file-${fileUuid}`;
    if (workspaceId) return `project-workspace-${workspaceId}`;
    return suppliedId || fallbackId;
  }

  function normalizeProject(value = {}, index = 0) {
    const canvasUrl = String(value.canvasUrl || value.sharedLikesCanvasUrl || "").trim();
    const workspaceId = String(value.workspaceId || extractWorkspaceId(canvasUrl)).trim();
    const fileUuid = String(value.fileUuid || value.sharedLikesFileUuid || extractFileUuid(canvasUrl)).trim();
    const fallbackId = workspaceId || fileUuid || `project-${index + 1}`;
    const id = getStableProjectId(value, workspaceId, fileUuid, `project-${fallbackId}`);
    const legacyIds = [...new Set([
      ...(Array.isArray(value.legacyIds) ? value.legacyIds : []),
      String(value.id || "").trim()
    ])].filter((item) => item && item !== id);
    return {
      acceptLegacyData: Boolean(value.acceptLegacyData),
      canvasUrl,
      color: String(value.color || value.sharedLikesColor || "#ff3864").trim() || "#ff3864",
      enabled: value.enabled !== false,
      fileUuid,
      id,
      isTeamPreset: Boolean(value.isTeamPreset),
      legacyIds,
      name: String(value.name || `项目 ${index + 1}`).trim() || `项目 ${index + 1}`,
      ownerName: String(value.ownerName || value.sharedLikesOwnerName || "").trim(),
      workspaceId
    };
  }

  function mergeTeamProjectPresets(projects) {
    const merged = projects.map(normalizeProject).filter((project) => project.id);
    for (const value of TEAM_PROJECT_PRESETS) {
      const preset = normalizeProject({ ...value, isTeamPreset: true });
      const index = merged.findIndex((project) => (
        project.id === preset.id
        || (preset.fileUuid && project.fileUuid === preset.fileUuid)
      ));
      if (index < 0) {
        merged.push(preset);
        continue;
      }
      const existing = merged[index];
      merged[index] = normalizeProject({
        ...preset,
        ...existing,
        acceptLegacyData: preset.acceptLegacyData || existing.acceptLegacyData,
        canvasUrl: existing.canvasUrl || preset.canvasUrl,
        fileUuid: existing.fileUuid || preset.fileUuid,
        isTeamPreset: true,
        workspaceId: existing.workspaceId || preset.workspaceId
      });
    }
    return merged;
  }

  function migrateProjects(options = {}) {
    if (Array.isArray(options.sharedLikesProjects) && options.sharedLikesProjects.length) {
      return mergeTeamProjectPresets(options.sharedLikesProjects);
    }
    return mergeTeamProjectPresets([normalizeProject({
      acceptLegacyData: true,
      canvasUrl: options.sharedLikesCanvasUrl,
      color: options.sharedLikesColor,
      enabled: options.sharedLikesEnabled,
      fileUuid: options.sharedLikesFileUuid,
      id: LEGACY_PROJECT_ID,
      name: LEGACY_PROJECT_NAME,
      ownerName: options.sharedLikesOwnerName,
      workspaceId: extractWorkspaceId(options.sharedLikesCanvasUrl)
    })]);
  }

  function findProject(projects, workspaceId = "", preferredProjectId = "", fileUuid = "") {
    const list = Array.isArray(projects) ? projects : [];
    const preferred = String(preferredProjectId || "").trim();
    if (preferred) {
      const project = list.find((item) => item.id === preferred || item.legacyIds?.includes(preferred));
      if (project) return project;
    }
    const file = String(fileUuid || "").trim();
    if (file) {
      const project = list.find((item) => item.fileUuid === file);
      if (project) return project;
    }
    const workspace = String(workspaceId || "").trim();
    return workspace ? list.find((item) => item.workspaceId === workspace) || null : null;
  }

  function createProject(value = {}) {
    return normalizeProject({
      ...value,
      id: value.id || `project-draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: value.name || "新项目"
    });
  }

  function getLocalLikesStorageKey(baseKey, project, workspaceId = "") {
    const scope = project?.id || `workspace-${String(workspaceId || "unassigned").trim() || "unassigned"}`;
    return `${baseKey}:project:${scope}`;
  }

  const api = { createProject, extractFileUuid, extractWorkspaceId, findProject, getLocalLikesStorageKey, migrateProjects, normalizeProject };
  globalThis.PixmaxProjectScopes = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
