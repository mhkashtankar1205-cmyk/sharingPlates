import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { UPLOAD_DIR, db, tx } from './db.js';

export const DEMO_PASSWORD = 'demo1234';
const M = 60000;
const H = 60 * M;
const D = 24 * H;

// ---- illustrated plates used as seed photos ----------------------------------

const DISH = {
  biryani: { bg: '#F3E2BF', base: '#E8B546', bits: ['#C06A22', '#FFF8EC', '#5E8A2A', '#A8431E'], side: '#F7F3E8', top: '#DCE9C9' },
  paneer: { bg: '#F5D9C6', base: '#D5602A', bits: ['#FFF4E0', '#FFF4E0', '#3E7B3A'], side: '#E7C386', top: '#D9A85C' },
  dal: { bg: '#ECE3C3', base: '#E2B236', bits: ['#FFFCF2', '#FFFCF2', '#7FA650'], side: '#FFFBEF', top: '#F4EFE0' },
  idli: { bg: '#D8E7DE', base: null, bits: [], side: '#C45A28', top: '#B04A1E' },
  curry: { bg: '#EFD3C2', base: '#9E3D1B', bits: ['#F2E6CC', '#6A2710', '#E0A060'], side: '#FFFBEF', top: '#F4EFE0' },
  sweets: { bg: '#FADFD1', base: '#F29B35', bits: ['#F2C94C', '#E4572E', '#8BBF5A', '#F7E3A1'], side: '#FFE7A8', top: '#F2C94C' },
  snacks: { bg: '#F1E1C8', base: '#C88A2E', bits: ['#8A5719', '#E3B04B', '#B8741F'], side: '#3E7B3A', top: '#5C9A3F' },
  poha: { bg: '#F2EBC1', base: '#F1D548', bits: ['#5E8A2A', '#B5462B', '#FFF8D8'], side: '#F7F3E8', top: '#E9E3D3' },
  thali: { bg: '#E4E9D2', base: '#F6F1E4', bits: ['#E2B236', '#D5602A', '#7FA650', '#FFFCF2'], side: '#D5602A', top: '#B04A1E' },
};

function plateSvg(dish, seedText) {
  const d = DISH[dish];
  let seed = [...seedText].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7) || 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let bits = '';
  if (dish === 'idli') {
    for (const [x, y] of [[150, 130], [205, 118], [175, 180], [230, 170], [128, 180]]) {
      bits += `<ellipse cx="${x}" cy="${y}" rx="30" ry="21" fill="#FFFDF7" stroke="#E4DDCB" stroke-width="2"/>`;
    }
  } else {
    for (let k = 0; k < 38; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 56;
      bits += `<circle cx="${(182 + Math.cos(a) * r).toFixed(1)}" cy="${(152 + Math.sin(a) * r * 0.86).toFixed(1)}" r="${(2.5 + rnd() * 5).toFixed(1)}" fill="${d.bits[k % d.bits.length]}"/>`;
    }
  }
  const stripes = Array.from({ length: 9 }, (_, k) => `<path d="M${k * 56 - 40} 0 l-60 300"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
<rect width="400" height="300" fill="${d.bg}"/>
<g stroke="#000" stroke-opacity=".05" stroke-width="10">${stripes}</g>
<ellipse cx="206" cy="166" rx="128" ry="118" fill="#000" opacity=".08"/>
<circle cx="200" cy="152" r="122" fill="#FFFFFF"/>
<circle cx="200" cy="152" r="98" fill="#F8F6F0"/>
${d.base ? `<ellipse cx="182" cy="152" rx="70" ry="60" fill="${d.base}"/>` : ''}
${bits}
<circle cx="278" cy="110" r="34" fill="#FFFFFF" stroke="#000" stroke-opacity=".08" stroke-width="2"/>
<circle cx="278" cy="110" r="25" fill="${d.side}"/>
<circle cx="272" cy="104" r="10" fill="${d.top}" opacity=".7"/>
<path d="M300 232 q20 -6 42 -42" stroke="#B9B2A3" stroke-width="7" stroke-linecap="round" fill="none"/>
</svg>`;
}

const DISH_PHOTOS = {
  biryani: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
  paneer: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
  dal: 'https://images.unsplash.com/photo-1613564834361-9436948817d1?auto=format&fit=crop&w=800&q=80',
  idli: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80',
  curry: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80',
  sweets: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=800&q=80',
  snacks: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80',
  poha: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=800&q=80',
  thali: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80',
};

function seedImage(dish, key) {
  const file = `seed-${key}.svg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), plateSvg(dish, key));
  return DISH_PHOTOS[dish] || `/uploads/${file}`;
}

// ---- data -------------------------------------------------------------------

const USERS = [
  { key: 'hostel', name: "Nest Girls' Hostel", type: 'hostel', lat: 12.9352, lng: 77.6245, locality: 'Koramangala 5th Block', phone: '+91 98450 11201', radius: 5 },
  { key: 'hotel', name: 'Hotel Saffron Inn', type: 'hotel', lat: 12.9116, lng: 77.6389, locality: 'HSR Layout', phone: '+91 80 4110 2233', radius: 5 },
  { key: 'caterer', name: 'Sharma Caterers', type: 'caterer', lat: 12.934, lng: 77.63, locality: 'Koramangala 4th Block', phone: '+91 99001 44120', radius: 5 },
  { key: 'cafe', name: 'Udupi Grand Café', type: 'restaurant', lat: 12.9166, lng: 77.6101, locality: 'BTM Layout', phone: '+91 80 2668 9012', radius: 5 },
  { key: 'ngo', name: 'Little Hearts NGO', type: 'ngo', lat: 12.945, lng: 77.63, locality: 'Ejipura', phone: '+91 97400 55310', radius: 8 },
  { key: 'priya', name: 'Priya Menon', type: 'individual', lat: 12.943, lng: 77.61, locality: 'Adugodi', phone: '+91 98860 20417', radius: 4 },
  { key: 'shelter', name: 'Hope Night Shelter', type: 'shelter', lat: 12.9619, lng: 77.6412, locality: 'Domlur', phone: '+91 80 2535 7788', radius: 10 },
  { key: 'temple', name: 'Sri Ganesha Temple Trust', type: 'event', lat: 12.9395, lng: 77.6082, locality: 'Adugodi', phone: '+91 80 2550 1144', radius: 5 },
];

export function seed({ quiet = false } = {}) {
  const t = Date.now();
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  tx(() => {
    db.exec('DELETE FROM notifications; DELETE FROM likes; DELETE FROM requests; DELETE FROM posts; DELETE FROM sessions; DELETE FROM users;');
    db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('users','posts','requests','notifications');`);

    const u = {};
    for (const x of USERS) {
      const { lastInsertRowid } = db
        .prepare(`INSERT INTO users (name, email, password_hash, account_type, phone, lat, lng, locality, radius_km, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(x.name, `${x.key}@demo.test`, hash, x.type, x.phone, x.lat, x.lng, x.locality, x.radius, t - 60 * D);
      u[x.key] = { ...x, id: Number(lastInsertRowid) };
    }

    const addPost = (who, p) => {
      const provider = u[who];
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO posts (user_id, title, description, food_type, source, quantity, image, address, locality, lat, lng, pickup_notes,
                              available_until, is_active, completed_at, urgent_sent, matched_count, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(provider.id, p.title, p.description ?? null, p.food ?? 'veg', p.source, p.quantity,
          seedImage(p.dish, `${who}-${p.key}`), p.address ?? `${provider.locality}, Bengaluru`, provider.locality,
          provider.lat + (p.dLat ?? 0), provider.lng + (p.dLng ?? 0), p.notes ?? null,
          t + p.until, p.active === false ? 0 : 1, p.completedAt ?? null, p.until < 45 * M ? 1 : 0, p.matched ?? 12, t + (p.createdAgo ? -p.createdAgo : -40 * M));
      return Number(lastInsertRowid);
    };
    const addRequest = (postId, who, quantity, status, opts = {}) => {
      const created = opts.created ?? t - 20 * M;
      const { lastInsertRowid } = db
        .prepare(`INSERT INTO requests (post_id, requester_id, quantity, people, note, status, pickup_code, created_at, updated_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(postId, u[who].id, quantity, opts.people ?? quantity, opts.note ?? null, status, opts.code ?? null, created, opts.completed ?? created, opts.completed ?? null);
      return Number(lastInsertRowid);
    };
    const note = (who, type, title, body, postId, ago, read = false, requestId = null) =>
      db.prepare(`INSERT INTO notifications (user_id, type, title, body, post_id, request_id, read_at, created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(u[who].id, type, title, body, postId, requestId, read ? t - ago + M : null, t - ago);

    // Live posts
    const biryani = addPost('caterer', {
      key: 'biryani', dish: 'biryani', title: 'Veg biryani with raita', source: 'wedding', quantity: 60, until: 95 * M,
      description: 'Untouched trays from the Sharma–Verma wedding reception. Packed in foil trays, still warm.',
      address: 'Sri Krishna Convention Hall, 80 Feet Road, Koramangala 4th Block', notes: 'Use the service gate on the left; ask for Ramesh (catering lead).', matched: 18, createdAgo: 25 * M,
    });
    const paneer = addPost('hotel', {
      key: 'paneer', dish: 'paneer', title: 'Paneer butter masala & tandoori rotis', source: 'hotel', quantity: 35, until: 38 * M,
      description: 'Lunch buffet surplus, kept in hot cases since 2:30 pm.', address: '27th Main, Sector 1, HSR Layout', notes: 'Reception will call the kitchen. Bring your own containers.', matched: 15, createdAgo: 70 * M,
    });
    const dal = addPost('priya', {
      key: 'dal', dish: 'dal', title: 'Dal, jeera rice & aloo sabzi', source: 'party', quantity: 18, until: 150 * M,
      description: "Leftovers from my son's birthday party. Home-cooked, no onion or garlic.", address: '14, 2nd Cross, Adugodi', notes: 'Ground floor, ring the bell.', matched: 9, createdAgo: 15 * M,
    });
    const idli = addPost('cafe', {
      key: 'idli', dish: 'idli', title: 'Idli, vada & sambar', source: 'restaurant', quantity: 25, until: 70 * M,
      description: 'Evening batch, made today.', address: '7th Main, BTM Layout 2nd Stage', matched: 11, createdAgo: 55 * M,
    });
    const sweets = addPost('temple', {
      key: 'sweets', dish: 'sweets', title: 'Boondi laddoos & cut fruit', source: 'event', quantity: 50, until: 220 * M,
      description: 'Prasadam from the evening puja. Individually packed.', address: 'Temple Road, Adugodi', matched: 21, createdAgo: 10 * M,
    });
    const curry = addPost('hotel', {
      key: 'curry', dish: 'curry', food: 'nonveg', title: 'Chicken curry & steamed rice', source: 'hotel', quantity: 40, until: 110 * M,
      description: 'Banquet surplus from a corporate dinner.', address: '27th Main, Sector 1, HSR Layout', notes: 'Banquet entrance at the back.', matched: 14, createdAgo: 90 * M,
    });
    const thali = addPost('caterer', {
      key: 'thali', dish: 'thali', title: 'Mini thalis — roti, sabzi, dal, sweet', source: 'party', quantity: 30, until: 5 * H,
      description: 'Office party order that was over-prepared.', address: '6th Cross, Koramangala 4th Block', matched: 16, createdAgo: 5 * M,
    });
    addPost('hotel', { key: 'poha', dish: 'poha', title: 'Breakfast poha & upma', source: 'hotel', quantity: 20, until: -5 * H, createdAgo: 9 * H, active: false });

    // Requests on live posts
    addRequest(paneer, 'ngo', 13, 'accepted', { code: '4821', note: 'We will send our van.', created: t - 50 * M });
    const shelterReq = addRequest(paneer, 'shelter', 15, 'pending', { note: 'For 15 residents tonight. We can come in 20 minutes.', created: t - 8 * M });
    const hostelCurry = addRequest(curry, 'hostel', 40, 'accepted', { code: '3057', people: 38, created: t - 60 * M });
    addRequest(idli, 'priya', 5, 'pending', { people: 5, note: 'For the security staff in our building.', created: t - 12 * M });

    // History: completed donations over the past two weeks
    const providers = ['hotel', 'caterer', 'cafe', 'priya', 'temple'];
    const receivers = ['hostel', 'ngo', 'shelter', 'priya'];
    const dishes = ['biryani', 'paneer', 'dal', 'idli', 'curry', 'sweets', 'snacks', 'thali'];
    const titles = {
      biryani: 'Veg pulao & raita', paneer: 'Kadai paneer & naan', dal: 'Rajma chawal', idli: 'Masala dosa & chutney',
      curry: 'Egg curry & rice', sweets: 'Gulab jamun & fruit', snacks: 'Samosa & pakora platters', thali: 'South Indian meals',
    };
    let k = 0;
    for (let day = 13; day >= 0; day--) {
      const perDay = 1 + ((day * 7) % 3);
      for (let i = 0; i < perDay; i++, k++) {
        const who = providers[k % providers.length];
        const dish = dishes[k % dishes.length];
        const created = t - day * D - (6 + i * 3) * H;
        const qty = 10 + ((k * 13) % 45);
        const doneAt = created + 2 * H;
        if (doneAt > t) continue;
        const pid = addPost(who, {
          key: `h${k}`, dish, title: titles[dish], source: ['hotel', 'wedding', 'restaurant', 'party', 'event'][k % 5], quantity: qty,
          until: created + 4 * H - t, createdAgo: t - created, completedAt: doneAt, matched: 8 + (k % 12),
          food: dish === 'curry' ? 'nonveg' : 'veg',
        });
        let receiver = receivers[k % receivers.length];
        if (receiver === who) receiver = 'hostel';
        addRequest(pid, receiver, qty, 'completed', { created: created + 30 * M, completed: doneAt, people: qty + (k % 4) });
      }
    }

    // Notifications
    note('hostel', 'ready', 'Your requested food is ready for pickup — 40 meals', 'Chicken curry & steamed rice · 27th Main, Sector 1, HSR Layout. Show your pickup code.', curry, 55 * M, false, hostelCurry);
    note('hostel', 'urgent', 'Urgent: 22 meals expire in 38 min, 2.8 km away', 'Paneer butter masala & tandoori rotis from Hotel Saffron Inn', paneer, 3 * M);
    note('hostel', 'nearby', 'Food available near your hostel — 60 meals 550 m away', 'Veg biryani with raita from Sharma Caterers · available for 1h 35m', biryani, 24 * M);
    note('hostel', 'nearby', 'Food available near your hostel — 18 meals 2.0 km away', "Dal, jeera rice & aloo sabzi from Priya Menon · available for 2h 30m", dal, 14 * M);
    note('hostel', 'nearby', 'Food available near your hostel — 30 meals 600 m away', 'Mini thalis — roti, sabzi, dal, sweet from Sharma Caterers · available for 5h', thali, 4 * M);
    note('hotel', 'request', 'Hope Night Shelter requested 15 meals', 'Paneer butter masala & tandoori rotis · 5.6 km away', paneer, 8 * M, false, shelterReq);
    note('hotel', 'urgent', '22 meals still unclaimed — your post expires in 38 min', '1 request(s) are waiting for your answer.', paneer, 2 * M);
    note('hotel', 'live', 'Your post is live — 14 nearby receivers were notified', 'Chicken curry & steamed rice', curry, 90 * M, true);
    note('ngo', 'ready', 'Your requested food is ready for pickup — 13 meals', 'Paneer butter masala & tandoori rotis · 27th Main, Sector 1, HSR Layout. Show your pickup code.', paneer, 45 * M);
    note('priya', 'nearby', '25 meals available 1.9 km away', 'Idli, vada & sambar from Udupi Grand Café · available for 1h 10m', idli, 50 * M, true);
    note('cafe', 'request', 'Priya Menon requested 5 meals', 'Idli, vada & sambar · 2.9 km away', idli, 12 * M);

    // Likes
    for (const [who, pid] of [['hostel', biryani], ['ngo', biryani], ['priya', biryani], ['shelter', paneer], ['hostel', sweets], ['ngo', dal]]) {
      db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').run(u[who].id, pid);
    }
  });

  if (!quiet) {
    console.log('Seeded demo data. Log in with any of these (password: demo1234):');
    for (const x of USERS) console.log(`  ${x.key}@demo.test`.padEnd(24), '—', x.name);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed();
}
