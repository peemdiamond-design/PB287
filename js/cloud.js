/* PB287 — Firebase layer (Auth + Firestore)
 * ตั้งค่า window.Cloud ให้ js/app.js เรียกใช้ และส่งข้อมูล real-time กลับผ่าน App.setData()
 * ความปลอดภัยจริงอยู่ที่ firestore.rules — Firebase Web config ด้านล่างไม่ใช่ความลับ
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
    doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAaqQ77vaYMeTMecseqEIu2O-wWUOBMz9A",
    authDomain: "pb287-4fc76.firebaseapp.com",
    projectId: "pb287-4fc76",
    storageBucket: "pb287-4fc76.firebasestorage.app",
    messagingSenderId: "728935756079",
    appId: "1:728935756079:web:6d49083763e576203271da"
};
const APP_ID = 'pb287_portal';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// เก็บข้อมูลไว้ในเครื่อง (IndexedDB): เปิดดูประกาศ/ศูนย์พักพิงตอนออฟไลน์ได้ และคิวคำขอ SOS ไว้ส่งเมื่อมีสัญญาณ
let db;
try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { console.warn('Offline cache unavailable:', e); db = getFirestore(app); }

const App = window.App;
const esc = window.escapeHtml;
const P = ['artifacts', APP_ID, 'public', 'data'];
const col = (name) => collection(db, ...P, name);
const KINDS = ['alerts', 'obstacles', 'sos', 'shelters', 'checkins', 'disease'];

// เขียนข้อมูล: ถ้าเซิร์ฟเวอร์ไม่ตอบใน 8 วินาที (ออฟไลน์) ถือว่าเข้าคิวแล้ว — Firestore จะส่งให้เองเมื่อกลับมาออนไลน์
const write = (promise, extra = {}) => Promise.race([
    promise.then(() => ({ ok: true, ...extra })),
    new Promise(res => setTimeout(() => res({ queued: true, ...extra }), 8000))
]);
const requireUser = () => {
    if (!auth.currentUser) throw new Error('ยังเชื่อมต่อระบบไม่ได้ (Anonymous sign-in อาจยังไม่ได้เปิดใน Firebase)');
    return auth.currentUser.uid;
};
const create = (name, data) => { const ref = doc(col(name)); return write(setDoc(ref, data), { id: ref.id }); };

// ===================== Public API for app.js =====================
window.Cloud = {
    addObstacle: (lat, lng) => create('obstacles', { lat, lng, uid: requireUser(), timestamp: Date.now() }),
    addSos: ({ lat, lng, level, people, phone }) => {
        const now = Date.now();
        return create('sos', { lat, lng, level, people: Number.isInteger(people) ? people : 0, phone: phone || '', status: 'new', uid: requireUser(), timestamp: now, updatedAt: now });
    },
    setSosStatus: (id, status) => write(updateDoc(doc(db, ...P, 'sos', id), { status, updatedAt: Date.now() })),
    saveShelter: (data, id) => {
        const payload = { ...data, updatedAt: Date.now() };
        return id ? write(updateDoc(doc(db, ...P, 'shelters', id), payload)) : create('shelters', payload);
    },
    addDiseaseReport: (r) => create('disease', { ...r, uid: requireUser(), timestamp: Date.now() }),
    addCheckin: ({ name, area, message }) => {
        const nameLower = name.toLowerCase();
        const words = [...new Set(nameLower.split(' ').filter(Boolean))].slice(0, 10);
        return create('checkins', { name, nameLower, words, area: area || '', message: message || '', uid: requireUser(), timestamp: Date.now() });
    },
    deleteCheckin: (id) => write(deleteDoc(doc(db, ...P, 'checkins', id))),
    searchCheckins: async (q) => {
        const lower = q.toLowerCase();
        const first = lower.split(' ')[0];
        const [byPrefix, byWord] = await Promise.all([
            getDocs(query(col('checkins'), where('nameLower', '>=', lower), where('nameLower', '<=', lower + ''), orderBy('nameLower'), limit(20))),
            getDocs(query(col('checkins'), where('words', 'array-contains', first), limit(20)))
        ]);
        const map = new Map();
        [...byPrefix.docs, ...byWord.docs].forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
        return [...map.values()].filter(c => c.nameLower.includes(lower)).sort((a, b) => b.timestamp - a.timestamp);
    },
    addAlert: (text, severity) => create('alerts', { text, severity, timestamp: Date.now() }),
    remove: (kind, id) => {
        if (!KINDS.includes(kind)) throw new Error('unknown kind');
        return write(deleteDoc(doc(db, ...P, kind, id)));
    }
};

// ===================== Auth UI =====================
let currentAuthMode = 'login';
let isAdmin = false;

window.openAdminLogin = () => { document.getElementById('adminLoginModal').classList.remove('hidden'); switchAuthTab('login'); };
window.closeAdminLogin = () => {
    document.getElementById('adminLoginModal').classList.add('hidden');
    document.getElementById('adminLoginError').classList.add('hidden');
};
window.switchAuthTab = (mode) => {
    currentAuthMode = mode;
    const on = "flex-1 pb-2 border-b-2 border-moph-primary font-bold text-moph-primary transition";
    const off = "flex-1 pb-2 border-b-2 border-transparent font-bold text-gray-400 hover:text-gray-600 transition";
    document.getElementById('tabLogin').className = mode === 'login' ? on : off;
    document.getElementById('tabReg').className = mode === 'login' ? off : on;
    document.getElementById('regCodeDiv').classList.toggle('hidden', mode === 'login');
    document.getElementById('btnSubmitAuth').innerText = mode === 'login' ? "เข้าสู่ระบบ (Login)" : "สร้างบัญชีใหม่ (Register)";
    document.getElementById('authTitle').innerText = mode === 'login' ? "EOC Admin Login" : "EOC Admin Register";
    document.getElementById('adminLoginError').classList.add('hidden');
};
const authErrorText = (code) => ({
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
    'auth/email-already-in-use': 'อีเมลนี้ถูกใช้สมัครแล้ว',
    'auth/weak-password': 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
    'auth/too-many-requests': 'ลองหลายครั้งเกินไป กรุณารอสักครู่',
    'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้'
}[code]);

window.processAuth = async () => {
    const email = document.getElementById('adminEmail').value.trim();
    const pwd = document.getElementById('adminPwd').value;
    const errorEl = document.getElementById('adminLoginError');
    const btn = document.getElementById('btnSubmitAuth');
    if (!email || !pwd) { errorEl.innerText = "กรุณากรอกอีเมลและรหัสผ่าน"; errorEl.classList.remove('hidden'); return; }
    const oldText = btn.innerText;
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        if (currentAuthMode === 'login') {
            await signInWithEmailAndPassword(auth, email, pwd);
        } else {
            // ด่านแรกฝั่งหน้าเว็บเท่านั้น — สิทธิ์จริงคุมโดย collection "admins" ใน Firestore Rules
            if (document.getElementById('regCode').value.trim() !== '527499') {
                errorEl.innerText = "รหัสยืนยันเจ้าหน้าที่ไม่ถูกต้อง!"; errorEl.classList.remove('hidden'); return;
            }
            await createUserWithEmailAndPassword(auth, email, pwd);
        }
        closeAdminLogin();
        ['adminEmail', 'adminPwd', 'regCode'].forEach(id => document.getElementById(id).value = '');
        window.openAdminDashboard();
    } catch (error) {
        errorEl.innerText = (currentAuthMode === 'login' ? "เข้าสู่ระบบล้มเหลว: " : "สมัครล้มเหลว: ") + (authErrorText(error.code) || error.message);
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false; btn.innerText = oldText;
    }
};

window.doLogout = async () => {
    window.closeAdminDashboard();
    await signOut(auth);
    try { await signInAnonymously(auth); } catch (e) { console.warn(e); }
};

window.addNewAlert = async () => {
    const text = document.getElementById('newAlertText').value.trim().slice(0, 300);
    const severity = document.getElementById('newAlertSeverity').value;
    if (!text) return;
    const btn = document.getElementById('btnAddAlert');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try { await window.Cloud.addAlert(text, severity); document.getElementById('newAlertText').value = ''; }
    catch (e) { console.error(e); window.openModal('ส่งประกาศไม่สำเร็จ', e.code === 'permission-denied' ? 'บัญชีนี้ยังไม่มีสิทธิ์ส่งประกาศ (ต้องอยู่ใน collection admins)' : e.message, 'fa-times-circle', 'text-red-500', 'bg-red-50'); }
    btn.disabled = false; btn.innerHTML = 'ส่งประกาศ';
};

const renderAdminStatus = (user) => {
    const el = document.getElementById('adminStatus');
    if (!user || user.isAnonymous) { el.innerHTML = ''; return; }
    if (isAdmin) {
        el.className = 'text-xs rounded-lg px-3 py-2 mb-3 bg-green-50 border border-green-200 text-green-800';
        el.innerHTML = `<i class="fas fa-user-check mr-1"></i> ${esc(user.email)} · สิทธิ์ EOC Admin`;
    } else {
        el.className = 'text-xs rounded-lg px-3 py-2 mb-3 bg-yellow-50 border border-yellow-200 text-yellow-800';
        el.innerHTML = `<i class="fas fa-user-clock mr-1"></i> ${esc(user.email)} · ยังไม่พบสิทธิ์แอดมิน — ให้ผู้ดูแลเพิ่มเอกสาร <code>admins/${esc(user.uid)}</code> ใน Firestore`;
    }
};

// ===================== Real-time subscriptions =====================
const listen = (q, key, onErr) => onSnapshot(q, (snap) => {
    App.setData(key, snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
}, (err) => { console.warn(`listen ${key}:`, err.code || err); if (onErr) onErr(err); });

// ข้อมูลสาธารณะ — ไม่ต้องล็อกอินก็อ่านได้
listen(col('alerts'), 'alerts');
listen(col('obstacles'), 'obstacles');
listen(col('shelters'), 'shelters');

// ข้อมูลที่ขึ้นกับสิทธิ์ — สมัครใหม่ทุกครั้งที่สถานะล็อกอินเปลี่ยน
let privateUnsubs = [];
const resubscribePrivate = (user) => {
    privateUnsubs.forEach(u => u()); privateUnsubs = [];
    ['sos', 'disease', 'checkins'].forEach(k => App.setData(k, []));
    if (!user) return;
    if (isAdmin) {
        privateUnsubs.push(listen(col('sos'), 'sos'));
        privateUnsubs.push(listen(col('disease'), 'disease'));
        privateUnsubs.push(listen(col('checkins'), 'checkins'));
    } else {
        privateUnsubs.push(listen(query(col('sos'), where('uid', '==', user.uid)), 'sos'));
    }
};

// แถบวิ่งประกาศ
const severityDot = (s) => ({ red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500' }[s] || 'bg-blue-500');
const origSetData = App.setData.bind(App);
App.setData = (key, items) => {
    origSetData(key, items);
    if (key === 'alerts') { renderTicker(items); renderAdminAlerts(items); }
};
const renderTicker = (alerts) => {
    const el = document.getElementById('live-ticker');
    if (!alerts.length) {
        el.innerHTML = '<span class="flex items-center gap-2"><span class="w-2 h-2 bg-green-500 rounded-full status-dot inline-block"></span> <span class="lang-th">สถานการณ์ปกติ ไม่มีประกาศแจ้งเตือนภัยพิบัติในขณะนี้</span><span class="lang-en">Normal situation. No active disaster alerts.</span></span>';
        return;
    }
    el.innerHTML = alerts.map(a => `<span class="flex items-center gap-2 mr-16"><span class="w-2 h-2 ${severityDot(a.severity)} rounded-full status-dot inline-block"></span> ${esc(a.text)}</span>`).join('');
};
const renderAdminAlerts = (alerts) => {
    const el = document.getElementById('adminAlertList');
    if (!alerts.length) { el.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">ไม่มีประกาศที่กำลังใช้งาน</p>'; return; }
    const name = { red: 'แดง (วิกฤต)', orange: 'ส้ม (เตือนภัย)', yellow: 'เหลือง (เฝ้าระวัง)' };
    el.innerHTML = alerts.map(a => `
        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200 gap-2">
            <div class="min-w-0">
                <p class="text-sm font-bold text-gray-800 break-words">${esc(a.text)}</p>
                <p class="text-xs text-gray-500 mt-1"><span class="inline-block w-2 h-2 rounded-full ${severityDot(a.severity)} mr-1"></span>ระดับ: <span class="font-semibold">${name[a.severity] || 'น้ำเงิน (ทั่วไป)'}</span> · ${window.fmtTime(a.timestamp)}</p>
            </div>
            <button onclick="adminDelete('alerts','${esc(a.id)}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-lg flex-shrink-0" title="ลบประกาศนี้"><i class="fas fa-trash"></i></button>
        </div>`).join('');
};

// ===================== Auth state =====================
onAuthStateChanged(auth, async (user) => {
    isAdmin = false;
    if (user && !user.isAnonymous) {
        try { isAdmin = (await getDoc(doc(db, 'admins', user.uid))).exists(); } catch (e) { isAdmin = false; }
    }
    const loggedIn = !!(user && !user.isAnonymous);
    document.getElementById('btnOpenLogin').classList.toggle('hidden', loggedIn);
    document.getElementById('btnAdminDash').classList.toggle('hidden', !loggedIn);
    document.getElementById('btnLogout').classList.toggle('hidden', !loggedIn);
    renderAdminStatus(user);
    App.setAuth({ uid: user ? user.uid : null, isAdmin });
    resubscribePrivate(user);
    if (user && window.onCloudReady) window.onCloudReady();
});

(async () => {
    try {
        // รอให้ Firebase กู้ session เดิมก่อน ไม่งั้นแอดมินจะถูกแทนด้วย anonymous ทุกครั้งที่รีเฟรช
        await auth.authStateReady();
        if (!auth.currentUser) await signInAnonymously(auth);
    } catch (e) {
        console.warn('Anonymous sign-in failed — เปิด Anonymous ใน Firebase Console > Authentication > Sign-in method:', e.code || e);
    }
})();
