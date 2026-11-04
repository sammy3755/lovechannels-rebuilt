import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {handleHostedAPI} from './handler.mjs';
const root=fileURLToPath(new URL('../public/',import.meta.url)),port=Number(process.env.PORT||4194);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf','.mp4':'video/mp4'};
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/'))return handleHostedAPI(req,res);
 if(url.pathname.startsWith('/assets/uploads/')){req.url='/api/index?asset='+encodeURIComponent(url.pathname.slice('/assets/'.length));return handleHostedAPI(req,res);}
 try{let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(['/','/member','/admin'].includes(url.pathname))path=resolve(root,'index.html');if(!path.startsWith(root.endsWith(sep)?root:root+sep))throw Error('Forbidden');if(!(await stat(path)).isFile())throw Error('Missing');res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:await readFile(path));}catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log('Hosted API verification: http://127.0.0.1:'+port));
