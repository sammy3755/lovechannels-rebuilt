import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { settings, services, wings, initialEvents } from './seed.mjs';

const directory = process.env.DATA_DIR || fileURLToPath(new URL('../.data/', import.meta.url));
mkdirSync(directory, { recursive: true });
export const db = new DatabaseSync(`${directory}/church.sqlite`);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', phone TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', wing TEXT NOT NULL DEFAULT '', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL, issued_at INTEGER NOT NULL DEFAULT 0,last_seen INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS souls (id INTEGER PRIMARY KEY, owner INTEGER NOT NULL REFERENCES users(id), parent INTEGER REFERENCES souls(id), name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'New connection', notes TEXT NOT NULL DEFAULT '', followup TEXT NOT NULL DEFAULT '', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS prayers (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Received', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS rsvps (user_id INTEGER NOT NULL REFERENCES users(id), event_id TEXT NOT NULL, PRIMARY KEY(user_id,event_id));
  CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, service TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
export const getDoc = key => JSON.parse(db.prepare('SELECT value FROM documents WHERE key=?').get(key).value);
export const setDoc = (key, value) => db.prepare('INSERT INTO documents(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
export {hashPassword} from './passwords.mjs';
import {hashPassword} from './passwords.mjs';
export const publicUser = user => Object.fromEntries(['id','name','email','role','phone','location','wing','created'].map(key=>[key,user[key]]));
if (!db.prepare('SELECT key FROM documents WHERE key=?').get('settings')) {
  setDoc('settings', settings); setDoc('services', services); setDoc('wings', wings); setDoc('events', initialEvents());
}
if (!db.prepare('SELECT id FROM users WHERE role=?').get('admin')) {
  const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url');
  const email = process.env.ADMIN_EMAIL || 'admin@thelovechannels.local';
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must have at least 12 characters.');
  db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)').run('Church administrator', email.toLowerCase(), await hashPassword(password), 'admin');
  console.log(`First-run administrator: ${email}\n${process.env.ADMIN_PASSWORD ? 'Using configured administrator password.' : `Generated password (save it): ${password}`}`);
}

await db.exec(`CREATE TABLE IF NOT EXISTS oauth_challenges(state TEXT PRIMARY KEY,binding TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,link_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_identities(subject TEXT PRIMARY KEY,user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE);`);

const sessionColumns=db.prepare('PRAGMA table_info(sessions)').all().map(c=>c.name);
for(const name of ['issued_at','last_seen'])if(!sessionColumns.includes(name))db.exec(`ALTER TABLE sessions ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`);
if(!db.prepare('PRAGMA table_info(oauth_challenges)').all().some(c=>c.name==='admin_required'))db.exec('ALTER TABLE oauth_challenges ADD COLUMN admin_required INTEGER NOT NULL DEFAULT 0');
