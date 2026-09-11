import vm from "node:vm";

const source = await Deno.readTextFile(new URL("../popup.js", import.meta.url));
function extract(name, next) {
  return source.slice(source.indexOf(`async function ${name}(`), source.indexOf(`\n${next}`, source.indexOf(`async function ${name}(`)));
}

Deno.test("update download reports streamed bytes with and without a total", async () => {
  for (const total of [0, 4]) {
    const events = [];
    const context = vm.createContext({
      AbortSignal, Uint8Array,
      githubTarballUrl: () => "https://example.invalid/update",
      fetch: async () => new Response(new ReadableStream({ start(c) {
        c.enqueue(new Uint8Array([1, 2])); c.enqueue(new Uint8Array([3, 4])); c.close();
      } }), { headers: total ? { "content-length": String(total) } : {} }),
      setUpdateProgress: (...args) => events.push(args),
      ungzip: async (bytes) => bytes,
      parseGithubTarArchive: (bytes) => Array.from(bytes),
    });
    vm.runInContext(extract("fetchGithubUpdateFiles", "function parseManifestFromUpdateFiles"), context);
    const bytes = await context.fetchGithubUpdateFiles({});
    if (bytes.join() !== "1,2,3,4") throw new Error("Download bytes corrupted");
    const updates = events.filter(([, text]) => text.startsWith("正在下载："));
    if (updates.length !== 2 || (total ? updates[0][0] !== 50 : updates.some(([value]) => value !== null))) {
      throw new Error("Incorrect download progress");
    }
  }
});

Deno.test("update writes manifest last and stops on a failed file", async () => {
  for (const fail of [false, true]) {
    const writes = [], progress = [];
    const context = vm.createContext({
      setUpdateProgress: (...args) => progress.push(args),
      getNestedFileHandle: async (_, path) => ({ createWritable: async () => ({
        write: async () => { if (fail) throw new Error("Disk full"); writes.push(path); },
        close: async () => {},
      }) }),
    });
    vm.runInContext(extract("writeUpdateFiles", "async function getNestedFileHandle"), context);
    let error;
    try { await context.writeUpdateFiles({}, new Map([["manifest.json", []], ["popup.js", []]])); }
    catch (e) { error = e; }
    if (fail) {
      if (!error || writes.length || progress.some(([value]) => value === 100)) throw new Error("Failed update reported success");
    } else if (writes.join() !== "popup.js,manifest.json" || progress.at(-1)[0] !== 100) {
      throw new Error("Incorrect installation order or progress");
    }
  }
});
