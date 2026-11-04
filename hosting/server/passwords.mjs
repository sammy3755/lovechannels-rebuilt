import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt),options={N:131072,r:8,p:1,maxmem:256*1024*1024};
export async function hashPassword(password){
 const salt=randomBytes(16).toString('hex');
 const key=await derive(password,salt,64,options);
 return `scrypt-v2:${salt}:${key.toString('hex')}`;
}
export async function validPassword(password,saved){
 const parts=String(saved||'').split(':'),modern=parts[0]==='scrypt-v2';
 const [salt,hash]=modern?parts.slice(1):parts;
 if(!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(hash||''))return false;
 const key=await derive(password,salt,64,modern?options:{N:16384,r:8,p:1,maxmem:64*1024*1024});
 return timingSafeEqual(key,Buffer.from(hash,'hex'));
}
export const dummyPassword='scrypt-v2:0123456789abcdef0123456789abcdef:'+ '00'.repeat(64);
