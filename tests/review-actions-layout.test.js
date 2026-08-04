Deno.test("keeps the four Review Board actions short and on one row", async () => {
  const html = await Deno.readTextFile(new URL("../likes.html", import.meta.url));
  const css = await Deno.readTextFile(new URL("../likes.css", import.meta.url));
  const script = await Deno.readTextFile(new URL("../likes.js", import.meta.url));

  for (const label of [">定位</a>", ">复制</button>", ">Eagle</button>", ">删除</button>"]) {
    if (!html.includes(label)) throw new Error(`Missing compact action label: ${label}`);
  }
  if (!css.includes("grid-template-columns: repeat(4, minmax(0, 1fr));")) {
    throw new Error("Review Board actions must use a four-column single-row grid");
  }
  if (!script.includes('open.textContent = "定位";')
    || script.includes('open.textContent = "定位 Pixmax";')
    || html.includes(">打开</a>")) {
    throw new Error("The Pixmax locator action must retain its compact label");
  }
});
