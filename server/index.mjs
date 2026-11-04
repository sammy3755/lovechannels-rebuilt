import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './api.mjs';
import { HttpError } from './auth.mjs';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf':'font/ttf', '.txt':'text/plain; charset=utf-8' };
createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com https://www.instagram.com https://open.spotify.com; media-src 'self' https:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      let body = {};
      if (!['GET','HEAD'].includes(req.method)) {
        // Do not trust forwarded headers. Reject cross-origin mutations.
        if (url.pathname!=='/api/payments/webhook' && req.headers.origin && req.headers.origin !== url.origin) throw new HttpError(403, 'Cross-origin requests are not allowed.');
        if (url.pathname!=='/api/payments/webhook' && req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed.');
        if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Use application/json.');
        let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > (url.pathname==='/api/admin/uploads'?4200000:65536)) throw new HttpError(413, 'Request is too large.'); }
        req.rawBody=raw;
        try { body = raw ? JSON.parse(raw,(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid key');return value;}) : {}; } catch { throw new HttpError(400, 'Invalid JSON.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object.');
      }
      return await api(req,res,url.pathname,body);
    }
    if (!['GET','HEAD'].includes(req.method)) throw new HttpError(405, 'Method not allowed.');
    let filename = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (['/','/member','/admin'].includes(url.pathname)) filename = resolve(root,'index.html');
    if (!filename.startsWith(root.endsWith(sep) ? root : root + sep)) throw new HttpError(403, 'Forbidden.');
    let info; try { info = await stat(filename); } catch { throw new HttpError(404, 'File not found.'); }
    if (!info.isFile()) throw new HttpError(404, 'File not found.');
    if(extname(filename)==='.mp4'){
      let start=0,end=info.size-1,status=200;
      if(req.headers.range){const match=req.headers.range.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}
        if(!match[1])start=Math.max(0,info.size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});return res.end();}status=206;
      }
      res.writeHead(status,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,'Cache-Control':'public,max-age=86400',...(status===206?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{})});
      if(req.method==='HEAD')return res.end();const stream=createReadStream(filename,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res);
    }
    res.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': ['.webp','.ttf'].includes(extname(filename)) ? 'public,max-age=86400' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(filename));
  } catch (error) {
    if (!error.status) console.error(error);
    res.writeHead(error.status || 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: error.status ? error.message : 'Something went wrong. Please try again.' }));
  }
}).listen(port, host, () => console.log(`The Love Channels: http://${host}:${port}`));
