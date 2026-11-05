import {randomBytes,createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {db,hashPassword} from './db.mjs';
import {assert,HttpError,rateLimit,startSession,requireUser,validPassword,passwordField} from './auth.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const callbackPath='/api/auth/google/callback';
export const googleEnabled=()=>Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.PUBLIC_URL);
export async function verifyGoogleToken(token,nonce,keySet=keys){
 const {payload}=await jwtVerify(token,keySet,{algorithms:['RS256'],issuer:['https://accounts.google.com','accounts.google.com'],audience:process.env.GOOGLE_CLIENT_ID,requiredClaims:['exp','iat','sub','nonce','email','email_verified'],maxTokenAge:'10m',clockTolerance:5});
 assert(payload.nonce===nonce&&payload.email_verified===true,'Google could not verify this account.',401);
 assert(typeof payload.sub==='string'&&payload.sub.length<=255&&typeof payload.email==='string'&&payload.email.length<=254,'Invalid Google identity.',401);
 return payload;
}
function cookie(res,value,maxAge){
 const prior=res.getHeader?.('Set-Cookie');
 res.setHeader('Set-Cookie',[...(Array.isArray(prior)?prior:prior?[prior]:[]),`lc_oauth=${value}; HttpOnly; SameSite=Lax; Path=${callbackPath}; Max-Age=${maxAge}${process.env.COOKIE_SECURE==='1'?'; Secure':''}`]);
}
export async function googleApi(req,res,path,body,send){
 assert(googleEnabled(),'Google sign-in is not configured yet. Please use email and password.',503);
 const base=new URL(process.env.PUBLIC_URL);
 assert(base.protocol==='https:'||(!process.env.VERCEL&&base.hostname==='127.0.0.1'),'Invalid sign-in configuration.',503);
 const redirect=base.origin+callbackPath;
 if(path==='/api/auth/google/start'&&req.method==='POST'){
  await rateLimit(req,'google-start',12);
  let link=null;
  if(body.link===true){const user=await requireUser(req);await rateLimit(req,'google-link',5);assert(await validPassword(passwordField(body.password),user.password),'Password is incorrect.',401);link=user.id;}
  const state=randomBytes(32).toString('hex'),binding=randomBytes(32).toString('hex'),nonce=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
  await db.prepare('DELETE FROM oauth_challenges WHERE expires<?').run(Date.now());
  await db.prepare('INSERT INTO oauth_challenges(state,binding,nonce,verifier,link_user_id,expires,admin_required) VALUES(?,?,?,?,?,?,?)').run(hash(state),hash(binding),nonce,verifier,link,Date.now()+600000,body.admin===true?1:0);
  cookie(res,binding,600);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'});
  return send({url:url.href});
 }
 if(path===callbackPath&&req.method==='GET'){
  // Consume the challenge even when provider verification fails; never expose tokens in a redirect.
  let destination='/#/?authError=google';
  try{
   await rateLimit(req,'google-callback',20);
   const url=new URL(req.url,base),state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'',binding=req.headers.cookie?.match(/(?:^|;\s*)lc_oauth=([a-f0-9]{64})(?:;|$)/)?.[1]||'';
   assert(/^[a-f0-9]{64}$/.test(state)&&binding&&code.length>0&&code.length<4096,'Sign-in expired.',401);
   const challenge=await db.prepare('DELETE FROM oauth_challenges WHERE state=? AND binding=? AND expires>? RETURNING *').get(hash(state),hash(binding),Date.now());
   assert(challenge,'Sign-in expired.',401);
   if(challenge.admin_required)destination='/#/admin?authError=admin-required';
   const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,code,code_verifier:challenge.verifier,redirect_uri:redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(10000)});
   assert(response.ok,'Google sign-in failed.',401);
   const tokens=await response.json();assert(typeof tokens.id_token==='string','Google sign-in failed.',401);
   const profile=await verifyGoogleToken(tokens.id_token,challenge.nonce),email=profile.email.toLowerCase();
   const identity=await db.prepare('SELECT user_id FROM auth_identities WHERE subject=?').get(profile.sub);
   let user;
   if(challenge.link_user_id){
    user=await db.prepare('SELECT * FROM users WHERE id=?').get(challenge.link_user_id);
    assert(user&&user.email===email&&(!identity||identity.user_id===user.id),'Cannot connect this Google account.',401);
    if(!identity)await db.prepare('INSERT INTO auth_identities(subject,user_id) VALUES(?,?)').run(profile.sub,user.id);
   }else if(identity){user=await db.prepare('SELECT * FROM users WHERE id=?').get(identity.user_id);}
   else{
    const existing=await db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if(existing){destination='/#/?authError=link-required';throw new HttpError(409,'Sign in with your password and connect Google from your profile.');}
    assert(!challenge.admin_required,'Administrator account required.',403);
    const name=String(profile.name||email.split('@')[0]).slice(0,100);
    const result=await db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name,email,await hashPassword(randomBytes(48).toString('hex')));
    user=await db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    await db.prepare('INSERT INTO auth_identities(subject,user_id) VALUES(?,?)').run(profile.sub,user.id);
   }
   req.authScope=challenge.admin_required?'admin':'member';assert(user,'Account unavailable.',401);assert(!challenge.admin_required||user.role==='admin','Administrator account required.',403);await startSession(res,user.id,req);
   destination=challenge.admin_required?'/#/admin':'/#/member';
  }catch{/* Deliberately generic: no provider secrets or account details in the response. */}
  cookie(res,'',0);res.writeHead(303,{'Location':destination,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end();
 }
 throw new HttpError(404,'Endpoint not found.');
}
