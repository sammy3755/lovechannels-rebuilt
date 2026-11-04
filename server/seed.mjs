export const settings = {
  churchName: 'The Love Channels',
  tagline: 'A place to belong. A life of purpose.',
  heroTitle: 'Loved by God.\nMade for more.',
  heroText: 'Discover a family where faith comes alive, love makes room, and your next chapter begins.',
  vision: 'Raising world changers through the preaching of the Gospel of Christ and a community-driven approach.',
  address: 'Plot 175 Ada George Road, Port Harcourt',
  phone: '+2349060335140',
  email: 'info@thelovechannels.com',
  whatsapp: 'https://wa.me/message/O26O6EUOWX32O1',
  livestream: 'https://facebook.com/officialchiomarufus',
  announcement: 'There is a place for you here. Join us this Sunday at 8am & 10am.',
  about: 'We are a family of believers growing in faith, rooted in love, and committed to making a difference. Through worship, the Word, and meaningful relationships, we walk together into everything God has called us to be.'
};
export const services = [
  { id: 'success', title: 'My Success Service', day: 'Sunday', time: '08:00', description: 'Begin your week with the Word, fresh perspective, and a heart full of faith.', image: 'service-sunday.webp', label: 'Faith for your everyday' },
  { id: 'elevation', title: 'My Elevation Service', day: 'Sunday', time: '10:00', description: 'A beautiful time of worship, community, and life-changing teaching.', image: 'service-elevation.webp', label: 'Go deeper. Rise higher.' },
  { id: 'fire', title: 'Altar of Fire', day: 'Tuesday', time: '17:30', description: 'An atmosphere of heartfelt prayer, worship, and fresh fire from God.', image: 'service-fire.webp', label: 'A heart set on fire' },
  { id: 'shift', title: 'Shift Service', day: 'Thursday', time: '17:30', description: 'Pause the rush. Be refreshed in His presence at our midweek gathering.', image: 'service-shift.webp', label: 'Make room for the new' },
  { id: 'gph', title: 'Global Prophetic Hour', day: 'Online', time: '', description: 'Join Pastor Chioma Rufus for revelation, prayer, and bold declarations across nations. Follow our page for broadcast times.', image: 'service-gph.webp', label: 'One faith. Beyond borders.' }
];
export const wings = [
  { id: 'kings', name: 'The Kings', description: 'Men growing in faith, purpose, and leadership.', image: 'wing-kings.webp', leader: '', location: 'Port Harcourt', contact: '', whatsapp: '' },
  { id: 'royal', name: 'The Royal Ladies', description: 'Women building one another in grace and strength.', image: 'wing-royal.webp', leader: '', location: 'Port Harcourt', contact: '', whatsapp: '' },
  { id: 'eagles', name: 'The Eagles / Vanguard', description: 'Young men discovering purpose and living boldly.', image: 'wing-eagles.webp', leader: '', location: 'Port Harcourt', contact: '', whatsapp: '' },
  { id: 'radiant', name: 'The Eagles / Radiant Ladies', description: 'Young women shining in faith and friendship.', image: 'wing-radiant.webp', leader: '', location: 'Port Harcourt', contact: '', whatsapp: '' }
];
export function initialEvents() {
  // These are recurring services from the original files, not invented special events.
  return services.filter(s => s.day !== 'Online').map(s => {
    const days = { Sunday: 0, Tuesday: 2, Thursday: 4 };
    const now = new Date();
    const local = new Date(now.getTime() + 3600000);
    const date = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
    date.setUTCDate(date.getUTCDate() + (days[s.day] - date.getUTCDay() + 7) % 7);
    const [h, m] = s.time.split(':').map(Number);
    date.setUTCHours(h - 1, m);
    if (date < now) date.setUTCDate(date.getUTCDate() + 7);
    return { id: s.id, title: s.title, date: date.toISOString(), location: settings.address, description: s.description, image: s.image, recurring: true };
  });
}
