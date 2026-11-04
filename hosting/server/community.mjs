import { db, getDoc, setDoc } from './db.mjs';
import { bookingTypes } from '../../public/js/catalogue.js';
(await db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),type TEXT NOT NULL,preferred_date TEXT NOT NULL,preferred_time TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL,details TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Requested',scheduled_at TEXT NOT NULL DEFAULT '',admin_note TEXT NOT NULL DEFAULT '',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS testimonies (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,story TEXT NOT NULL,consent INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'Pending review',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS contributions (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),fund TEXT NOT NULL,amount_kobo INTEGER NOT NULL,reference TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Pledged',admin_note TEXT NOT NULL DEFAULT '',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS threads (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Open',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS thread_messages (id INTEGER PRIMARY KEY,thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,sender INTEGER NOT NULL REFERENCES users(id),body TEXT NOT NULL,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS resources (id INTEGER PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL,author TEXT NOT NULL,description TEXT NOT NULL,price_kobo INTEGER NOT NULL DEFAULT 0,url TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),resource_id INTEGER NOT NULL REFERENCES resources(id),title TEXT NOT NULL,quantity INTEGER NOT NULL,total_kobo INTEGER NOT NULL,reference TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Awaiting payment',admin_note TEXT NOT NULL DEFAULT '',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`));
export const communityContent = {
    gphTitle: 'Global Prophetic Hour',
    gphText: 'An hour of revelation, prayer, and bold declarations with Pastor Chioma Rufus, reaching people across nations. Join us from wherever you are.',
    testimonyTitle: 'The stories. The gratitude. The God behind it all.',
    testimonyIntro: 'Testimonies remind us of God’s goodness in our midst. These are moments from our church family. Share your own story or book a time to testify.',
    values: ['Community-centred faith', 'Transparency & accountability', 'Partnership & empowerment', 'Leadership & mentorship'],
    programs: ['Night of Miraculous', 'Beauty of Relationships', 'Supernatural Life Conference', 'Extol', 'Breakfast Prophetic Hour', 'Sunrise Prayers with PND', 'Prayer Rain'],
    secondaryPhone: '+2349152147728', secondaryEmail: 'thelovechannelng@gmail.com',
    facebook: 'https://facebook.com/thelovechannels', instagram: 'https://instagram.com/thelovechannels', twitter: 'https://twitter.com/thelovechannels',
    bankName: '', accountName: '', accountNumber: '', givingNote: 'Use the church office contact to confirm payment instructions. Contributions are verified by the finance team.',
    gallery: [['outreach-1', 'Outreaches', 'Sharing love in our community'], ['family-week', 'Family week', 'Faith, friendship, and family'], ['campus', 'Campuses', 'Growing in faith on campus'], ['outreach-2', 'Outreaches', 'Faith beyond the church walls'], ['children', 'Children', 'A place for the next generation'], ['choir', 'Worship', 'One family, one sound']]
};
if (!(await db.prepare('SELECT key FROM documents WHERE key=?').get('community')))
    (await setDoc('community', communityContent));
export async function publicCommunity() {
    const community = (await getDoc('community'));
    return { community, bookingTypes, resources: (await db.prepare('SELECT * FROM resources WHERE published=1 ORDER BY id DESC').all()), testimonies: (await db.prepare("SELECT testimonies.id,title,story,users.name FROM testimonies JOIN users ON users.id=user_id WHERE consent=1 AND status='Published' ORDER BY testimonies.id DESC").all()) };
}
async function threads(where, id) {
    const list = (await db.prepare(`SELECT threads.*,users.name,users.email FROM threads JOIN users ON users.id=threads.user_id ${where} ORDER BY threads.id DESC`).all(...(id ? [id] : [])));
    const messages = db.prepare('SELECT thread_messages.*,users.name,users.role FROM thread_messages JOIN users ON users.id=sender WHERE thread_id=? ORDER BY thread_messages.id');
    return (await Promise.all(list.map(async (thread) => ({ ...thread, messages: (await messages.all(thread.id)) }))));
}
export async function memberCommunity(id) {
    return { bookings: (await db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY id DESC').all(id)), testimonies: (await db.prepare('SELECT * FROM testimonies WHERE user_id=? ORDER BY id DESC').all(id)), contributions: (await db.prepare('SELECT * FROM contributions WHERE user_id=? ORDER BY id DESC').all(id)), orders: (await db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(id)), threads: (await threads('WHERE threads.user_id=?', id)) };
}
export async function adminCommunity() {
    return { bookings: (await db.prepare('SELECT bookings.*,users.name,users.email FROM bookings JOIN users ON users.id=user_id ORDER BY bookings.id DESC').all()), testimonies: (await db.prepare('SELECT testimonies.*,users.name FROM testimonies JOIN users ON users.id=user_id ORDER BY testimonies.id DESC').all()), contributions: (await db.prepare('SELECT contributions.*,users.name FROM contributions JOIN users ON users.id=user_id ORDER BY contributions.id DESC').all()), orders: (await db.prepare('SELECT orders.*,users.name,users.email FROM orders JOIN users ON users.id=user_id ORDER BY orders.id DESC').all()), resources: (await db.prepare('SELECT * FROM resources ORDER BY id DESC').all()), threads: (await threads('')) };
}
