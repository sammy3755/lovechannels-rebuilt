import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,exportJWK} from 'jose';
import {createHash} from 'node:crypto';
process.env.LC_PGLITE='1';
process.env.ADMIN_PASSWORD='SecurityTestPassword-123';
process.env.GOOGLE_CLIENT_ID='test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET='test-only-never-a-real-secret';
process.env.PUBLIC_URL='http://127.0.0.1:4197';
const {db,withDatabase,closeDatabase}=await import('../postgres.mjs');
const {api}=await import('../server/api.mjs');
const {verifyGoogleToken}=await import('../server/google.mjs');
const {hashPassword,validPassword}=await import('../server/passwords.mjs');
after(closeDatabase);
const req=(method='GET',cookie='')=>({method,url:'/api/auth/google/callback',headers:{cookie},socket:{remoteAddress:'127.0.0.1'}});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},getHeader(k){return this.headers[k]},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers)},end(body){this.body=body}};}
test('passwords preserve spaces, use scrypt v2, and reject wrong credentials',async()=>{
 const saved=await hashPassword('  A strong password with spaces  ');
 assert.match(saved,/^scrypt-v2:/);assert.ok(await validPassword('  A strong password with spaces  ',saved));
 assert.equal(await validPassword('A strong password with spaces',saved),false);
 assert.equal(await validPassword('anything','malformed'),false);
});
test('OIDC verifies signature, audience, nonce, expiry and verified email',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const sign=async(claims={},aud=process.env.GOOGLE_CLIENT_ID,exp='2m')=>new SignJWT({sub:'google-user-1',nonce:'expected',email:'member@example.test',email_verified:true,...claims}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
 assert.equal((await verifyGoogleToken(await sign(),'expected',publicKey)).sub,'google-user-1');
 await assert.rejects(()=>verifyGoogleToken(sign(),'bad',publicKey));
 await assert.rejects(async()=>verifyGoogleToken(await sign({nonce:'wrong'}),'expected',publicKey));
 await assert.rejects(async()=>verifyGoogleToken(await sign({email_verified:false}),'expected',publicKey));
 await assert.rejects(async()=>verifyGoogleToken(await sign({},'attacker-client'),'expected',publicKey));
 await assert.rejects(async()=>verifyGoogleToken(await sign({},undefined,'-1m'),'expected',publicKey));
 const other=await generateKeyPair('RS256');await assert.rejects(async()=>verifyGoogleToken(await sign(),'expected',other.publicKey));
});
test('Google start uses PKCE, fixed callback, one-time browser binding and no requested role',async()=>{
 const out=response();await withDatabase(()=>api(req('POST'),out,'/api/auth/google/start',{role:'admin',redirect:'https://attacker.invalid'}));
 const url=new URL(JSON.parse(out.body).url);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:4197/api/auth/google/callback');
 assert.ok(url.searchParams.get('nonce'));assert.ok(url.searchParams.get('state'));assert.match(out.headers['Set-Cookie'][0],/HttpOnly; SameSite=Lax/);
 const state=url.searchParams.get('state'),cookie=out.headers['Set-Cookie'][0].split(';')[0];
 const callback=req('GET',cookie);callback.url+="?state="+state+'&code=fake-provider-code';
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return {ok:false}};
 try{
  const invalid=response();await withDatabase(()=>api({...callback,headers:{cookie:'lc_oauth='+'0'.repeat(64)}},invalid,'/api/auth/google/callback',{}));assert.equal(calls,0);
  const failed=response();await withDatabase(()=>api(callback,failed,'/api/auth/google/callback',{}));assert.equal(calls,1);assert.equal(failed.status,303);assert.match(failed.headers.Location,/authError=google/);
  await withDatabase(()=>api(callback,response(),'/api/auth/google/callback',{}));assert.equal(calls,1,'Consumed state cannot be replayed');
 }finally{globalThis.fetch=original;}
 assert.equal((await db.prepare('SELECT count(*) AS count FROM auth_identities').get()).count,0);
});
test('untrusted Google linking, demo bypass, injection and private API access are rejected',async()=>{
 await assert.rejects(()=>withDatabase(()=>api(req('POST'),response(),'/api/auth/google/start',{link:true,password:'ignored'})),e=>e.status===401);
 await assert.rejects(()=>withDatabase(()=>api(req('POST'),response(),'/api/demo',{role:'admin'})),e=>e.status===404);
 await assert.rejects(()=>withDatabase(()=>api(req(),response(),'/api/admin',{})),e=>e.status===401);
 await assert.rejects(()=>withDatabase(()=>api(req('POST'),response(),'/api/login',{email:"admin' OR 1=1 --@example.test",password:'AnyPassword-12345'})),e=>e.status===401||e.status===400);
});
test('Google cannot take over an existing administrator by matching email',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='google-test-key';jwk.alg='RS256';
 const original=globalThis.fetch;let nonce,email='admin@thelovechannels.local',subject='google-existing-admin';
 globalThis.fetch=async url=>{
  if(String(url).includes('googleapis.com/oauth2/v3/certs'))return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
  if(String(url)==='https://oauth2.googleapis.com/token'){
   const token=await new SignJWT({nonce,email,email_verified:true,name:'Google Member'}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer('https://accounts.google.com').setAudience(process.env.GOOGLE_CLIENT_ID).setSubject(subject).setIssuedAt().setExpirationTime('2m').sign(privateKey);
   return new Response(JSON.stringify({id_token:token}),{headers:{'Content-Type':'application/json'}});
  }
  throw Error('Unexpected external request');
 };
 async function flow(body={},session=''){
  const start=response();await withDatabase(()=>api(req('POST',session),start,'/api/auth/google/start',body));
  const state=new URL(JSON.parse(start.body).url).searchParams.get('state');
  nonce=(await db.prepare('SELECT nonce FROM oauth_challenges WHERE state=?').get(createHash('sha256').update(state).digest('hex'))).nonce;
  const callback=req('GET',start.headers['Set-Cookie'][0].split(';')[0]);callback.url+='?state='+state+'&code=valid-code';
  const out=response();await withDatabase(()=>api(callback,out,'/api/auth/google/callback',{}));return out;
 }
 try{
  const takeover=await flow();assert.match(takeover.headers.Location,/link-required/);assert.ok(!takeover.headers['Set-Cookie'].some(c=>c.startsWith('lc_member_session=')||c.startsWith('lc_admin_session=')));
  const login=response();await withDatabase(()=>api(req('POST'),login,'/api/login',{email,password:'SecurityTestPassword-123'}));
  const linked=await flow({link:true,password:'SecurityTestPassword-123'},login.headers['Set-Cookie'].split(';')[0]);assert.equal(linked.headers.Location,'/#/member');
  const returning=await flow();assert.equal(returning.headers.Location,'/#/member');const adminAccess=await flow({admin:true});assert.equal(adminAccess.headers.Location,'/#/admin');
  email='new-google@example.test';subject='google-new-member';const created=await flow({role:'admin'});assert.equal(created.headers.Location,'/#/member');
  const user=await db.prepare('SELECT role FROM users WHERE email=?').get(email);assert.equal(user.role,'member');
  const denied=await flow({admin:true});assert.match(denied.headers.Location,/admin\?authError=admin-required/);assert.ok(!denied.headers['Set-Cookie'].some(c=>c.startsWith('lc_member_session=')||c.startsWith('lc_admin_session=')));
  email='unknown-google@example.test';subject='unknown-admin-intent';const unknown=await flow({admin:true});assert.match(unknown.headers.Location,/admin\?authError=admin-required/);assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').get(email),undefined);
 }finally{globalThis.fetch=original;}
});
test('login throttle persists even when failed transactions roll back',async()=>{
 let blocked=false;
 for(let i=0;i<12;i++)try{await withDatabase(()=>api(req('POST'),response(),'/api/login',{email:'throttle@example.test',password:'Wrong-password-123'}));}catch(e){if(e.status===429){blocked=true;break;}assert.equal(e.status,401);}
 assert.ok(blocked);
});
