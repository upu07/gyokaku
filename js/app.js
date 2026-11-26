/* 大野水産 漁獲帳
   タブ: 直近の相場（ランキング・価格推移・売上予測）／漁獲高記録／ホーム／過去の漁獲高／フレンド
   記録は Firebase（ログイン時）か、この端末（未設定・未ログイン時）に保存する。 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen = n => Math.round(n || 0).toLocaleString('ja-JP');
const man = n => Math.abs(n) >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万' : yen(n);
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const kana = s => String(s || '').normalize('NFKC').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/[\s・（）()]/g, '').toLowerCase();
const md = s => { const p = String(s).split('-'); return +p[1] + '/' + (+p[2]); };
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const DAY = 864e5, T = s => Date.parse(s + 'T00:00:00Z');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const WD = ['日', '月', '火', '水', '木', '金', '土'];
let toastT;
const toast = msg => { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); };

/* ───────── 相場 ───────── */
let MK = { species: [] }, SP = [], byN = {}, latest = '';
const buildSP = () => {
  latest = MK.latest || MK.species.reduce((m, s) => s.d.reduce((a, x) => x[0] > a ? x[0] : a, m), '');
  SP = MK.species.map(s => {
    const d = s.d.filter(x => x[2] > 0).sort((a, b) => a[0] < b[0] ? -1 : 1);
    if (!d.length) return null;
    const last = d[d.length - 1][0], recent = !!latest && T(last) > T(latest) - 7 * DAY, end = recent ? latest : last;
    const w = d.filter(x => T(x[0]) > T(end) - 7 * DAY && T(x[0]) <= T(end));
    const a = w.reduce((t, x) => t + x[1], 0), kg7 = w.reduce((t, x) => t + x[2], 0);
    return { n: s.n, j: s.j || '', g: s.g, p: Math.round(kg7 ? a / kg7 : 0), kg7, a7: a, days7: w.length, asof: last, recent, per: s.per || 0, t: !!s.t };
  }).filter(s => s && s.p > 0);
  byN = Object.fromEntries(SP.map(s => [s.n, s]));
};
const mprice = n => byN[n] ? byN[n].p : 0;
const search = q => {
  const k = kana(q); if (!k) return [];
  return SP.map(s => { const a = kana(s.n), b = kana(s.j); return [a.startsWith(k) || b.startsWith(k) ? 0 : (a.includes(k) || b.includes(k) ? 1 : 9), s]; })
    .filter(x => x[0] < 9).sort((x, y) => x[0] - y[0] || y[1].kg7 - x[1].kg7 || y[1].p - x[1].p).slice(0, 8).map(x => x[1]);
};

/* ───────── 端末内の設定・下書き ───────── */
const KEY = 'gyokaku-local-v1';
const mk = (sp, n, per) => ({ sp, n, per, kg: +(n * per).toFixed(1), price: '' });
const newDraft = (keep = {}) => ({ id: null, date: keep.date || today(), time: nowHM(), place: { name: '', lat: null, lng: null }, entries: [], tfOn: true, memo: '', photos: [] });
const DEF = {
  mode: 'kg', view: 'home', fee: 0, tf: 0, per: {},
  sim: { days: 4, m: 1, tfn: 1, cost: 0,
    am: [mk('クルバニ', 1, 1.5), mk('ハヤー', 3, 0.8), mk('ビタロー', 3, 0.6), mk('ユダヤー', 1, 0.8), mk('オーバチャー', 2, 1.5), mk('長尾ミーバイ', 1, 1.0)],
    pm: [mk('オーバチャー', 4, 1.5), mk('ハヤー', 2, 0.8), mk('長尾ミーバイ', 1, 1.0), mk('アーガイ', 1, 1.0)] },
  mk: { sub: 'rank', filter: 't', sort: 'a', sp: '', from: '', to: '', quick: '1m' },
  draft: newDraft(), hist: { sub: 'cal', month: today().slice(0, 7), day: today(), open: null, who: 'me', period: 'all' },
  fr: { sub: 'cal', month: today().slice(0, 7), day: today(), open: null, who: '', period: 'all', rank: 'kg' },
  home: { rank: 'kg', fperiod: 'month' }
};
let L; try { L = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
if (!L || !L.sim || !L.draft) L = clone(DEF);
L.hist = Object.assign(clone(DEF.hist), L.hist || {}, { who: 'me' });
L.fr = Object.assign(clone(DEF.fr), L.fr || {}); L.mk = Object.assign(clone(DEF.mk), L.mk || {});
if (L.view === 'sim') { L.view = 'mk'; L.mk.sub = 'sim'; } L.home = Object.assign(clone(DEF.home), L.home || {});
let saveT; const saveL = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) {} }, 250); };

/* ───────── 記録の保存先 ───────── */
const LOCAL_TRIPS = 'gyokaku-trips-v1';
const Store = {
  mode: 'local', user: null, profile: null, trips: [], friendsTrips: {}, sharers: [], ready: false,
  readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_TRIPS)) || []; } catch (e) { return []; } },
  writeLocal(a) { try { localStorage.setItem(LOCAL_TRIPS, JSON.stringify(a)); } catch (e) { toast('この端末に保存できませんでした'); } },
  async init() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg) { this.trips = this.readLocal(); this.ready = true; return; }
    try { await FB.init(cfg); this.mode = 'cloud'; }
    catch (e) { console.error(e); this.trips = this.readLocal(); this.ready = true; toast('ログイン機能に接続できません。この端末に保存します'); }
  },
  async save(t) {
    t.updatedAt = Date.now(); if (!t.id) t.id = uid(); if (!t.createdAt) t.createdAt = t.updatedAt;
    if (this.user) return FB.saveTrip(t);
    const a = this.readLocal().filter(x => x.id !== t.id); a.push(t); this.writeLocal(a); this.trips = a;
  },
  async remove(id) {
    const tr = this.trips.find(x => x.id === id); (tr?.photos || []).forEach(p => Photos.del(p));
    if (this.user) return FB.removeTrip(id);
    const a = this.readLocal().filter(x => x.id !== id); this.writeLocal(a); this.trips = a;
  },
  tripsOf(who) { return who === 'me' || !this.user ? this.trips : (this.friendsTrips[who] || []); }
};

/* Firebase（Auth + Firestore）。設定があるときだけ読み込む */
const FB = {
  v: '10.12.2', a: null, f: null, auth: null, db: null, unsub: [],
  async init(cfg) {
    const base = `https://www.gstatic.com/firebasejs/${this.v}/`;
    const [app, a, f] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    this.a = a; this.f = f; this.app = app; this.cfg = cfg;
    const fa = app.initializeApp(cfg);
    this.auth = a.getAuth(fa);
    try { this.db = f.initializeFirestore(fa, { localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }) }); }
    catch (e) { this.db = f.getFirestore(fa); }
    await new Promise(res => a.onAuthStateChanged(this.auth, u => { this.onUser(u); res(); }));
  },
  idOf(u) { return (u.email || '').split('@')[0]; },
  async onUser(u) {
    this.unsub.forEach(f => f()); this.unsub = [];
    Store.user = u || null; Store.profile = null; Store.trips = u ? [] : Store.readLocal(); Store.friendsTrips = {}; Store.sharers = [];
    Store.ready = true; render();
    if (!u) return;
    const { doc, getDoc, setDoc, collection, onSnapshot, query, where } = this.f;
    const id = this.idOf(u), me = doc(this.db, 'users', u.uid);
    try {
      const snap = await getDoc(me);
      if (!snap.exists()) await setDoc(me, { id, name: id, friends: [] });
      await setDoc(doc(this.db, 'ids', id), { uid: u.uid });
    } catch (e) { console.warn(e); }
    this.unsub.push(onSnapshot(me, s => { Store.profile = s.data() || { id, name: id, friends: [] }; render(true); }));
    this.unsub.push(onSnapshot(collection(this.db, 'users', u.uid, 'trips'), s => { Store.trips = s.docs.map(d => d.data()); render(true); }, e => console.warn(e)));
    // 自分をフレンドに追加してくれている人 = 記録を見られる相手
    this.unsub.push(onSnapshot(query(collection(this.db, 'users'), where('friends', 'array-contains', u.uid)), s => {
      Store.sharers = s.docs.map(d => ({ uid: d.id, ...d.data() })); render(true);
      // ホームのランキングとフレンドタブのために、見られる人の記録をまとめて読む
      Promise.all(Store.sharers.map(x => this.loadFriendTrips(x.uid).catch(() => {}))).then(() => render(true));
    }, e => console.warn(e)));
  },
  async login(id, pw) { await this.a.signInWithEmailAndPassword(this.auth, `${id.trim().toLowerCase()}@${window.ACCOUNT_DOMAIN}`, pw); },
  isAdmin() { return !!Store.user && (window.ADMIN_IDS || ['austin']).includes(this.idOf(Store.user)); },
  // 管理者用: 友人のアカウントを発行する。自分のログインを保ったまま、別のアプリ枠で新しいユーザーを作る
  async createAccount(id, pw, name, mutual) {
    const { doc, getDoc, setDoc, updateDoc, arrayUnion } = this.f;
    if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(id)) throw new Error('IDは半角の英小文字・数字（2〜30文字、. _ - も可）にしてください');
    if (pw.length < 6) throw new Error('パスワードは6文字以上にしてください');
    if ((await getDoc(doc(this.db, 'ids', id))).exists()) throw new Error('そのIDはもう使われています');
    if (!this.app2) this.app2 = this.app.initializeApp(this.cfg, 'issuer');
    const auth2 = this.a.getAuth(this.app2), db2 = this.f.getFirestore(this.app2);
    let cred;
    try { cred = await this.a.createUserWithEmailAndPassword(auth2, `${id}@${window.ACCOUNT_DOMAIN}`, pw); }
    catch (e) {
      const c = e.code || '';
      throw new Error(c === 'auth/email-already-in-use' ? 'そのIDはもう使われています'
        : /admin-restricted|operation-not-allowed/.test(c) ? 'Firebaseの設定で新規作成が止められています（Authentication → 設定 → ユーザーアクション）'
        : c === 'auth/weak-password' ? 'パスワードが弱すぎます（6文字以上）' : '発行できませんでした（' + (c || e.message) + '）');
    }
    const uid = cred.user.uid;
    try {
      await setDoc(doc(db2, 'users', uid), { id, name: name || id, friends: mutual ? [Store.user.uid] : [] });
      await setDoc(doc(db2, 'ids', id), { uid });
    } finally { await this.a.signOut(auth2).catch(() => {}); }
    if (mutual) await updateDoc(doc(this.db, 'users', Store.user.uid), { friends: arrayUnion(uid) });
    return uid;
  },
  async logout() { await this.a.signOut(this.auth); },
  async changePassword(pw) { await this.a.updatePassword(this.auth.currentUser, pw); },
  async saveTrip(t) { const { doc, setDoc } = this.f; await setDoc(doc(this.db, 'users', Store.user.uid, 'trips', t.id), t); },
  async removeTrip(id) { const { doc, deleteDoc } = this.f; await deleteDoc(doc(this.db, 'users', Store.user.uid, 'trips', id)); },
  async setName(name) { const { doc, updateDoc } = this.f; await updateDoc(doc(this.db, 'users', Store.user.uid), { name }); },
  async addFriend(id) {
    const { doc, getDoc, updateDoc, arrayUnion } = this.f;
    const s = await getDoc(doc(this.db, 'ids', id.trim().toLowerCase()));
    if (!s.exists()) throw new Error('そのIDのユーザーが見つかりません（相手が一度もログインしていない場合も見つかりません）');
    if (s.data().uid === Store.user.uid) throw new Error('自分のIDです');
    await updateDoc(doc(this.db, 'users', Store.user.uid), { friends: arrayUnion(s.data().uid) });
  },
  async removeFriend(fuid) { const { doc, updateDoc, arrayRemove } = this.f; await updateDoc(doc(this.db, 'users', Store.user.uid), { friends: arrayRemove(fuid) }); },
  async profileOf(fuid) { const { doc, getDoc } = this.f; const s = await getDoc(doc(this.db, 'users', fuid)); return s.exists() ? s.data() : null; },
  async putPhoto(id, data, tripId) { const { doc, setDoc } = this.f; await setDoc(doc(this.db, 'users', Store.user.uid, 'photos', id), { data, tripId, createdAt: Date.now() }); },
  async delPhoto(id) { const { doc, deleteDoc } = this.f; await deleteDoc(doc(this.db, 'users', Store.user.uid, 'photos', id)); },
  async getPhoto(id, owner) { const { doc, getDoc } = this.f; const s = await getDoc(doc(this.db, 'users', owner, 'photos', id)); return s.exists() ? s.data().data : null; },
  async loadFriendTrips(fuid) {
    const { collection, getDocs } = this.f;
    const s = await getDocs(collection(this.db, 'users', fuid, 'trips'));
    Store.friendsTrips[fuid] = s.docs.map(d => d.data());
  }
};

/* ───────── 写真 ─────────
   端末内（IndexedDB）に必ず保存し、ログイン中は Firestore の users/{uid}/photos にも保存する。
   Firebase Storage は有料プランが必要なため、縮小したJPEGを文書として保存する（1枚 約100〜300KB）。 */
const Photos = {
  db: null, mem: {},
  open() {
    if (this.db) return this.db;
    return this.db = new Promise((res, rej) => { const r = indexedDB.open('gyokaku', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  },
  async idb(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('photos', mode), r = fn(tx.objectStore('photos')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); },
  async put(id, data) { this.mem[id] = data; try { await this.idb('readwrite', s => s.put(data, id)); } catch (e) {} },
  async del(id) { delete this.mem[id]; try { await this.idb('readwrite', s => s.delete(id)); } catch (e) {} if (Store.user) FB.delPhoto(id).catch(() => {}); },
  async get(id, owner) {
    if (this.mem[id]) return this.mem[id];
    try { const d = await this.idb('readonly', s => s.get(id)); if (d) return this.mem[id] = d; } catch (e) {}
    if (Store.user) { const d = await FB.getPhoto(id, owner || Store.user.uid).catch(() => null); if (d) { this.mem[id] = d; if (!owner || owner === Store.user.uid) this.put(id, d); return d; } }
    return null;
  },
  async compress(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const s = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let q = 0.72, d = c.toDataURL('image/jpeg', q);
      while (d.length > 700000 && q > 0.35) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
      return d;
    } finally { URL.revokeObjectURL(url); }
  },
  // 画面上の <img data-photo="id" data-owner="uid"> に中身を入れる
  async fill(root = document) {
    for (const im of root.querySelectorAll('img[data-photo]:not([src])')) { const d = await this.get(im.dataset.photo, im.dataset.owner || null); if (d) im.src = d; else im.alt = '読み込めませんでした'; }
  }
};
const thumbs = (ids, { del = false, owner = '' } = {}) => `<div class="thumbs">${(ids || []).map(id => `<div class="th"><button class="thv" data-view-photo="${esc(id)}" data-owner="${esc(owner)}" aria-label="写真を大きく見る"><img data-photo="${esc(id)}" data-owner="${esc(owner)}" alt="漁の写真"></button>${del ? `<button class="thx" data-del-photo="${esc(id)}" aria-label="この写真を外す">×</button>` : ''}</div>`).join('')}</div>`;

/* ───────── 計算 ───────── */
const perOf = r => r.per !== '' && r.per != null ? num(r.per) : (L.per[r.sp] ?? byN[r.sp]?.per ?? 1);
const kgOf = (r, mode = L.mode) => mode === 'kg' ? num(r.kg) : num(r.n) * perOf(r);
const priceOf = (r, withPrice) => withPrice && r.price !== '' && r.price != null ? num(r.price) : (r.mp || mprice(r.sp));
const tripGross = t => t.entries.reduce((s, r) => s + kgOf(r, t.mode) * priceOf(r, true), 0);
const tripKg = t => t.entries.reduce((s, r) => s + kgOf(r, t.mode), 0);
const tripCost = (t, g) => ({ fee: g * num(t.fee) / 100, tf: t.tfOn ? num(t.tf) : 0 });
const tripNet = t => { const g = tripGross(t), c = tripCost(t, g); return g - c.fee - c.tf; };
const isPM = t => (t.time || '00:00') >= '12:00';
const subLine = (g, x) => `売上（手数料前） ${yen(g)}円` + (x.fee ? `／手数料 ${yen(x.fee)}円` : '') + (x.tf ? `／振込手数料 ${yen(x.tf)}円` : '') + (x.cost ? `／経費 ${yen(x.cost)}円` : '');
const kv = a => $('kv').innerHTML = a.map(x => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
const head = (title, label, big, sub) => { $('h1').textContent = title; $('bigl').textContent = label; $('big').innerHTML = big; $('bigs').textContent = sub || ''; };

/* ───────── 伝票の行（①と②で共通） ───────── */
const fields = withPrice => L.mode === 'kg' ? (withPrice ? ['kg', 'price'] : ['kg']) : (withPrice ? ['n', 'per', 'price'] : ['n', 'per']);
const FL = { kg: ['重さ', 'kg', '0.1', 'decimal'], n: ['匹数', '匹', '1', 'numeric'], per: ['1匹の重さ', 'kg/匹', '0.1', 'decimal'], price: ['単価', '円/kg', '10', 'numeric'] };
const rowsHead = withPrice => { const f = fields(withPrice); return `<div class="row hd" style="--k:${f.length + 1}"><span>魚種</span>${f.map(k => `<span>${FL[k][0]}（${FL[k][1]}）</span>`).join('')}<span>金額</span><span></span></div>`; };
const rowHtml = (r, key, i, withPrice) => {
  const f = fields(withPrice), s = byN[r.sp];
  const sub = s ? `${s.j ? esc(s.j) + '・' : ''}相場 ${yen(s.p)}円/kg` : '相場なし・単価を入力';
  return `<div class="row" style="--k:${f.length + 1}"><div class="nm"><b>${esc(r.sp)}</b><small>${sub}</small></div>` +
    f.map(k => {
      let v = r[k], ph = FL[k][1];
      if (k === 'per' && (v === '' || v == null)) { v = ''; ph = String(perOf(r)); }
      if (k === 'price') ph = s ? String(s.p) : '円/kg';
      return `<label class="f"><span>${FL[k][0]}（${FL[k][1]}）</span><input type="number" min="0" step="${FL[k][2]}" inputmode="${FL[k][3]}" placeholder="${esc(ph)}" value="${esc(v)}" aria-label="${esc(r.sp)}の${FL[k][0]}" data-key="${key}" data-i="${i}" data-f="${k}"></label>`;
    }).join('') +
    `<span class="v" id="v-${key}-${i}"></span><button class="x" aria-label="${esc(r.sp)}を削除" data-del="${key}" data-i="${i}">×</button></div>`;
};
const adder = key => `<div class="adder"><input type="search" placeholder="島名・和名で検索して追加（例: クルバニ、ハタ）" aria-label="魚種を検索して追加" data-search="${key}" autocomplete="off" enterkeyhint="done"><div class="hits" id="h-${key}"></div></div>`;
const rowsOf = key => key === 'calc' ? L.draft.entries : L.sim[key];
const renderHits = (key, q) => {
  const h = $('h-' + key); if (!h) return; const r = search(q), t = q.trim();
  h.innerHTML = r.map(s => `<button data-addsp="${esc(s.n)}" data-key="${key}"><span>${esc(s.n)} <small>${esc(s.j)}</small></span><span class="pr">${yen(s.p)}円/kg</span></button>`).join('') +
    (t && !r.some(s => s.n === t) ? `<button data-addsp="${esc(t)}" data-key="${key}"><span>「${esc(t)}」を追加 <small>相場なし・単価は手入力</small></span></button>` : '');
};
const modeSw = () => `<div class="mode" role="group" aria-label="計算方法"><button data-mode="kg" aria-pressed="${L.mode === 'kg'}">重さで計算</button><button data-mode="n" aria-pressed="${L.mode === 'n'}">匹数で計算</button></div>`;
const modeNote = () => L.mode === 'kg' ? '重さは魚種ごとの合計kgです。' : '匹数×1匹の重さでkgを出します。1匹の重さには魚種ごとの目安が入っているので、実際に合わせて書き換えてください。';
const MKLINK = `<a href="https://www.okinawa-fish.jp/shikyou/gyosyu/?ichiba=119" style="color:inherit" target="_blank" rel="noopener">おきなわ魚市場情報</a>`;

/* ───────── 直近の相場 ─────────
   ランキング: 直近7日の市場全体の売上（金額）を魚種ごとに並べる
   価格の推移: data/history.json（全期間）を必要なときだけ読み、日ごとの平均単価をグラフと表にする */
let HIST = null, histLoading = null;
const loadHist = () => histLoading || (histLoading = fetch('data/history.json', { cache: 'no-cache' }).then(r => r.json()).then(d => { HIST = d; return d; }).catch(() => { HIST = MK; return MK; }));
const MKSUB = { rank: 'ランキング', trend: '価格の推移', sim: '売上予測' };
const MKSORT = { a: '売上金額', p: '単価', kg: '水揚量' };
const QUICK = { '1w': ['1週間', 7], '1m': ['1か月', 30], '3m': ['3か月', 91], '1y': ['1年', 365] };
const mkSeg = () => `<div class="wrap" style="padding-top:16px"><div class="seg" role="group" aria-label="直近の相場の表示">${Object.entries(MKSUB).map(([k, v]) => `<button data-mksub="${k}" aria-pressed="${L.mk.sub === k}">${v}</button>`).join('')}</div></div>`;
const renderMk = () => {
  const k = L.mk.sub;
  if (k === 'sim') { renderSim(); $('main').insertAdjacentHTML('afterbegin', mkSeg()); return; }
  $('main').innerHTML = mkSeg() + `<section class="band" style="padding-top:0"><div class="wrap" id="mkbody"></div></section>`;
  k === 'trend' ? renderTrend() : renderRank();
};
const calcMk = () => { if (L.mk.sub === 'sim') calcSim(); };
const rankList = () => {
  const m = L.mk, list = SP.filter(s => s.recent && (m.filter === 'all' || s.t));
  const key = m.sort === 'a' ? 'a7' : m.sort === 'kg' ? 'kg7' : 'p';
  return list.sort((x, y) => y[key] - x[key]);
};
const renderRank = () => {
  const m = L.mk, list = rankList(), key = m.sort === 'a' ? 'a7' : m.sort === 'kg' ? 'kg7' : 'p', mx = list.length ? list[0][key] || 1 : 1;
  const from = latest ? ymd(new Date(T(latest) - 6 * DAY)) : '';
  const a = list.reduce((t, x) => t + x.a7, 0), kg = list.reduce((t, x) => t + x.kg7, 0);
  head('直近1週間の相場', `${m.filter === 't' ? '捕獲対象の魚' : '全魚種'}の売上合計（${from ? md(from) : ''}〜${latest ? md(latest) : ''}・JF沖縄魚市場）`, yen(a) + '<small>円</small>', `相場データの最終取引日 ${latest ? md(latest) : '—'}。毎日昼と夕方に更新`);
  kv([[list.length + ' 種', '取引があった魚種'], [yen(kg) + ' kg', '水揚量の合計'], [yen(kg ? a / kg : 0) + '円', '平均単価（円/kg）'], [list[0] ? esc(list[0].n) : '—', `${MKSORT[m.sort]}が1位の魚`]]);
  $('mkbody').innerHTML = `<div class="ch" style="margin-bottom:10px">${segBtns('mkfilter', { t: '捕獲対象', all: '総合' }, m.filter, '魚の範囲')}${segBtns('mksort', MKSORT, m.sort, '並べ方')}</div>
<p class="note" style="margin-top:0">${m.filter === 't' ? '捕獲対象＝素潜り手銛で狙えて、漁業権の対象（タコ・エビ・カニ・貝）ではない魚。深場の魚・回遊魚・網漁の魚は除いています。' : '市場に出たすべての魚種です。'}魚を押すと価格の推移を見られます。</p>
${list.length ? `<ol class="rank mkr">${list.map((x, i) => `<li><button class="rk" data-mksp="${esc(x.n)}" aria-label="${esc(x.n)}の価格の推移を見る"><span class="no">${i + 1}</span><span class="nm2">${esc(x.n)}${x.j ? ` <small>${esc(x.j)}</small>` : ''}</span><span class="n">${m.sort === 'a' ? yen(x.a7) + '円' : m.sort === 'kg' ? x.kg7.toFixed(1) + ' kg' : yen(x.p) + '円/kg'}</span><div class="t"><i style="width:${x[key] / mx * 100}%;background:var(--am)"></i></div><small class="sub2">${m.sort === 'p' ? '' : `単価 ${yen(x.p)}円/kg・`}${m.sort === 'kg' ? '' : `${x.kg7.toFixed(1)}kg・`}${x.days7}日取引</small></button></li>`).join('')}</ol>` : '<p class="empty">直近1週間に取引がありません。</p>'}`;
};
const mkHits = q => { const h = $('h-mk'); if (!h) return; h.innerHTML = search(q).map(s => `<button data-mksp="${esc(s.n)}"><span>${esc(s.n)} <small>${esc(s.j)}</small></span><span class="pr">${yen(s.p)}円/kg</span></button>`).join(''); };
const trendRange = () => {
  const m = L.mk, end = m.to || latest || today();
  if (m.quick && QUICK[m.quick]) return [ymd(new Date(T(end) - (QUICK[m.quick][1] - 1) * DAY)), end];
  return [m.from || ymd(new Date(T(end) - 29 * DAY)), end];
};
const renderTrend = () => {
  const m = L.mk; if (!m.sp && SP.length) m.sp = (rankList()[0] || SP[0]).n;
  const s = byN[m.sp] || null, [from, to] = trendRange();
  $('mkbody').innerHTML = `<div class="adder" style="margin-top:0"><input type="search" placeholder="島名・和名で魚を検索" aria-label="価格の推移を見る魚を検索" data-mksearch autocomplete="off"><div class="hits" id="h-mk"></div></div>
<div class="range"><div class="dates"><label class="c" for="mkfrom">開始</label><input type="date" id="mkfrom" value="${from}"><label class="c" for="mkto">終了</label><input type="date" id="mkto" value="${to}"></div>
<div class="seg sm quick" role="group" aria-label="期間をすぐ選ぶ">${Object.entries(QUICK).map(([k, v]) => `<button data-quick="${k}" aria-pressed="${m.quick === k}">${v[0]}</button>`).join('')}</div></div>
<div id="trend"><p class="empty">読み込み中…</p></div>`;
  head(s ? `${s.n}${s.j ? '（' + s.j + '）' : ''}` : '価格の推移', '直近1週間の予想単価', s ? yen(s.p) + '<small>円/kg</small>' : '—', s ? (s.recent ? `${md(latest)}時点` : `${md(s.asof)}までの取引から`) : '');
  kv([['—', '期間の平均単価'], ['—', '期間の最高'], ['—', '期間の最安'], ['—', '取引があった日数']]);
  loadHist().then(() => { if (L.view === 'mk' && L.mk.sub === 'trend') drawTrend(); });
};
const drawTrend = () => {
  const m = L.mk, [from, to] = trendRange(), s = byN[m.sp];
  const src = (HIST?.species || []).find(x => x.n === m.sp) || MK.species.find(x => x.n === m.sp);
  const rows = (src?.d || []).filter(x => x[0] >= from && x[0] <= to && x[2] > 0).sort((a, b) => a[0] < b[0] ? -1 : 1)
    .map(x => ({ d: x[0], p: x[1] / x[2], a: x[1], kg: x[2], hi: x[3] ?? null, lo: x[4] ?? null }));
  const el = $('trend'); if (!el) return;
  if (!rows.length) { el.innerHTML = `<p class="empty">${esc(m.sp)}はこの期間に取引がありません。期間を広げてください。</p>`; return; }
  const A = rows.reduce((t, r) => t + r.a, 0), K = rows.reduce((t, r) => t + r.kg, 0), ps = rows.map(r => r.p);
  const hiR = rows.reduce((a, r) => r.p > a.p ? r : a), loR = rows.reduce((a, r) => r.p < a.p ? r : a);
  kv([[yen(A / K) + '円', '期間の平均単価（金額÷水揚量）'], [yen(hiR.p) + '円', `期間の最高（${md(hiR.d)}）`], [yen(loR.p) + '円', `期間の最安（${md(loR.d)}）`], [rows.length + ' 日', '取引があった日数']]);
  el.innerHTML = `<div class="chart" id="chart" role="img" aria-label="${esc(m.sp)}の日ごとの平均単価の推移、${md(from)}から${md(to)}"></div>
<p class="note">線は日ごとの平均単価（その日の金額÷水揚量）、薄い帯はその日の高値〜安値です。日曜など取引がない日はとばしています。</p>
<details${rows.length <= 14 ? ' open' : ''}><summary>表で見る（${rows.length}日分）</summary><div class="tbl"><table><thead><tr><th>日付</th><th class="r">平均単価</th><th class="r">高値</th><th class="r">安値</th><th class="r">水揚量</th></tr></thead><tbody>${rows.slice().reverse().map(r => `<tr><td>${md(r.d)}（${WD[new Date(r.d + 'T00:00').getDay()]}）</td><td class="r"><b>${yen(r.p)}</b>円</td><td class="r">${r.hi != null ? yen(r.hi) + '円' : '—'}</td><td class="r">${r.lo != null ? yen(r.lo) + '円' : '—'}</td><td class="r">${r.kg.toFixed(1)}kg</td></tr>`).join('')}</tbody></table></div></details>`;
  lineChart($('chart'), rows);
};
const niceTicks = (lo, hi, n = 4) => {
  const span = hi - lo || hi || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, t = [];
  for (let v = a; v <= b + step / 2; v += step) t.push(v); return t;
};
const lineChart = (box, rows) => {
  const W = Math.max(300, box.clientWidth || 340), H = 230, P = { l: 52, r: 14, t: 14, b: 28 };
  const vals = rows.flatMap(r => [r.p, r.hi, r.lo].filter(v => v != null && v > 0));
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals)), y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const t0 = T(rows[0].d), t1 = T(rows[rows.length - 1].d) || t0 + 1;
  const X = d => P.l + (rows.length === 1 ? (W - P.l - P.r) / 2 : (T(d) - t0) / (t1 - t0) * (W - P.l - P.r));
  const Y = v => P.t + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - P.t - P.b);
  const band = rows.filter(r => r.hi != null && r.lo != null);
  const bandPath = band.length > 1 ? 'M' + band.map(r => `${X(r.d)},${Y(r.hi)}`).join('L') + 'L' + band.slice().reverse().map(r => `${X(r.d)},${Y(r.lo)}`).join('L') + 'Z' : '';
  const line = 'M' + rows.map(r => `${X(r.d)},${Y(r.p)}`).join('L');
  const xl = [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]].filter((r, i, a) => a.indexOf(r) === i);
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" aria-hidden="true">
${ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${P.l - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${yen(v)}</text>`).join('')}
${bandPath ? `<path d="${bandPath}" class="band"/>` : ''}
<path d="${line}" class="ln"/>
${rows.length <= 40 ? rows.map(r => `<circle cx="${X(r.d)}" cy="${Y(r.p)}" r="3" class="pt"/>`).join('') : ''}
<circle cx="${X(rows[rows.length - 1].d)}" cy="${Y(rows[rows.length - 1].p)}" r="5" class="end"/>
${xl.map((r, i) => `<text x="${X(r.d)}" y="${H - 8}" class="ax" text-anchor="${i === 0 ? 'start' : i === xl.length - 1 ? 'end' : 'middle'}">${md(r.d)}</text>`).join('')}
<line class="xh" y1="${P.t}" y2="${H - P.b}" x1="-10" x2="-10"/><circle class="xp" r="5" cx="-10" cy="-10"/>
<rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent" class="hit"/>
</svg><div class="tip" hidden></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('.tip'), xh = box.querySelector('.xh'), xp = box.querySelector('.xp');
  const show = e => {
    const r0 = svg.getBoundingClientRect(), x = (e.clientX - r0.left) * W / r0.width;
    const r = rows.reduce((a, b) => Math.abs(X(b.d) - x) < Math.abs(X(a.d) - x) ? b : a);
    xh.setAttribute('x1', X(r.d)); xh.setAttribute('x2', X(r.d)); xp.setAttribute('cx', X(r.d)); xp.setAttribute('cy', Y(r.p));
    box.classList.add('on'); tip.hidden = false; tip.innerHTML = `<b>${md(r.d)}（${WD[new Date(r.d + 'T00:00').getDay()]}）</b><br>平均 ${yen(r.p)}円/kg${r.hi != null ? `<br>高値 ${yen(r.hi)}円・安値 ${yen(r.lo)}円` : ''}<br>水揚量 ${r.kg.toFixed(1)}kg`;
    const px = X(r.d) / W * r0.width; tip.style.left = Math.min(Math.max(px - 70, 0), r0.width - 150) + 'px';
  };
  const hide = () => { box.classList.remove('on'); tip.hidden = true; xh.setAttribute('x1', -10); xh.setAttribute('x2', -10); xp.setAttribute('cx', -10); };
  svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', hide);
};

/* ───────── 漁獲高記録 ───────── */
let pmap = null, pmark = null;
const places = () => {
  const m = new Map(); Store.trips.forEach(t => { if (t.place?.name && t.place.lat != null) m.set(t.place.name, t.place); }); return [...m.values()];
};
const renderCalc = () => {
  const d = L.draft, editing = !!d.id;
  $('main').innerHTML = `
<section class="band"><div class="wrap">
${editing ? `<div class="box" style="margin:0 0 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="flex:1 1 200px"><b>${md(d.date)}（${WD[new Date(d.date + 'T00:00').getDay()]}）${esc(d.time)} の漁を編集中</b></span><button id="cancelEdit">編集をやめる</button></div>` : ''}
<h2>いつ・どこで</h2>
<div class="cond">
 <div><label class="c" for="d-date">日付</label><input id="d-date" type="date" value="${esc(d.date)}" data-d="date"></div>
 <div><label class="c" for="d-time">漁に入った時刻</label><input id="d-time" type="time" value="${esc(d.time)}" data-d="time"></div>
</div>
<div class="placeRow" style="margin-top:12px">
 <div><label class="c" for="d-place">場所の名前</label><input id="d-place" list="placeList" placeholder="例: 大度海岸の沖" value="${esc(d.place.name)}" data-d="place" autocomplete="off"></div>
 <button id="here" type="button">現在地</button>
</div>
<datalist id="placeList">${places().map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
<div id="pmap" class="pmap" role="application" aria-label="漁の場所を選ぶ地図"></div>
<p class="note" id="pinfo" style="margin:6px 0 0">${d.place.lat != null ? `地図の位置: ${d.place.lat.toFixed(4)}, ${d.place.lng.toFixed(4)}（地図をタップすると変えられます）` : '地図をタップするか「現在地」で場所を記録できます。'}</p>
</div></section>
<section class="band" style="padding-top:0"><div class="wrap">
<h2>獲れた魚</h2>${modeSw()}
<div class="slip ${isPM(d) ? 'pm' : ''}"><div class="sh"><span class="lbl">${isPM(d) ? '夕方〜夜' : '朝〜昼過ぎ'}の漁</span><span class="sum" id="t-calc"></span></div>
${d.entries.length ? rowsHead(true) : '<p class="empty">まだ魚がありません。下の検索から追加してください。</p>'}
${d.entries.map((r, i) => rowHtml(r, 'calc', i, true)).join('')}${adder('calc')}</div>
<p class="note">${modeNote()}単価は空欄なら相場の予想単価で計算します。実際の売値がわかったら入力してください。重さと匹数は切り替えても、それぞれの入力が残ります。</p>
<div class="box"><h3>手数料・振込</h3><div class="cond">
 <div><label class="c" for="fee">市場・漁協の手数料（%）</label><input id="fee" type="number" inputmode="decimal" min="0" max="30" step="0.5" value="${esc(L.fee)}" data-g="fee"></div>
 <div><label class="c" for="tf">振込手数料（円/回）</label><input id="tf" type="number" inputmode="numeric" min="0" step="10" value="${esc(L.tf)}" data-g="tf"></div>
</div><label class="chk"><input type="checkbox" id="tfOn" ${d.tfOn ? 'checked' : ''}> この漁の売上から振込手数料を引く</label>
<p class="note" style="margin:4px 0 0">手数料は売上に対する割合です。率と額は出荷先の漁協で確認して入力してください。</p></div>
<div class="box"><h3>写真</h3>${thumbs(d.photos, { del: true })}
<label class="filebtn"><input type="file" id="photoIn" accept="image/*" multiple>＋ 写真を追加（撮影・ライブラリ）</label>
<p class="note" style="margin:6px 0 0">写真は自動で小さくしてから保存します。</p></div>
<div style="margin-top:14px"><label class="c" for="memo">メモ</label><textarea id="memo" data-d="memo" placeholder="潮・水温・透明度など">${esc(d.memo)}</textarea></div>
<div class="acts"><button class="pri" id="saveTrip">${editing ? '変更を保存' : 'この漁を記録する'}</button>${editing ? '' : '<button id="clearDraft">入力をクリア</button>'}</div>
<p class="note" id="saveNote">${Store.user ? 'アカウントに保存します。フレンドに追加した人も見られます。' : (Store.mode === 'cloud' ? 'ログインしていないため、この端末にだけ保存します。' : 'この端末に保存します。')}</p>
</div></section>`;
  initPlaceMap(); Photos.fill($('main'));
};
const initPlaceMap = () => {
  if (pmap) { pmap.remove(); pmap = null; pmark = null; }
  if (!window.L || !$('pmap')) return;
  const p = L.draft.place, has = p.lat != null;
  pmap = window.L.map('pmap', { zoomControl: true, attributionControl: true }).setView(has ? [p.lat, p.lng] : [26.45, 127.85], has ? 13 : 9);
  tiles(pmap);
  if (has) pmark = window.L.marker([p.lat, p.lng]).addTo(pmap);
  pmap.on('click', e => setPlace(e.latlng.lat, e.latlng.lng));
};
const setPlace = (lat, lng, zoom) => {
  const p = L.draft.place; p.lat = +lat.toFixed(5); p.lng = +lng.toFixed(5);
  if (pmap) { if (pmark) pmark.setLatLng([p.lat, p.lng]); else pmark = window.L.marker([p.lat, p.lng]).addTo(pmap); if (zoom) pmap.setView([p.lat, p.lng], zoom); }
  const i = $('pinfo'); if (i) i.textContent = `地図の位置: ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}（地図をタップすると変えられます）`;
  saveL();
};
const tiles = m => window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
const calcCalc = () => {
  const d = L.draft; let g = 0, kg = 0, n = 0;
  d.entries.forEach((r, i) => { const a = kgOf(r) * priceOf(r, true); g += a; kg += kgOf(r); n += num(r.n); const e = $(`v-calc-${i}`); if (e) e.textContent = yen(a) + '円'; });
  const c = { fee: g * num(L.fee) / 100, tf: d.tfOn ? num(L.tf) : 0 };
  const t = $('t-calc'); if (t) t.textContent = yen(g) + '円';
  head('この漁の漁獲高', 'この漁の手取り（手数料・振込手数料を引いた額）', yen(g - c.fee - c.tf) + '<small>円</small>', subLine(g, c));
  kv([[kg.toFixed(1) + ' kg', '総重量'], [L.mode === 'n' ? yen(n) + ' 匹' : d.entries.length + ' 種', L.mode === 'n' ? '総匹数' : '魚種の数'], [yen(kg ? g / kg : 0) + '円', '平均単価（円/kg）'], [latest ? md(latest) : '—', '相場の基準日']]);
};
const saveTrip = async () => {
  const d = L.draft;
  const entries = d.entries.filter(r => kgOf(r) > 0);
  if (!entries.length) { toast('重さか匹数を入れた魚を1つ以上追加してください'); return; }
  const t = { id: d.id || uid(), photos: (d.photos || []).slice(), date: d.date || today(), time: d.time || '', place: clone(d.place), mode: L.mode, fee: num(L.fee), tf: num(L.tf), tfOn: !!d.tfOn, memo: d.memo || '',
    entries: entries.map(r => ({ sp: r.sp, kg: r.kg, n: r.n, per: r.per === '' || r.per == null ? perOf(r) : num(r.per), price: r.price, mp: mprice(r.sp) || r.mp || 0 })) };
  if (d.createdAt) t.createdAt = d.createdAt;
  const b = $('saveTrip'); b.disabled = true;
  try {
    const prev = Store.trips.find(x => x.id === t.id), before = prev?.photos || [];
    if (Store.user) for (const id of t.photos.filter(x => !before.includes(x))) { const data = await Photos.get(id); if (data) await FB.putPhoto(id, data, t.id); }
    before.filter(x => !t.photos.includes(x)).forEach(x => Photos.del(x));
    await Store.save(t);
    toast(d.id ? '変更を保存しました' : '記録しました。「過去の漁獲高」で見られます');
    L.draft = newDraft({ date: t.date }); L.hist.month = t.date.slice(0, 7); L.hist.day = t.date; L.hist.open = t.id;
    saveL(); render();
  } catch (e) { console.error(e); toast('保存できませんでした: ' + (e.message || e)); b.disabled = false; }
};

/* ───────── ② 売上予測 ───────── */
const renderSim = () => {
  const s = L.sim;
  $('main').innerHTML = `
<section class="band"><div class="wrap"><h2>条件</h2><div class="cond">
 <div><label class="c" for="days">漁をする日数</label><input id="days" type="number" inputmode="numeric" min="1" max="60" value="${esc(s.days)}" data-s="days"></div>
 <div><label class="c" for="cost">経費合計（円）</label><input id="cost" type="number" inputmode="numeric" min="0" step="1000" value="${esc(s.cost)}" data-s="cost"></div>
</div>
<div class="box"><h3>手数料・振込</h3><div class="cond">
 <div><label class="c" for="fee">市場・漁協の手数料（%）</label><input id="fee" type="number" inputmode="decimal" min="0" max="30" step="0.5" value="${esc(L.fee)}" data-g="fee"></div>
 <div><label class="c" for="tf">振込手数料（円/回）</label><input id="tf" type="number" inputmode="numeric" min="0" step="10" value="${esc(L.tf)}" data-g="tf"></div>
 <div><label class="c" for="tfn">振込の回数</label><input id="tfn" type="number" inputmode="numeric" min="0" step="1" value="${esc(s.tfn)}" data-s="tfn"></div>
</div><p class="note" style="margin:6px 0 0">経費は氷・燃料・船代など、期間全体の合計です。</p></div>
</div></section>
<section class="band" style="padding-top:0"><div class="wrap"><h2>1回あたりの水揚げ（1日分）</h2>${modeSw()}
<div class="slips">${['am', 'pm'].map(k => `<div class="slip ${k}"><div class="sh"><span class="lbl">${k === 'am' ? '朝〜昼過ぎ' : '夕方〜夜'}</span><span class="sum" id="t-${k}"></span></div>${s[k].length ? rowsHead(false) : ''}${s[k].map((r, i) => rowHtml(r, k, i, false)).join('')}${adder(k)}</div>`).join('')}</div>
<p class="note">${modeNote()}重さと匹数は切り替えても、それぞれの入力が残ります。</p>
</div></section>
<section class="band" style="padding-top:0"><div class="wrap"><h2>魚種別の売上（期間合計・手数料前）</h2><div class="bars" id="bars"></div>
<ul class="note"><li>単価は${MKLINK}のJF沖縄魚市場の値で、魚種ごとに直近7日間の「金額の合計÷水揚量の合計」です（円/kg）。7日以内に取引がない魚種は、最後に取引があった週の値を使います。</li><li>市場データにサイズ別の内訳はないため、大型ほど単価が上がる魚では実際とずれます。日曜は市場の取引がありません。</li></ul>
</div></section>
`;
};
const calcSim = () => {
  const s = L.sim, d = Math.max(0, num(s.days)), m = s.m, by = {}, tot = { am: 0, pm: 0 }; let kg = 0, n = 0;
  ['am', 'pm'].forEach(k => s[k].forEach((r, i) => {
    const v = kgOf(r) * mprice(r.sp) * m; tot[k] += v; kg += kgOf(r) * m * d; n += num(r.n) * m * d;
    const e = $(`v-${k}-${i}`); if (e) e.textContent = yen(v) + '円'; by[r.sp] = by[r.sp] || { am: 0, pm: 0 }; by[r.sp][k] += v * d;
  }));
  ['am', 'pm'].forEach(k => { const e = $('t-' + k); if (e) e.textContent = yen(tot[k]) + '円/回'; });
  const g = (tot.am + tot.pm) * d, x = { fee: g * num(L.fee) / 100, tf: num(L.tf) * num(s.tfn), cost: num(s.cost) };
  head(`${s.days}日間・1日2回潜った場合の売上予測`, '想定の手取り（手数料・振込手数料・経費を引いた額）', yen(g - x.fee - x.tf - x.cost) + '<small>円</small>', subLine(g, x));
  kv([[yen(g / (d || 1)) + '円', '1日あたり（手数料前）'], [yen(g / ((d * 2) || 1)) + '円', '1回あたり（手数料前）'], [kg.toFixed(1) + ' kg', '総水揚量'], L.mode === 'n' ? [Math.round(n) + ' 匹', '総匹数'] : [yen(kg ? g / kg : 0) + '円', '平均単価（円/kg）']]);
  const arr = Object.entries(by).map(([k, v]) => [k, v.am, v.pm, v.am + v.pm]).sort((a, b) => b[3] - a[3]), mx = arr.length ? arr[0][3] || 1 : 1;
  const b = $('bars'); if (b) b.innerHTML = arr.length ? arr.map(a => `<div class="b"><span>${esc(a[0])}</span><div class="t" style="width:${a[3] / mx * 100}%"><i style="width:${a[1] / (a[3] || 1) * 100}%;background:var(--am)"></i><i style="width:${a[2] / (a[3] || 1) * 100}%;background:var(--pm)"></i></div><span class="n">${yen(a[3])}円</span></div>`).join('') + `<p class="note" style="margin-top:8px"><span style="color:var(--am)">■</span> 朝〜昼過ぎ　<span style="color:var(--pm)">■</span> 夕方〜夜</p>` : '<p class="empty">魚種を追加すると内訳が出ます。</p>';
};

/* ───────── ③ 過去の漁獲高 ───────── */
let hmap = null;
const H = () => L.view === 'friend' ? L.fr : L.hist;
const whoName = w => w === 'me' ? '自分' : (Store.sharers.find(s => s.uid === w)?.name || 'フレンド');
const curTrips = () => Store.tripsOf(H().who).slice().sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1);
const whoSel = () => !Store.user ? '' : `<div class="who"><label class="c" for="who">誰の記録を見るか</label><select id="who">${[['me', '自分']].concat(Store.sharers.map(s => [s.uid, s.name || s.id])).map(([v, n]) => `<option value="${esc(v)}"${H().who === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>${Store.sharers.length ? '' : '<p class="note" style="margin:4px 0 0">フレンドがあなたを追加すると、その人の記録をここで選べます。</p>'}</div>`;
const renderHist = () => {
  const h = H();
  $('main').innerHTML = `<section class="band"><div class="wrap">
<div class="seg" role="group" aria-label="表示方法"><button data-sub="cal" aria-pressed="${h.sub === 'cal'}">カレンダー</button><button data-sub="map" aria-pressed="${h.sub === 'map'}">地図</button></div>
<div id="hbody"></div></div></section>`;
  h.sub === 'map' ? renderMap() : renderCal();
};
const renderCal = () => {
  const h = H(), [y, m] = h.month.split('-').map(Number), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
  const trips = curTrips(), byDay = {};
  trips.forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
  let cells = '';
  for (let i = 0; i < first.getDay(); i++) cells += '<button class="out" tabindex="-1" aria-hidden="true"></button>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`, ts = byDay[ds] || [], tot = ts.reduce((s, t) => s + tripNet(t), 0);
    cells += `<button data-day="${ds}" aria-pressed="${h.day === ds}" class="${ds === today() ? 'today' : ''}" aria-label="${m}月${d}日${ts.length ? `、漁${ts.length}回、${yen(tot)}円` : ''}"><span>${d}</span>${ts.length ? `<span class="dots">${ts.map(t => `<i class="${isPM(t) ? 'pm' : ''}"></i>`).join('')}</span><span class="amt">${man(tot)}</span>` : ''}</button>`;
  }
  const dayTrips = (byDay[h.day] || []);
  const mine = H().who === 'me';
  setTimeout(() => Photos.fill($('hbody')));
  $('hbody').innerHTML = `<div class="mnav"><button data-mon="-1" aria-label="前の月">‹ 前月</button><b>${y}年${m}月</b><button data-mon="1" aria-label="次の月">次月 ›</button></div>
<div class="cal">${WD.map(w => `<div class="dw">${w}</div>`).join('')}${cells}</div>
<h2 style="margin-top:20px">${md(h.day)}（${WD[new Date(h.day + 'T00:00').getDay()]}）の漁</h2>
<div class="trips">${dayTrips.length ? dayTrips.map(t => tripCard(t, mine)).join('') : `<p class="empty">この日の記録はありません。${mine ? '「漁獲高記録」から記録できます。' : ''}</p>`}</div>`;
  // 月の集計をヘッダーに
  const mt = trips.filter(t => t.date.startsWith(h.month)), g = mt.reduce((s, t) => s + tripGross(t), 0), net = mt.reduce((s, t) => s + tripNet(t), 0);
  const kg = mt.reduce((s, t) => s + tripKg(t), 0), nd = new Set(mt.map(t => t.date)).size;
  head(`${H().who === 'me' ? '' : whoName(H().who) + 'さんの'}${m}月の漁獲高`, `${m}月の手取り（手数料・振込手数料を引いた額）`, yen(net) + '<small>円</small>', `売上（手数料前） ${yen(g)}円`);
  kv([[mt.length + ' 回', '漁の回数'], [nd + ' 日', '漁をした日数'], [kg.toFixed(1) + ' kg', '総重量'], [yen(kg ? g / kg : 0) + '円', '平均単価（円/kg）']]);
};
const tripCard = (t, mine) => {
  const g = tripGross(t), c = tripCost(t, g), open = H().open === t.id;
  return `<div class="trip ${isPM(t) ? 'pm' : ''}" id="trip-${esc(t.id)}"><button class="head" data-open="${esc(t.id)}" aria-expanded="${open}"><span class="tm">${esc(t.time || '--:--')}</span><span class="pl">${esc(t.place?.name || (t.place?.lat != null ? '地図で指定' : '場所なし'))}</span><span class="tt">${yen(g - c.fee - c.tf)}円</span></button>
${open ? `<div class="det"><div class="tbl"><table><thead><tr><th>魚種</th><th class="r">${t.mode === 'n' ? '匹数' : '重さ'}</th><th class="r">単価</th><th class="r">金額</th></tr></thead><tbody>${t.entries.map(r => { const k = kgOf(r, t.mode), p = priceOf(r, true); return `<tr><td>${esc(r.sp)}</td><td class="r">${t.mode === 'n' ? num(r.n) + '匹（' + k.toFixed(1) + 'kg）' : k.toFixed(1) + 'kg'}</td><td class="r">${yen(p)}円</td><td class="r">${yen(k * p)}円</td></tr>`; }).join('')}</tbody></table></div>
${t.photos?.length ? thumbs(t.photos, { owner: mine ? '' : H().who }) : ''}
<p class="note">${subLine(g, c)}${t.memo ? `<br>メモ: ${esc(t.memo)}` : ''}</p>
<div class="acts">${t.place?.lat != null ? `<button data-showmap="${esc(t.id)}">地図で見る</button>` : ''}${mine ? `<button data-edit="${esc(t.id)}">編集</button><button data-deltrip="${esc(t.id)}">削除</button>` : ''}</div></div>` : ''}</div>`;
};
const PERIODS = { month: ['今月', 31], q: ['3か月', 92], all: ['全期間', 1e5] };
const renderMap = () => {
  const h = H();
  $('hbody').innerHTML = `<div class="seg" role="group" aria-label="期間" style="background:transparent;padding:0">${Object.entries(PERIODS).map(([k, v]) => `<button data-period="${k}" aria-pressed="${h.period === k}">${v[0]}</button>`).join('')}</div>
<div id="hmap" class="bigmap" role="application" aria-label="過去の漁の地図"></div>
<p class="note">ピンを押すと、その漁の日時と漁獲高が出ます。<span style="color:var(--am)">●</span> 朝〜昼過ぎ　<span style="color:var(--pm)">●</span> 夕方〜夜</p>`;
  const from = ymd(new Date(Date.now() - PERIODS[h.period][1] * DAY));
  const trips = curTrips().filter(t => t.date >= from), pts = trips.filter(t => t.place?.lat != null);
  const g = trips.reduce((s, t) => s + tripGross(t), 0), net = trips.reduce((s, t) => s + tripNet(t), 0);
  head(`${h.who === 'me' ? '' : whoName(h.who) + 'さんの'}漁場マップ`, `${PERIODS[h.period][0]}の手取り`, yen(net) + '<small>円</small>', `売上（手数料前） ${yen(g)}円`);
  const top = Object.entries(pts.reduce((m, t) => { const k = t.place.name || '名前なし'; m[k] = (m[k] || 0) + tripNet(t); return m; }, {})).sort((a, b) => b[1] - a[1])[0];
  kv([[trips.length + ' 回', '漁の回数'], [pts.length + ' 回', '場所の記録がある漁'], [top ? esc(top[0]) : '—', 'いちばん稼いだ場所'], [top ? yen(top[1]) + '円' : '—', 'その場所の手取り合計']]);
  if (hmap) { hmap.remove(); hmap = null; }
  if (!window.L) { $('hmap').innerHTML = '<p class="empty" style="padding:16px">地図を読み込めませんでした。電波のある場所で開き直してください。</p>'; return; }
  hmap = window.L.map('hmap').setView([26.45, 127.85], 9); tiles(hmap);
  const css = getComputedStyle(document.documentElement), am = css.getPropertyValue('--am').trim(), pm = css.getPropertyValue('--pm').trim();
  const ms = pts.map(t => window.L.circleMarker([t.place.lat, t.place.lng], { radius: 9, color: '#fff', weight: 2, fillColor: isPM(t) ? pm : am, fillOpacity: .9 })
    .bindPopup(`<b>${md(t.date)}（${WD[new Date(t.date + 'T00:00').getDay()]}）${esc(t.time)}</b><br>${esc(t.place.name || '')}<br>手取り ${yen(tripNet(t))}円・${tripKg(t).toFixed(1)}kg<br><button data-goto="${esc(t.id)}" style="margin-top:6px;min-height:36px">カレンダーで見る</button>`).addTo(hmap));
  if (ms.length) hmap.fitBounds(window.L.featureGroup(ms).getBounds().pad(0.3), { maxZoom: 14 });
  if (h.focus) { const t = pts.find(x => x.id === h.focus); if (t) { hmap.setView([t.place.lat, t.place.lng], 14); ms[pts.indexOf(t)].openPopup(); } h.focus = null; }
};

/* ───────── ホーム ───────── */
const RANK = { kg: '重さ', n: '匹数', yen: '金額' };
const rankSpecies = (trips, by) => {
  const m = {};
  trips.forEach(t => t.entries.forEach(r => {
    const x = m[r.sp] = m[r.sp] || { kg: 0, n: 0, yen: 0 }, k = kgOf(r, t.mode);
    x.kg += k; x.n += num(r.n); x.yen += k * priceOf(r, true);
  }));
  return Object.entries(m).filter(([, v]) => v[by] > 0).sort((a, b) => b[1][by] - a[1][by]).slice(0, 10);
};
const fmtRank = (v, by) => by === 'kg' ? v.toFixed(1) + ' kg' : by === 'n' ? yen(v) + ' 匹' : yen(v) + '円';
const rankBars = (list, by, color = 'var(--am)') => {
  if (!list.length) return `<p class="empty">${by === 'n' ? '匹数を入れた記録がまだありません。' : 'まだ記録がありません。'}</p>`;
  const mx = list[0][1][by] || 1;
  return `<ol class="rank">${list.map(([k, v], i) => `<li><span class="no">${i + 1}</span><span class="nm2">${esc(k)}${byN[k]?.j ? ` <small>${esc(byN[k].j)}</small>` : ''}</span><span class="n">${fmtRank(v[by], by)}</span><div class="t"><i style="width:${v[by] / mx * 100}%;background:${color}"></i></div></li>`).join('')}</ol>`;
};
const segBtns = (attr, opts, cur, label) => `<div class="seg sm" role="group" aria-label="${label}">${Object.entries(opts).map(([k, v]) => `<button data-${attr}="${k}" aria-pressed="${cur === k}">${v}</button>`).join('')}</div>`;
const sumOf = trips => ({ g: trips.reduce((s, t) => s + tripGross(t), 0), net: trips.reduce((s, t) => s + tripNet(t), 0), kg: trips.reduce((s, t) => s + tripKg(t), 0), n: trips.length });
const renderHome = () => {
  const me = Store.trips, all = sumOf(me), mon = today().slice(0, 7), yr = today().slice(0, 4), hm = L.home;
  const tm = sumOf(me.filter(t => t.date.startsWith(mon)));
  head('ホーム', '累計の手取り（手数料・振込手数料を引いた額）', yen(all.net) + '<small>円</small>', `累計売上（手数料前） ${yen(all.g)}円`);
  kv([[yen(tm.net) + '円', `${+mon.slice(5)}月の手取り`], [tm.n + ' 回', `${+mon.slice(5)}月の漁の回数`], [all.kg.toFixed(1) + ' kg', '累計の総重量'], [all.n + ' 回', '累計の漁の回数']]);
  // フレンドランキング
  const pre = hm.fperiod === 'month' ? mon : yr;
  const people = Store.user ? [{ uid: 'me', name: (Store.profile?.name || FB.idOf(Store.user)), trips: me }].concat(Store.sharers.map(x => ({ uid: x.uid, name: x.name || x.id, trips: Store.friendsTrips[x.uid] || [] }))) : [];
  const fr = people.map(p => ({ ...p, ...sumOf(p.trips.filter(t => t.date.startsWith(pre))) })).sort((a, b) => b.net - a.net);
  const fmx = fr.length ? fr[0].net || 1 : 1;
  const recent = me.slice().sort((a, b) => (b.date + b.time) < (a.date + a.time) ? -1 : 1).slice(0, 3);
  $('main').innerHTML = `<section class="band"><div class="wrap home">
<div class="card"><div class="ch"><h2>今までとった魚種ランキング</h2>${segBtns('hrank', RANK, hm.rank, '並べ方')}</div>${rankBars(rankSpecies(me, hm.rank), hm.rank)}</div>
<div class="card"><div class="ch"><h2>フレンドランキング</h2>${segBtns('fperiod', { month: '月間', year: '年間' }, hm.fperiod, '期間')}</div>
${!Store.user ? `<p class="empty">${Store.mode === 'cloud' ? 'ログインすると、フレンドとの手取りランキングが出ます。' : 'ログイン機能の設定後に使えます。'}</p>` :
 `<p class="note" style="margin-top:0">${hm.fperiod === 'month' ? `${+mon.slice(5)}月` : `${yr}年`}の手取り。あなたをフレンドに追加している人が並びます。</p><ol class="rank">${fr.map((p, i) => `<li class="${p.uid === 'me' ? 'me' : ''}"><span class="no">${i + 1}</span><span class="nm2">${esc(p.name)}${p.uid === 'me' ? ' <small>あなた</small>' : ''}</span><span class="n">${yen(p.net)}円</span><div class="t"><i style="width:${Math.max(0, p.net) / fmx * 100}%;background:${p.uid === 'me' ? 'var(--am)' : 'var(--pm)'}"></i></div><small class="sub2">${p.n}回・${p.kg.toFixed(1)}kg</small></li>`).join('')}</ol>${Store.sharers.length ? '' : '<p class="note">右上のアカウントからフレンドを追加し、相手にもあなたを追加してもらうと並びます。</p>'}`}</div>
<div class="card"><h2>最近の漁</h2>${recent.length ? `<div class="trips" style="margin-top:0">${recent.map(t => `<button class="recent" data-goto-own="${esc(t.id)}"><span class="tm">${md(t.date)} ${esc(t.time)}</span><span class="pl">${esc(t.place?.name || '')}</span><span class="tt">${yen(tripNet(t))}円</span></button>`).join('')}</div>` : '<p class="empty">「漁獲高記録」から最初の漁を記録しましょう。</p>'}</div>
</div></section>`;
};

/* ───────── フレンド ───────── */
const friendBox = () => Store.user ? `<div class="card" id="fbox"><div class="ch"><h2>フレンドを追加</h2></div>
<p class="note" style="margin-top:0">あなたのID: <b>${esc(FB.idOf(Store.user))}</b>。追加した人は、あなたの記録を見られます。相手もあなたを追加すると、ここに相手の記録が出ます。</p>
<div class="placeRow"><input id="fid2" placeholder="相手のID" autocapitalize="none" autocomplete="off" spellcheck="false" aria-label="追加するフレンドのID"><button class="sec" id="addFriend2">追加</button></div>
<p class="err" id="ferr2"></p><div class="flist" id="flist2"></div></div>` : '';
const renderFriend = () => {
  const f = L.fr;
  if (!Store.user || !Store.sharers.length) {
    head('フレンドの漁獲高', '', '—', '');
    kv([['—', 'フレンド'], ['—', '漁の回数'], ['—', '総重量'], ['—', '手取り']]);
    $('main').innerHTML = `<section class="band"><div class="wrap"><p class="empty">${!Store.user ? (Store.mode === 'cloud' ? 'ログインすると、フレンドの漁獲高を見られます。' : 'ログイン機能の設定後に使えます。') : 'まだ記録を見られるフレンドがいません。下で相手のIDを追加し、相手にもあなたのIDを追加してもらってください。'}</p>${friendBox()}</div></section>`;
    fillFriends('flist2');
    return;
  }
  if (!Store.sharers.some(x => x.uid === f.who)) f.who = Store.sharers[0].uid;
  const trips = Store.friendsTrips[f.who] || [], s = sumOf(trips);
  $('main').innerHTML = `<section class="band"><div class="wrap">
<div class="who"><label class="c" for="who">フレンド</label><select id="who">${Store.sharers.map(x => `<option value="${esc(x.uid)}"${f.who === x.uid ? ' selected' : ''}>${esc(x.name || x.id)}</option>`).join('')}</select></div>
<div class="card"><div class="ch"><h2>今までとった魚種ランキング</h2>${segBtns('frank', RANK, f.rank, '並べ方')}</div>${rankBars(rankSpecies(trips, f.rank), f.rank, 'var(--pm)')}</div>
<h2 style="margin-top:22px">過去の漁獲高</h2>
<div class="seg" role="group" aria-label="表示方法"><button data-sub="cal" aria-pressed="${f.sub === 'cal'}">カレンダー</button><button data-sub="map" aria-pressed="${f.sub === 'map'}">地図</button></div>
<div id="hbody"></div><div style="margin-top:22px">${friendBox()}</div></div></section>`;
  f.sub === 'map' ? renderMap() : renderCal();
  fillFriends('flist2');
};

/* ───────── アカウント ───────── */
const dlg = $('dlg');
const openAcct = (msg = '') => {
  if (Store.mode !== 'cloud') {
    dlg.innerHTML = `<div class="dl"><h2>アカウント</h2><p>このアプリはまだログイン機能の設定前です。記録はこの端末にだけ保存されます。</p><div class="acts"><button data-close>閉じる</button></div></div>`;
  } else if (!Store.user) {
    dlg.innerHTML = `<form class="dl" id="loginForm"><h2>ログイン</h2><p class="note">大野水産から受け取ったIDとパスワードを入れてください。</p>
<label class="c" for="lid">ID</label><input id="lid" autocomplete="username" autocapitalize="none" spellcheck="false" required>
<label class="c" for="lpw" style="margin-top:10px">パスワード</label><input id="lpw" type="password" autocomplete="current-password" required>
<p class="err" id="lerr">${esc(msg)}</p><div class="acts"><button type="button" data-close>閉じる</button><button class="pri" type="submit">ログイン</button></div></form>`;
  } else {
    const p = Store.profile || {}, local = Store.readLocal().length;
    dlg.innerHTML = `<div class="dl"><h2>アカウント</h2>
<p class="note" style="margin-top:0">ID: <b>${esc(FB.idOf(Store.user))}</b>（フレンドにはこのIDを伝えてください）</p>
<label class="c" for="pname">表示名</label><div class="placeRow"><input id="pname" value="${esc(p.name || '')}" maxlength="20"><button id="saveName">変更</button></div>
<h3 style="margin-top:18px">フレンド</h3><p class="note" style="margin-top:0">追加した人は、あなたの漁の記録を見られます。相手もあなたを追加すると、相手の記録を「過去の漁獲高」で見られます。</p>
<div class="flist" id="flist">${(p.friends || []).length ? '<p class="note">読み込み中…</p>' : '<p class="note">まだいません</p>'}</div>
<div class="placeRow"><input id="fid" placeholder="相手のID" autocapitalize="none" spellcheck="false" aria-label="追加するフレンドのID"><button class="sec" id="addFriend">追加</button></div>
<p class="err" id="ferr">${esc(msg)}</p>
${local ? `<div class="box"><p style="margin:0 0 8px">この端末にログイン前の記録が ${local}件 あります。</p><button id="migrate">アカウントに移す</button></div>` : ''}
<details style="margin-top:12px"><summary>パスワードを変える</summary><div class="placeRow"><input id="npw" type="password" autocomplete="new-password" placeholder="新しいパスワード（6文字以上）" aria-label="新しいパスワード"><button id="setPw">変更</button></div></details>
${FB.isAdmin() ? `<details class="box" id="issue" style="margin-top:12px"${msg === '__issue' ? ' open' : ''}><summary><b>アカウントを発行する（管理者）</b></summary>
<p class="note">友人に渡すIDとパスワードを決めて発行します。メールアドレスは使いません。</p>
<label class="c" for="nid">ID（半角英小文字・数字）</label><input id="nid" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="例: tanaka" maxlength="30">
<label class="c" for="nname" style="margin-top:8px">表示名（あとで本人が変えられます）</label><input id="nname" maxlength="20" placeholder="例: 田中">
<label class="c" for="npw2" style="margin-top:8px">初期パスワード（6文字以上）</label><div class="placeRow"><input id="npw2" autocomplete="off" autocapitalize="none" spellcheck="false"><button type="button" id="genPw">自動で作る</button></div>
<label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="nmutual" checked style="width:auto">お互いにフレンドにする</label>
<p class="err" id="ierr"></p><button class="pri" id="issueBtn" style="width:100%">発行する</button><div id="issued"></div></details>` : ''}
<div class="acts"><button id="logout">ログアウト</button><button class="pri" data-close>閉じる</button></div></div>`;
    fillFriends();
  }
  if (!dlg.open) dlg.showModal();
};
const fillFriends = async (elId = 'flist') => {
  const el = $(elId), ids = Store.profile?.friends || []; if (!el) return;
  if (!ids.length) { if (elId !== 'flist') el.innerHTML = ''; return; }
  const ps = await Promise.all(ids.map(u => FB.profileOf(u).catch(() => null)));
  el.innerHTML = ids.map((u, i) => `<div><span>${esc(ps[i]?.name || '不明')} <small class="note">ID: ${esc(ps[i]?.id || '')}</small>${Store.sharers.some(s => s.uid === u) ? ' <span class="pill ok">お互い</span>' : ' <span class="pill">相手の追加待ち</span>'}</span><button data-unfriend="${esc(u)}" aria-label="${esc(ps[i]?.name || '')}をフレンドから外す">外す</button></div>`).join('');
};
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('submit', async e => {
  e.preventDefault();
  try { await FB.login($('lid').value, $('lpw').value); dlg.close(); toast('ログインしました'); }
  catch (err) { $('lerr').textContent = /invalid|wrong|not-found|credential/.test(err.code || '') ? 'IDかパスワードが違います' : 'ログインできませんでした（' + (err.code || err.message) + '）'; }
});

/* ───────── 描画 ───────── */
const VIEWS = { calc: [renderCalc, calcCalc], mk: [renderMk, calcMk], home: [renderHome, () => {}], hist: [renderHist, () => {}], friend: [renderFriend, () => {}] };
const calc = () => { VIEWS[L.view][1](); saveL(); };
const render = (soft) => {
  if (soft && (L.view === 'calc' || (L.view === 'mk' && L.mk.sub === 'sim'))) { VIEWS[L.view][1](); updAcct(); return; } // 入力中の再描画を避ける
  if (!VIEWS[L.view]) L.view = 'home';
  if (L.view !== 'calc' && pmap) { pmap.remove(); pmap = null; pmark = null; }
  if (L.view !== 'hist' && hmap) { hmap.remove(); hmap = null; }
  VIEWS[L.view][0]();
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === L.view));
  $('scn').hidden = !(L.view === 'mk' && L.mk.sub === 'sim');
  document.querySelectorAll('[data-m]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.m === L.sim.m));
  updAcct(); calc();
};
const updAcct = () => {
  let nm = Store.profile?.name;
  if (Store.user) { const k = 'gyokaku-name-' + Store.user.uid; try { if (nm) localStorage.setItem(k, nm); else nm = localStorage.getItem(k); } catch (e) {} }
  $('acctBtn').textContent = Store.user ? (nm || FB.idOf(Store.user)) : (Store.mode === 'cloud' ? 'ログイン' : 'この端末に保存'); };

/* ───────── 操作 ───────── */
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.search != null) { renderHits(t.dataset.search, t.value); return; }
  if (t.dataset.mksearch != null) { mkHits(t.value); return; }
  if (t.dataset.g) { L[t.dataset.g] = t.value; calc(); return; }
  if (t.dataset.s) { L.sim[t.dataset.s] = t.value; calc(); return; }
  if (t.dataset.d) {
    const d = L.draft, k = t.dataset.d;
    if (k === 'place') { d.place.name = t.value; const p = places().find(x => x.name === t.value); if (p) setPlace(p.lat, p.lng, 13); }
    else d[k] = t.value;
    saveL(); return;
  }
  if (t.dataset.f) { const r = rowsOf(t.dataset.key)[+t.dataset.i]; r[t.dataset.f] = t.value; if (t.dataset.f === 'per' && t.value !== '') L.per[r.sp] = num(t.value); calc(); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'tfOn') { L.draft.tfOn = t.checked; calc(); }
  else if (t.id === 'photoIn') {
    const files = [...t.files]; if (!files.length) return; toast('写真を取り込んでいます…');
    for (const f of files) { try { const data = await Photos.compress(f), id = uid(); await Photos.put(id, data); (L.draft.photos = L.draft.photos || []).push(id); } catch (err) { toast('読み込めない写真がありました'); } }
    saveL(); render(); toast(`写真を${files.length}枚追加しました`);
  }
  else if (t.id === 'd-time') render();
  else if (t.id === 'mkfrom' || t.id === 'mkto') { const r = trendRange(); L.mk.from = t.id === 'mkfrom' ? t.value : r[0]; L.mk.to = t.id === 'mkto' ? t.value : r[1]; if (L.mk.from > L.mk.to) [L.mk.from, L.mk.to] = [L.mk.to, L.mk.from]; L.mk.quick = ''; saveL(); drawTrend(); const a = $('mkfrom'), b = $('mkto'); if (a) a.value = L.mk.from; if (b) b.value = L.mk.to; document.querySelectorAll('[data-quick]').forEach(x => x.setAttribute('aria-pressed', 'false')); }
  else if (t.id === 'who') {
    L.fr.who = t.value; L.fr.open = null; saveL();
    if (t.value !== 'me' && !Store.friendsTrips[t.value]) { try { await FB.loadFriendTrips(t.value); } catch (err) { toast('記録を読み込めませんでした'); } }
    render();
  }
});
document.addEventListener('keydown', e => { const t = e.target; if (e.key === 'Enter' && t.dataset.search != null) { const b = $('h-' + t.dataset.search)?.querySelector('button'); if (b) { e.preventDefault(); b.click(); } } });
document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  const ds = t.dataset;
  if (ds.view) { L.view = ds.view; render(); window.scrollTo(0, 0); }
  else if (ds.m) { L.sim.m = +ds.m; render(); }
  else if (ds.mode) { L.mode = ds.mode; render(); }
  else if (ds.addsp != null) {
    const key = ds.key; rowsOf(key).push({ sp: ds.addsp, kg: '', n: '', per: '', price: '' }); render();
    const i = rowsOf(key).length - 1; document.querySelector(`[data-key="${key}"][data-i="${i}"][data-f]`)?.focus();
  }
  else if (ds.del) { rowsOf(ds.del).splice(+ds.i, 1); render(); }
  else if (t.id === 'here') {
    if (!navigator.geolocation) { toast('この端末では現在地を使えません'); return; }
    t.disabled = true; t.textContent = '取得中…';
    navigator.geolocation.getCurrentPosition(p => { setPlace(p.coords.latitude, p.coords.longitude, 14); t.disabled = false; t.textContent = '現在地'; },
      () => { toast('現在地を取得できませんでした。設定で位置情報を許可してください'); t.disabled = false; t.textContent = '現在地'; }, { enableHighAccuracy: true, timeout: 15000 });
  }
  else if (t.id === 'saveTrip') saveTrip();
  else if (t.id === 'clearDraft') { if (ds.ok !== '1') { ds.ok = '1'; t.textContent = 'もう一度押すとクリア'; setTimeout(() => { ds.ok = ''; t.textContent = '入力をクリア'; }, 3000); return; } L.draft = newDraft(); render(); }
  else if (t.id === 'cancelEdit') { L.draft = newDraft(); render(); }
  else if (ds.sub) { H().sub = ds.sub; render(); }
  else if (ds.period) { H().period = ds.period; render(); }
  else if (ds.mon) { const [y, m] = H().month.split('-').map(Number), d = new Date(y, m - 1 + +ds.mon, 1); H().month = ymd(d).slice(0, 7); H().day = ymd(d); H().open = null; render(); }
  else if (ds.day) { H().day = ds.day; H().open = null; render(); }
  else if (ds.open) { H().open = H().open === ds.open ? null : ds.open; render(); document.getElementById('trip-' + ds.open)?.scrollIntoView({ block: 'nearest' }); }
  else if (ds.edit) { const tr = Store.trips.find(x => x.id === ds.edit); if (tr) { L.draft = Object.assign(newDraft(), clone(tr), { entries: clone(tr.entries).map(r => ({ ...r, price: r.price ?? '' })), photos: (tr.photos || []).slice() }); L.mode = tr.mode || L.mode; L.view = 'calc'; render(); window.scrollTo(0, 0); } }
  else if (ds.deltrip) {
    if (ds.ok !== '1') { ds.ok = '1'; t.textContent = 'もう一度押すと削除'; setTimeout(() => { ds.ok = ''; t.textContent = '削除'; }, 3000); return; }
    try { await Store.remove(ds.deltrip); H().open = null; toast('削除しました'); render(); } catch (err) { toast('削除できませんでした'); }
  }
  else if (ds.showmap) { H().sub = 'map'; H().focus = ds.showmap; H().period = 'all'; render(); }
  else if (ds.goto) { const tr = curTrips().find(x => x.id === ds.goto); if (tr) { H().sub = 'cal'; H().month = tr.date.slice(0, 7); H().day = tr.date; H().open = tr.id; render(); } }
  else if (ds.viewPhoto) { const d = await Photos.get(ds.viewPhoto, ds.owner || null); if (!d) return; dlg.innerHTML = `<div class="dl photo"><img src="${d}" alt="漁の写真"><div class="acts"><button class="pri" data-close>閉じる</button></div></div>`; if (!dlg.open) dlg.showModal(); }
  else if (ds.delPhoto) {
    const id = ds.delPhoto, saved = Store.trips.some(x => (x.photos || []).includes(id));
    L.draft.photos = (L.draft.photos || []).filter(x => x !== id); if (!saved) Photos.del(id); saveL(); render();
  }
  else if (ds.mksub) { L.mk.sub = ds.mksub; render(); }
  else if (ds.mkfilter) { L.mk.filter = ds.mkfilter; render(); }
  else if (ds.mksort) { L.mk.sort = ds.mksort; render(); }
  else if (ds.mksp) { L.mk.sp = ds.mksp; L.mk.sub = 'trend'; render(); window.scrollTo(0, 0); }
  else if (ds.quick) { L.mk.quick = ds.quick; L.mk.to = ''; L.mk.from = ''; render(); }
  else if (ds.hrank) { L.home.rank = ds.hrank; render(); }
  else if (ds.fperiod) { L.home.fperiod = ds.fperiod; render(); }
  else if (ds.frank) { L.fr.rank = ds.frank; render(); }
  else if (ds.gotoOwn) { const tr = Store.trips.find(x => x.id === ds.gotoOwn); if (tr) { L.view = 'hist'; L.hist.sub = 'cal'; L.hist.month = tr.date.slice(0, 7); L.hist.day = tr.date; L.hist.open = tr.id; render(); window.scrollTo(0, 0); } }
  else if (t.id === 'acctBtn') openAcct();
  else if (ds.close != null) dlg.close();
  else if (t.id === 'logout') { await FB.logout(); dlg.close(); toast('ログアウトしました'); }
  else if (t.id === 'saveName') { try { const nm = $('pname').value.trim() || FB.idOf(Store.user); await FB.setName(nm); if (Store.profile) Store.profile.name = nm; updAcct(); toast('表示名を変えました'); } catch (err) { $('ferr').textContent = '変更できませんでした'; } }
  else if (t.id === 'addFriend') { try { await FB.addFriend($('fid').value); toast('フレンドに追加しました'); openAcct(); } catch (err) { $('ferr').textContent = err.message; } }
  else if (ds.unfriend) { try { await FB.removeFriend(ds.unfriend); if (dlg.open) openAcct(); else toast('フレンドから外しました'); } catch (err) { toast('外せませんでした'); } }
  else if (t.id === 'genPw') { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; $('npw2').value = Array.from(crypto.getRandomValues(new Uint32Array(8)), v => c[v % c.length]).join(''); }
  else if (t.id === 'issueBtn') {
    const id = $('nid').value.trim().toLowerCase(), pw = $('npw2').value, nm = $('nname').value.trim();
    t.disabled = true; $('ierr').textContent = '';
    try {
      await FB.createAccount(id, pw, nm, $('nmutual').checked);
      const text = `大野水産 漁獲帳\nhttps://upu07.github.io/gyokaku/\nID: ${id}\nパスワード: ${pw}`;
      $('issued').innerHTML = `<div class="box" style="margin-top:10px"><p style="margin:0 0 6px"><b>発行しました。</b>この内容を本人に伝えてください。</p><pre style="white-space:pre-wrap;margin:0 0 8px">${esc(text)}</pre><button type="button" id="copyIssued">コピー</button></div>`;
      $('copyIssued').onclick = () => navigator.clipboard?.writeText(text).then(() => toast('コピーしました'), () => {});
      $('nid').value = $('nname').value = $('npw2').value = ''; toast('アカウントを発行しました');
      if ($('nmutual').checked) fillFriends();
    } catch (err) { $('ierr').textContent = err.message; }
    t.disabled = false;
  }
  else if (t.id === 'addFriend2') { try { await FB.addFriend($('fid2').value); toast('フレンドに追加しました'); $('fid2').value = ''; setTimeout(() => fillFriends('flist2'), 300); } catch (err) { $('ferr2').textContent = err.message; } }
  else if (t.id === 'setPw') { try { await FB.changePassword($('npw').value); toast('パスワードを変えました'); openAcct(); } catch (err) { $('ferr').textContent = err.code === 'auth/requires-recent-login' ? '一度ログアウトしてログインし直してから変えてください' : '変えられませんでした（6文字以上にしてください）'; } }
  else if (t.id === 'migrate') {
    t.disabled = true; const a = Store.readLocal();
    try { for (const tr of a) await FB.saveTrip(tr); Store.writeLocal([]); toast(`${a.length}件をアカウントに移しました`); openAcct(); } catch (err) { $('ferr').textContent = '移せませんでした'; t.disabled = false; }
  }
});

/* ───────── 起動 ───────── */
buildSP(); render();
// 相場の読み込み後は、入力中なら数値だけ更新して入力を消さない
fetch('data/market.json', { cache: 'no-cache' }).then(r => r.json()).then(d => { MK = d; buildSP(); render(['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)); }).catch(() => toast('相場を読み込めませんでした'));
Store.init().then(() => render());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
// iPhoneでキーボードやダイアログを閉じたあと、下のタブが浮いたままになるのを戻す
const fixVP = () => setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 60);
document.addEventListener('focusout', fixVP); dlg.addEventListener('close', fixVP);
window.visualViewport?.addEventListener('resize', fixVP);
})();
