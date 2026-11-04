import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.mjs';
import { assert, currentUser, requireUser, emailField, textField, rateLimit } from './auth.mjs';
import { givingFunds } from '../../public/js/catalogue.js';
import { activeCampaign } from './growth.mjs';
(await db.exec(`CREATE TABLE IF NOT EXISTS payments(reference TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),email TEXT NOT NULL,purpose TEXT NOT NULL,fund TEXT NOT NULL,amount_kobo INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'NGN',resource_id INTEGER REFERENCES resources(id),quantity INTEGER NOT NULL DEFAULT 1,order_id INTEGER REFERENCES orders(id),campaign TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Pending',created TEXT DEFAULT CURRENT_TIMESTAMP,paid_at TEXT NOT NULL DEFAULT '');`));
export function validSignature(raw, signature, key = process.env.PAYSTACK_SECRET_KEY) {
    if (!key || typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature))
        return false;
    return timingSafeEqual(Buffer.from(signature, 'hex'), createHmac('sha512', key).update(raw).digest());
}
async function paystack(path, data) {
    assert(process.env.PAYSTACK_SECRET_KEY, 'Paystack is not connected yet. Please use bank transfer.', 503);
    let response;
    try {
        response = await fetch('https://api.paystack.co' + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(20000) });
    }
    catch {
        assert(false, 'Payment service is temporarily unavailable. Please try again.', 502);
    }
    const result = await response.json();
    assert(response.ok && result.status, 'Payment service could not complete the request. Please try again.', 502);
    return result.data;
}
// Both verified callbacks and signed webhooks use the same idempotent ledger update.
export async function settlePayment(data) {
    const p = (await db.prepare('SELECT * FROM payments WHERE reference=? FOR UPDATE').get(String(data.reference || '')));
    assert(p, 'Payment reference not found.', 404);
    assert(data.status === 'success' && data.reference === p.reference && data.currency === p.currency && Number.isSafeInteger(data.amount) && data.amount === p.amount_kobo, 'Payment amount, currency or status did not match.', 409);
    if (p.status === 'Paid')
        return p;
    (await db.exec('BEGIN'));
    try {
        if (p.purpose === 'purchase')
            (await db.prepare("UPDATE orders SET status='Paid — awaiting fulfilment',reference=? WHERE id=?").run(p.reference, p.order_id));
        else if (p.user_id)
            (await db.prepare("INSERT INTO contributions(user_id,fund,amount_kobo,reference,status) VALUES(?,?,?,?,'Verified')").run(p.user_id, p.fund, p.amount_kobo, p.reference));
        (await db.prepare("UPDATE payments SET status='Paid',paid_at=CURRENT_TIMESTAMP WHERE reference=?").run(p.reference));
        (await db.exec('COMMIT'));
    }
    catch (e) {
        (await db.exec('ROLLBACK'));
        throw e;
    }
    return { ...p, status: 'Paid' };
}
export async function paymentApi(req, path, body) {
    if (path === '/api/payments/webhook' && req.method === 'POST') {
        assert(validSignature(req.rawBody, req.headers['x-paystack-signature']), 'Invalid webhook signature.', 401);
        if (body.event === 'charge.success')
            (await settlePayment(body.data || {}));
        return { ok: true };
    }
    if (path === '/api/payments/verify' && req.method === 'POST') {
        (await rateLimit(req, 'payment-verify', 40));
        const ref = textField(body.reference, 'Reference', 100);
        assert(/^lc-[a-f0-9-]{36}$/.test(ref), 'Invalid payment reference.');
        const p = (await db.prepare('SELECT * FROM payments WHERE reference=?').get(ref));
        assert(p, 'Payment not found.', 404);
        if (p.status !== 'Paid') {
            const data = await paystack('/transaction/verify/' + encodeURIComponent(ref));
            (await settlePayment(data));
        }
        return { reference: ref, status: 'Paid', amount_kobo: p.amount_kobo, currency: p.currency };
    }
    if (path === '/api/payments/initialize' && req.method === 'POST') {
        (await rateLimit(req, 'payment-init', 25));
        assert(process.env.PAYSTACK_SECRET_KEY && process.env.PUBLIC_URL, 'Paystack is not connected yet. Bank transfer is available.', 503);
        const origin = new URL(process.env.PUBLIC_URL);
        assert(origin.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(origin.hostname), 'PUBLIC_URL must use HTTPS.');
        const user = (await currentUser(req)), email = user?.email || emailField(body.email);
        let amount, purpose, fund, resource = null, quantity = 1, orderId = null;
        if (body.purpose === 'purchase') {
            (await requireUser(req));
            purpose = 'purchase';
            resource = (await db.prepare("SELECT * FROM resources WHERE id=? AND published=1 AND type='book'").get(Number(body.resource_id)));
            assert(resource, 'Book not found.', 404);
            quantity = Number(body.quantity);
            assert(Number.isInteger(quantity) && quantity >= 1 && quantity <= 20, 'Choose 1–20 copies.');
            amount = resource.price_kobo * quantity;
            fund = resource.title;
        }
        else {
            assert(body.purpose === 'giving', 'Invalid payment purpose.');
            purpose = 'giving';
            assert(givingFunds.includes(body.fund), 'Choose a giving fund.');
            fund = body.fund;
            assert(/^[0-9]+(\.[0-9]{1,2})?$/.test(String(body.amount)), 'Use an amount with at most two decimal places.');
            amount = Math.round(Number(body.amount) * 100);
        }
        assert(Number.isSafeInteger(amount) && amount >= 100 && amount <= 10000000000, 'Choose an amount between ₦1 and ₦100,000,000.');
        const campaign = body.campaign ? textField(body.campaign, 'Campaign', 80) : '';
        if (campaign) {
            const c = (await db.prepare('SELECT * FROM campaigns WHERE id=?').get(campaign));
            assert(c && activeCampaign(c), 'Campaign not available.');
        }
        const reference = 'lc-' + randomUUID();
        if (resource) {
            orderId = Number((await db.prepare("INSERT INTO orders(user_id,resource_id,title,quantity,total_kobo,reference,status) VALUES(?,?,?,?,?,?,'Awaiting payment')").run(user.id, resource.id, resource.title, quantity, amount, reference)).lastInsertRowid);
        }
        (await db.prepare('INSERT INTO payments(reference,user_id,email,purpose,fund,amount_kobo,resource_id,quantity,order_id,campaign) VALUES(?,?,?,?,?,?,?,?,?,?)').run(reference, user?.id || null, email, purpose, fund, amount, resource?.id || null, quantity, orderId, campaign));
        const result = await paystack('/transaction/initialize', { email, amount, currency: 'NGN', reference, callback_url: origin.origin + '/?payment_reference=' + reference + '#/give', metadata: { purpose, campaign } });
        const checkout = new URL(result.authorization_url);
        assert(checkout.protocol === 'https:' && checkout.hostname === 'checkout.paystack.com', 'Unexpected checkout destination.', 502);
        return { reference, authorization_url: checkout.href };
    }
    assert(false, 'Payment route not found.', 404);
}
export const adminPayments = async () => (await db.prepare('SELECT reference,purpose,fund,amount_kobo,currency,campaign,status,created,paid_at FROM payments ORDER BY created DESC LIMIT 500').all());
