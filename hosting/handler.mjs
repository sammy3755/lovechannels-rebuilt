import {withDatabase,db} from './postgres.mjs';
import {api} from './server/api.mjs';
import {HttpError} from './server/auth.mjs';

export async function handleHostedAPI(req,res){
 const address=new URL(req.url,(process.env.VERCEL?'https://':'http://')+(req.headers.host||'localhost'));
 const path=address.searchParams.get('route')||address.pathname;
 let body={};
 try{
  const asset=address.searchParams.get('asset');
  if(asset){
   if(req.method!=='GET'&&req.method!=='HEAD')throw new HttpError(405,'Method not allowed.');
   if(!/^uploads\/[a-f0-9-]+\.(webp|png|jpg)$/.test(asset))throw new HttpError(404,'Photograph not found.');
   const image=await withDatabase(()=>db.prepare('SELECT mime,data FROM uploaded_assets WHERE path=?').get(asset));
   if(!image)throw new HttpError(404,'Photograph not found.');
   res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.data.length,'Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'});
   return res.end(req.method==='HEAD'?undefined:Buffer.from(image.data));
  }
  if(!path.startsWith('/api/')||path==='/api/index')throw new HttpError(404,'Endpoint not found.');
  if(!['GET','HEAD'].includes(req.method)){
   const expected=process.env.PUBLIC_URL?new URL(process.env.PUBLIC_URL).origin:address.origin;
   if(path!=='/api/payments/webhook'&&req.headers.origin&&![expected,address.origin].includes(req.headers.origin))throw new HttpError(403,'Cross-origin requests are not allowed.');
   if(path!=='/api/payments/webhook'&&req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'Cross-site requests are not allowed.');
   if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'Use application/json.');
   const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>(path==='/api/admin/uploads'?4200000:65536))throw new HttpError(413,'Request is too large.');chunks.push(Buffer.from(chunk));}
   req.rawBody=Buffer.concat(chunks).toString('utf8');
   try{body=req.rawBody?JSON.parse(req.rawBody):{};}catch{throw new HttpError(400,'Invalid JSON.');}
   if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Expected a JSON object.');
  }
  // Commit before exposing success or a new session cookie to the browser.
  const buffered={status:200,headers:{},payload:undefined,setHeader(k,v){this.headers[k]=v;},writeHead(s,h){this.status=s;Object.assign(this.headers,h);},end(value){this.payload=value;}};
  await withDatabase(()=>api(req,buffered,path,body));
  res.writeHead(buffered.status,{'X-Content-Type-Options':'nosniff',...buffered.headers});res.end(buffered.payload);
 }catch(error){
  if(!error.status)console.error('Hosted API error:',error.code||error.name,error.message);
  res.writeHead(error.status||500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify({error:error.status?error.message:'Something went wrong. Please try again.'}));
 }
}
