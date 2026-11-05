import {sessionPolicy,sessionInfo,sessionIsValid} from './session-policy.mjs';
export {sessionInfo} from './session-policy.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { db } from './db.mjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const assert = (condition, message, status = 400) => { if (!condition) throw new HttpError(status, message); };
const cookieName=scope=>scope==='admin'?'lc_admin_session':'lc_member_session';
const cookieToken=req=>{const name=cookieName(req.authScope||'member');return req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);};
const digest = token => createHash('sha256').update(token).digest('hex');
export function currentUser(req,touch=true) {
  const token=cookieToken(req);const scope=req.authScope||'member';
  req.sessionInfo=null;if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const now=Date.now(),key=digest(token);
  const user=db.prepare('SELECT users.*,sessions.expires AS session_expires,sessions.issued_at AS session_issued_at,sessions.last_seen AS session_last_seen,sessions.access_scope AS session_scope FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.token=?').get(key);
  if(!sessionIsValid(user,now)||user.session_scope!==scope||(scope==='admin'&&user.role!=='admin'))return null;
  if(touch){
    const policy=sessionPolicy(user.session_scope==='admin'?'admin':'member');
    const changed=db.prepare('UPDATE sessions SET last_seen=CASE WHEN last_seen<? THEN ? ELSE last_seen END WHERE token=? AND expires>? AND last_seen>? AND issued_at>?').run(now,now,key,now,now-policy.idleSeconds*1000,now-policy.absoluteSeconds*1000);
    if(!changed.changes)return null;user.session_last_seen=Math.max(Number(user.session_last_seen),now);
  }
  req.sessionInfo=sessionInfo(user,now);return user;
}
export function requireUser(req, admin = false) {
  if(admin)req.authScope='admin';
  const user = currentUser(req);
  assert(user, 'Please sign in to continue.', 401);
  assert(!admin || user.role === 'admin', 'Administrator access is required.', 403);
  return user;
}
export function startSession(res,id,req) {
  const user=db.prepare('SELECT role FROM users WHERE id=?').get(id);
  const scope=req?.authScope||'member';
  assert(user,'Account unavailable.',401);
  assert(scope!=='admin'||user.role==='admin','Administrator access is required.',403);
  if(req)endSession(req,res);
  const token=randomBytes(32).toString('hex'),now=Date.now(),policy=sessionPolicy(scope),expires=now+policy.absoluteSeconds*1000;
  db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
  db.prepare('INSERT INTO sessions(token,user_id,expires,issued_at,last_seen,access_scope) VALUES(?,?,?,?,?,?)').run(digest(token),id,expires,now,now,scope);
  res.setHeader('Set-Cookie',`${cookieName(scope)}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${policy.absoluteSeconds}${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);
  const info=sessionInfo({...user,session_scope:scope,session_expires:expires,session_issued_at:now,session_last_seen:now},now);
  if(req)req.sessionInfo=info;return info;
}
export function endSession(req, res) {
  req.sessionInfo=null;
  const token=cookieToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));
  res.setHeader('Set-Cookie', `${cookieName(req.authScope||'member')}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
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
