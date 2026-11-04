import { db, getDoc, setDoc } from './db.mjs';
import { requireUser, assert, HttpError, textField as field, safeLink, rateLimit, emailField } from './auth.mjs';
import { bookingTypes, bookingStatuses, givingFunds } from '../../public/js/catalogue.js';
const opt = (value, label, max = 500) => field(value ?? '', label, max, false);
const positive = value => { const id = Number(value); assert(Number.isSafeInteger(id) && id > 0, 'Invalid record.'); return id; };
const money = value => { const number = Number(value); assert(['string', 'number'].includes(typeof value) && /^\d+(\.\d{1,2})?$/.test(String(value)) && Number.isFinite(number) && number >= 0.01 && number <= 100000000, 'Enter an amount between ₦0.01 and ₦100,000,000, with at most two decimal places.'); return Math.round(number * 100); };
function date(value) { const text = field(value, 'Preferred date', 10); assert(/^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text, 'Choose a valid date.'); assert(text >= new Date(Date.now() + 3600000).toISOString().slice(0, 10), 'Choose today or a future date.'); return text; }
export async function communityApi(req, path, body) {
    const method = req.method, admin = path.startsWith('/api/admin/'), user = (await requireUser(req, admin));
    if (path === '/api/bookings' && method === 'POST') {
        (await rateLimit(req, 'booking', 30));
        const type = field(body.type, 'Booking type', 50);
        assert(bookingTypes.some(t => t[0] === type), 'Choose a valid booking type.');
        const time = opt(body.preferred_time, 'Preferred time', 5);
        assert(!time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time), 'Choose a valid time.');
        const result = (await db.prepare('INSERT INTO bookings(user_id,type,preferred_date,preferred_time,phone,details) VALUES(?,?,?,?,?,?)').run(user.id, type, date(body.preferred_date), time, field(body.phone, 'Contact number', 40), field(body.details, 'Details', 3000)));
        return { id: Number(result.lastInsertRowid) };
    }
    let match = path.match(/^\/api\/bookings\/(\d+)$/);
    if (match && method === 'PUT') {
        const id = positive(match[1]), record = (await db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(id, user.id));
        assert(record, 'Booking not found.', 404);
        assert(['Requested', 'Confirmed'].includes(record.status), 'This booking can no longer be cancelled.');
        assert(body.status === 'Cancelled', 'Members can only cancel their own booking.');
        (await db.prepare("UPDATE bookings SET status='Cancelled' WHERE id=?").run(id));
        return { ok: true };
    }
    if (path === '/api/testimonies' && method === 'POST') {
        (await rateLimit(req, 'testimony', 15));
        assert(typeof body.consent === 'boolean', 'Choose your publication preference.');
        const result = (await db.prepare('INSERT INTO testimonies(user_id,title,story,consent) VALUES(?,?,?,?)').run(user.id, field(body.title, 'Title', 150), field(body.story, 'Your testimony', 5000), body.consent ? 1 : 0));
        return { id: Number(result.lastInsertRowid) };
    }
    match = path.match(/^\/api\/testimonies\/(\d+)$/);
    if (match && method === 'PUT') {
        const id = positive(match[1]);
        assert((await db.prepare('SELECT id FROM testimonies WHERE id=? AND user_id=?').get(id, user.id)), 'Testimony not found.', 404);
        assert(body.consent === false, 'Use this action to withdraw publication consent.');
        (await db.prepare("UPDATE testimonies SET consent=0,status='Private' WHERE id=?").run(id));
        return { ok: true };
    }
    if (path === '/api/giving' && method === 'POST') {
        (await rateLimit(req, 'giving', 25));
        assert(givingFunds.includes(body.fund), 'Choose a valid giving fund.');
        const reference = opt(body.reference, 'Transfer reference', 150);
        const result = (await db.prepare('INSERT INTO contributions(user_id,fund,amount_kobo,reference,status) VALUES(?,?,?,?,?)').run(user.id, body.fund, money(body.amount), reference, reference ? 'Awaiting verification' : 'Pledged'));
        return { id: Number(result.lastInsertRowid) };
    }
    if (path === '/api/messages' && method === 'POST') {
        (await rateLimit(req, 'message', 40));
        assert(['General', 'Observation', 'Pastoral care', 'Order support'].includes(body.kind), 'Choose a valid message category.');
        const subject = field(body.subject, 'Subject', 180), message = field(body.message, 'Message', 4000);
        (await db.exec('BEGIN'));
        try {
            const result = (await db.prepare('INSERT INTO threads(user_id,kind,subject) VALUES(?,?,?)').run(user.id, body.kind, subject));
            (await db.prepare('INSERT INTO thread_messages(thread_id,sender,body) VALUES(?,?,?)').run(result.lastInsertRowid, user.id, message));
            (await db.exec('COMMIT'));
            return { id: Number(result.lastInsertRowid) };
        }
        catch (error) {
            (await db.exec('ROLLBACK'));
            throw error;
        }
    }
    match = path.match(/^\/api\/(admin\/)?messages\/(\d+)$/);
    if (match && ['POST', 'PUT'].includes(method)) {
        const id = positive(match[2]), thread = (await db.prepare('SELECT * FROM threads WHERE id=?').get(id));
        assert(thread && (admin || thread.user_id === user.id), 'Conversation not found.', 404);
        if (method === 'PUT') {
            assert(admin, 'Administrator access required.', 403);
            assert(['Open', 'Resolved'].includes(body.status), 'Invalid status.');
            (await db.prepare('UPDATE threads SET status=? WHERE id=?').run(body.status, id));
        }
        else {
            (await rateLimit(req, 'reply', 60));
            (await db.prepare('INSERT INTO thread_messages(thread_id,sender,body) VALUES(?,?,?)').run(id, user.id, field(body.message, 'Reply', 4000)));
            (await db.prepare("UPDATE threads SET status='Open' WHERE id=?").run(id));
        }
        return { ok: true };
    }
    if (path === '/api/orders' && method === 'POST') {
        (await rateLimit(req, 'order', 25));
        const resource = (await db.prepare('SELECT * FROM resources WHERE id=? AND published=1').get(positive(body.resource_id)));
        assert(resource, 'Resource not found.', 404);
        assert(resource.type === 'book', 'Only books can be ordered.');
        const quantity = Number(body.quantity);
        assert(Number.isInteger(quantity) && quantity >= 1 && quantity <= 20, 'Choose 1–20 copies.');
        const reference = opt(body.reference, 'Transfer reference', 150);
        const result = (await db.prepare('INSERT INTO orders(user_id,resource_id,title,quantity,total_kobo,reference,status) VALUES(?,?,?,?,?,?,?)').run(user.id, resource.id, resource.title, quantity, resource.price_kobo * quantity, reference, resource.price_kobo === 0 ? 'Requested' : 'Awaiting payment'));
        return { id: Number(result.lastInsertRowid) };
    }
    if (path === '/api/admin/community' && method === 'PUT') {
        const old = (await getDoc('community')), updated = { ...old };
        for (const key of ['gphTitle', 'gphText', 'testimonyTitle', 'testimonyIntro', 'secondaryPhone', 'secondaryEmail', 'bankName', 'accountName', 'accountNumber', 'givingNote'])
            updated[key] = opt(body[key] ?? old[key], key, ['gphText', 'testimonyIntro', 'givingNote'].includes(key) ? 2000 : 300);
        if (updated.secondaryEmail)
            updated.secondaryEmail = emailField(updated.secondaryEmail);
        for (const key of ['facebook', 'instagram', 'twitter'])
            updated[key] = safeLink(body[key] ?? old[key], key);
        for (const key of ['values', 'programs']) {
            if (body[key] !== undefined) {
                assert(Array.isArray(body[key]) && body[key].length <= 20, `Invalid ${key}.`);
                updated[key] = body[key].map(value => field(value, key, 180));
            }
        }
        assert(!updated.accountNumber || /^\d{10}$/.test(updated.accountNumber), 'Nigerian account numbers must contain 10 digits.');
        (await setDoc('community', updated));
        return { ok: true };
    }
    match = path.match(/^\/api\/admin\/bookings\/(\d+)$/);
    if (match && method === 'PUT') {
        const id = positive(match[1]);
        assert((await db.prepare('SELECT id FROM bookings WHERE id=?').get(id)), 'Booking not found.', 404);
        assert(bookingStatuses.includes(body.status), 'Invalid booking status.');
        const scheduled = opt(body.scheduled_at, 'Confirmed date/time', 50);
        assert(!scheduled || !isNaN(Date.parse(scheduled)), 'Enter a valid appointment time.');
        if (body.status === 'Confirmed')
            assert(scheduled, 'Set a confirmed date/time before confirming this booking.');
        (await db.prepare('UPDATE bookings SET status=?,scheduled_at=?,admin_note=? WHERE id=?').run(body.status, scheduled ? new Date(scheduled).toISOString() : '', opt(body.admin_note, 'Member update', 2000), id));
        return { ok: true };
    }
    match = path.match(/^\/api\/admin\/testimonies\/(\d+)$/);
    if (match && method === 'PUT') {
        const id = positive(match[1]), record = (await db.prepare('SELECT * FROM testimonies WHERE id=?').get(id));
        assert(record, 'Testimony not found.', 404);
        assert(['Pending review', 'Published', 'Private', 'Declined'].includes(body.status), 'Invalid publication status.');
        assert(body.status !== 'Published' || record.consent === 1, 'Publication consent is required.');
        (await db.prepare('UPDATE testimonies SET status=? WHERE id=?').run(body.status, id));
        return { ok: true };
    }
    match = path.match(/^\/api\/admin\/(giving|orders)\/(\d+)$/);
    if (match && method === 'PUT') {
        const table = match[1] === 'giving' ? 'contributions' : 'orders', id = positive(match[2]);
        const allowed = table === 'orders' ? ['Requested', 'Awaiting payment', 'Paid — processing', 'Ready for collection', 'Completed', 'Cancelled'] : ['Pledged', 'Awaiting verification', 'Verified', 'Not received'];
        assert(allowed.includes(body.status), 'Invalid status.');
        assert((await db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id)), 'Record not found.', 404);
        (await db.prepare(`UPDATE ${table} SET status=?,admin_note=? WHERE id=?`).run(body.status, opt(body.admin_note, 'Member update', 2000), id));
        return { ok: true };
    }
    match = path.match(/^\/api\/admin\/resources(?:\/(\d+))?$/);
    if (match && ['POST', 'PUT'].includes(method)) {
        assert(['book', 'message'].includes(body.type), 'Choose book or message.');
        assert(typeof body.published === 'boolean', 'Choose publication status.');
        const price = body.price === '' || Number(body.price) === 0 ? 0 : money(body.price);
        const url = safeLink(body.url || '', 'Resource link');
        const values = [body.type, field(body.title, 'Title', 200), field(body.author, 'Author / speaker', 150), field(body.description, 'Description', 3000), price, url, body.published ? 1 : 0];
        if (match[1]) {
            assert(method === 'PUT', 'Use PUT to edit a resource.');
            assert((await db.prepare('UPDATE resources SET type=?,title=?,author=?,description=?,price_kobo=?,url=?,published=? WHERE id=?').run(...values, positive(match[1]))).changes, 'Resource not found.', 404);
        }
        else {
            assert(method === 'POST', 'Use POST to create a resource.');
            (await db.prepare('INSERT INTO resources(type,title,author,description,price_kobo,url,published) VALUES(?,?,?,?,?,?,?)').run(...values));
        }
        return { ok: true };
    }
    throw new HttpError(404, 'This endpoint does not exist.');
}
