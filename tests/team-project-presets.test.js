Deno.test("new members automatically receive Haiyue and iQOO team projects", async () => {
  await import(new URL(`../project-scopes.js?test=${crypto.randomUUID()}`, import.meta.url).href);
  const scopes = globalThis.PixmaxProjectScopes;
  const projects = scopes.migrateProjects({
    sharedLikesCanvasUrl: "",
    sharedLikesOwnerName: ""
  });

  if (projects.length !== 2) throw new Error(`Expected 2 team projects, got ${projects.length}`);
  const haiyue = projects.find((project) => project.name === "海悦");
  const iqoo = projects.find((project) => project.name === "iQOO");
  if (!haiyue?.isTeamPreset || !iqoo?.isTeamPreset) {
    throw new Error("Haiyue and iQOO must both be managed team presets");
  }
  if (iqoo.workspaceId !== "987f2296-e6cd-4a9d-bd12-9567a0247066"
    || iqoo.fileUuid !== "1f19b0ce-e717-62fd-bc8f-b3a87e586bc1") {
    throw new Error("iQOO preset must point to the verified shared plugin canvas");
  }
  if (projects.some((project) => project.ownerName)) {
    throw new Error("Team presets must not copy a personal member name");
  }
});

Deno.test("team presets preserve existing personal settings", async () => {
  const scopes = globalThis.PixmaxProjectScopes;
  const projects = scopes.migrateProjects({
    sharedLikesProjects: [{
      canvasUrl: "https://app.pixmax.cn/workspace/987f2296-e6cd-4a9d-bd12-9567a0247066?file=1f19b0ce-e717-62fd-bc8f-b3a87e586bc1",
      color: "#123456",
      name: "我的 iQOO",
      ownerName: "Sokimi"
    }]
  });

  const iqoo = projects.find((project) => project.fileUuid === "1f19b0ce-e717-62fd-bc8f-b3a87e586bc1");
  if (projects.length !== 2) throw new Error(`Expected the saved project plus missing preset, got ${projects.length}`);
  if (iqoo?.ownerName !== "Sokimi" || iqoo.color !== "#123456" || iqoo.name !== "我的 iQOO") {
    throw new Error("Existing personal project settings must win over preset defaults");
  }
  if (!iqoo.isTeamPreset) throw new Error("A matching saved project must be recognized as a team preset");
});
