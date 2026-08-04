Deno.test("renders Pixmax covers and exposes a retryable Jimeng upload queue", async () => {
  const likesSource = await Deno.readTextFile(new URL("../likes.js", import.meta.url));
  const jimengSource = await Deno.readTextFile(new URL("../jimeng.js", import.meta.url));

  if (!likesSource.includes("item.pixmaxPreviewUrl || item.poster || item.thumbnailUrl")) {
    throw new Error("Review Board does not prefer the Pixmax-generated video cover");
  }
  if (!likesSource.includes('if (!poster) video.src = url')) {
    throw new Error("Review Board has no first-frame fallback when a video cover is unavailable");
  }
  if (!likesSource.includes("promptContent: Array.isArray(nodeMetaData.promptContent)")
    || !likesSource.includes("referenceImages: Array.isArray(nodeMetaData.referenceImages)")) {
    throw new Error("Review Board cannot recover Jimeng prompt metadata from its Pixmax archive node");
  }
  for (const contract of [
    'const QUEUE_ID = "pixmax-jimeng-upload-queue"',
    "MAX_CONCURRENT_UPLOADS = 1",
    "function findMetadataRecord(video)",
    "const record = findMetadataRecord(video)",
    "if (hasPrompt) return node",
    "extractReferenceImages(record, video, promptElement)",
    "assertJimengMetadataCaptured(job.item)",
    "cleanJimengPromptText",
    "!videoCard?.contains(image)",
    "findPromptElementForVideo(video, record)",
    "findPromptMediaScope(promptElement)",
    "Extension context invalidated",
    "const allPromptElements = [...record.querySelectorAll('[class*=\"prompt-\"]')]",
    "top: 72px",
    'toggle.textContent = uploadQueueCollapsed ? "展开" : "收起"',
    'retry.textContent = "重试"',
    "updateUploadJobFromBackground"
  ]) {
    if (!jimengSource.includes(contract)) {
      throw new Error(`Jimeng upload queue is missing: ${contract}`);
    }
  }
});

Deno.test("serializes Pixmax canvas mutations to prevent stale-revision upload failures", async () => {
  const backgroundSource = await Deno.readTextFile(new URL("../background.js", import.meta.url));
  for (const contract of [
    "const pixmaxCanvasMutationLocks = new Map()",
    "function withPixmaxCanvasMutationLock(fileUuid, task)",
    "withPixmaxCanvasMutationLock(options.sharedLikesFileUuid",
    "withPixmaxCanvasMutationLock(JIMENG_ARCHIVE_FILE_UUID",
    "createJimengArchiveVideoNode(item, uploadedAsset, 4)"
  ]) {
    if (!backgroundSource.includes(contract)) {
      throw new Error(`Pixmax canvas write lock is missing: ${contract}`);
    }
  }
});
