import { db } from '../postgres.mjs';
export { db } from '../postgres.mjs';
import { randomBytes, scryptSync } from 'node:crypto';
import { settings, services, wings, initialEvents } from './seed.mjs';
export const demoMode = process.argv.includes('--demo') && !process.env.VERCEL;
(await db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', phone TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', wing TEXT NOT NULL DEFAULT '', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS souls (id INTEGER PRIMARY KEY, owner INTEGER NOT NULL REFERENCES users(id), parent INTEGER REFERENCES souls(id), name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'New connection', notes TEXT NOT NULL DEFAULT '', followup TEXT NOT NULL DEFAULT '', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS prayers (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Received', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS rsvps (user_id INTEGER NOT NULL REFERENCES users(id), event_id TEXT NOT NULL, PRIMARY KEY(user_id,event_id));
  CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, service TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`));
export const getDoc = async (key) => JSON.parse((await db.prepare('SELECT value FROM documents WHERE key=?').get(key)).value);
export const setDoc = async (key, value) => (await db.prepare('INSERT INTO documents(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)));
export function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export const publicUser = ({ password, ...user }) => user;
if (!(await db.prepare('SELECT key FROM documents WHERE key=?').get('settings'))) {
    (await setDoc('settings', settings));
    (await setDoc('services', services));
    (await setDoc('wings', wings));
    (await setDoc('events', initialEvents()));
}
if (!(await db.prepare('SELECT id FROM users WHERE role=?').get('admin'))) {
    const password = process.env.ADMIN_PASSWORD || (demoMode || process.env.LC_PGLITE === '1' ? randomBytes(18).toString('base64url') : '');
    if (!password)
        throw Error('Configure ADMIN_EMAIL and ADMIN_PASSWORD for the first hosted administrator.');
    const email = process.env.ADMIN_EMAIL || 'admin@thelovechannels.local';
    if (password.length < 12)
        throw new Error('ADMIN_PASSWORD must have at least 12 characters.');
    (await db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run('Church administrator', email.toLowerCase(), hashPassword(password), 'admin'));
    console.log('Church administrator account initialized.');
}
if (demoMode && !(await db.prepare('SELECT id FROM users WHERE email=?').get('grace@example.test'))) {
    const { lastInsertRowid: member } = (await db.prepare('INSERT INTO users(name,email,password,phone,location,wing) VALUES(?,?,?,?,?,?)').run('Grace Okafor', 'grace@example.test', hashPassword(randomBytes(24).toString('hex')), '', 'Port Harcourt', 'radiant'));
    const add = db.prepare('INSERT INTO souls(owner,parent,name,status,followup) VALUES(?,?,?,?,?)');
    const first = (await add.run(member, null, 'Amara (sample)', 'Growing in faith', ''));
    (await add.run(member, first.lastInsertRowid, 'Daniel (sample)', 'Foundation class', ''));
    (await add.run(member, null, 'Chidi (sample)', 'New connection', ''));
}
