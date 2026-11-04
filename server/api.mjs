import {publicGrowth,memberGrowth,adminGrowth,growthApi} from './growth.mjs';
import {paymentApi,adminPayments} from './payments.mjs';
import {editorialApi,publicEditorial,publicEvents,asset,assets} from './editorial.mjs';
import { randomUUID } from 'node:crypto';
import { db, demoMode, getDoc, setDoc, hashPassword, publicUser } from './db.mjs';
import { assert, HttpError, currentUser, requireUser, startSession, endSession, validPassword, rateLimit, textField as field, emailField, safeLink } from './auth.mjs';
import { publicCommunity,memberCommunity,adminCommunity } from './community.mjs';
import { communityApi } from './community-api.mjs';

const statuses = ['New connection', 'Growing in faith', 'Foundation class', 'Baptised', 'Discipling others'];
const idField = value => { const id = Number(value); assert(Number.isSafeInteger(id) && id > 0, 'Invalid record.'); return id; };
const optional = (value, label, max = 500) => field(value ?? '', label, max, false);
const imageField=asset;
export async function api(req, res, path, body) {
  const method = req.method;
  const send = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  if(path.startsWith('/api/payments/'))return send(await paymentApi(req,path,body));
  if(/^\/api\/(analytics|campaign-leads|questions|connections)$/.test(path)||/^\/api\/admin\/(growth-settings|campaigns|homecells|connections|questions|followups)(?:\/|$)/.test(path))return send(await growthApi(req,path,body));
  if (path === '/api/public' && method === 'GET') return send({ settings: getDoc('settings'), services: getDoc('services'), wings: getDoc('wings'), events:publicEvents(),editorial:publicEditorial(),assets:assets(),demoMode,...publicCommunity(),growth:publicGrowth() });
  if(path.startsWith('/api/admin/editorial/')||path==='/api/admin/uploads')return send(await editorialApi(req,path,body));
  if (path === '/api/session' && method === 'GET') { const user = currentUser(req); return send({ user: user ? publicUser(user) : null }); }
  if (path === '/api/login' && method === 'POST') {
    rateLimit(req, 'login');
    const email = emailField(body.email), password = field(body.password, 'Password', 256);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    // A dummy hash computation keeps unknown-email attempts similarly expensive.
    const valid = validPassword(password, user?.password || '0123456789abcdef0123456789abcdef:' + '00'.repeat(64));
    assert(user && valid, 'Email or password is incorrect.', 401);
    startSession(res, user.id); return send({ user: publicUser(user) });
  }
  if (path === '/api/register' && method === 'POST') {
    rateLimit(req, 'register', 8);
    const name = field(body.name, 'Name', 100), email = emailField(body.email), password = field(body.password, 'Password', 256);
    assert(password.length >= 12, 'Use a password with at least 12 characters.');
    assert(!db.prepare('SELECT id FROM users WHERE email=?').get(email), 'An account already exists with this email.', 409);
    const result = db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name, email, hashPassword(password));
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    startSession(res, user.id); return send({ user: publicUser(user) }, 201);
  }
  if (path === '/api/demo' && method === 'POST') {
    assert(demoMode, 'Demo access is disabled.', 404);
    rateLimit(req, 'demo');
    assert(['member', 'admin'].includes(body.role), 'Invalid demo role.');
    const user = body.role === 'admin' ? db.prepare("SELECT * FROM users WHERE role='admin' LIMIT 1").get() : db.prepare('SELECT * FROM users WHERE email=?').get('grace@example.test');
    startSession(res, user.id); return send({ user: publicUser(user) });
  }
  if (path === '/api/logout' && method === 'POST') { endSession(req, res); return send({ ok: true }); }
  if (path === '/api/visits' && method === 'POST') {
    rateLimit(req, 'visit', 8);
    const name = field(body.name, 'Name', 100), email = emailField(body.email), service = field(body.service, 'Service', 100);
    assert(getDoc('services').some(s => s.id === service), 'Choose an available service.');
    db.prepare('INSERT INTO visits(name,email,service) VALUES(?,?,?)').run(name, email, service);
    return send({ ok: true }, 201);
  }
  if (/^\/api\/(?:bookings|testimonies|giving|messages|orders)(?:\/|$)/.test(path) || /^\/api\/admin\/(?:community|bookings|testimonies|giving|messages|orders|resources)(?:\/|$)/.test(path)) return send(await communityApi(req,path,body));
  const user = requireUser(req, path.startsWith('/api/admin'));
  if (path === '/api/member' && method === 'GET') return send({
    growth:memberGrowth(user.id),...memberCommunity(user.id),user: publicUser(user), souls: db.prepare('SELECT * FROM souls WHERE owner=? ORDER BY id').all(user.id),
    prayers: db.prepare('SELECT * FROM prayers WHERE user_id=? ORDER BY id DESC').all(user.id),
    rsvps: db.prepare('SELECT event_id FROM rsvps WHERE user_id=?').all(user.id).map(r => r.event_id)
  });
  if (path === '/api/profile' && method === 'PUT') {
    const name = field(body.name, 'Name', 100), phone = optional(body.phone, 'Phone', 40), location = optional(body.location, 'Location', 200), wing = optional(body.wing, 'Wing', 50);
    assert(!wing || getDoc('wings').some(w => w.id === wing), 'Choose an available wing.');
    db.prepare('UPDATE users SET name=?,phone=?,location=?,wing=? WHERE id=?').run(name, phone, location, wing, user.id);
    return send({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
  }
  if (path === '/api/password' && method === 'PUT') {
    const previous = field(body.currentPassword, 'Current password', 256), next = field(body.password, 'New password', 256);
    assert(validPassword(previous, user.password), 'Current password is incorrect.', 400);
    assert(next.length >= 12, 'Use at least 12 characters.');
    db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(next), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    startSession(res, user.id); return send({ ok: true });
  }
  if (path === '/api/souls' && method === 'POST') {
    const name = field(body.name, 'Name', 100), phone = optional(body.phone, 'Phone', 40), notes = optional(body.notes, 'Notes', 2000), followup = optional(body.followup, 'Follow-up', 10);
    assert(!followup || /^\d{4}-\d{2}-\d{2}$/.test(followup), 'Enter a valid follow-up date.');
    const parent = body.parent ? idField(body.parent) : null;
    assert(!parent || db.prepare('SELECT id FROM souls WHERE id=? AND owner=?').get(parent, user.id), 'Choose a person in your own tree.');
    const status = field(body.status, 'Status', 50); assert(statuses.includes(status), 'Invalid discipleship stage.');
    const result = db.prepare('INSERT INTO souls(owner,parent,name,phone,status,notes,followup) VALUES(?,?,?,?,?,?,?)').run(user.id, parent, name, phone, status, notes, followup);
    return send({ id: Number(result.lastInsertRowid) }, 201);
  }
  const soulMatch = path.match(/^\/api\/souls\/(\d+)$/);
  if (soulMatch && ['PUT', 'DELETE'].includes(method)) {
    const id = idField(soulMatch[1]);
    assert(db.prepare('SELECT id FROM souls WHERE id=? AND owner=?').get(id, user.id), 'Person not found.', 404);
    if (method === 'DELETE') {
      // Keep descendants: attach them to the removed person's parent.
      const soul = db.prepare('SELECT parent FROM souls WHERE id=?').get(id);
      db.exec('BEGIN');
      try { db.prepare('UPDATE souls SET parent=? WHERE parent=?').run(soul.parent, id); db.prepare('DELETE FROM souls WHERE id=?').run(id); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    } else {
      const status = field(body.status, 'Status', 50); assert(statuses.includes(status), 'Invalid stage.');
      const existing = db.prepare('SELECT name,phone FROM souls WHERE id=?').get(id);
      const followup = optional(body.followup, 'Follow-up', 10);
      assert(!followup || /^\d{4}-\d{2}-\d{2}$/.test(followup), 'Enter a valid follow-up date.');
      db.prepare('UPDATE souls SET name=?,phone=?,status=?,notes=?,followup=? WHERE id=?').run(field(body.name ?? existing.name, 'Name', 100), optional(body.phone ?? existing.phone, 'Phone', 40), status, optional(body.notes, 'Notes', 2000), followup, id);
    }
    return send({ ok: true });
  }
  if (path === '/api/prayers' && method === 'POST') {
    rateLimit(req, 'prayer', 20);
    db.prepare('INSERT INTO prayers(user_id,message) VALUES(?,?)').run(user.id, field(body.message, 'Prayer request', 3000));
    return send({ ok: true }, 201);
  }
  if (path === '/api/rsvp' && method === 'POST') {
    const event = field(body.event, 'Event', 100); assert(getDoc('events').some(e => e.id === event), 'Event not found.', 404);
    assert(typeof body.attending === 'boolean', 'Choose whether you are attending.');
    if (body.attending) db.prepare('INSERT OR IGNORE INTO rsvps(user_id,event_id) VALUES(?,?)').run(user.id, event);
    else db.prepare('DELETE FROM rsvps WHERE user_id=? AND event_id=?').run(user.id, event);
    return send({ ok: true });
  }
  if (path === '/api/admin' && method === 'GET') return send({
    growth:adminGrowth(),payments:adminPayments(),...adminCommunity(),events:getDoc('events'),editorial:getDoc('editorial'),
    members: db.prepare('SELECT id,name,email,phone,location,wing,role,created FROM users ORDER BY id DESC').all(),
    prayers: db.prepare('SELECT prayers.*, users.name FROM prayers JOIN users ON users.id=prayers.user_id ORDER BY prayers.id DESC').all(),
    visits: db.prepare('SELECT * FROM visits ORDER BY id DESC').all(),
    rsvps: db.prepare('SELECT event_id,count(*) AS count FROM rsvps GROUP BY event_id').all(),
    soulCount: db.prepare('SELECT count(*) AS count FROM souls').get().count
  });
  if (path === '/api/admin/settings' && method === 'PUT') {
    const data = {};
    for (const [key,value] of Object.entries(getDoc('settings'))) data[key] = field(body[key] ?? value, key, key === 'about' ? 3000 : 600);
    data.whatsapp = safeLink(data.whatsapp, 'Church WhatsApp', true);
    data.livestream = safeLink(data.livestream, 'Livestream'); data.email = emailField(data.email);
    setDoc('settings', data); return send({ ok: true });
  }
  const wingMatch = path.match(/^\/api\/admin\/wings\/([a-z-]+)$/);
  if (wingMatch && method === 'PUT') {
    const wings = getDoc('wings'), index = wings.findIndex(w => w.id === wingMatch[1]); assert(index >= 0, 'Wing not found.', 404);
    const wing = wings[index];
    for (const key of ['name','description','leader','location','contact']) wing[key] = field(body[key] ?? wing[key], key, 400, ['name','description','location'].includes(key));
    if(body.images!==undefined){assert(Array.isArray(body.images)&&body.images.length>0&&body.images.length<=8,'Choose one to eight wing photographs.');wing.images=body.images.map(asset);wing.image=wing.images[0];}
    wing.whatsapp = safeLink(body.whatsapp || '', 'Wing WhatsApp', true);
    setDoc('wings', wings); return send({ ok: true });
  }
  const serviceMatch = path.match(/^\/api\/admin\/services\/([a-z-]+)$/);
  if (serviceMatch && method === 'PUT') {
    const services = getDoc('services'), service = services.find(s => s.id === serviceMatch[1]); assert(service, 'Service not found.', 404);
    for (const key of ['title','day','description','label']) service[key] = field(body[key] ?? service[key], key, 500);
    if(body.image)service.image=asset(body.image);
    service.time = optional(body.time, 'Time', 5); assert(!service.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(service.time), 'Enter a valid time.');
    setDoc('services', services); return send({ ok: true });
  }
  if (path === '/api/admin/events' && method === 'POST') {
    const title = field(body.title, 'Event title', 160), date = optional(body.date, 'Date', 50), location = field(body.location, 'Location', 250), description = field(body.description, 'Description', 2000);
    assert(!date||Number.isFinite(Date.parse(date)), 'Enter a valid date.');assert(!body.end||(Number.isFinite(Date.parse(body.end))&&(!date||Date.parse(body.end)>Date.parse(date))),'Event end must follow its start.');
    const events = getDoc('events'); events.push({ id: randomUUID(), title, date:date?new Date(date).toISOString():'', location, description, image: imageField(body.image || 'service-sunday.webp'), recurring: false,published:body.published!==false,end:optional(body.end,'Event end',50) });
    setDoc('events', events); return send({ ok: true }, 201);
  }
  const eventMatch = path.match(/^\/api\/admin\/events\/([\w-]+)$/);
  if (eventMatch && ['PUT','DELETE'].includes(method)) {
    const events = getDoc('events'), index = events.findIndex(e => e.id === eventMatch[1]); assert(index >= 0, 'Event not found.', 404);
    if (method === 'DELETE') { events.splice(index, 1); db.prepare('DELETE FROM rsvps WHERE event_id=?').run(eventMatch[1]); }
    else {
      const event = events[index];
      for (const key of ['title','location','description']) event[key] = field(body[key], key, key === 'description' ? 2000 : 250);
      assert(!body.date||Number.isFinite(Date.parse(body.date)), 'Enter a valid date.'); event.date=body.date?new Date(body.date).toISOString():'';event.published=body.published!==false;event.end=optional(body.end,'Event end',50);
      event.image = imageField(body.image || event.image); event.recurring = false;
    }
    const changed=events.find(x=>x.id===eventMatch[1]);if(changed?.end){assert(Number.isFinite(Date.parse(changed.end))&&(!changed.date||Date.parse(changed.end)>Date.parse(changed.date)),'Event end must follow its start.');}
    setDoc('events', events); return send({ ok: true });
  }
  const prayerMatch = path.match(/^\/api\/admin\/prayers\/(\d+)$/);
  if (prayerMatch && method === 'PUT') {
    assert(['Received','Praying with you','Followed up'].includes(body.status), 'Invalid prayer status.');
    assert(db.prepare('UPDATE prayers SET status=? WHERE id=?').run(body.status, idField(prayerMatch[1])).changes, 'Request not found.', 404);
    return send({ ok: true });
  }
  const memberMatch = path.match(/^\/api\/admin\/members\/(\d+)$/);
  if (memberMatch && method === 'PUT') {
    const wing = optional(body.wing, 'Wing', 50); assert(!wing || getDoc('wings').some(w => w.id === wing), 'Invalid wing.');
    assert(db.prepare('UPDATE users SET wing=? WHERE id=?').run(wing, idField(memberMatch[1])).changes, 'Member not found.', 404);
    return send({ ok: true });
  }
  throw new HttpError(404, 'This endpoint does not exist.');
}
