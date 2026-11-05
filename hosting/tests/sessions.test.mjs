import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.env.LC_PGLITE='1';process.env.ADMIN_PASSWORD='SessionAdminPassword-123';
const {db,withDatabase,closeDatabase}=await import('../postgres.mjs');
const {startSession,currentUser,requireUser}=await import('../server/auth.mjs');
const {api}=await import('../server/api.mjs');
const {hashPassword}=await import('../server/passwords.mjs');
after(closeDatabase);
const admin=(await db.prepare("SELECT id FROM users WHERE role='admin'").get()).id;
const member=(await db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run('Session member','session@example.test',await hashPassword('SessionMemberPassword-123'))).lastInsertRowid;
const request=(cookie='',method='GET')=>({method,headers:{cookie},socket:{remoteAddress:'127.0.0.1'}});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},getHeader(k){return this.headers[k]},writeHead(status,h){this.status=status;Object.assign(this.headers,h)},end(body){this.body=body}};}
async function login(id){const out=response();const metadata=await withDatabase(()=>startSession(out,id));return {cookie:out.headers['Set-Cookie'].split(';')[0],header:out.headers['Set-Cookie'],metadata};}
const key=cookie=>createHash('sha256').update(cookie.split('=')[1]).digest('hex');
test('member/admin lifetimes differ and read-only status never extends idle expiry',async()=>{
 const real=Date.now;let now=real();Date.now=()=>now;
 try{
  for(const [id,idle,max] of [[member,900,28800],[admin,300,7200]]){
   const s=await login(id);assert.equal(s.metadata.issuedAt,now);assert.equal(s.metadata.idleSeconds,idle);assert.equal(s.metadata.absoluteSeconds,max);assert.match(s.header,new RegExp('Max-Age='+max));
   now+=idle*1000-1;
   const out=response();await withDatabase(()=>api(request(s.cookie),out,'/api/session',{}));const status=JSON.parse(out.body);assert.ok(status.user);assert.equal(status.session.idleExpiresAt,s.metadata.idleExpiresAt);
   now+=1;assert.equal(await withDatabase(()=>currentUser(request(s.cookie))),null);
   await assert.rejects(()=>withDatabase(()=>requireUser(request(s.cookie))),e=>e.status===401);
  }
 }finally{Date.now=real;}
});
test('activity renews idle time but cannot extend maximum lifetime',async()=>{
 const real=Date.now;let now=real();Date.now=()=>now;
 try{
  for(const [id,idle,max] of [[member,900,28800],[admin,300,7200]]){
   const s=await login(id),began=now;
   now+=idle*1000-1000;const active=request(s.cookie,'POST'),out=response();await withDatabase(()=>api(active,out,'/api/session/touch',{}));const info=JSON.parse(out.body).session;assert.ok(info.idleExpiresAt>s.metadata.idleExpiresAt);assert.equal(info.absoluteExpiresAt,s.metadata.absoluteExpiresAt);
   now=began+max*1000;await db.prepare('UPDATE sessions SET last_seen=? WHERE token=?').run(now-1,key(s.cookie));
   assert.equal(await withDatabase(()=>currentUser(request(s.cookie))),null,'Recent activity cannot revive an absolutely expired session');
  }
 }finally{Date.now=real;}
});
test('legacy long sessions are rejected and client-supplied deadlines cannot override policy',async()=>{
 const s=await login(member);await db.prepare('UPDATE sessions SET issued_at=0,last_seen=0 WHERE token=?').run(key(s.cookie));
 assert.equal(await withDatabase(()=>currentUser(request(s.cookie))),null);
 const out=response();await withDatabase(()=>api(request('','POST'),out,'/api/login',{email:'session@example.test',password:'SessionMemberPassword-123',expires:Date.now()+999999999999,idleSeconds:999999}));assert.equal(JSON.parse(out.body).session.idleSeconds,900);
});
test('admin credential switching requires the admin role and revokes the replaced browser session',async()=>{
 const original=await login(member);
 await assert.rejects(()=>withDatabase(()=>api(request(original.cookie,'POST'),response(),'/api/login',{email:'session@example.test',password:'SessionMemberPassword-123',admin:true})),e=>e.status===403);
 assert.equal((await withDatabase(()=>currentUser(request(original.cookie)))).id,member,'Rejected switch keeps the member login');
 const out=response();await withDatabase(()=>api(request(original.cookie,'POST'),out,'/api/login',{email:'admin@thelovechannels.local',password:'SessionAdminPassword-123',admin:true}));
 const switched=out.headers['Set-Cookie'].split(';')[0];assert.equal(JSON.parse(out.body).user.role,'admin');assert.equal(JSON.parse(out.body).session.idleSeconds,300);
 assert.equal(await withDatabase(()=>currentUser(request(original.cookie))),null,'Replaced session cannot be replayed');
 assert.equal((await withDatabase(()=>requireUser(request(switched),true))).role,'admin');
});
