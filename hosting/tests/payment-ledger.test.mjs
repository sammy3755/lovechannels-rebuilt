import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
process.env.LC_PGLITE='1';process.env.ADMIN_PASSWORD='LedgerVerification-123';
const {db}=await import('../server/db.mjs');
await import('../server/community.mjs');
const {settlePayment,validSignature,paymentApi}=await import('../server/payments.mjs');
const {withDatabase,closeDatabase}=await import('../postgres.mjs');
after(closeDatabase);
test('signature authenticates the exact webhook bytes',()=>{
 const body='{"event":"charge.success"}',key='test-only',signature=createHmac('sha512',key).update(body).digest('hex');
 assert.equal(validSignature(body,signature,key),true);assert.equal(validSignature(body+' ',signature,key),false);assert.equal(validSignature(body,'fake',key),false);
});
test('hosted ledger rejects mismatches and settles concurrent gifts once',async()=>{
 const user=(await db.prepare('SELECT id FROM users LIMIT 1').get()).id;
 await db.prepare('INSERT INTO payments(reference,user_id,email,purpose,fund,amount_kobo) VALUES(?,?,?,?,?,?)').run('gift',user,'admin@example.test','giving','Offering',50000);
 const valid={reference:'gift',status:'success',amount:50000,currency:'NGN'};
 for(const invalid of [{amount:1},{currency:'USD'},{status:'pending'}])await assert.rejects(withDatabase(()=>settlePayment({...valid,...invalid})));
 assert.equal((await db.prepare('SELECT status FROM payments WHERE reference=?').get('gift')).status,'Pending');
 await Promise.all([withDatabase(()=>settlePayment(valid)),withDatabase(()=>settlePayment(valid))]);
 assert.equal(Number((await db.prepare('SELECT count(*) AS n FROM contributions WHERE reference=?').get('gift')).n),1);
});
test('hosted checkout uses authoritative prices and verifies before fulfilment',async()=>{
 const {startSession}=await import('../server/auth.mjs'),user=(await db.prepare('SELECT id FROM users LIMIT 1').get()).id;let cookie;
 await startSession({setHeader:(_,value)=>cookie=value.split(';')[0]},user);
 const resource=await db.prepare("INSERT INTO resources(type,title,author,description,price_kobo,published) VALUES('book','Priced book','Author','Description',120000,1)").run();
 process.env.PAYSTACK_SECRET_KEY='sk_test_unit_only';process.env.PUBLIC_URL='https://church.example.test';
 const originalFetch=globalThis.fetch;let outgoing;
 globalThis.fetch=async(url,options)=>{
  assert.equal(new URL(url).hostname,'api.paystack.co');
  if(url.includes('initialize')){outgoing=JSON.parse(options.body);return Response.json({status:true,data:{authorization_url:'https://checkout.paystack.com/test',reference:outgoing.reference}});}
  return Response.json({status:true,data:{reference:outgoing.reference,amount:outgoing.amount,currency:'NGN',status:'success'}});
 };
 try{
  const req={method:'POST',headers:{cookie},socket:{remoteAddress:'127.0.0.1'}};
  const result=await withDatabase(()=>paymentApi(req,'/api/payments/initialize',{purpose:'purchase',resource_id:Number(resource.lastInsertRowid),quantity:2,amount:'0.01'}));
  assert.equal(outgoing.amount,240000);assert.equal((await db.prepare('SELECT status FROM payments WHERE reference=?').get(result.reference)).status,'Pending');
  assert.equal((await withDatabase(()=>paymentApi(req,'/api/payments/verify',{reference:result.reference}))).status,'Paid');
  assert.equal((await db.prepare('SELECT status FROM orders WHERE reference=?').get(result.reference)).status,'Paid — awaiting fulfilment');
 }finally{globalThis.fetch=originalFetch;delete process.env.PAYSTACK_SECRET_KEY;delete process.env.PUBLIC_URL;}
});
