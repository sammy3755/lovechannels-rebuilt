import {AsyncLocalStorage} from 'node:async_hooks';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import pg from 'pg';

const scope=new AsyncLocalStorage(),testMode=process.env.LC_PGLITE==='1';
pg.types.setTypeParser(20,v=>{const n=Number(v);if(!Number.isSafeInteger(n))throw Error('Database integer exceeds the supported range.');return n;});
let pool,limiterPool,lite,queue=Promise.resolve();
if(testMode){
 const {PGlite}=await import('@electric-sql/pglite');lite=new PGlite();
 await lite.exec(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
}else{
 const value=process.env.DATABASE_URL||process.env.POSTGRES_URL;
 if(!value)throw Error('Set DATABASE_URL to the church Postgres database before starting the hosted API.');
 const address=new URL(value);address.searchParams.delete('sslmode');address.searchParams.delete('channel_binding');
 const config={connectionString:address.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000,idleTimeoutMillis:20000};
 pool=new pg.Pool({...config,max:5});limiterPool=new pg.Pool({...config,max:2});
}
const utcNow="to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')";
/** Translate the existing parameterised SQL vocabulary; no SQL is supplied by clients. */
export function postgresSQL(input){
 let sql=input.trim().replace(/;$/,'');
 // Explicit schema names work with transaction-mode connection pooling.
 const tables='documents|users|sessions|souls|prayers|rsvps|visits|bookings|testimonies|contributions|threads|thread_messages|resources|orders|campaigns|campaign_leads|analytics_events|homecells|member_connections|followups|questions|payments|uploaded_assets|request_limits';
 sql=sql.replace(new RegExp('\\b(FROM|JOIN|UPDATE|INTO)\\s+('+tables+')\\b','gi'),(_,keyword,table)=>keyword+' lovechannels.'+table);

 sql=sql.replace(/\bCURRENT_TIMESTAMP\b/gi,utcNow).replace(/ORDER BY rowid DESC/gi,'ORDER BY created DESC');
 sql=sql.replace(/datetime\('now','-(\d+) days'\)/g,(_,days)=>`to_char((now() AT TIME ZONE 'UTC') - INTERVAL '${days} days','YYYY-MM-DD HH24:MI:SS')`);
 sql=sql.replace(/sum\(kind='([^']+)'\)/g,(_,kind)=>`sum((kind='${kind}')::integer)`);
 if(/^INSERT OR IGNORE /i.test(sql))sql=sql.replace(/^INSERT OR IGNORE /i,'INSERT ')+' ON CONFLICT DO NOTHING';
 let quoted=false,index=0;
 sql=sql.replace(/'(?:''|[^'])*'|\?/g,token=>token==='?'?'$'+(++index):token);
 return sql;
}
function normalise(row){
 if(!row)return row;
 return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]));
}
const client=()=>scope.getStore()?.client||lite||pool;
async function query(sql,params=[]){return client().query(postgresSQL(sql),params);}
export const db={
 prepare(sql){return {
  async get(...params){return normalise((await query(sql,params)).rows[0]);},
  async all(...params){return (await query(sql,params)).rows.map(normalise);},
  async run(...params){
   const table=sql.match(/^\s*INSERT(?: OR IGNORE)? INTO\s+(\w+)/i)?.[1];
   const returning=table&&!['documents','sessions','rsvps','member_connections','payments','uploaded_assets','request_limits'].includes(table);
   const result=await query(sql+(returning?' RETURNING id':''),params);
   return {changes:result.rowCount??result.affectedRows??result.rows.length,lastInsertRowid:result.rows[0]?.id};
  }
 };},
 async exec(sql){
  // Schema creation belongs to hosting/schema.sql, applied before deployment.
  if(/CREATE TABLE|PRAGMA/i.test(sql))return;
  const state=scope.getStore(),command=sql.trim().toUpperCase();
  if(state&&['BEGIN','COMMIT','ROLLBACK'].includes(command)){
   if(command==='BEGIN'){const depth=++state.savepoints;return state.client.query(`SAVEPOINT lc_${depth}`);}
   if(state.savepoints>0){const depth=state.savepoints--;return state.client.query(command==='COMMIT'?`RELEASE SAVEPOINT lc_${depth}`:`ROLLBACK TO SAVEPOINT lc_${depth}`);}
   throw Error('Unbalanced database transaction.');
  }
  return query(sql);
 }
};
export async function withDatabase(action){
 const run=async()=>{
  const c=lite||await pool.connect();let releaseLock;
  try{
   await c.query('BEGIN');
   const value=await scope.run({client:c,savepoints:0},action);
   await c.query('COMMIT');return value;
  }catch(e){try{await c.query('ROLLBACK');}catch{}throw e;}
  finally{if(!lite)c.release();}
 };
 // Embedded Postgres verification has one connection; production uses the pool.
 if(testMode){const pending=queue.then(run,run);queue=pending.catch(()=>{});return pending;}
 return run();
}
const testLimits=new Map();
export async function countAttempt(req,key,max){
 const now=Date.now(),until=Math.floor(now/600000+1)*600000;
 const ip=(process.env.VERCEL?req.headers['x-forwarded-for']?.split(',')[0]:req.socket?.remoteAddress)||'unknown';
 if(!testMode&&!process.env.RATE_LIMIT_SECRET)throw Error('RATE_LIMIT_SECRET is required for hosted rate limiting.');
 const digest=createHmac('sha256',process.env.RATE_LIMIT_SECRET||'embedded-verification').update(ip+':'+key+':'+until).digest('hex');
 if(testMode){const n=(testLimits.get(digest)||0)+1;testLimits.set(digest,n);return n<=max;}
 // Independent commit: a rejected login must still count towards its rate limit.
 const result=await limiterPool.query('INSERT INTO lovechannels.request_limits(key,count,expires) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=request_limits.count+1 RETURNING count',[digest,until]);
 await limiterPool.query('DELETE FROM lovechannels.request_limits WHERE expires<$1',[now]);return result.rows[0].count<=max;
}
export async function closeDatabase(){if(lite)await lite.close();else await Promise.all([pool.end(),limiterPool.end()]);}
