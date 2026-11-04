import { countAttempt } from '../postgres.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { db } from './db.mjs';
export class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
export const assert = (condition, message, status = 400) => { if (!condition)
    throw new HttpError(status, message); };
const digest = token => createHash('sha256').update(token).digest('hex');
export async function currentUser(req) {
    const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('lc_session='))?.slice(11);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
        return null;
    return (await db.prepare('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>?').get(digest(token), Date.now())) || null;
}
export async function requireUser(req, admin = false) {
    const user = (await currentUser(req));
    assert(user, 'Please sign in to continue.', 401);
    assert(!admin || user.role === 'admin', 'Administrator access is required.', 403);
    return user;
}
export async function startSession(res, id) {
    const token = randomBytes(32).toString('hex');
    (await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()));
    (await db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(digest(token), id, Date.now() + 86400000));
    res.setHeader('Set-Cookie', `lc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
}
export async function endSession(req, res) {
    const token = req.headers.cookie?.match(/(?:^|;\s*)lc_session=([^;]+)/)?.[1];
    if (token)
        (await db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token)));
    res.setHeader('Set-Cookie', `lc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
}
export {validPassword} from './passwords.mjs';
export async function rateLimit(req, key, max = 20) { assert(await countAttempt(req, key, max), 'Too many attempts. Please try again in ten minutes.', 429); }
export const textField = (value, label, max = 500, required = true) => {
    assert(typeof value === 'string', `${label} must be text.`);
    const result = value.trim();
    assert((!required || result.length > 0) && result.length <= max, `${label} must be ${required ? '1' : '0'}–${max} characters.`);
    return result;
};
export const emailField = value => {
    const email = textField(value, 'Email', 254).toLowerCase();
    assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address.');
    return email;
};
export function safeLink(value, label, whatsapp = false) {
    if (!value)
        return '';
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new HttpError(400, `${label} must be a valid HTTPS URL.`);
    }
    assert(url.protocol === 'https:' && !url.username && !url.password, `${label} must use HTTPS.`);
    if (whatsapp)
        assert(['wa.me', 'chat.whatsapp.com', 'api.whatsapp.com'].includes(url.hostname), `${label} must be a WhatsApp link.`);
    return url.href;
}

export function passwordField(value){assert(typeof value==='string'&&value.length>0&&value.length<=256,'Enter a password of 1–256 characters.');return value;}
