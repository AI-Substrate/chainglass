// T004 harness server (throwaway): serves external-research/ statically and
// collects the page's POSTed results into decode-harness/decode-report-<name>.json.
// Usage: node serve.mjs [port] [reportName]   (run from anywhere; paths are script-relative)
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = normalize(join(here, '..', '..')); // external-research/
const port = Number(process.argv[2] || 8088);
const reportName = process.argv[3] || 'browser';

const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const out = join(here, `decode-report-${reportName}.json`);
      await writeFile(out, body);
      console.log(`report written: ${out}`);
      res.writeHead(200).end('ok');
    });
    return;
  }
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found: ' + req.url);
  }
});

server.listen(port, () => console.log(`harness server on http://localhost:${port}/spike/decode-harness/index.html (root=${root}, report=${reportName})`));
