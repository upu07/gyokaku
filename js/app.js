/* 大野水産 漁獲帳
   ① 漁獲高計算: 1回の漁を、日時・場所つきで記録して手取りを出す
   ② 売上予測: 何日・1日2回潜った場合の売上目安
   ③ 過去の漁獲高: カレンダー／地図で振り返る（フレンドの記録も）
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
    return { n: s.n, j: s.j || '', g: s.g, p: Math.round(kg7 ? a / kg7 : 0), kg7, asof: last, recent, per: s.per || 0 };
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
const newDraft = (keep = {}) => ({ id: null, date: keep.date || today(), time: nowHM(), place: { name: '', lat: null, lng: null }, entries: [], tfOn: true, memo: '' });
const DEF = {
  mode: 'kg', view: 'calc', fee: 0, tf: 0, per: {},
  sim: { days: 4, m: 1, tfn: 1, cost: 0,
    am: [mk('クルバニ', 1, 1.5), mk('ハヤー', 3, 0.8), mk('ビタロー', 3, 0.6), mk('ユダヤー', 1, 0.8), mk('オーバチャー', 2, 1.5), mk('長尾ミーバイ', 1, 1.0)],
    pm: [mk('オーバチャー', 4, 1.5), mk('ハヤー', 2, 0.8), mk('長尾ミーバイ', 1, 1.0), mk('アーガイ', 1, 1.0)] },
  draft: newDraft(), hist: { sub: 'cal', month: today().slice(0, 7), day: today(), open: null, who: 'me', period: 'all' }
};
let L; try { L = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
if (!L || !L.sim || !L.draft) L = clone(DEF);
L.hist = Object.assign(clone(DEF.hist), L.hist || {});
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
    t.updatedAt = Date.now(); if (!t.id) { t.id = uid(); t.createdAt = t.updatedAt; }
    if (this.user) return FB.saveTrip(t);
    const a = this.readLocal().filter(x => x.id !== t.id); a.push(t); this.writeLocal(a); this.trips = a;
  },
  async remove(id) {
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
    this.a = a; this.f = f;
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
    if (L.hist.who !== 'me') L.hist.who = 'me';
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
    }, e => console.warn(e)));
  },
  async login(id, pw) { await this.a.signInWithEmailAndPassword(this.auth, `${id.trim().toLowerCase()}@${window.ACCOUNT_DOMAIN}`, pw); },
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
  async loadFriendTrips(fuid) {
    const { collection, getDocs } = this.f;
    const s = await getDocs(collection(this.db, 'users', fuid, 'trips'));
    Store.friendsTrips[fuid] = s.docs.map(d => d.data());
  }
};

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

/* ───────── ① 漁獲高計算 ───────── */
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
<div style="margin-top:14px"><label class="c" for="memo">メモ</label><textarea id="memo" data-d="memo" placeholder="潮・水温・透明度など">${esc(d.memo)}</textarea></div>
<div class="acts"><button class="pri" id="saveTrip">${editing ? '変更を保存' : 'この漁を記録する'}</button>${editing ? '' : '<button id="clearDraft">入力をクリア</button>'}</div>
<p class="note" id="saveNote">${Store.user ? 'アカウントに保存します。フレンドに追加した人も見られます。' : (Store.mode === 'cloud' ? 'ログインしていないため、この端末にだけ保存します。' : 'この端末に保存します。')}</p>
</div></section>`;
  initPlaceMap();
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
  const t = { id: d.id || null, date: d.date || today(), time: d.time || '', place: clone(d.place), mode: L.mode, fee: num(L.fee), tf: num(L.tf), tfOn: !!d.tfOn, memo: d.memo || '',
    entries: entries.map(r => ({ sp: r.sp, kg: r.kg, n: r.n, per: r.per === '' || r.per == null ? perOf(r) : num(r.per), price: r.price, mp: mprice(r.sp) || r.mp || 0 })) };
  if (d.createdAt) t.createdAt = d.createdAt;
  const b = $('saveTrip'); b.disabled = true;
  try {
    await Store.save(t);
    toast(d.id ? '変更を保存しました' : '記録しました。「過去の漁獲高」で見られます');
    L.draft = newDraft({ date: t.date }); L.hist.month = t.date.slice(0, 7); L.hist.day = t.date; L.hist.open = t.id; L.hist.who = 'me';
    saveL(); render();
  } catch (e) { console.error(e); toast('保存できませんでした: ' + (e.message || e)); b.disabled = false; }
};

/* ───────── ② 売上予測 ───────── */
let mq = '';
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
<section class="band" style="padding-top:0"><div class="wrap"><details id="mkd"${mq ? ' open' : ''}><summary>相場一覧（${SP.length}魚種・${latest ? md(latest) + '時点' : '読み込み中'}）</summary>
<div class="adder" style="margin-top:4px;max-width:520px"><input type="search" id="mq" placeholder="島名・和名で絞り込み" aria-label="相場を絞り込み" value="${esc(mq)}" autocomplete="off"></div>
<div class="tbl" style="margin-top:10px"><table><thead><tr><th>魚種（島名／和名）</th><th class="r">予想単価</th><th class="r">7日間の水揚量</th><th>時点</th></tr></thead><tbody id="mkb"></tbody></table></div>
<p class="note">一度でも市場に出た魚種は一覧に残します。和名は島名から当てはめた目安で、わからない魚種は空欄です。相場は毎日昼と夕方に自動で更新します。</p></details></div></section>`;
  fillMk();
};
const fillMk = () => {
  const b = $('mkb'); if (!b) return; const k = kana(mq);
  const list = SP.filter(s => !k || kana(s.n).includes(k) || kana(s.j).includes(k)).sort((a, b) => b.recent - a.recent || b.p - a.p);
  b.innerHTML = list.map(s => `<tr><td><b>${esc(s.n)}</b>${s.j ? `<br><small style="color:var(--sub)">${esc(s.j)}</small>` : ''}</td><td class="r"><b>${yen(s.p)}</b> 円/kg</td><td class="r">${s.kg7 ? s.kg7.toFixed(1) + ' kg' : '—'}</td><td>${s.recent ? '<span class="pill ok">今週</span>' : `<span class="pill old">${md(s.asof)}まで</span>`}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">該当する魚種がありません</td></tr>';
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
const H = () => L.hist;
const whoName = w => w === 'me' ? '自分' : (Store.sharers.find(s => s.uid === w)?.name || 'フレンド');
const curTrips = () => Store.tripsOf(H().who).slice().sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1);
const whoSel = () => !Store.user ? '' : `<div class="who"><label class="c" for="who">誰の記録を見るか</label><select id="who">${[['me', '自分']].concat(Store.sharers.map(s => [s.uid, s.name || s.id])).map(([v, n]) => `<option value="${esc(v)}"${H().who === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>${Store.sharers.length ? '' : '<p class="note" style="margin:4px 0 0">フレンドがあなたを追加すると、その人の記録をここで選べます。</p>'}</div>`;
const renderHist = () => {
  const h = H();
  $('main').innerHTML = `<section class="band"><div class="wrap">${whoSel()}
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
  $('hbody').innerHTML = `<div class="mnav"><button data-mon="-1" aria-label="前の月">‹ 前月</button><b>${y}年${m}月</b><button data-mon="1" aria-label="次の月">次月 ›</button></div>
<div class="cal">${WD.map(w => `<div class="dw">${w}</div>`).join('')}${cells}</div>
<h2 style="margin-top:20px">${md(h.day)}（${WD[new Date(h.day + 'T00:00').getDay()]}）の漁</h2>
<div class="trips">${dayTrips.length ? dayTrips.map(t => tripCard(t, mine)).join('') : `<p class="empty">この日の記録はありません。${mine ? '「漁獲高計算」から記録できます。' : ''}</p>`}</div>`;
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
<div class="acts"><button id="logout">ログアウト</button><button class="pri" data-close>閉じる</button></div></div>`;
    fillFriends();
  }
  if (!dlg.open) dlg.showModal();
};
const fillFriends = async () => {
  const el = $('flist'), ids = Store.profile?.friends || []; if (!el || !ids.length) return;
  const ps = await Promise.all(ids.map(u => FB.profileOf(u).catch(() => null)));
  el.innerHTML = ids.map((u, i) => `<div><span>${esc(ps[i]?.name || '不明')} <small class="note">ID: ${esc(ps[i]?.id || '')}</small>${Store.sharers.some(s => s.uid === u) ? ' <span class="pill ok">お互い</span>' : ''}</span><button data-unfriend="${esc(u)}" aria-label="${esc(ps[i]?.name || '')}をフレンドから外す">外す</button></div>`).join('');
};
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('submit', async e => {
  e.preventDefault();
  try { await FB.login($('lid').value, $('lpw').value); dlg.close(); toast('ログインしました'); }
  catch (err) { $('lerr').textContent = /invalid|wrong|not-found|credential/.test(err.code || '') ? 'IDかパスワードが違います' : 'ログインできませんでした（' + (err.code || err.message) + '）'; }
});

/* ───────── 描画 ───────── */
const VIEWS = { calc: [renderCalc, calcCalc], sim: [renderSim, calcSim], hist: [renderHist, () => {}] };
const calc = () => { VIEWS[L.view][1](); saveL(); };
const render = (soft) => {
  if (soft && L.view === 'calc') { calcCalc(); updAcct(); return; } // 入力中の再描画を避ける
  if (!VIEWS[L.view]) L.view = 'calc';
  if (L.view !== 'calc' && pmap) { pmap.remove(); pmap = null; pmark = null; }
  if (L.view !== 'hist' && hmap) { hmap.remove(); hmap = null; }
  VIEWS[L.view][0]();
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === L.view));
  $('scn').hidden = L.view !== 'sim';
  document.querySelectorAll('[data-m]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.m === L.sim.m));
  updAcct(); calc();
};
const updAcct = () => { $('acctBtn').textContent = Store.user ? (Store.profile?.name || FB.idOf(Store.user)) : (Store.mode === 'cloud' ? 'ログイン' : 'この端末に保存'); };

/* ───────── 操作 ───────── */
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.search != null) { renderHits(t.dataset.search, t.value); return; }
  if (t.id === 'mq') { mq = t.value; fillMk(); return; }
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
  else if (t.id === 'd-time') render();
  else if (t.id === 'who') {
    H().who = t.value; H().open = null; saveL();
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
  else if (ds.edit) { const tr = Store.trips.find(x => x.id === ds.edit); if (tr) { L.draft = Object.assign(newDraft(), clone(tr), { entries: clone(tr.entries).map(r => ({ ...r, price: r.price ?? '' })) }); L.mode = tr.mode || L.mode; L.view = 'calc'; render(); window.scrollTo(0, 0); } }
  else if (ds.deltrip) {
    if (ds.ok !== '1') { ds.ok = '1'; t.textContent = 'もう一度押すと削除'; setTimeout(() => { ds.ok = ''; t.textContent = '削除'; }, 3000); return; }
    try { await Store.remove(ds.deltrip); H().open = null; toast('削除しました'); render(); } catch (err) { toast('削除できませんでした'); }
  }
  else if (ds.showmap) { H().sub = 'map'; H().focus = ds.showmap; H().period = 'all'; render(); }
  else if (ds.goto) { const tr = curTrips().find(x => x.id === ds.goto); if (tr) { H().sub = 'cal'; H().month = tr.date.slice(0, 7); H().day = tr.date; H().open = tr.id; render(); } }
  else if (t.id === 'acctBtn') openAcct();
  else if (ds.close != null) dlg.close();
  else if (t.id === 'logout') { await FB.logout(); dlg.close(); toast('ログアウトしました'); }
  else if (t.id === 'saveName') { try { await FB.setName($('pname').value.trim() || FB.idOf(Store.user)); toast('表示名を変えました'); } catch (err) { $('ferr').textContent = '変更できませんでした'; } }
  else if (t.id === 'addFriend') { try { await FB.addFriend($('fid').value); toast('フレンドに追加しました'); openAcct(); } catch (err) { $('ferr').textContent = err.message; } }
  else if (ds.unfriend) { try { await FB.removeFriend(ds.unfriend); openAcct(); } catch (err) { $('ferr').textContent = '外せませんでした'; } }
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
})();
