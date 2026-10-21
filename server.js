const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function localFile(urlPath) {
  let clean = urlPath.split("?")[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return null;
  }
  let rel = clean === "/" ? "/index.html" : clean;
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  return null;
}

function isFlight(req) {
  const url = req.url || "";
  return (
    req.headers.rsc === "1" ||
    req.headers["next-router-prefetch"] ||
    req.headers["next-router-state-tree"] ||
    url.includes("_rsc=")
  );
}

function stripExplorerLinks(text) {
  return text
    .replaceAll('<a class="pill-cell" href="https://explorer.imd.fun">Explorer</a>', "")
    .replaceAll('<a class="pill-cell" href="https://explorer.imd.fun/launch">Launch</a>', "")
    .replaceAll('<a href="https://explorer.imd.fun">explorer</a>', "explorer")
    .replaceAll('<a href="https://explorer.imd.fun/launch">explorer.imd.fun/launch</a>', "explorer.imd.fun/launch")
    .replaceAll(
      '[\\"$\\",\\"a\\",null,{\\"href\\":\\"https://explorer.imd.fun\\",\\"children\\":\\"explorer\\"}]',
      '\\"explorer\\"'
    )
    .replaceAll(
      '[\\"$\\",\\"a\\",null,{\\"href\\":\\"https://explorer.imd.fun/launch\\",\\"children\\":\\"explorer.imd.fun/launch\\"}]',
      '\\"explorer.imd.fun/launch\\"'
    )
    .replace(/<a class="token-coins-go" href="https:\/\/communitycoins\.imd\.fun"[^>]*>[\s\S]*?<\/a>/g, "")
    .replace(/<a class="ways_button__Ok_8k" href="https:\/\/pool4\.imd\.fun\/stake"[^>]*>[\s\S]*?<\/a>/g, "")
    .replace(/<a class="ways_button__Ok_8k" href="\/seats\/"[^>]*>[\s\S]*?<\/a>/g, "")
    .replace(/<a href="https:\/\/www\.defined\.fi\/token\/eth\/TBA\/0xb07d640fd9e2eb9dc81b953c8e4fd006bdfeaf276010fb5418eb763ca15abfb3"[^>]*>[\s\S]*?<\/a>/g, "")
    .replace(/<a class="telegram-seat" href="\/seats\/">[\s\S]*?<\/a>/g, "")
    .replaceAll('<a href="/seats/">agent seat</a>', "agent seat")
    .replaceAll('<a href="/seats/">Buy one here</a>', "Buy one here")
    .replaceAll(
      '[\\"$\\",\\"a\\",null,{\\"href\\":\\"/seats/\\",\\"children\\":\\"agent seat\\"}]',
      '\\"agent seat\\"'
    )
    .replaceAll(
      '[\\"$\\",\\"a\\",null,{\\"href\\":\\"/seats/\\",\\"children\\":\\"Buy one here\\"}]',
      '\\"Buy one here\\"'
    );
}

function proxy(req, res) {
  const headers = { ...req.headers, host: "imd.fun" };
  delete headers["accept-encoding"];
  const preq = https.request(
    {
      hostname: "imd.fun",
      path: req.url,
      method: req.method,
      headers,
    },
    (pres) => {
      const type = String(pres.headers["content-type"] || "");
      const textual = /text|javascript|json|xml/.test(type) || type === "";
      if (!textual) {
        res.writeHead(pres.statusCode || 502, pres.headers);
        pres.pipe(res);
        return;
      }
      const chunks = [];
      pres.on("data", (chunk) => chunks.push(chunk));
      pres.on("end", () => {
        const body = stripExplorerLinks(Buffer.concat(chunks).toString("utf8"));
        const headersOut = { ...pres.headers };
        delete headersOut["content-length"];
        delete headersOut["content-encoding"];
        res.writeHead(pres.statusCode || 502, headersOut);
        res.end(body);
      });
    }
  );
  preq.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502);
    res.end(err.message);
  });
  req.pipe(preq);
}

const server = http.createServer((req, res) => {
  if (!isFlight(req)) {
    const file = localFile(req.url || "/");
    if (file) {
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        "content-type": types[ext] || "application/octet-stream",
        "cache-control": "no-cache",
      });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }
  proxy(req, res);
});

server.listen(port, () => {
  console.log(`IMD clone at http://localhost:${port}`);
});
