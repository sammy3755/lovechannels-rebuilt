import {dummyPassword} from './passwords.mjs';
import {googleApi,googleEnabled} from './google.mjs';
import { publicGrowth, memberGrowth, adminGrowth, growthApi } from './growth.mjs';
import { paymentApi, adminPayments } from './payments.mjs';
import { editorialApi, publicEditorial, publicEvents, asset, assets } from './editorial.mjs';
import { randomUUID } from 'node:crypto';
import { db, getDoc, setDoc, hashPassword, publicUser } from './db.mjs';
import { assert, HttpError, currentUser, requireUser, startSession, endSession, validPassword, rateLimit, textField as field, emailField, safeLink, passwordField } from './auth.mjs';
import { publicCommunity, memberCommunity, adminCommunity } from './community.mjs';
import { communityApi } from './community-api.mjs';
const statuses = ['New connection', 'Growing in faith', 'Foundation class', 'Baptised', 'Discipling others'];
const idField = value => { const id = Number(value); assert(Number.isSafeInteger(id) && id > 0, 'Invalid record.'); return id; };
const optional = (value, label, max = 500) => field(value ?? '', label, max, false);
const imageField = asset;
export async function api(req, res, path, body) {
    const method = req.method;
 if(path==='/api/demo')throw new HttpError(404,'Endpoint not found.');
 await rateLimit(req,'api-total',1200);
 if(!['GET','HEAD'].includes(method))await rateLimit(req,'api-write',180);
    const send = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({...data,...('sessionInfo' in req?{session:req.sessionInfo}:{})})); };
 if(path==='/api/auth/config')return send({googleEnabled:googleEnabled()});
 if(path.startsWith('/api/auth/google/'))return googleApi(req,res,path,body,send);
    if (path.startsWith('/api/payments/'))
        return send(await paymentApi(req, path, body));
    if (/^\/api\/(analytics|campaign-leads|questions|connections)$/.test(path) || /^\/api\/admin\/(growth-settings|campaigns|homecells|connections|questions|followups)(?:\/|$)/.test(path))
        return send(await growthApi(req, path, body));
    if (path === '/api/public' && method === 'GET')
        return send({ googleEnabled:googleEnabled(),settings: (await getDoc('settings')), services: (await getDoc('services')), wings: (await getDoc('wings')), events: (await publicEvents()), editorial: (await publicEditorial()), assets: assets(), ...(await publicCommunity()), growth: (await publicGrowth()) });
    if (path.startsWith('/api/admin/editorial/') || path === '/api/admin/uploads')
        return send(await editorialApi(req, path, body));
    if (path === '/api/session' && method === 'GET') {
        const user = (await currentUser(req,false));
        return send({ user: user ? publicUser(user) : null });
    }
    if(path==='/api/session/touch'&&method==='POST'){await rateLimit(req,'session-touch',120);const user=await requireUser(req);return send({user:publicUser(user)});}
  if (path === '/api/login' && method === 'POST') {
        (await rateLimit(req, 'login'));
        const email = emailField(body.email), password = passwordField(body.password);
        await rateLimit(req,'login-account:'+email,10);
    const user = (await db.prepare('SELECT * FROM users WHERE email=?').get(email));
        // A dummy hash computation keeps unknown-email attempts similarly expensive.
        const valid = await validPassword(password, user?.password || dummyPassword);
        assert(user && valid, 'Email or password is incorrect.', 401);
    assert(body.admin!==true||user.role==='admin','Use an administrator account to access administration.',403);
    if(!user.password.startsWith('scrypt-v2:'))await db.prepare('UPDATE users SET password=? WHERE id=?').run(await hashPassword(password),user.id);
        (await startSession(res, user.id,req));
        return send({ user: publicUser(user) });
    }
    if (path === '/api/register' && method === 'POST') {
        (await rateLimit(req, 'register', 8));
        const name = field(body.name, 'Name', 100), email = emailField(body.email), password = passwordField(body.password);
        assert(password.length >= 15, 'Use a password with at least 15 characters.');
        assert(!(await db.prepare('SELECT id FROM users WHERE email=?').get(email)), 'An account already exists with this email.', 409);
        const result = (await db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name, email, await hashPassword(password)));
        const user = (await db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid));
        (await startSession(res, user.id,req));
        return send({ user: publicUser(user) }, 201);
    }
  if (path === '/api/logout' && method === 'POST') {
        (await endSession(req, res));
        return send({ ok: true });
    }
    if (path === '/api/visits' && method === 'POST') {
        (await rateLimit(req, 'visit', 8));
        const name = field(body.name, 'Name', 100), email = emailField(body.email), service = field(body.service, 'Service', 100);
        assert((await getDoc('services')).some(s => s.id === service), 'Choose an available service.');
        (await db.prepare('INSERT INTO visits(name,email,service) VALUES(?,?,?)').run(name, email, service));
        return send({ ok: true }, 201);
    }
    if (/^\/api\/(?:bookings|testimonies|giving|messages|orders)(?:\/|$)/.test(path) || /^\/api\/admin\/(?:community|bookings|testimonies|giving|messages|orders|resources)(?:\/|$)/.test(path))
        return send(await communityApi(req, path, body));
    const user = (await requireUser(req, path.startsWith('/api/admin')));
    if (path === '/api/member' && method === 'GET')
        return send({
            growth: (await memberGrowth(user.id)), ...(await memberCommunity(user.id)), user: publicUser(user), souls: (await db.prepare('SELECT * FROM souls WHERE owner=? ORDER BY id').all(user.id)),
            prayers: (await db.prepare('SELECT * FROM prayers WHERE user_id=? ORDER BY id DESC').all(user.id)),
            rsvps: (await db.prepare('SELECT event_id FROM rsvps WHERE user_id=?').all(user.id)).map(r => r.event_id)
        });
    if (path === '/api/profile' && method === 'PUT') {
        const name = field(body.name, 'Name', 100), phone = optional(body.phone, 'Phone', 40), location = optional(body.location, 'Location', 200), wing = optional(body.wing, 'Wing', 50);
        assert(!wing || (await getDoc('wings')).some(w => w.id === wing), 'Choose an available wing.');
        (await db.prepare('UPDATE users SET name=?,phone=?,location=?,wing=? WHERE id=?').run(name, phone, location, wing, user.id));
        return send({ user: publicUser((await db.prepare('SELECT * FROM users WHERE id=?').get(user.id))) });
    }
    if (path === '/api/password' && method === 'PUT') {
        await rateLimit(req,'password-change',5);
    const previous = passwordField(body.currentPassword), next = passwordField(body.password);
        assert(await validPassword(previous, user.password), 'Current password is incorrect.', 400);
        assert(next.length >= 15, 'Use at least 15 characters.');
        (await db.prepare('UPDATE users SET password=? WHERE id=?').run(await hashPassword(next), user.id));
        (await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id));
        (await startSession(res, user.id,req));
        return send({ ok: true });
    }
    if (path === '/api/souls' && method === 'POST') {
        const name = field(body.name, 'Name', 100), phone = optional(body.phone, 'Phone', 40), notes = optional(body.notes, 'Notes', 2000), followup = optional(body.followup, 'Follow-up', 10);
        assert(!followup || /^\d{4}-\d{2}-\d{2}$/.test(followup), 'Enter a valid follow-up date.');
        const parent = body.parent ? idField(body.parent) : null;
        assert(!parent || (await db.prepare('SELECT id FROM souls WHERE id=? AND owner=?').get(parent, user.id)), 'Choose a person in your own tree.');
        const status = field(body.status, 'Status', 50);
        assert(statuses.includes(status), 'Invalid discipleship stage.');
        const result = (await db.prepare('INSERT INTO souls(owner,parent,name,phone,status,notes,followup) VALUES(?,?,?,?,?,?,?)').run(user.id, parent, name, phone, status, notes, followup));
        return send({ id: Number(result.lastInsertRowid) }, 201);
    }
    const soulMatch = path.match(/^\/api\/souls\/(\d+)$/);
    if (soulMatch && ['PUT', 'DELETE'].includes(method)) {
        const id = idField(soulMatch[1]);
        assert((await db.prepare('SELECT id FROM souls WHERE id=? AND owner=?').get(id, user.id)), 'Person not found.', 404);
        if (method === 'DELETE') {
            // Keep descendants: attach them to the removed person's parent.
            const soul = (await db.prepare('SELECT parent FROM souls WHERE id=?').get(id));
            (await db.exec('BEGIN'));
            try {
                (await db.prepare('UPDATE souls SET parent=? WHERE parent=?').run(soul.parent, id));
                (await db.prepare('DELETE FROM souls WHERE id=?').run(id));
                (await db.exec('COMMIT'));
            }
            catch (error) {
                (await db.exec('ROLLBACK'));
                throw error;
            }
        }
        else {
            const status = field(body.status, 'Status', 50);
            assert(statuses.includes(status), 'Invalid stage.');
            const existing = (await db.prepare('SELECT name,phone FROM souls WHERE id=?').get(id));
            const followup = optional(body.followup, 'Follow-up', 10);
            assert(!followup || /^\d{4}-\d{2}-\d{2}$/.test(followup), 'Enter a valid follow-up date.');
            (await db.prepare('UPDATE souls SET name=?,phone=?,status=?,notes=?,followup=? WHERE id=?').run(field(body.name ?? existing.name, 'Name', 100), optional(body.phone ?? existing.phone, 'Phone', 40), status, optional(body.notes, 'Notes', 2000), followup, id));
        }
        return send({ ok: true });
    }
    if (path === '/api/prayers' && method === 'POST') {
        (await rateLimit(req, 'prayer', 20));
        (await db.prepare('INSERT INTO prayers(user_id,message) VALUES(?,?)').run(user.id, field(body.message, 'Prayer request', 3000)));
        return send({ ok: true }, 201);
    }
    if (path === '/api/rsvp' && method === 'POST') {
        const event = field(body.event, 'Event', 100);
        assert((await getDoc('events')).some(e => e.id === event), 'Event not found.', 404);
        assert(typeof body.attending === 'boolean', 'Choose whether you are attending.');
        if (body.attending)
            (await db.prepare('INSERT OR IGNORE INTO rsvps(user_id,event_id) VALUES(?,?)').run(user.id, event));
        else
            (await db.prepare('DELETE FROM rsvps WHERE user_id=? AND event_id=?').run(user.id, event));
        return send({ ok: true });
    }
    if (path === '/api/admin' && method === 'GET')
        return send({
            growth: (await adminGrowth()), payments: (await adminPayments()), ...(await adminCommunity()), events: (await getDoc('events')), editorial: (await getDoc('editorial')),
            members: (await db.prepare('SELECT id,name,email,phone,location,wing,role,created FROM users ORDER BY id DESC').all()),
            prayers: (await db.prepare('SELECT prayers.*, users.name FROM prayers JOIN users ON users.id=prayers.user_id ORDER BY prayers.id DESC').all()),
            visits: (await db.prepare('SELECT * FROM visits ORDER BY id DESC').all()),
            rsvps: (await db.prepare('SELECT event_id,count(*) AS count FROM rsvps GROUP BY event_id').all()),
            soulCount: (await db.prepare('SELECT count(*) AS count FROM souls').get()).count
        });
    if (path === '/api/admin/settings' && method === 'PUT') {
        const data = {};
        for (const [key, value] of Object.entries((await getDoc('settings'))))
            data[key] = field(body[key] ?? value, key, key === 'about' ? 3000 : 600);
        data.whatsapp = safeLink(data.whatsapp, 'Church WhatsApp', true);
        data.livestream = safeLink(data.livestream, 'Livestream');
        data.email = emailField(data.email);
        (await setDoc('settings', data));
        return send({ ok: true });
    }
    const wingMatch = path.match(/^\/api\/admin\/wings\/([a-z-]+)$/);
    if (wingMatch && method === 'PUT') {
        const wings = (await getDoc('wings')), index = wings.findIndex(w => w.id === wingMatch[1]);
        assert(index >= 0, 'Wing not found.', 404);
        const wing = wings[index];
        for (const key of ['name', 'description', 'leader', 'location', 'contact'])
            wing[key] = field(body[key] ?? wing[key], key, 400, ['name', 'description', 'location'].includes(key));
        if (body.images !== undefined) {
            assert(Array.isArray(body.images) && body.images.length > 0 && body.images.length <= 8, 'Choose one to eight wing photographs.');
            wing.images = body.images.map(asset);
            wing.image = wing.images[0];
        }
        wing.whatsapp = safeLink(body.whatsapp || '', 'Wing WhatsApp', true);
        (await setDoc('wings', wings));
        return send({ ok: true });
    }
    const serviceMatch = path.match(/^\/api\/admin\/services\/([a-z-]+)$/);
    if (serviceMatch && method === 'PUT') {
        const services = (await getDoc('services')), service = services.find(s => s.id === serviceMatch[1]);
        assert(service, 'Service not found.', 404);
        for (const key of ['title', 'day', 'description', 'label'])
            service[key] = field(body[key] ?? service[key], key, 500);
        if (body.image)
            service.image = (await asset(body.image));
        service.time = optional(body.time, 'Time', 5);
        assert(!service.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(service.time), 'Enter a valid time.');
        (await setDoc('services', services));
        return send({ ok: true });
    }
    if (path === '/api/admin/events' && method === 'POST') {
        const title = field(body.title, 'Event title', 160), date = optional(body.date, 'Date', 50), location = field(body.location, 'Location', 250), description = field(body.description, 'Description', 2000);
        assert(!date || Number.isFinite(Date.parse(date)), 'Enter a valid date.');
        assert(!body.end || (Number.isFinite(Date.parse(body.end)) && (!date || Date.parse(body.end) > Date.parse(date))), 'Event end must follow its start.');
        const events = (await getDoc('events'));
        events.push({ id: randomUUID(), title, date: date ? new Date(date).toISOString() : '', location, description, image: (await imageField(body.image || 'service-sunday.webp')), registrationUrl: safeLink(body.registrationUrl||'', 'Registration URL'), recurring: false, published: body.published !== false, end: optional(body.end, 'Event end', 50) });
        (await setDoc('events', events));
        return send({ ok: true }, 201);
    }
    const eventMatch = path.match(/^\/api\/admin\/events\/([\w-]+)$/);
    if (eventMatch && ['PUT', 'DELETE'].includes(method)) {
        const events = (await getDoc('events')), index = events.findIndex(e => e.id === eventMatch[1]);
        assert(index >= 0, 'Event not found.', 404);
        if (method === 'DELETE') {
            events.splice(index, 1);
            (await db.prepare('DELETE FROM rsvps WHERE event_id=?').run(eventMatch[1]));
        }
        else {
            const event = events[index];
            for (const key of ['title', 'location', 'description'])
                event[key] = field(body[key], key, key === 'description' ? 2000 : 250);
            assert(!body.date || Number.isFinite(Date.parse(body.date)), 'Enter a valid date.');
            event.date = body.date ? new Date(body.date).toISOString() : '';
            event.published = body.published !== false;
            event.end = optional(body.end, 'Event end', 50);
            event.image = (await imageField(body.image || event.image));
            event.recurring = false; event.registrationUrl=safeLink(body.registrationUrl??event.registrationUrl??'','Registration URL');
        }
        const changed = events.find(x => x.id === eventMatch[1]);
        if (changed?.end) {
            assert(Number.isFinite(Date.parse(changed.end)) && (!changed.date || Date.parse(changed.end) > Date.parse(changed.date)), 'Event end must follow its start.');
        }
        (await setDoc('events', events));
        return send({ ok: true });
    }
    const prayerMatch = path.match(/^\/api\/admin\/prayers\/(\d+)$/);
    if (prayerMatch && method === 'PUT') {
        assert(['Received', 'Praying with you', 'Followed up'].includes(body.status), 'Invalid prayer status.');
        assert((await db.prepare('UPDATE prayers SET status=? WHERE id=?').run(body.status, idField(prayerMatch[1]))).changes, 'Request not found.', 404);
        return send({ ok: true });
    }
    const memberMatch = path.match(/^\/api\/admin\/members\/(\d+)$/);
    if (memberMatch && method === 'PUT') {
        const wing = optional(body.wing, 'Wing', 50);
        assert(!wing || (await getDoc('wings')).some(w => w.id === wing), 'Invalid wing.');
        assert((await db.prepare('UPDATE users SET wing=? WHERE id=?').run(wing, idField(memberMatch[1]))).changes, 'Member not found.', 404);
        return send({ ok: true });
    }
    throw new HttpError(404, 'This endpoint does not exist.');
}
