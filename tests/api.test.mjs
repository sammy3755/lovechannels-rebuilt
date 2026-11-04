import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const directory = mkdtempSync(join(tmpdir(),'lovechannels-test-'));
const origin = 'http://127.0.0.1:4188';
let server, memberCookie, otherCookie, adminCookie, rootSoul, childSoul;
async function call(path, body, { cookie, method = body ? 'POST' : 'GET', headers = {} } = {}) {
  const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(cookie ? {Cookie:cookie} : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status:response.status, data:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] };
}
before(async () => {
  server = spawn(process.execPath,['server/index.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'4188',DATA_DIR:directory,ADMIN_PASSWORD:'TestAdminPassword-321'},stdio:'ignore'});
  let ready = false;
  for (let i=0;i<100;i++) { try { ready=(await fetch(`${origin}/api/public`)).ok; } catch {} if(ready) break; await delay(50); }
  assert.ok(ready,'test server started');
});
after(async () => { if(server) { server.kill(); await new Promise(resolve => server.once('exit',resolve)); } rmSync(directory,{recursive:true,force:true}); });

test('public site has church content, five services, and both dashboards are protected', async () => {
  for (const path of ['/','/member','/admin','/js/app.js','/styles/site.css','/assets/hero.webp']) assert.equal((await fetch(`${origin}${path}`)).status,200,`${path} is served`);
  const publicData = await call('/public'); assert.equal(publicData.status,200); assert.equal(publicData.data.services.length,5); assert.equal(publicData.data.wings.length,4);
  assert.equal((await call('/member')).status,401); assert.equal((await call('/admin')).status,401);
});
test('registration validates input, rejects duplicate emails, and sets HttpOnly session', async () => {
  assert.equal((await call('/register',{name:'A',email:'invalid',password:'LongPassword-123'})).status,400);
  assert.equal((await call('/register',{name:'A',email:'a@example.test',password:'short'})).status,400);
  const result=await call('/register',{name:'Test Member',email:'a@example.test',password:'MemberPassword-123'});
  assert.equal(result.status,201); assert.equal(result.data.user.role,'member'); assert.ok(!('password' in result.data.user)); memberCookie=result.cookie;
  assert.equal((await call('/register',{name:'A',email:'a@example.test',password:'MemberPassword-123'})).status,409);
  const response=await fetch(`${origin}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'a@example.test',password:'MemberPassword-123'})});
  assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const other=await call('/register',{name:'Another Member',email:'b@example.test',password:'MemberPassword-123'}); otherCookie=other.cookie;
});
test('member cannot access admin data or impersonate admin role', async () => {
  assert.equal((await call('/admin',undefined,{cookie:memberCookie})).status,403);
  assert.equal((await call('/admin/settings',{announcement:'hacked'},{cookie:memberCookie,method:'PUT'})).status,403);
});
test('profile updates persist and invalid wing is rejected', async () => {
  const body={name:'Updated Member',phone:'+234000000000',location:'Port Harcourt',wing:'kings',role:'admin'};
  assert.equal((await call('/profile',body,{cookie:memberCookie,method:'PUT'})).status,200);
  const profile=(await call('/member',undefined,{cookie:memberCookie})).data.user;
  assert.equal(profile.name,'Updated Member'); assert.equal(profile.wing,'kings'); assert.equal(profile.role,'member');
  assert.equal((await call('/profile',{...body,wing:'imaginary'},{cookie:memberCookie,method:'PUT'})).status,400);
});
test('multi-level discipleship is saved and isolated between members', async () => {
  const root=await call('/souls',{name:'Root connection',phone:'',parent:'',status:'Growing in faith',notes:'',followup:'2026-11-01'},{cookie:memberCookie}); rootSoul=root.data.id;
  const child=await call('/souls',{name:'Second generation',phone:'',parent:rootSoul,status:'New connection',notes:'',followup:''},{cookie:memberCookie}); childSoul=child.data.id;
  assert.equal(child.status,201);
  const member=(await call('/member',undefined,{cookie:memberCookie})).data;
  assert.equal(member.souls.length,2); assert.equal(member.souls.find(s=>s.id===childSoul).parent,rootSoul);
  assert.equal((await call('/member',undefined,{cookie:otherCookie})).data.souls.length,0);
  assert.equal((await call(`/souls/${rootSoul}`,{status:'Baptised',notes:'',followup:''},{cookie:otherCookie,method:'PUT'})).status,404);
  assert.equal((await call('/souls',{name:'Bad parent',parent:rootSoul,status:'New connection'},{cookie:otherCookie})).status,400);
});
test('deleting a soul preserves descendants and progress updates persist', async () => {
  assert.equal((await call(`/souls/${rootSoul}`,{},{cookie:memberCookie,method:'DELETE'})).status,200);
  assert.equal((await call('/member',undefined,{cookie:memberCookie})).data.souls[0].parent,null);
  assert.equal((await call(`/souls/${childSoul}`,{status:'Baptised',notes:'Followed up',followup:'2026-11-02'},{cookie:memberCookie,method:'PUT'})).status,200);
  assert.equal((await call('/member',undefined,{cookie:memberCookie})).data.souls[0].status,'Baptised');
});
test('RSVP creation is idempotent and can be cancelled', async () => {
  for(let i=0;i<2;i++) assert.equal((await call('/rsvp',{event:'success',attending:true},{cookie:memberCookie})).status,200);
  assert.deepEqual((await call('/member',undefined,{cookie:memberCookie})).data.rsvps,['success']);
  await call('/rsvp',{event:'success',attending:false},{cookie:memberCookie}); assert.equal((await call('/member',undefined,{cookie:memberCookie})).data.rsvps.length,0);
});
test('admin content updates reach public site and unsafe links are rejected', async () => {
  const auth=await call('/login',{email:'admin@thelovechannels.local',password:'TestAdminPassword-321'}); assert.equal(auth.status,200); adminCookie=auth.cookie;
  await call('/admin/settings',{announcement:'An updated church announcement'},{cookie:adminCookie,method:'PUT'});
  assert.equal((await call('/public')).data.settings.announcement,'An updated church announcement');
  assert.equal((await call('/admin/settings',{livestream:'javascript:alert(1)'},{cookie:adminCookie,method:'PUT'})).status,400);
  assert.equal((await call('/admin/wings/kings',{whatsapp:'https://example.com/fake'},{cookie:adminCookie,method:'PUT'})).status,400);
  await call('/admin/wings/kings',{leader:'Test Leader',whatsapp:'https://chat.whatsapp.com/test'},{cookie:adminCookie,method:'PUT'});
  assert.equal((await call('/public')).data.wings[0].leader,'Test Leader');
});
test('admin event create, edit and delete reach public calendar', async () => {
  const event={title:'Test event',date:'2026-12-01T09:00:00+01:00',location:'Church',description:'A test gathering',image:'service-sunday.webp'};
  assert.equal((await call('/admin/events',event,{cookie:adminCookie})).status,201);
  const saved=(await call('/public')).data.events.find(e=>e.title==='Test event'); assert.ok(saved);
  assert.equal((await call(`/admin/events/${saved.id}`,{...event,title:'Updated event'},{cookie:adminCookie,method:'PUT'})).status,200);
  assert.ok((await call('/public')).data.events.some(e=>e.title==='Updated event'));
  await call(`/admin/events/${saved.id}`,{},{cookie:adminCookie,method:'DELETE'});
  assert.ok(!(await call('/public')).data.events.some(e=>e.id===saved.id));
});
test('prayer privacy, admin follow-up, and visit coordination work', async () => {
  await call('/prayers',{message:'Please pray with me.'},{cookie:memberCookie});
  assert.equal((await call('/member',undefined,{cookie:otherCookie})).data.prayers.length,0);
  const admin=(await call('/admin',undefined,{cookie:adminCookie})).data; const prayer=admin.prayers[0]; assert.equal(prayer.message,'Please pray with me.');
  await call(`/admin/prayers/${prayer.id}`,{status:'Praying with you'},{cookie:adminCookie,method:'PUT'});
  assert.equal((await call('/member',undefined,{cookie:memberCookie})).data.prayers[0].status,'Praying with you');
  assert.equal((await call('/visits',{name:'A Visitor',email:'visitor@example.test',service:'success'})).status,201);
  assert.equal((await call('/admin',undefined,{cookie:adminCookie})).data.visits.length,1);
});
test('cross-origin writes and unknown routes are rejected', async () => {
  assert.equal((await call('/profile',{name:'Nope'},{cookie:memberCookie,method:'PUT',headers:{Origin:'https://attacker.example'}})).status,403);
  assert.equal((await call('/unknown',undefined,{cookie:memberCookie})).status,404);
});
test('password changes invalidate other sessions and logout revokes access', async () => {
  const old=await call('/login',{email:'a@example.test',password:'MemberPassword-123'});
  const changed=await call('/password',{currentPassword:'MemberPassword-123',password:'ChangedPassword-123'},{cookie:memberCookie,method:'PUT'});
  assert.equal(changed.status,200); assert.equal((await call('/member',undefined,{cookie:old.cookie})).status,401);
  assert.equal((await call('/login',{email:'a@example.test',password:'MemberPassword-123'})).status,401);
  assert.equal((await call('/login',{email:'a@example.test',password:'ChangedPassword-123'})).status,200);
  await call('/logout',{},{cookie:changed.cookie}); assert.equal((await call('/member',undefined,{cookie:changed.cookie})).status,401);
});
test('normal mode has no demo access or sample member records', async () => {
  const normalOrigin='http://127.0.0.1:4191';
  let output='';
  const normal=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'4191',DATA_DIR:join(directory,'normal'),ADMIN_PASSWORD:'NormalAdminPassword-321'},stdio:['ignore','pipe','pipe']});
  normal.stdout.on('data',chunk=>{output+=chunk;}); normal.stderr.on('data',chunk=>{output+=chunk;});
  try {
    let ready=false;
    for(let i=0;i<300;i++) { try { ready=(await fetch(`${normalOrigin}/api/public`)).ok; } catch {} if(ready || normal.exitCode !== null) break; await delay(100); }
    assert.ok(ready,output);
    assert.equal((await (await fetch(`${normalOrigin}/api/public`)).json()).demoMode,undefined);
    assert.equal((await fetch(`${normalOrigin}/api/demo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin'})})).status,404);
    const login=await fetch(`${normalOrigin}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@thelovechannels.local',password:'NormalAdminPassword-321'})});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const admin=await (await fetch(`${normalOrigin}/api/admin`,{headers:{Cookie:cookie}})).json();
    assert.equal(admin.members.length,1); assert.equal(admin.members[0].role,'admin'); assert.equal(admin.soulCount,0);
    assert.equal((await fetch(`${normalOrigin}/%2e%2e%2fserver/db.mjs`)).status,403);
  } finally { if(normal.exitCode === null) { normal.kill(); await new Promise(resolve=>normal.once('exit',resolve)); } }
});

let workflowCookie,bookingId,observationId,resourceId,orderId;
test('all twelve booking categories persist, stay private, and support admin confirmation',async()=>{
  workflowCookie=(await call('/login',{email:'a@example.test',password:'ChangedPassword-123'})).cookie;
  const types=(await call('/public')).data.bookingTypes;assert.equal(types.length,12);
  const future=new Date(Date.now()+86400000*14).toISOString().slice(0,10);
  for(const [type] of types){const result=await call('/bookings',{type,preferred_date:future,preferred_time:'10:00',phone:'+234123456789',details:'Please arrange this milestone.'},{cookie:workflowCookie});assert.equal(result.status,200);if(type==='counseling')bookingId=result.data.id;}
  assert.equal((await call('/member',undefined,{cookie:workflowCookie})).data.bookings.length,12);
  assert.equal((await call('/member',undefined,{cookie:otherCookie})).data.bookings.length,0);
  assert.equal((await call(`/bookings/${bookingId}`,{status:'Cancelled'},{cookie:otherCookie,method:'PUT'})).status,404);
  assert.equal((await call(`/admin/bookings/${bookingId}`,{status:'Confirmed',admin_note:'See you soon.',scheduled_at:''},{cookie:adminCookie,method:'PUT'})).status,400);
  assert.equal((await call(`/admin/bookings/${bookingId}`,{status:'Confirmed',admin_note:'See you soon.',scheduled_at:future+'T10:00:00+01:00'},{cookie:adminCookie,method:'PUT'})).status,200);
  const saved=(await call('/member',undefined,{cookie:workflowCookie})).data.bookings.find(b=>b.id===bookingId);assert.equal(saved.status,'Confirmed');assert.equal(saved.admin_note,'See you soon.');assert.ok(saved.scheduled_at);
  assert.equal((await call('/bookings',{type:'invalid',preferred_date:future,phone:'123',details:'Test'},{cookie:workflowCookie})).status,400);
  assert.equal((await call('/bookings',{type:'wedding',preferred_date:'2020-01-01',phone:'123',details:'Test'},{cookie:workflowCookie})).status,400);
});
test('testimony publication requires consent and withdrawal removes it from public view',async()=>{
  const privateStory=await call('/testimonies',{title:'A private story',story:'For the team only.',consent:false},{cookie:workflowCookie});
  assert.equal((await call(`/admin/testimonies/${privateStory.data.id}`,{status:'Published'},{cookie:adminCookie,method:'PUT'})).status,400);
  const story=await call('/testimonies',{title:'A public story',story:'An encouragement to the church.',consent:true},{cookie:workflowCookie});
  await call(`/admin/testimonies/${story.data.id}`,{status:'Published'},{cookie:adminCookie,method:'PUT'});
  assert.ok((await call('/public')).data.testimonies.some(t=>t.id===story.data.id));
  assert.equal((await call(`/testimonies/${story.data.id}`,{consent:false},{cookie:otherCookie,method:'PUT'})).status,404);
  await call(`/testimonies/${story.data.id}`,{consent:false},{cookie:workflowCookie,method:'PUT'});
  assert.ok(!(await call('/public')).data.testimonies.some(t=>t.id===story.data.id));
});
test('giving records start unverified, reject invalid amounts, and carry finance updates back to members',async()=>{
  for(const amount of ['-5','0','0.001','1.005','abc'])assert.equal((await call('/giving',{fund:'Offering',amount,reference:''},{cookie:workflowCookie})).status,400);
  const result=await call('/giving',{fund:'Offering',amount:'1500.50',reference:'BANK-TEST',status:'Verified'},{cookie:workflowCookie});
  const records=(await call('/member',undefined,{cookie:workflowCookie})).data.contributions;
  assert.equal(records[0].amount_kobo,150050);assert.equal(records[0].status,'Awaiting verification');
  assert.equal((await call(`/admin/giving/${result.data.id}`,{status:'Verified'},{cookie:workflowCookie,method:'PUT'})).status,403);
  await call(`/admin/giving/${result.data.id}`,{status:'Verified',admin_note:'Confirmed by finance.'},{cookie:adminCookie,method:'PUT'});
  assert.equal((await call('/member',undefined,{cookie:workflowCookie})).data.contributions[0].status,'Verified');
  assert.equal((await call('/member',undefined,{cookie:otherCookie})).data.contributions.length,0);
});
test('observations and inbox replies are isolated and admin replies reach the member',async()=>{
  const result=await call('/messages',{kind:'Observation',subject:'A useful observation',message:'Please consider this improvement.'},{cookie:workflowCookie});observationId=result.data.id;
  assert.equal((await call(`/messages/${observationId}`,{message:'I should not see this.'},{cookie:otherCookie})).status,404);
  assert.equal((await call('/member',undefined,{cookie:otherCookie})).data.threads.length,0);
  await call(`/admin/messages/${observationId}`,{message:'Thank you. We are reviewing it.'},{cookie:adminCookie});
  const thread=(await call('/member',undefined,{cookie:workflowCookie})).data.threads[0];assert.equal(thread.kind,'Observation');assert.equal(thread.messages.length,2);assert.equal(thread.messages[1].role,'admin');
  await call(`/admin/messages/${observationId}`,{status:'Resolved'},{cookie:adminCookie,method:'PUT'});
  assert.equal((await call('/member',undefined,{cookie:workflowCookie})).data.threads[0].status,'Resolved');
});
test('resource publishing, book prices, order history, and collection status are authoritative',async()=>{
  const resource={type:'book',title:'A Real Test Book',author:'Church author',description:'A test catalogue item.',price:'2500',url:'',published:true};
  assert.equal((await call('/admin/resources',resource,{cookie:workflowCookie})).status,403);
  assert.equal((await call('/admin/resources',{...resource,url:'javascript:alert(1)'},{cookie:adminCookie})).status,400);
  await call('/admin/resources',resource,{cookie:adminCookie});resourceId=(await call('/public')).data.resources.find(r=>r.title===resource.title).id;
  assert.equal((await call('/orders',{resource_id:resourceId,quantity:21},{cookie:workflowCookie})).status,400);
  const order=await call('/orders',{resource_id:resourceId,quantity:2,total_kobo:1,reference:'BANK-ORDER'},{cookie:workflowCookie});orderId=order.data.id;
  await call(`/admin/resources/${resourceId}`,{...resource,title:'Updated catalogue title',price:'3500'},{cookie:adminCookie,method:'PUT'});
  const saved=(await call('/member',undefined,{cookie:workflowCookie})).data.orders[0];assert.equal(saved.total_kobo,500000);assert.equal(saved.title,'A Real Test Book');
  await call(`/admin/orders/${orderId}`,{status:'Ready for collection',admin_note:'Collect from the church office.'},{cookie:adminCookie,method:'PUT'});
  assert.equal((await call('/member',undefined,{cookie:workflowCookie})).data.orders[0].status,'Ready for collection');
  await call(`/admin/resources/${resourceId}`,{...resource,published:false},{cookie:adminCookie,method:'PUT'});
  assert.ok(!(await call('/public')).data.resources.some(r=>r.id===resourceId));
  assert.equal((await call('/orders',{resource_id:resourceId,quantity:1},{cookie:workflowCookie})).status,404);
});
test('footer, programme, and giving instructions are editable with validation',async()=>{
  assert.equal((await call('/admin/community',{bankName:'Test Bank'},{cookie:workflowCookie,method:'PUT'})).status,403);
  assert.equal((await call('/admin/community',{accountNumber:'123'},{cookie:adminCookie,method:'PUT'})).status,400);
  assert.equal((await call('/admin/community',{facebook:'javascript:bad'},{cookie:adminCookie,method:'PUT'})).status,400);
  await call('/admin/community',{bankName:'Test Bank',accountName:'Test Church',accountNumber:'0123456789',programs:['A confirmed programme']},{cookie:adminCookie,method:'PUT'});
  const community=(await call('/public')).data.community;assert.equal(community.accountNumber,'0123456789');assert.deepEqual(community.programs,['A confirmed programme']);
});

test('editorial management is admin-only and validates photographs and contact links',async()=>{
 assert.equal((await call('/admin/editorial/people',{name:'Unauthorized',image:'about.webp',published:true},{cookie:otherCookie})).status,403);
 assert.equal((await call('/admin/editorial/people',{name:'Bad image',image:'../../private.sqlite',published:true},{cookie:adminCookie})).status,400);
 assert.equal((await call('/admin/editorial/people',{name:'Bad link',image:'about.webp',url:'javascript:alert(1)',published:true},{cookie:adminCookie})).status,400);
 assert.equal((await call('/admin/editorial/people',{name:'Browser pastor',role:'Pastor',image:'about.webp',phone:'12345',email:'pastor@example.test',description:'A person added by the church team.',published:true},{cookie:adminCookie})).status,200);
 let data=(await call('/public')).data;const person=data.editorial.people.find(p=>p.name==='Browser pastor');assert.ok(person);assert.equal(person.phone,'12345');
 assert.equal((await call(`/admin/editorial/people/${person.id}`,{...person,name:'Updated pastor',published:false},{cookie:adminCookie,method:'PUT'})).status,200);assert.ok(!(await call('/public')).data.editorial.people.some(p=>p.id===person.id));
 assert.ok((await call('/admin',undefined,{cookie:adminCookie})).data.editorial.people.some(p=>p.id===person.id));
 assert.equal((await call(`/admin/editorial/people/${person.id}`,{},{cookie:adminCookie,method:'DELETE'})).status,200);
});
test('announcements and media respect publication windows and member-visible content',async()=>{
 const make=(name,start,end)=>call('/admin/editorial/announcements',{name,description:'Church office update',published:true,start,end},{cookie:adminCookie});
 assert.equal((await make('Visible notice','','')).status,200);await make('Future notice',new Date(Date.now()+86400000).toISOString(),'');await make('Expired notice','',new Date(Date.now()-86400000).toISOString());
 let pub=(await call('/public')).data.editorial;assert.ok(pub.announcements.some(x=>x.name==='Visible notice'));assert.ok(!pub.announcements.some(x=>['Future notice','Expired notice'].includes(x.name)));
 assert.equal((await call('/admin/editorial/podcasts',{name:'A podcast episode',url:'https://example.com/episode.mp3',published:true},{cookie:adminCookie})).status,200);
 assert.equal((await call('/admin/editorial/videos',{name:'A church video',url:'https://www.youtube.com/watch?v=abcdefghijk',published:true},{cookie:adminCookie})).status,200);
 pub=(await call('/public')).data.editorial;assert.ok(pub.podcasts.some(x=>x.name==='A podcast episode'));assert.ok(pub.videos.some(x=>x.name==='A church video'));
 assert.equal((await call('/admin/editorial/settings',{heroVideo:'javascript:bad'},{cookie:adminCookie,method:'PUT'})).status,400);
});
test('special events support TBA, manual publication and automatic expiry',async()=>{
 const base={title:'Programme date to follow',date:'',location:'Church',description:'A church programme',image:'event-love.webp',published:true};
 assert.equal((await call('/admin/events',base,{cookie:adminCookie})).status,201);
 let event=(await call('/public')).data.events.find(x=>x.title===base.title);assert.ok(event);assert.equal(event.date,'');
 const date=new Date(Date.now()+86400000).toISOString();await call(`/admin/events/${event.id}`,{...base,date,published:false},{cookie:adminCookie,method:'PUT'});assert.ok(!(await call('/public')).data.events.some(x=>x.id===event.id));
 await call(`/admin/events/${event.id}`,{...base,date:new Date(Date.now()-172800000).toISOString(),end:new Date(Date.now()-86400000).toISOString()},{cookie:adminCookie,method:'PUT'});assert.ok(!(await call('/public')).data.events.some(x=>x.id===event.id));assert.ok((await call('/admin',undefined,{cookie:adminCookie})).data.events.some(x=>x.id===event.id));
 assert.equal((await call('/admin/events',{...base,date,end:new Date(Date.now()).toISOString()},{cookie:adminCookie})).status,400);
});
test('photo uploads reject unauthorised users and invalid image bytes',async()=>{
 const fake={data:'data:image/webp;base64,'+Buffer.from('this is not a real image file').toString('base64')};assert.equal((await call('/admin/uploads',fake,{cookie:otherCookie})).status,403);assert.equal((await call('/admin/uploads',fake,{cookie:adminCookie})).status,400);
 const {readFileSync,unlinkSync}=await import('node:fs');const data='data:image/png;base64,'+readFileSync(new URL('../public/assets/icon-32.png',import.meta.url)).toString('base64');const upload=await call('/admin/uploads',{data},{cookie:adminCookie});assert.equal(upload.status,200);assert.ok(/^uploads\/[\w-]+\.png$/.test(upload.data.image));assert.equal((await fetch(`${origin}/assets/${upload.data.image}`)).status,200);unlinkSync(new URL('../public/assets/'+upload.data.image,import.meta.url));
});
