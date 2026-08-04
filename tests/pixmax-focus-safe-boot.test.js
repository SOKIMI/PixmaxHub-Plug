Deno.test("keeps Review Board focus compatible with Pixmax canvas boot", async () => {
  const bridge = await Deno.readTextFile(new URL("../bridge.js", import.meta.url));
  const content = await Deno.readTextFile(new URL("../content.js", import.meta.url));
  const likes = await Deno.readTextFile(new URL("../likes.js", import.meta.url));

  if (bridge.includes("Storage.prototype.getItem") || bridge.includes("Storage.prototype.setItem")) {
    throw new Error("Review Board focus must not replace Pixmax's global Storage methods");
  }
  if (bridge.includes("maybeRememberFlowController") || bridge.includes("flowControllers")) {
    throw new Error("Review Board focus must not scan every Pixmax Map insertion for flow internals");
  }
  if (!bridge.includes("if (internals.workspaceController) restoreMapSet();")
    || !bridge.includes("window.setTimeout(restoreMapSet, 15000);")) {
    throw new Error("The legacy collaboration probe must restore Map.set promptly");
  }
  if (!content.includes("async function focusNodeFromUrl()")
    || content.includes('requestBridge("set-flow-viewport"')) {
    throw new Error("Focus should use the safe post-boot DOM path instead of captured Pixmax internals");
  }

  const linkStart = likes.indexOf("open.href = buildFocusUrl");
  const linkEnd = likes.indexOf("renderReviewPanel(item", linkStart);
  const openLinkSetup = likes.slice(linkStart, linkEnd);
  if (!openLinkSetup.includes("open.href = buildFocusUrl")
    || openLinkSetup.includes('open.addEventListener("click"')) {
    throw new Error("Review Board Pixmax links must retain immediate native browser navigation");
  }
});
