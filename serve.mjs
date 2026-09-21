import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8099);
const endpoint = process.env.JEV_ENDPOINT || 'http://127.0.0.1:8012';
if (!['http:', 'https:'].includes(new URL(endpoint).protocol)) throw new Error('JEV_ENDPOINT must be an HTTP(S) URL');
const escaped = endpoint.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.png':'image/png' };
const within = path => { const rel = relative(root,path); return rel !== '..' && !rel.startsWith('..'+sep) && !isAbsolute(rel); };
createServer(async (req,res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405);res.end();return; }
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!within(path)) throw new Error('Not found');
    if ((await stat(path)).isDirectory()) {
      if (!url.pathname.endsWith('/')) {res.writeHead(302,{Location:url.pathname+'/'+url.search});res.end();return;}
      path = resolve(path,'index.html');
    }
    if (!within(await realpath(path)) || !mime[extname(path)]) throw new Error('Not found');
    let content = await readFile(path);
    if (extname(path)==='.html') content=content.toString('utf8').replace('<head>', '<head>\n<meta name="jev-endpoint" content="'+escaped+'">');
    res.writeHead(200,{'Content-Type':mime[extname(path)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:content);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Jev demos: http://127.0.0.1:${port} · default bridge ${endpoint}`));
