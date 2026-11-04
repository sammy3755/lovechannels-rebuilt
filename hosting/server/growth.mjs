import { randomUUID } from 'node:crypto';
import { db, getDoc, setDoc } from './db.mjs';
import { requireUser, assert, textField as field, emailField, safeLink, rateLimit } from './auth.mjs';
import { growthDefaults } from './growth-content.mjs';
(await db.exec(`
CREATE TABLE IF NOT EXISTS analytics_events(id INTEGER PRIMARY KEY,visitor TEXT NOT NULL,kind TEXT NOT NULL,route TEXT NOT NULL,target TEXT NOT NULL,device TEXT NOT NULL,browser TEXT NOT NULL,region TEXT NOT NULL,source TEXT NOT NULL,campaign TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS analytics_date ON analytics_events(created);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,image TEXT NOT NULL DEFAULT 'hero.webp',cta TEXT NOT NULL DEFAULT 'Register interest',published INTEGER NOT NULL DEFAULT 0,starts TEXT NOT NULL DEFAULT '',ends TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS campaign_leads(id INTEGER PRIMARY KEY,campaign TEXT NOT NULL REFERENCES campaigns(id),name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,source TEXT NOT NULL,medium TEXT NOT NULL,tag TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),subject TEXT NOT NULL,question TEXT NOT NULL,answer TEXT NOT NULL DEFAULT '',answered TEXT NOT NULL DEFAULT '',created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS homecells(id INTEGER PRIMARY KEY,name TEXT NOT NULL,area TEXT NOT NULL,address TEXT NOT NULL,leader TEXT NOT NULL,phone TEXT NOT NULL,whatsapp TEXT NOT NULL DEFAULT '',map TEXT NOT NULL DEFAULT '',wing TEXT NOT NULL DEFAULT '',capacity INTEGER NOT NULL DEFAULT 20,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS member_connections(user_id INTEGER PRIMARY KEY REFERENCES users(id),area TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',interests TEXT NOT NULL DEFAULT '',marital_status TEXT NOT NULL DEFAULT '',wing_preference TEXT NOT NULL DEFAULT '',cell_id INTEGER REFERENCES homecells(id) ON DELETE SET NULL,assignment_status TEXT NOT NULL DEFAULT 'Pending directory',call_consent INTEGER NOT NULL DEFAULT 0,updated TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS followups(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),purpose TEXT NOT NULL,scheduled TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Needs provider',created TEXT DEFAULT CURRENT_TIMESTAMP);
`));
if (!(await db.prepare('SELECT key FROM documents WHERE key=?').get('growth')))
    (await setDoc('growth', growthDefaults));
const opt = (v, n, max = 500) => field(v ?? '', n, max, false);
export const activeCampaign = c => Boolean(c.published && (!c.starts || Date.parse(c.starts) <= Date.now()) && (!c.ends || Date.parse(c.ends) > Date.now()));
export async function publicGrowth() { return { ...(await getDoc('growth')), campaigns: (await db.prepare('SELECT * FROM campaigns ORDER BY rowid DESC').all()).filter(activeCampaign), paymentReady: Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PUBLIC_URL) }; }
export async function connection(id) { const c = (await db.prepare('SELECT * FROM member_connections WHERE user_id=?').get(id)); return { ...c, cell: c?.cell_id ? (await db.prepare('SELECT * FROM homecells WHERE id=? AND active=1').get(c.cell_id)) : null }; }
export async function memberGrowth(id) { return { connection: (await connection(id)), questions: (await db.prepare('SELECT * FROM questions WHERE user_id=? ORDER BY id DESC').all(id)) }; }
export async function adminGrowth() { return { campaigns: (await db.prepare('SELECT * FROM campaigns ORDER BY rowid DESC').all()), leads: (await db.prepare('SELECT * FROM campaign_leads ORDER BY id DESC LIMIT 500').all()), questions: (await db.prepare('SELECT questions.*,users.name FROM questions JOIN users ON users.id=user_id ORDER BY id DESC').all()), cells: (await db.prepare('SELECT homecells.*,(SELECT count(*) FROM member_connections WHERE cell_id=homecells.id) AS assigned FROM homecells').all()), connections: (await db.prepare('SELECT member_connections.*,users.name,users.email FROM member_connections JOIN users ON users.id=user_id').all()), followups: (await db.prepare('SELECT followups.*,users.name,users.phone,member_connections.call_consent FROM followups JOIN users ON users.id=followups.user_id LEFT JOIN member_connections ON member_connections.user_id=users.id ORDER BY id DESC').all()), analytics: (await analyticsSummary()), settings: (await getDoc('growth')) }; }
const clean = v => String(v || '').toLowerCase().trim().replace(/\s+/g, ' ');
export async function assignCell(id) {
    const c = (await connection(id));
    if (!c.user_id)
        return;
    // Existing active assignment stays stable; admin can explicitly reassign.
    if (c.cell)
        return;
    const cells = (await db.prepare('SELECT * FROM homecells WHERE active=1 ORDER BY id FOR UPDATE').all());
    let chosen;
    for(const cell of cells){
      if(clean(cell.area)!==clean(c.area)||(cell.wing&&cell.wing!==c.wing_preference))continue;
      const used=(await db.prepare('SELECT count(*) AS n FROM member_connections WHERE cell_id=?').get(cell.id)).n;
      if(used<cell.capacity){chosen=cell;break;}
    }
    (await db.prepare('UPDATE member_connections SET cell_id=?,assignment_status=? WHERE user_id=?').run(chosen?.id || null, chosen ? 'Assigned' : cells.length ? 'Awaiting matching cell' : 'Pending directory', id));
    if (chosen?.wing)
        (await db.prepare('UPDATE users SET wing=? WHERE id=?').run(chosen.wing, id));
}
async function analyticsSummary() {
    (await db.prepare("DELETE FROM analytics_events WHERE created<datetime('now','-90 days')").run());
    const where = "WHERE created>=datetime('now','-30 days')";
    const group = async (column, kind) => (await db.prepare(`SELECT ${column} AS label,count(*) AS count FROM analytics_events ${where}${kind ? ' AND kind=?' : ''} GROUP BY ${column} ORDER BY count DESC LIMIT 30`).all(...(kind ? [kind] : [])));
    return { totals: (await db.prepare(`SELECT count(*) AS events,count(DISTINCT visitor) AS visitors,sum(kind='pageview') AS pageviews,sum(kind='click') AS clicks FROM analytics_events ${where}`).get()), devices: (await group('device', 'pageview')), browsers: (await group('browser', 'pageview')), regions: (await group('region', 'pageview')), pages: (await group('route', 'pageview')), targets: (await group('target', 'click')), sources: (await group('source', 'pageview')), campaigns: (await group('campaign', 'pageview')), depth: (await group('target', 'scroll')), daily: (await db.prepare(`SELECT date(created) AS label,count(*) AS count FROM analytics_events ${where} AND kind='pageview' GROUP BY date(created) ORDER BY label`).all()) };
}
export async function growthApi(req, path, body) {
    const method = req.method;
    if (path === '/api/analytics' && method === 'POST') {
        (await rateLimit(req, 'analytics', 600));
        assert(body.consent === true, 'Analytics consent required.');
        assert(/^[a-f0-9-]{36}$/.test(body.visitor), 'Invalid visit identifier.');
        assert(['pageview', 'click', 'scroll', 'conversion'].includes(body.kind), 'Invalid event.');
        const route = opt(body.route, 'Route', 140);
        assert(/^#\/[a-z0-9/-]*$/.test(route) && !/^#\/(member|admin)/.test(route), 'Public routes only.');
        const ua = req.headers['user-agent'] || '', device = /tablet|ipad/i.test(ua) ? 'Tablet' : /mobile|iphone|android/i.test(ua) ? 'Mobile' : 'Desktop', browser = /Edg\//.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Other';
        // Use a geolocation header only behind an explicitly configured, trusted reverse proxy.
        const header = process.env.TRUSTED_COUNTRY_HEADER?.toLowerCase(), country = header ? req.headers[header] : '';
        const region = typeof country === 'string' && /^[A-Z]{2}$/.test(country) ? country : 'Unknown (no geo provider)';
        const target = opt(body.target, 'Target', 100);
        assert(/^[a-zA-Z0-9_/#: .%-]*$/.test(target), 'Invalid target.');
        (await db.prepare('INSERT INTO analytics_events(visitor,kind,route,target,device,browser,region,source,campaign) VALUES(?,?,?,?,?,?,?,?,?)').run(body.visitor, body.kind, route, target, device, browser, region, opt(body.source, 'Source', 100), opt(body.campaign, 'Campaign', 100)));
        (await db.prepare("DELETE FROM analytics_events WHERE created<datetime('now','-90 days')").run());
        return { ok: true };
    }
    if (path === '/api/campaign-leads' && method === 'POST') {
        (await rateLimit(req, 'campaign-lead', 12));
        assert(body.consent === true, 'Please agree to be contacted about this campaign.');
        assert(!body.website, 'Unable to submit.');
        const c = (await db.prepare('SELECT * FROM campaigns WHERE id=?').get(field(body.campaign, 'Campaign', 80)));
        assert(c && activeCampaign(c), 'This campaign is not accepting registrations.', 404);
        (await db.prepare('INSERT INTO campaign_leads(campaign,name,email,phone,source,medium,tag) VALUES(?,?,?,?,?,?,?)').run(c.id, field(body.name, 'Name', 100), emailField(body.email), field(body.phone, 'Phone', 40), opt(body.source, 'Source', 100), opt(body.medium, 'Medium', 100), opt(body.tag, 'Campaign tag', 100)));
        return { ok: true };
    }
    const admin = path.startsWith('/api/admin/'), user = (await requireUser(req, admin));
    if (path === '/api/questions' && method === 'POST') {
        (await rateLimit(req, 'questions', 20));
        const r = (await db.prepare('INSERT INTO questions(user_id,subject,question) VALUES(?,?,?)').run(user.id, field(body.subject, 'Subject', 160), field(body.question, 'Question', 4000)));
        return { id: Number(r.lastInsertRowid) };
    }
    let m = path.match(/^\/api\/admin\/questions\/(\d+)$/);
    if (m && method === 'PUT') {
        assert((await db.prepare('SELECT id FROM questions WHERE id=?').get(m[1])), 'Question not found.', 404);
        (await db.prepare('UPDATE questions SET answer=?,answered=CURRENT_TIMESTAMP WHERE id=?').run(field(body.answer, 'Answer', 6000), m[1]));
        return { ok: true };
    }
    if (path === '/api/connections' && method === 'PUT') {
        assert(!body.wing_preference || (await getDoc('wings')).some(w => w.id === body.wing_preference), 'Choose an available wing.');
        assert(['', 'Single', 'Married', 'Prefer not to say', 'Other'].includes(body.marital_status), 'Choose marital status.');
        assert(typeof body.call_consent === 'boolean', 'Choose calling preference.');
        (await db.prepare('INSERT INTO member_connections(user_id,area,address,interests,marital_status,wing_preference,call_consent) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET area=excluded.area,address=excluded.address,interests=excluded.interests,marital_status=excluded.marital_status,wing_preference=excluded.wing_preference,call_consent=excluded.call_consent,updated=CURRENT_TIMESTAMP').run(user.id, field(body.area, 'Area', 150), field(body.address, 'Address', 500), opt(body.interests, 'Interests', 1000), body.marital_status, opt(body.wing_preference, 'Wing', 50), body.call_consent ? 1 : 0));
        if (body.phone !== undefined)
            (await db.prepare('UPDATE users SET phone=? WHERE id=?').run(field(body.phone, 'Phone', 40), user.id));
        if (body.wing_preference)
            (await db.prepare('UPDATE users SET wing=? WHERE id=?').run(body.wing_preference, user.id));
        if (!body.call_consent)
            (await db.prepare("UPDATE followups SET status='Cancelled — consent withdrawn' WHERE user_id=? AND status='Needs provider'").run(user.id));
        (await assignCell(user.id));
        return { connection: (await connection(user.id)) };
    }
    if (path === '/api/admin/growth-settings' && method === 'PUT') {
        const old = (await getDoc('growth'));
        for (const key of ['newBuildingAddress', 'accountName'])
            old[key] = opt(body[key] ?? old[key], key, 600);
        for (const key of ['newBuildingMap', 'liveUrl'])
            old[key] = safeLink(body[key] ?? old[key], key);
        if (body.accounts !== undefined) {
            assert(Array.isArray(body.accounts) && body.accounts.length <= 10, 'Use up to 10 accounts.');
            old.accounts = body.accounts.map(a => { assert(/^\d{10}$/.test(a.number), 'Account numbers must have ten digits.'); assert(['NGN', 'USD', 'GBP', 'EUR'].includes(a.currency), 'Invalid currency.'); return { bank: field(a.bank, 'Bank', 100), number: a.number, currency: a.currency }; });
        }
        if (body.information) {
            assert(Array.isArray(body.information) && body.information.length === 4, 'Keep four information pages.');
            old.information = body.information.map(p => { const before = old.information.find(x => x.id === p.id); assert(before, 'Unknown information page.'); assert(Array.isArray(p.facts) && p.facts.length <= 8 && Array.isArray(p.sections) && p.sections.length <= 8, 'Invalid page sections.'); return { ...before, title: field(p.title, 'Title', 180), intro: field(p.intro, 'Introduction', 1200), facts: p.facts.map(f => field(f, 'Fact', 300)), sections: p.sections.map(s => { assert(Array.isArray(s) && s.length === 2, 'Invalid section.'); return [field(s[0], 'Heading', 180), field(s[1], 'Text', 2500)]; }) }; });
        }
        if (body.sermons) {
            assert(Array.isArray(body.sermons) && body.sermons.length <= 100, 'Use up to 100 sermons.');
            old.sermons = body.sermons.map(s => ({ title: field(s.title, 'Title', 180), speaker: field(s.speaker, 'Speaker', 180), date: opt(s.date, 'Date', 10), url: safeLink(s.url, 'Sermon page'), audio: safeLink(s.audio, 'Audio') }));
        }
        (await setDoc('growth', old));
        return { ok: true };
    }
    if (path === '/api/admin/campaigns' && method === 'POST') {
        const id = field(body.id || randomUUID(), 'Campaign URL slug', 80);
        assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), 'Use lowercase words separated by hyphens.');
        assert(!(await db.prepare('SELECT id FROM campaigns WHERE id=?').get(id)), 'This slug is already used.', 409);
        (await db.prepare('INSERT INTO campaigns(id,title,description) VALUES(?,?,?)').run(id, field(body.title, 'Title', 180), field(body.description, 'Description', 4000)));
        return { id };
    }
    m = path.match(/^\/api\/admin\/campaigns\/([a-z0-9-]+)$/);
    if (m && method === 'PUT') {
        assert((await db.prepare('SELECT id FROM campaigns WHERE id=?').get(m[1])), 'Campaign not found.', 404);
        const start = opt(body.starts, 'Start', 50), end = opt(body.ends, 'End', 50);
        assert((!start || Number.isFinite(Date.parse(start))) && (!end || Number.isFinite(Date.parse(end))) && (!start || !end || Date.parse(end) > Date.parse(start)), 'Choose a valid campaign period.');
        const image = field(body.image, 'Image', 120);
        assert(/^[a-zA-Z0-9_.-]+\.(webp|jpg|png)$/.test(image), 'Choose an asset filename.');
        (await db.prepare('UPDATE campaigns SET title=?,description=?,image=?,cta=?,published=?,starts=?,ends=? WHERE id=?').run(field(body.title, 'Title', 180), field(body.description, 'Description', 4000), image, field(body.cta, 'Button label', 100), body.published === true ? 1 : 0, start, end, m[1]));
        return { ok: true };
    }
    if (path === '/api/admin/homecells' && method === 'POST') {
        const rows = body.cells;
        assert(Array.isArray(rows) && rows.length > 0 && rows.length <= 100, 'Upload 1–100 homecells.');
        const cells = (await Promise.all(rows.map(async (c) => { const wing = opt(c.wing, 'Wing', 50); assert(!wing || (await getDoc('wings')).some(w => w.id === wing), 'Unknown wing ID.'); const capacity = Number(c.capacity || 20); assert(Number.isInteger(capacity) && capacity > 0 && capacity <= 1000, 'Capacity must be 1–1000.'); return [field(c.name, 'Cell name', 150), field(c.area, 'Area', 150), field(c.address, 'Address', 500), field(c.leader, 'Leader', 150), field(c.phone, 'Phone', 40), safeLink(c.whatsapp, 'WhatsApp', true), safeLink(c.map, 'Map'), wing, capacity]; })));
        (await db.exec('BEGIN'));
        try {
            for (const c of cells)
                (await db.prepare('INSERT INTO homecells(name,area,address,leader,phone,whatsapp,map,wing,capacity) VALUES(?,?,?,?,?,?,?,?,?)').run(...c));
            for (const c of (await db.prepare('SELECT user_id FROM member_connections WHERE cell_id IS NULL').all()))
                (await assignCell(c.user_id));
            (await db.exec('COMMIT'));
        }
        catch (e) {
            (await db.exec('ROLLBACK'));
            throw e;
        }
        return { ok: true, imported: cells.length };
    }
    m = path.match(/^\/api\/admin\/homecells\/(\d+)$/);
    if (m && method === 'DELETE') {
        assert((await db.prepare('SELECT id FROM homecells WHERE id=?').get(m[1])), 'Cell not found.', 404);
        (await db.prepare('DELETE FROM homecells WHERE id=?').run(m[1]));
        for (const c of (await db.prepare('SELECT user_id FROM member_connections WHERE cell_id IS NULL').all()))
            (await assignCell(c.user_id));
        return { ok: true };
    }
    m = path.match(/^\/api\/admin\/connections\/(\d+)$/);
    if (m && method === 'PUT') {
        const cell = (await db.prepare('SELECT * FROM homecells WHERE id=? AND active=1').get(Number(body.cell_id)));
        assert(cell, 'Choose an active cell.');
        assert((await db.prepare('SELECT user_id FROM member_connections WHERE user_id=?').get(m[1])), 'Member connection not found.', 404);
        const used = (await db.prepare('SELECT count(*) AS n FROM member_connections WHERE cell_id=? AND user_id<>?').get(cell.id, m[1])).n;
        assert(used < cell.capacity, 'This cell is full.');
        (await db.prepare("UPDATE member_connections SET cell_id=?,assignment_status='Assigned by admin' WHERE user_id=?").run(cell.id, m[1]));
        if (cell.wing)
            (await db.prepare('UPDATE users SET wing=? WHERE id=?').run(cell.wing, m[1]));
        return { ok: true };
    }
    if (path === '/api/admin/followups' && method === 'POST') {
        const member = (await db.prepare('SELECT users.id,users.phone,member_connections.call_consent FROM users JOIN member_connections ON users.id=user_id WHERE users.id=?').get(Number(body.user_id)));
        assert(member && member.call_consent && member.phone, 'Member must opt in and provide a phone number.');
        assert(['Pastoral follow-up', 'Event reminder', 'Evangelism follow-up', 'Close-contact check-in'].includes(body.purpose), 'Choose a purpose.');
        const scheduled = field(body.scheduled, 'Scheduled date', 50);
        assert(Date.parse(scheduled) > Date.now(), 'Choose a future date.');
        (await db.prepare('INSERT INTO followups(user_id,purpose,scheduled) VALUES(?,?,?)').run(member.id, body.purpose, scheduled));
        return { ok: true, providerConnected: false };
    }
    m = path.match(/^\/api\/admin\/followups\/(\d+)$/);
    if (m && method === 'DELETE') {
        (await db.prepare("UPDATE followups SET status='Cancelled' WHERE id=?").run(m[1]));
        return { ok: true };
    }
    assert(false, 'Route not found.', 404);
}
