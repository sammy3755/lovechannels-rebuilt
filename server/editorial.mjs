import {originalCentres} from './centres.mjs';
import {db,getDoc,setDoc} from './db.mjs';
import {assert,requireUser,textField as field,safeLink,emailField} from './auth.mjs';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const assetRoot=fileURLToPath(new URL('../public/assets/',import.meta.url));
export function asset(value){const name=field(value,'Photograph',160);assert(/^[\w-]+(?:\/[\w-]+)?\.(webp|png|jpe?g)$/i.test(name)&&existsSync(assetRoot+name),'Choose or upload a photograph.');return name;}
const optional=(v,label,max=2000)=>field(v??'',label,max,false);
const defaults={
 settings:{youtube:'https://www.youtube.com/@Thelovechannels',heroVideo:'',instagram:'https://instagram.com/thelovechannels',instagramReel:'',podcast:'',mission:'To raise world changers through the preaching of the Gospel of Christ and a community-driven approach.',objectives:'Grow in the Word. Build strong families. Serve our communities. Make disciples.',gphCount:'100+',gphCountLabel:'Streamers',crossImage:'https://as1.ftcdn.net/jpg/08/25/21/60/1000_F_825216052_DjSwxHeaOE7YP9uuUKeFcPMGwMbn9Fjh.jpg',childrenText:'A loving place for children to learn the Word, build friendships, and grow in faith. Speak with the children’s team about age groups, check-in, and service arrangements.'},
 people:[{id:'chioma',name:'Pastor Chioma Rufus',role:'Pastor',image:'service-gph.webp',description:'Global Prophetic Hour · The Love Channels Christian Centre',phone:'',email:'',location:'Port Harcourt',url:'',published:true},{id:'ndubuisi',name:'Pastor Ndubuisi Rufus',role:'Pastor',image:'pastor-ndubuisi.webp',description:'The Love Channels Christian Centre',phone:'',email:'',location:'Port Harcourt',url:'',published:true}],
 announcements:[],podcasts:[],videos:[],
 units:[{id:'children',name:'Children’s Ministry',role:'The next generation',image:'children.webp',description:'A loving place for children to learn the Word and grow in faith.',phone:'',email:'',location:'Plot 175 Ada George Road, Port Harcourt',url:'',published:true},{id:'worship',name:'Worship & music',role:'Service unit',image:'choir.webp',description:'Serve the church family through worship and music.',phone:'',email:'',location:'Port Harcourt',url:'',published:true},{id:'campus',name:'Campus fellowship',role:'Community',image:'campus.webp',description:'Find your church family while studying and growing in faith.',phone:'',email:'',location:'Contact the church office for your campus',url:'',published:true},{id:'outreach',name:'Outreach & evangelism',role:'Service unit',image:'outreach-1.webp',description:'Take the Gospel and practical love beyond the church walls.',phone:'',email:'',location:'Port Harcourt',url:'',published:true}]
};
if(!db.prepare('SELECT key FROM documents WHERE key=?').get('editorial'))setDoc('editorial',defaults);
if(!db.prepare('SELECT key FROM documents WHERE key=?').get('experience-v1')){
 const services=getDoc('services');for(const s of services){if(s.id==='success'||/success/i.test(s.title))s.image='service-sunday-poster.webp';if(/elevation/i.test(s.title))s.image='service-sunday-poster.webp';if(/fire/i.test(s.title))s.image='service-fire-poster.webp';if(/shift/i.test(s.title))s.image='service-shift-poster.webp';if(/prophetic/i.test(s.title))s.image='gph-poster.webp';}setDoc('services',services);
 const wings=getDoc('wings');for(const w of wings)w.images=[w.image,...[0,1,2].map(i=>`wing-${w.id==='royal-ladies'?'royal':w.id}-${i}.webp`).filter(p=>existsSync(assetRoot+p))];setDoc('wings',wings);
 const events=getDoc('events');for(const [id,title,image] of [['love-pain-bliss','Love, Pain & Bliss','event-love.webp'],['hidden-in-christ','Hidden in Christ','event-hidden.webp'],['night-of-opportunities','Night of Opportunities','event-opportunities.webp'],['extol','Extol · The sound of Christmas','event-extol.webp']])if(!events.some(e=>e.id===id)&&existsSync(assetRoot+image))events.push({id,title,image,date:'',location:getDoc('settings').address,description:'A church programme. This cover is from a previous edition; the next date will be announced by the church.',recurring:false,published:true});setDoc('events',events);
 setDoc('experience-v1',true);
}
if(!db.prepare('SELECT key FROM documents WHERE key=?').get('experience-people-v1')){
 const content=getDoc('editorial');
 const people=[['williams','Pastor Williams Chukwu','pastor-williams.webp','Life Experience Centre','08037045706'],['valereen','Pastor Valereen Wealth','pastor-val.webp','Excellent Experience Centre','08130002180'],['harry','Pastor Harry Owanaba','pastor-harry.webp','Godlife Experience Centre','09062711357']];
 for(const [id,name,image,location,phone] of people)if(!content.people.some(p=>p.id===id))content.people.push({id,name,image,location,phone,role:'Pastor / Experience centre',description:'Serving the church family through community, the Word, and discipleship.',email:'',url:'',published:true});
 for(const unit of originalCentres)if(!content.units.some(x=>x.id===unit.id))content.units.push(unit);
 setDoc('editorial',content);setDoc('experience-people-v1',true);
}
if(!db.prepare('SELECT key FROM documents WHERE key=?').get('experience-events-v2')){
 const events=getDoc('events');for(const [id,title,image] of [['kings-week','The Kings Week','event-kings-week.webp'],['thanksgiving','Annual Thanksgiving','event-thanksgiving.webp'],['family-movie','Family Movie Night','event-family-movie.webp'],['divine-acceleration','Divine Acceleration','event-divine.webp']])if(!events.some(e=>e.id===id))events.push({id,title,image,date:'',end:'',location:getDoc('settings').address,description:'A church programme. This cover is from a previous edition. Confirm the next date with the church office.',recurring:false,published:true});setDoc('events',events);setDoc('experience-events-v2',true);
}
if(!db.prepare('SELECT key FROM documents WHERE key=?').get('experience-vision-v1')){
 const settings=getDoc('settings');if(settings.vision==='Raising world changers through the preaching of the gospel of Christ.')settings.vision='Raising world changers through the preaching of the Gospel of Christ and a community-driven approach.';setDoc('settings',settings);setDoc('experience-vision-v1',true);
}
export function scheduled(record,now=Date.now()){return record.published!==false&&(!record.start||Date.parse(record.start)<=now)&&(!record.end||Date.parse(record.end)>=now);}
export function publicEditorial(){const all=getDoc('editorial');return {...all,...Object.fromEntries(['people','units','announcements','videos','podcasts'].map(k=>[k,(all[k]||[]).filter(x=>scheduled(x))]))};}
export function publicEvents(){return getDoc('events').filter(x=>x.published!==false&&(x.recurring||!x.date||Date.parse(x.end||x.date)+(!x.end?86400000:0)>=Date.now()));}
export function assets(){return readdirSync(assetRoot).filter(f=>/\.webp$/.test(f));}
export async function editorialApi(req,path,body){
 requireUser(req,true);
 if(path==='/api/admin/uploads'&&req.method==='POST'){
  assert(typeof body.data==='string'&&body.data.length<4200000,'Upload an image smaller than 3MB.');const match=body.data.match(/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/);assert(match,'Use a JPEG, PNG or WebP image.');const bytes=Buffer.from(match[2],'base64');const type=match[1];assert(bytes.length<3000000&&bytes.length>20,'Invalid image size.');assert(type==='webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':type==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216,'Invalid image format.');mkdirSync(assetRoot+'uploads',{recursive:true});const image=`uploads/${randomUUID()}.${type==='jpeg'?'jpg':type}`;writeFileSync(assetRoot+image,bytes);return {image};
 }
 const content=getDoc('editorial');
 if(path==='/api/admin/editorial/settings'&&req.method==='PUT'){
  const next={...content.settings};for(const key of Object.keys(defaults.settings)){if(body[key]!==undefined)next[key]=['youtube','heroVideo','instagram','instagramReel','podcast','crossImage'].includes(key)?safeLink(body[key],key):optional(body[key],key,3000);}content.settings=next;setDoc('editorial',content);return {ok:true};
 }
 const match=path.match(/^\/api\/admin\/editorial\/(people|units|announcements|videos|podcasts)(?:\/([\w-]+))?$/);assert(match,'Page not found.',404);
 const [,collection,id]=match,list=content[collection]||[];const index=list.findIndex(item=>item.id===id);
 if(req.method==='DELETE'){assert(index>=0,'Record not found.',404);list.splice(index,1);}
 else {
  assert(['POST','PUT'].includes(req.method),'Method not allowed.',405);if(req.method==='PUT')assert(index>=0,'Record not found.',404);assert(list.length<100||index>=0,'This section has reached its limit.');
  const item={id:id||randomUUID(),name:field(body.name,'Title / name',180),role:optional(body.role,'Role / category',120),description:optional(body.description,'Description',5000),image:body.image?asset(body.image):'',phone:optional(body.phone,'Phone',60),email:body.email?emailField(body.email):'',location:optional(body.location,'Location',400),url:safeLink(body.url||'','Link'),published:body.published===true,start:optional(body.start,'Start',50),end:optional(body.end,'End',50)};
  for(const key of ['start','end'])assert(!item[key]||Number.isFinite(Date.parse(item[key])),'Choose a valid publication date.');assert(!item.end||!item.start||Date.parse(item.end)>Date.parse(item.start),'End must follow start.');
  if(collection==='people'||collection==='units')assert(item.image,'Choose a photograph.');
  if(collection==='podcasts'||collection==='videos')assert(item.url,'Add an episode or video link.');
  if(index>=0)list[index]=item;else list.push(item);
 }
 content[collection]=list;setDoc('editorial',content);return {ok:true};
}
