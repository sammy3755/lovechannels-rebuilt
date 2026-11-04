import { randomBytes, createHash } from 'node:crypto';
import { db } from './db.mjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const assert = (condition, message, status = 400) => { if (!condition) throw new HttpError(status, message); };
const digest = token => createHash('sha256').update(token).digest('hex');
export function currentUser(req) {
  const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('lc_session='))?.slice(11);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>?').get(digest(token), Date.now()) || null;
}
export function requireUser(req, admin = false) {
  const user = currentUser(req);
  assert(user, 'Please sign in to continue.', 401);
  assert(!admin || user.role === 'admin', 'Administrator access is required.', 403);
  return user;
}
export function startSession(res, id) {
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(digest(token), id, Date.now() + 86400000);
  res.setHeader('Set-Cookie', `lc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
}
export function endSession(req, res) {
  const token = req.headers.cookie?.match(/(?:^|;\s*)lc_session=([^;]+)/)?.[1];
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
  res.setHeader('Set-Cookie', `lc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
}
export {validPassword} from './passwords.mjs';
const limits = new Map();
export function rateLimit(req, key, max = 20) {
  const now = Date.now();
  for (const [k,v] of limits) if (v.until < now) limits.delete(k);
  const id = `${key.startsWith('login-account:')?'account':req.socket.remoteAddress}:${key}`;
  const entry = limits.get(id) || { count: 0, until: now + 600000 };
  entry.count++; limits.set(id, entry);
  assert(entry.count <= max, 'Too many attempts. Please try again in ten minutes.', 429);
}
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
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, `${label} must be a valid HTTPS URL.`); }
  assert(url.protocol === 'https:' && !url.username && !url.password, `${label} must use HTTPS.`);
  if (whatsapp) assert(['wa.me', 'chat.whatsapp.com', 'api.whatsapp.com'].includes(url.hostname), `${label} must be a WhatsApp link.`);
  return url.href;
}

export function passwordField(value){assert(typeof value==='string'&&value.length>0&&value.length<=256,'Enter a password of 1–256 characters.');return value;}
