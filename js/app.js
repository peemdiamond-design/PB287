/* PB287 All-Hazards Portal — UI, แผนที่, เนื้อหา และ PWA
 * ฝั่ง Cloud (Firebase) อยู่ใน js/cloud.js ซึ่งจะตั้ง window.Cloud และเรียก App.setData(...)
 */

// ===================== 0. Helpers & State =====================
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let isEnMode = false;
const t = (th, en) => (isEnMode ? en : th);
const fmtTime = (ms) => ms ? new Date(ms).toLocaleString(isEnMode ? 'en-GB' : 'th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const HOUR = 3600 * 1000;

function distanceKm(a, b) {
    const R = 6371, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
const directionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${Number(lat)},${Number(lng)}`;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const App = window.App = {
    isAdmin: false,
    uid: null,
    myLoc: null,
    data: { alerts: [], obstacles: [], sos: [], shelters: [], disease: [], checkins: [] },
    setData(key, items) {
        this.data[key] = items || [];
        renderAll(key);
    },
    setAuth({ uid, isAdmin }) {
        this.uid = uid; this.isAdmin = !!isAdmin;
        renderAll();
    }
};
window.escapeHtml = escapeHtml;
window.fmtTime = fmtTime;

// ===================== 1. Language =====================
function applyLanguage() {
    document.body.classList.toggle('en-mode', isEnMode);
    document.documentElement.lang = isEnMode ? 'en' : 'th';
    document.getElementById('lang-btn-text').innerText = isEnMode ? 'TH' : 'EN';
    renderModeButtons();
    renderMentalQuestions();
    renderDiseaseFields();
    renderAll();
}
function toggleLanguage() {
    isEnMode = !isEnMode;
    try { localStorage.setItem('ah_lang', isEnMode ? 'en' : 'th'); } catch (e) {}
    applyLanguage();
}

// ===================== 2. Tabs =====================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => { el.classList.remove('tab-active'); el.classList.add('tab-inactive'); });
    document.getElementById('tab-' + tabId).classList.remove('hidden');
    const btn = document.getElementById('btn-' + tabId);
    btn.classList.remove('tab-inactive'); btn.classList.add('tab-active');
    if (tabId === 'risk' && map) setTimeout(() => map.invalidateSize(), 100);
}
function switchAdminTab(tab) {
    document.querySelectorAll('.apanel').forEach(el => el.classList.add('hidden'));
    document.getElementById('apanel-' + tab).classList.remove('hidden');
    document.querySelectorAll('.atab').forEach(el => {
        const on = el.dataset.atab === tab;
        el.classList.toggle('atab-active', on); el.classList.toggle('atab-inactive', !on);
    });
}

// ===================== 3. Guides (SOP + กลุ่มเปราะบาง) =====================
const GUIDES = {
    flood: { icon: 'fa-water', color: 'text-blue-500', bg: 'bg-blue-100',
        th: ['น้ำท่วม & ดินถล่ม', [
            'ติดตามประกาศเตือนภัย และเตรียมกระเป๋าฉุกเฉินให้พร้อม',
            'ยกของและปลั๊กไฟขึ้นที่สูง ตัดไฟที่เบรกเกอร์ก่อนน้ำเข้าบ้าน (ห้ามแตะสวิตช์ขณะตัวเปียก)',
            'อพยพขึ้นที่สูงทันทีเมื่อได้รับคำสั่ง อย่ารอจนน้ำสูง',
            'ห้ามเดินหรือขับรถลุยน้ำไหลเชี่ยว น้ำลึกเพียง 15 ซม. ก็ทำให้ล้มได้',
            'หลีกเลี่ยงการแช่น้ำนาน สวมรองเท้าบูท ปิดแผลกันน้ำ เพื่อป้องกันโรคฉี่หนู',
            'ดินถล่ม: ถ้าน้ำป่าขุ่นข้น มีเสียงดังผิดปกติจากภูเขา หรือต้นไม้เอียง ให้ออกจากเชิงเขาทันที']],
        en: ['Flood & Landslide', [
            'Follow official warnings and keep your go bag ready.',
            'Move belongings and power outlets up high; switch off the main breaker before water enters (never touch switches while wet).',
            'Evacuate to high ground as soon as you are told to — do not wait for water to rise.',
            'Never walk or drive through moving water; 15 cm of fast water can knock you down.',
            'Avoid long contact with floodwater, wear boots and cover wounds to prevent leptospirosis.',
            'Landslide: muddy runoff, unusual rumbling or tilting trees mean leave the hillside immediately.']] },
    quake: { icon: 'fa-house-crack', color: 'text-orange-500', bg: 'bg-orange-100',
        th: ['แผ่นดินไหว & สึนามิ', [
            'หมอบ ป้อง เกาะ (Drop, Cover, Hold On) ใต้โต๊ะที่แข็งแรง ห่างจากหน้าต่าง',
            'อยู่ในที่กำบังจนกว่าการสั่นจะหยุด อย่าวิ่งออกขณะยังสั่น',
            'เมื่อหยุดสั่น อพยพออกทางบันได ห้ามใช้ลิฟต์ และระวังอาฟเตอร์ช็อก',
            'ถ้าอยู่กลางแจ้ง ให้อยู่ห่างจากอาคาร เสาไฟ และต้นไม้',
            'สึนามิ: ถ้าอยู่ชายฝั่งแล้วรู้สึกแผ่นดินไหวแรง หรือเห็นน้ำทะเลลดลงผิดปกติ ให้ขึ้นที่สูงทันทีโดยไม่ต้องรอไซเรน',
            'อย่ากลับลงไปชายหาดจนกว่าจะมีประกาศว่าปลอดภัย คลื่นอาจมาหลายระลอก']],
        en: ['Earthquake & Tsunami', [
            'Drop, Cover, Hold On under sturdy furniture, away from windows.',
            'Stay covered until shaking stops — do not run outside while shaking.',
            'After shaking stops, leave by the stairs (no elevators) and expect aftershocks.',
            'If outdoors, stay clear of buildings, poles and trees.',
            'Tsunami: if you feel a strong quake on the coast or see the sea recede, go to high ground immediately — do not wait for sirens.',
            'Do not return to the beach until an all-clear is announced; waves may come in several surges.']] },
    fire: { icon: 'fa-fire', color: 'text-red-500', bg: 'bg-red-100',
        th: ['อัคคีภัย & สารเคมี', [
            'ตะโกนเตือนคนรอบข้าง กดสัญญาณเตือนไฟ และโทร 199',
            'ก้มต่ำ คลานหนีควัน ใช้ผ้าชุบน้ำปิดจมูกและปาก',
            'คลำลูกบิดประตูก่อนเปิด ถ้าร้อนห้ามเปิด ให้ใช้ทางหนีอื่น ห้ามใช้ลิฟต์',
            'ไฟติดเสื้อผ้า: หยุด ล้ม กลิ้ง (Stop, Drop, Roll)',
            'สารเคมีรั่ว: อพยพไปทางเหนือลมและที่สูง อยู่ห่างจากกลุ่มควันหรือกลิ่น',
            'หน้ากาก N95 กันฝุ่นและควันได้ แต่กันก๊าซพิษไม่ได้ การอพยพออกจากพื้นที่สำคัญที่สุด',
            'ถ้าสารเคมีเปื้อนตัว ให้ถอดเสื้อผ้าที่เปื้อนออก แล้วล้างผิวด้วยน้ำสะอาดปริมาณมาก']],
        en: ['Fire & Chemical Spill', [
            'Shout a warning, pull the fire alarm and call 199.',
            'Stay low and crawl under smoke; cover nose and mouth with a wet cloth.',
            'Feel the door handle first — if hot, do not open; use another exit. No elevators.',
            'If clothes catch fire: Stop, Drop and Roll.',
            'Chemical leak: move upwind and uphill, away from any cloud or smell.',
            'N95 masks filter dust and smoke but NOT toxic gases — leaving the area matters most.',
            'If contaminated, remove soiled clothing and rinse skin with plenty of clean water.']] },
    outbreak: { icon: 'fa-virus', color: 'text-green-600', bg: 'bg-green-100',
        th: ['โรคระบาดในภาวะภัยพิบัติ', [
            'สวมหน้ากากอนามัยในที่แออัด เช่น ศูนย์พักพิง',
            'ล้างมือด้วยสบู่หรือเจลแอลกอฮอล์บ่อยๆ โดยเฉพาะก่อนกินอาหารและหลังเข้าห้องน้ำ',
            'กินร้อน ใช้ช้อนส่วนตัว ดื่มน้ำสะอาดหรือน้ำบรรจุขวดเท่านั้น',
            'หากมีไข้ ไอ ผื่น หรือท้องเสีย ให้แจ้งเจ้าหน้าที่สาธารณสุข (ทีม SRRT) เพื่อแยกพื้นที่ดูแล',
            'สอบถามข้อมูลโรคติดต่อได้ที่สายด่วนกรมควบคุมโรค 1422']],
        en: ['Outbreaks During Disasters', [
            'Wear a mask in crowded places such as shelters.',
            'Wash hands with soap or sanitizer often, especially before eating and after using the toilet.',
            'Eat hot food, use your own spoon, drink only clean or bottled water.',
            'If you have fever, cough, rash or diarrhea, tell health staff (SRRT) so you can be cared for separately.',
            'For disease information call the DDC hotline 1422.']] },
    elderly: { icon: 'fa-person-cane', color: 'text-purple-500', bg: 'bg-purple-100',
        th: ['ผู้สูงอายุ / ผู้พิการ / ผู้ป่วยติดเตียง', [
            'ลงทะเบียนกับ อสม. หรือ รพ.สต. ไว้ล่วงหน้า ให้ทีมกู้ภัยรู้ว่ามีผู้ต้องช่วยอพยพ',
            'อพยพก่อนคนอื่นตั้งแต่ได้รับคำเตือน ไม่ต้องรอจนน้ำขึ้น',
            'เตรียมอุปกรณ์ช่วย: แว่นตา เครื่องช่วยฟัง ไม้เท้า รถเข็น ผ้าอ้อมผู้ใหญ่',
            'ผู้ใช้ออกซิเจนหรือเครื่องมือแพทย์ที่ใช้ไฟฟ้า: เตรียมแบตเตอรี่สำรอง และแจ้งโรงพยาบาลล่วงหน้าเผื่อไฟดับ',
            'ผู้ป่วยติดเตียง: พลิกตัวอย่างน้อยทุก 2 ชั่วโมง ป้องกันแผลกดทับ',
            'ติดป้ายชื่อ เบอร์ญาติ และโรคประจำตัวไว้กับตัวเสมอ']],
        en: ['Elderly / Disabled / Bedridden', [
            'Register with your village health volunteer or health center in advance so rescuers know who needs help.',
            'Evacuate early, as soon as a warning is issued.',
            'Pack assistive items: glasses, hearing aids, cane, wheelchair, adult diapers.',
            'Oxygen or powered medical devices: keep backup batteries and tell your hospital in case of power cuts.',
            'Bedridden patients: reposition at least every 2 hours to prevent pressure sores.',
            'Carry a tag with name, family phone number and medical conditions.']] },
    chronic: { icon: 'fa-pills', color: 'text-purple-500', bg: 'bg-purple-100',
        th: ['ผู้ป่วยโรคเรื้อรัง', [
            'พกยาให้พออย่างน้อย 7 วัน พร้อมสมุดประจำตัวหรือรายการยา',
            'เบาหวาน: พกลูกอมหรือน้ำหวานเผื่อน้ำตาลต่ำ อินซูลินเก็บในกระติกเย็น ห้ามแช่แข็ง',
            'ความดันสูง/โรคหัวใจ: กินยาให้ตรงเวลา ถ้าเจ็บหน้าอกหรือหอบเหนื่อย โทร 1669 ทันที',
            'ผู้ฟอกไต/ล้างไตทางช่องท้อง: ติดต่อหน่วยไตล่วงหน้าเรื่องสถานที่ฟอกไตสำรอง',
            'ผู้ป่วยจิตเวช วัณโรค หรือ HIV: ห้ามหยุดยาเอง ถ้ายาหมดให้แจ้งหน่วยแพทย์ในศูนย์พักพิง']],
        en: ['Chronic Illness', [
            'Carry at least 7 days of medicine plus your medication list or patient book.',
            'Diabetes: carry candy or sweet drinks for low blood sugar; keep insulin in a cool box, never frozen.',
            'Hypertension/heart disease: take medicines on time; chest pain or breathlessness → call 1669.',
            'Dialysis patients: contact your kidney unit in advance about backup dialysis sites.',
            'Psychiatric, TB or HIV patients: do not stop medicines; if you run out, tell the shelter medical team.']] },
    pregnant: { icon: 'fa-person-pregnant', color: 'text-pink-500', bg: 'bg-pink-100',
        th: ['หญิงตั้งครรภ์ / ทารก', [
            'พกสมุดฝากครรภ์ (สมุดสีชมพู) และยาบำรุงติดตัวตลอดเวลา',
            'อาการอันตราย: เลือดออก น้ำเดิน ปวดท้องถี่ ลูกดิ้นน้อยลง ปวดศีรษะมาก ตาพร่า หรือบวม → แจ้งเจ้าหน้าที่หรือโทร 1669 ทันที',
            'นมแม่ปลอดภัยที่สุดสำหรับทารกในภาวะภัยพิบัติ ควรให้ต่อเนื่อง',
            'ถ้าใช้นมผง: ชงด้วยน้ำต้มสุกหรือน้ำขวด ล้างและต้มขวดนม นมที่ชงแล้วใช้ให้หมดภายใน 2 ชั่วโมง',
            'ขอพื้นที่เฉพาะสำหรับแม่และเด็กในศูนย์พักพิง']],
        en: ['Pregnancy / Infants', [
            'Always carry your antenatal record book and prenatal vitamins.',
            'Danger signs: bleeding, water breaking, frequent contractions, reduced baby movement, severe headache, blurred vision or swelling → tell staff or call 1669.',
            'Breastfeeding is the safest way to feed infants in emergencies — continue it.',
            'If using formula: use boiled or bottled water, wash and boil bottles, and use prepared milk within 2 hours.',
            'Ask for a mother-and-baby area in the shelter.']] },
    children: { icon: 'fa-child-reaching', color: 'text-blue-500', bg: 'bg-blue-100',
        th: ['เด็ก', [
            'เขียนชื่อและเบอร์ผู้ปกครองติดตัวเด็ก (ป้ายข้อมือหรือในกระเป๋า)',
            'นัดจุดพบกันไว้ล่วงหน้าเผื่อพลัดหลง',
            'ให้อยู่กับครอบครัว ไม่แยกเด็กออกจากผู้ดูแล',
            'ตอบคำถามตามจริงด้วยภาษาง่ายๆ ให้เด็กได้เล่นหรือวาดรูประบายความรู้สึก',
            'ฝันร้าย ติดพ่อแม่ หรือกลับมาปัสสาวะรดที่นอน เป็นปฏิกิริยาปกติช่วงแรก ถ้าเป็นนานเกิน 1 เดือนควรปรึกษาผู้เชี่ยวชาญ',
            'ห้ามเด็กเล่นน้ำท่วม เสี่ยงจมน้ำ ไฟดูด และโรคติดเชื้อ']],
        en: ['Children', [
            "Put the child's name and a parent's phone number on them (wristband or bag).",
            'Agree on a meeting point in case you get separated.',
            'Keep children with their family or caregiver.',
            'Answer questions honestly in simple words; let them play or draw to express feelings.',
            'Nightmares, clinginess or bed-wetting are normal at first; seek help if they last over a month.',
            'Do not let children play in floodwater — risk of drowning, electrocution and infection.']] },
    pets: { icon: 'fa-paw', color: 'text-amber-600', bg: 'bg-amber-100',
        th: ['สัตว์เลี้ยง & ปศุสัตว์ (One Health)', [
            'เตรียมอาหาร น้ำ ยา สายจูง และกรงสำหรับสัตว์เลี้ยงอย่างน้อย 3 วัน',
            'ติดป้ายชื่อและเบอร์โทรที่ปลอกคอ และถ่ายรูปสัตว์เก็บไว้เผื่อพลัดหลง',
            'ฉีดวัคซีนพิษสุนัขบ้าให้ครบ',
            'ตรวจสอบล่วงหน้าว่าศูนย์พักพิงรับสัตว์เลี้ยงหรือไม่',
            'ย้ายปศุสัตว์ขึ้นที่สูงก่อนน้ำมา',
            'ห้ามจับซากสัตว์ด้วยมือเปล่า แจ้ง อปท. หรือปศุสัตว์อำเภอ ให้ฝังกลบและโรยปูนขาว']],
        en: ['Pets & Livestock (One Health)', [
            'Pack food, water, medicine, leash and carrier for at least 3 days.',
            'Put a name and phone tag on the collar and keep a photo in case you get separated.',
            'Keep rabies vaccination up to date.',
            'Check in advance whether the shelter accepts pets.',
            'Move livestock to high ground before the water arrives.',
            'Never handle animal carcasses bare-handed; report them to local authorities for burial with lime.']] }
};
function showGuide(key) {
    const g = GUIDES[key]; if (!g) return;
    const [title, items] = isEnMode ? g.en : g.th;
    openModal(title, items.map((x, i) => `${i + 1}. ${x}`).join('\n'), g.icon, g.color, g.bg);
}

// ===================== 4. Map =====================
let map, layers = {}, myLocationMarker;
let mapMode = null; // null | 'obstacle' | 'sos' | 'shelter'
let tempLatLng = null;

function initMap() {
    if (!window.L) { document.getElementById('map').innerHTML = '<p class="p-6 text-sm text-gray-500 text-center">ไม่สามารถโหลดแผนที่ได้ (ออฟไลน์)</p>'; return; }
    map = L.map('map').setView([13.7563, 100.5018], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);
    ['shelters', 'obstacles', 'sos', 'local'].forEach(k => layers[k] = L.layerGroup().addTo(map));
    map.on('click', (e) => {
        if (mapMode === 'obstacle') reportObstacle(e.latlng);
        else if (mapMode === 'sos') { tempLatLng = e.latlng; openSosModal(); }
        else if (mapMode === 'shelter') { setMode(null); openShelterModal(null, e.latlng); }
    });
    loadLocalPins();
}

function divIcon(html, size = 32) { return L.divIcon({ className: 'custom-icon', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] }); }
const SOS_BG = { red: 'bg-red-600', yellow: 'bg-yellow-500', green: 'bg-green-500' };
function sosIcon(level, status) {
    const lv = SOS_BG[level] ? level : 'red';
    const ring = status === 'enroute' ? 'ring-4 ring-blue-400' : '';
    return divIcon(`<div class="${SOS_BG[lv]} ${ring} text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg border-2 border-white ${status === 'new' || !status ? 'sos-icon-' + lv : ''}"><i class="fas fa-hand-paper text-xs"></i></div>`);
}
const obstacleIcon = () => divIcon('<div class="bg-gray-800 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md border-2 border-white"><i class="fas fa-times text-[10px]"></i></div>', 24);
const SHELTER_TYPES = {
    shelter: { icon: 'fa-campground', bg: 'bg-green-600', th: 'ศูนย์พักพิง', en: 'Shelter' },
    hospital: { icon: 'fa-hospital', bg: 'bg-blue-600', th: 'โรงพยาบาล', en: 'Hospital' },
    medical: { icon: 'fa-kit-medical', bg: 'bg-blue-500', th: 'หน่วยแพทย์', en: 'Medical point' },
    supply: { icon: 'fa-box-open', bg: 'bg-amber-500', th: 'จุดแจกของ', en: 'Supplies' }
};
function shelterState(s) {
    if (!s.open) return 'closed';
    if (num(s.capacity) > 0 && num(s.occupancy) >= num(s.capacity)) return 'full';
    return 'open';
}
function shelterIcon(s) {
    const ty = SHELTER_TYPES[s.type] || SHELTER_TYPES.shelter;
    const st = shelterState(s);
    const bg = st === 'closed' ? 'bg-gray-400' : ty.bg;
    const ring = st === 'full' ? 'ring-4 ring-red-400' : '';
    return divIcon(`<div class="${bg} ${ring} text-white rounded-lg w-8 h-8 flex items-center justify-center shadow-lg border-2 border-white"><i class="fas ${ty.icon} text-sm"></i></div>`);
}

const SOS_STATUS = {
    new: { th: 'รอเจ้าหน้าที่รับเรื่อง', en: 'Waiting for EOC', cls: 'bg-red-100 text-red-700' },
    enroute: { th: 'เจ้าหน้าที่กำลังเดินทางไป', en: 'Rescue team on the way', cls: 'bg-blue-100 text-blue-700' },
    done: { th: 'ช่วยเหลือแล้ว', en: 'Resolved', cls: 'bg-green-100 text-green-700' }
};
const statusBadge = (st) => { const s = SOS_STATUS[st] || SOS_STATUS.new; return `<span class="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${s.cls}">${t(s.th, s.en)}</span>`; };
function sosLevelText(level) {
    if (level === 'yellow') return t('เหลือง (เร่งด่วน)', 'Yellow (Urgent)');
    if (level === 'green') return t('เขียว (รอได้)', 'Green (Non-urgent)');
    return t('แดง (วิกฤต)', 'Red (Critical)');
}
function occupancyBar(s) {
    const cap = num(s.capacity), occ = num(s.occupancy);
    if (!cap) return '';
    const pct = Math.min(100, Math.round(occ / cap * 100));
    const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500';
    return `<div class="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div class="${color} h-1.5 rounded-full" style="width:${pct}%"></div></div><p class="text-[11px] text-gray-500 mt-0.5">${occ}/${cap} ${t('คน', 'people')} (${pct}%)</p>`;
}
function shelterStateBadge(s) {
    const st = shelterState(s);
    if (st === 'closed') return `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">${t('ปิด', 'Closed')}</span>`;
    if (st === 'full') return `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">${t('เต็ม', 'Full')}</span>`;
    return `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">${t('เปิดรับ', 'Open')}</span>`;
}

function renderMap() {
    if (!map) return;
    const { obstacles, sos, shelters } = App.data;
    layers.obstacles.clearLayers();
    obstacles.forEach(d => {
        if (typeof d.lat !== 'number') return;
        let html = `<b><i class="fas fa-road-barrier"></i> ${t('สิ่งกีดขวาง/เส้นทางขาด', 'Obstacle / Road cut')}</b><br>${t('แจ้งโดยประชาชน', 'Reported by public')} · ${fmtTime(d.timestamp)}`;
        if (App.isAdmin) html += `<br><button onclick="adminDelete('obstacles','${escapeHtml(d.id)}')" class="mt-2 text-xs bg-red-50 text-red-600 px-2 py-1 rounded">${t('ลบจุดนี้', 'Remove')}</button>`;
        L.marker([d.lat, d.lng], { icon: obstacleIcon() }).bindPopup(html).addTo(layers.obstacles);
    });

    layers.sos.clearLayers();
    sos.filter(d => d.status !== 'done' && typeof d.lat === 'number').forEach(d => {
        let html = `<b><i class="fas fa-life-ring"></i> SOS</b> ${statusBadge(d.status)}<br>${t('ระดับ', 'Level')}: ${sosLevelText(d.level)}<br>${fmtTime(d.timestamp)}`;
        if (d.people) html += `<br>${t('จำนวนคน', 'People')}: ${num(d.people)}`;
        if (App.isAdmin && d.phone) html += `<br>${t('โทร', 'Phone')}: <a href="tel:${escapeHtml(d.phone)}">${escapeHtml(d.phone)}</a>`;
        if (App.isAdmin) html += `<br><div class="flex gap-1 mt-2">${sosActionButtons(d)}</div>`;
        L.marker([d.lat, d.lng], { icon: sosIcon(d.level, d.status), zIndexOffset: 1000 }).bindPopup(html).addTo(layers.sos);
    });

    layers.shelters.clearLayers();
    shelters.forEach(s => {
        if (typeof s.lat !== 'number') return;
        const ty = SHELTER_TYPES[s.type] || SHELTER_TYPES.shelter;
        let html = `<b>${escapeHtml(s.name)}</b> ${shelterStateBadge(s)}<br><span class="text-xs text-gray-500">${t(ty.th, ty.en)}</span>${occupancyBar(s)}
            <a href="${directionsUrl(s.lat, s.lng)}" target="_blank" rel="noopener" class="inline-block mt-2 text-xs bg-green-600 text-white px-2 py-1 rounded"><i class="fas fa-route"></i> ${t('นำทาง', 'Directions')}</a>`;
        if (App.isAdmin) html += ` <button onclick="editShelter('${escapeHtml(s.id)}')" class="text-xs bg-gray-100 px-2 py-1 rounded">${t('แก้ไข', 'Edit')}</button>`;
        L.marker([s.lat, s.lng], { icon: shelterIcon(s) }).bindPopup(html).addTo(layers.shelters);
    });
}

// --- โหมดแผนที่ ---
function renderModeButtons() {
    document.getElementById('btn-report').innerHTML = mapMode === 'obstacle'
        ? `<i class="fas fa-times"></i> ${t('ยกเลิก', 'Cancel')}`
        : `<i class="fas fa-road-barrier"></i> ${t('สิ่งกีดขวาง', 'Obstacle')}`;
    document.getElementById('btn-sos').innerHTML = mapMode === 'sos'
        ? `<i class="fas fa-times"></i> ${t('ยกเลิก SOS', 'Cancel')}`
        : `<i class="fas fa-life-ring"></i> ${t('แจ้งพิกัด SOS', 'SOS Location')}`;
    const rep = document.getElementById('btn-report'), sos = document.getElementById('btn-sos');
    rep.classList.toggle('bg-gray-800', mapMode === 'obstacle'); rep.classList.toggle('text-white', mapMode === 'obstacle');
    rep.classList.toggle('bg-gray-100', mapMode !== 'obstacle'); rep.classList.toggle('text-gray-700', mapMode !== 'obstacle');
    sos.classList.toggle('bg-red-600', mapMode === 'sos'); sos.classList.toggle('text-white', mapMode === 'sos');
    sos.classList.toggle('bg-red-100', mapMode !== 'sos'); sos.classList.toggle('text-red-700', mapMode !== 'sos');
}
function setMode(mode) {
    mapMode = mode;
    renderModeButtons();
    const mapEl = document.getElementById('map');
    mapEl.classList.toggle('cursor-crosshair', !!mode);
    if (mode === 'obstacle') showMapToast(`<i class="fas fa-road-barrier mr-2"></i> ${t('คลิกลงบนแผนที่เพื่อระบุจุดกีดขวาง', 'Click on the map to mark an obstacle.')}`, 'bg-gray-800');
    else if (mode === 'sos') showMapToast(`<i class="fas fa-life-ring mr-2"></i> ${t('คลิกตำแหน่งของคุณบนแผนที่ หรือกด "ตำแหน่งฉัน" เพื่อใช้ GPS', 'Click your position on the map, or tap "My Location" to use GPS.')}`, 'bg-red-600');
    else if (mode === 'shelter') showMapToast(`<i class="fas fa-map-pin mr-2"></i> คลิกตำแหน่งสถานที่บนแผนที่ (กด Esc เพื่อยกเลิก)`, 'bg-green-700');
    else hideMapToast();
}
function toggleReportMode() { setMode(mapMode === 'obstacle' ? null : 'obstacle'); }
function toggleSosMode() { setMode(mapMode === 'sos' ? null : 'sos'); }
function showMapToast(msg, bgClass) {
    const toast = document.getElementById('map-toast');
    toast.className = `text-white text-sm text-center py-2.5 font-bold shadow-inner ${bgClass}`;
    document.getElementById('map-toast-msg').innerHTML = msg;
}
function hideMapToast() { document.getElementById('map-toast').classList.add('hidden'); }

// --- Local fallback (ไม่มี Cloud เลย เช่น Firebase โหลดไม่ได้) ---
function saveLocal(type, item) {
    const key = `all_hazard_${type}s`, list = lsGet(key, []);
    list.push({ ...item, timestamp: Date.now() }); lsSet(key, list);
    addLocalPin(type, item);
}
function addLocalPin(type, d) {
    if (!map) return;
    const icon = type === 'sos' ? sosIcon(d.level, 'new') : obstacleIcon();
    L.marker([d.lat, d.lng], { icon }).bindPopup(`<i class="text-xs">${t('บันทึกในเครื่องนี้เท่านั้น (ยังไม่ถึง EOC)', 'Saved on this device only (not sent to EOC)')}</i>`).addTo(layers.local);
}
function loadLocalPins() { ['obstacle', 'sos'].forEach(type => lsGet(`all_hazard_${type}s`, []).forEach(d => addLocalPin(type, d))); }
window.onCloudReady = () => { if (layers.local) layers.local.clearLayers(); };

// --- Obstacle & SOS ---
async function reportObstacle(latlng) {
    setMode(null);
    let res = null;
    if (window.Cloud) { try { res = await window.Cloud.addObstacle(latlng.lat, latlng.lng); } catch (e) { console.error(e); } }
    if (!res) saveLocal('obstacle', { lat: latlng.lat, lng: latlng.lng });
    if (res && res.queued) openModal(t('รอส่งข้อมูล', 'Queued'), t('ยังไม่มีสัญญาณ ระบบจะส่งจุดนี้ให้ EOC อัตโนมัติเมื่อกลับมาออนไลน์', 'No connection yet — this will be sent to EOC automatically when back online.'), 'fa-clock', 'text-yellow-500', 'bg-yellow-50');
    else if (res) openModal(t('รับแจ้งเหตุสำเร็จ', 'Report Sent'), t('บันทึกจุดสิ่งกีดขวาง/เส้นทางขาดแล้ว ผู้ใช้อื่นจะเห็นจุดนี้บนแผนที่', 'Obstacle marked. Other users will see it on the map.'), 'fa-check-circle', 'text-green-500', 'bg-green-50');
    else openModal(t('บันทึกไว้ในเครื่อง', 'Saved Locally'), t('ยังเชื่อมต่อระบบ EOC ไม่ได้ จุดนี้จึงเห็นได้เฉพาะในเครื่องนี้', 'Could not reach EOC; this pin is visible on this device only.'), 'fa-exclamation-triangle', 'text-yellow-500', 'bg-yellow-50');
}
function openSosModal() {
    document.getElementById('sosPeople').value = '';
    document.getElementById('sosPhone').value = lsGet('ah_sos_phone', '');
    document.getElementById('sosModal').classList.remove('hidden');
}
function cancelSos() {
    tempLatLng = null;
    document.getElementById('sosModal').classList.add('hidden');
    if (mapMode === 'sos') setMode(null);
}
async function submitSos(level) {
    if (!tempLatLng) return;
    const { lat, lng } = tempLatLng;
    const people = Math.min(Math.max(parseInt(document.getElementById('sosPeople').value, 10) || 0, 0), 999);
    const phone = document.getElementById('sosPhone').value.replace(/[^0-9+\-\s]/g, '').trim().slice(0, 20);
    if (phone) lsSet('ah_sos_phone', phone);
    document.getElementById('sosModal').classList.add('hidden');
    tempLatLng = null;
    if (mapMode === 'sos') setMode(null);

    let res = null;
    if (window.Cloud) { try { res = await window.Cloud.addSos({ lat, lng, level, people, phone }); } catch (e) { console.error(e); } }
    if (!res) {
        saveLocal('sos', { lat, lng, level, people });
        openModal(t('ส่ง SOS ไม่สำเร็จ', 'SOS Not Sent'), t('ไม่สามารถเชื่อมต่อศูนย์ EOC ได้ กรุณาโทร 1669 หรือ 1784 ทันที', 'Could not reach EOC. Please call 1669 or 1784 immediately.'), 'fa-phone-alt', 'text-red-500', 'bg-red-50');
    } else if (res.queued) {
        openModal(t('SOS อยู่ในคิว', 'SOS Queued'), t('ยังไม่มีสัญญาณ ระบบจะส่ง SOS อัตโนมัติเมื่อกลับมาออนไลน์ (อย่าปิดแอป) — ถ้าโทรได้ ให้โทร 1669 ทันที', 'No signal — your SOS will be sent automatically when back online (keep the app open). If you can call, dial 1669 now.'), 'fa-clock', 'text-yellow-500', 'bg-yellow-50');
    } else {
        openModal(t('ส่งสัญญาณ SOS สำเร็จ', 'SOS Sent'), t('EOC ได้รับพิกัดแล้ว ติดตามสถานะได้ใต้แผนที่ กรุณาอยู่ในที่ปลอดภัยและสงวนแบตเตอรี่', 'EOC has your location. Track the status below the map. Stay safe and save battery.'), 'fa-broadcast-tower', 'text-green-500', 'bg-green-50');
    }
}

// --- GPS ---
function updateNearbyLinks(lat, lng) {
    const mk = (q) => `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${lat.toFixed(5)},${lng.toFixed(5)},14z`;
    document.getElementById('link-hospital').href = mk('โรงพยาบาล');
    document.getElementById('link-shelter').href = mk('ศูนย์พักพิง');
}
function locateMe() {
    if (!navigator.geolocation) {
        openModal(t('ไม่รองรับ GPS', 'GPS Unavailable'), t('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง กรุณาคลิกเลือกบนแผนที่แทน', 'This device cannot share location. Please click on the map instead.'), 'fa-location-crosshairs', 'text-yellow-500', 'bg-yellow-50');
        return;
    }
    const btn = document.getElementById('btn-locate'), old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    navigator.geolocation.getCurrentPosition((pos) => {
        btn.innerHTML = old;
        const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        App.myLoc = ll;
        if (map) {
            map.setView([ll.lat, ll.lng], 14);
            if (myLocationMarker) myLocationMarker.setLatLng([ll.lat, ll.lng]);
            else myLocationMarker = L.circleMarker([ll.lat, ll.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).addTo(map);
            myLocationMarker.bindPopup(t('ตำแหน่งของคุณ', 'Your location') + ` (±${Math.round(pos.coords.accuracy)} m)`);
        }
        updateNearbyLinks(ll.lat, ll.lng);
        renderShelterList();
        if (mapMode === 'sos') { tempLatLng = ll; openSosModal(); }
    }, () => {
        btn.innerHTML = old;
        openModal(t('ระบุตำแหน่งไม่ได้', 'Location Error'), t('กรุณาอนุญาตการเข้าถึงตำแหน่ง หรือคลิกเลือกตำแหน่งบนแผนที่แทน', 'Please allow location access, or click on the map instead.'), 'fa-location-crosshairs', 'text-yellow-500', 'bg-yellow-50');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
}
function flyTo(lat, lng) {
    closeAdminDashboard();
    switchTab('risk');
    setTimeout(() => { if (map) { map.flyTo([lat, lng], 16); document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 150);
}

// ===================== 5. Shelters =====================
function renderShelterList() {
    const el = document.getElementById('shelterList');
    let list = App.data.shelters.filter(s => s.open);
    if (!list.length) {
        el.innerHTML = `<p class="text-sm text-gray-400 text-center py-2">${t('ยังไม่มีศูนย์พักพิงที่ EOC ประกาศ', 'No shelters announced by EOC yet.')}</p>`;
    } else {
        if (App.myLoc) list = list.map(s => ({ ...s, _d: distanceKm(App.myLoc, s) })).sort((a, b) => a._d - b._d);
        el.innerHTML = list.map(s => {
            const ty = SHELTER_TYPES[s.type] || SHELTER_TYPES.shelter;
            return `<div class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                <div class="${ty.bg} text-white rounded-lg w-9 h-9 flex items-center justify-center flex-shrink-0"><i class="fas ${ty.icon} text-sm"></i></div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-gray-800 truncate">${escapeHtml(s.name)} ${shelterStateBadge(s)}</p>
                    <p class="text-[11px] text-gray-500">${t(ty.th, ty.en)}${s._d !== undefined ? ` · ${s._d.toFixed(1)} ${t('กม.', 'km')}` : ''}</p>
                    ${occupancyBar(s)}
                </div>
                <div class="flex flex-col gap-1 flex-shrink-0">
                    <button onclick="flyTo(${num(s.lat)},${num(s.lng)})" class="text-xs bg-white border border-gray-300 px-2 py-1 rounded"><i class="fas fa-map"></i></button>
                    <a href="${directionsUrl(s.lat, s.lng)}" target="_blank" rel="noopener" class="text-xs bg-green-600 text-white px-2 py-1 rounded text-center"><i class="fas fa-route"></i></a>
                </div>
            </div>`;
        }).join('');
    }
    // datalist สำหรับฟอร์มรายงานโรค
    document.getElementById('drShelterOptions').innerHTML = App.data.shelters
        .filter(s => s.type === 'shelter').map(s => `<option value="${escapeHtml(s.name)}"></option>`).join('');
}

function startShelterPin() {
    if (!App.isAdmin) return openModal('ไม่มีสิทธิ์', 'เฉพาะแอดมิน EOC เท่านั้น', 'fa-lock', 'text-yellow-500', 'bg-yellow-50');
    closeAdminDashboard(); switchTab('risk'); setMode('shelter');
    document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
let shelterDraftLatLng = null;
function openShelterModal(existing, latlng) {
    const s = existing || { name: '', type: 'shelter', capacity: '', occupancy: 0, open: true };
    shelterDraftLatLng = existing ? { lat: existing.lat, lng: existing.lng } : latlng;
    document.getElementById('shelterId').value = existing ? existing.id : '';
    document.getElementById('shelterModalTitle').innerText = existing ? 'แก้ไขสถานที่' : 'เพิ่มศูนย์พักพิง / จุดบริการ';
    document.getElementById('shelterName').value = s.name;
    document.getElementById('shelterType').value = s.type || 'shelter';
    document.getElementById('shelterCapacity').value = s.capacity || '';
    document.getElementById('shelterOccupancy').value = s.occupancy || 0;
    document.getElementById('shelterOpen').checked = s.open !== false;
    document.getElementById('shelterCoords').innerText = shelterDraftLatLng ? `พิกัด: ${shelterDraftLatLng.lat.toFixed(5)}, ${shelterDraftLatLng.lng.toFixed(5)}` : '';
    document.getElementById('shelterModal').classList.remove('hidden');
}
function closeShelterModal() { document.getElementById('shelterModal').classList.add('hidden'); }
function editShelter(id) { const s = App.data.shelters.find(x => x.id === id); if (s) openShelterModal(s); }
async function saveShelter() {
    const id = document.getElementById('shelterId').value;
    const data = {
        name: document.getElementById('shelterName').value.trim().slice(0, 80),
        type: document.getElementById('shelterType').value,
        capacity: Math.max(0, parseInt(document.getElementById('shelterCapacity').value, 10) || 0),
        occupancy: Math.max(0, parseInt(document.getElementById('shelterOccupancy').value, 10) || 0),
        open: document.getElementById('shelterOpen').checked,
        lat: shelterDraftLatLng.lat, lng: shelterDraftLatLng.lng
    };
    if (!data.name) return openModal('ข้อมูลไม่ครบ', 'กรุณาใส่ชื่อสถานที่', 'fa-exclamation-triangle', 'text-yellow-500', 'bg-yellow-50');
    const btn = document.getElementById('btnSaveShelter'); btn.disabled = true;
    try { await window.Cloud.saveShelter(data, id || null); closeShelterModal(); }
    catch (e) { cloudError(e); }
    btn.disabled = false;
}
async function adjustOccupancy(id, delta) {
    const s = App.data.shelters.find(x => x.id === id); if (!s) return;
    try { await window.Cloud.saveShelter({ occupancy: Math.max(0, num(s.occupancy) + delta) }, id); } catch (e) { cloudError(e); }
}
async function toggleShelterOpen(id) {
    const s = App.data.shelters.find(x => x.id === id); if (!s) return;
    try { await window.Cloud.saveShelter({ open: !s.open }, id); } catch (e) { cloudError(e); }
}
function renderAdminShelters() {
    const el = document.getElementById('adminShelterList');
    const list = App.data.shelters;
    if (!list.length) { el.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">ยังไม่มีสถานที่ — กดปุ่มด้านบนเพื่อปักหมุด</p>'; return; }
    el.innerHTML = list.map(s => {
        const ty = SHELTER_TYPES[s.type] || SHELTER_TYPES.shelter;
        return `<div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div class="flex justify-between items-start gap-2">
                <div class="min-w-0">
                    <p class="text-sm font-bold text-gray-800">${escapeHtml(s.name)} ${shelterStateBadge(s)}</p>
                    <p class="text-xs text-gray-500">${ty.th} · อัปเดต ${fmtTime(s.updatedAt)}</p>
                </div>
                <div class="flex gap-1 flex-shrink-0">
                    <button onclick="flyTo(${num(s.lat)},${num(s.lng)})" class="text-blue-600 bg-blue-50 p-2 rounded-lg" title="ดูบนแผนที่"><i class="fas fa-map-marker-alt"></i></button>
                    <button onclick="editShelter('${escapeHtml(s.id)}')" class="text-gray-600 bg-white border p-2 rounded-lg" title="แก้ไข"><i class="fas fa-pen"></i></button>
                    <button onclick="adminDelete('shelters','${escapeHtml(s.id)}')" class="text-red-500 bg-red-50 p-2 rounded-lg" title="ลบ"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            ${occupancyBar(s)}
            <div class="flex flex-wrap gap-1 mt-2 text-xs">
                <button onclick="adjustOccupancy('${escapeHtml(s.id)}',-10)" class="px-2 py-1 bg-white border rounded">-10</button>
                <button onclick="adjustOccupancy('${escapeHtml(s.id)}',-1)" class="px-2 py-1 bg-white border rounded">-1</button>
                <button onclick="adjustOccupancy('${escapeHtml(s.id)}',1)" class="px-2 py-1 bg-white border rounded">+1</button>
                <button onclick="adjustOccupancy('${escapeHtml(s.id)}',10)" class="px-2 py-1 bg-white border rounded">+10</button>
                <button onclick="toggleShelterOpen('${escapeHtml(s.id)}')" class="px-2 py-1 rounded ${s.open ? 'bg-gray-700 text-white' : 'bg-green-600 text-white'}">${s.open ? 'ปิดรับ' : 'เปิดรับ'}</button>
            </div>
        </div>`;
    }).join('');
}

// ===================== 6. SOS (ประชาชน + แอดมิน) =====================
function renderMySos() {
    const card = document.getElementById('mySosCard'), el = document.getElementById('mySosList');
    const mine = App.data.sos.filter(s => s.uid && s.uid === App.uid && (s.status !== 'done' || Date.now() - num(s.updatedAt || s.timestamp) < 24 * HOUR));
    if (!mine.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    el.innerHTML = mine.map(s => `<div class="flex justify-between items-center bg-white rounded-lg border border-red-100 p-2 text-sm">
        <div><span class="inline-block w-2.5 h-2.5 rounded-full ${SOS_BG[s.level] || 'bg-red-600'} mr-1"></span>${sosLevelText(s.level)} <span class="text-xs text-gray-400">· ${fmtTime(s.timestamp)}</span></div>
        ${statusBadge(s.status)}</div>`).join('');
}

let sosFilter = 'active';
function setSosFilter(f) {
    sosFilter = f;
    document.querySelectorAll('.sosf').forEach(b => {
        const on = b.dataset.sosfilter === f;
        b.classList.toggle('bg-gray-800', on); b.classList.toggle('text-white', on);
        b.classList.toggle('bg-gray-100', !on); b.classList.toggle('text-gray-600', !on);
    });
    renderAdminSos();
}
function sosActionButtons(s) {
    const id = escapeHtml(s.id);
    let html = '';
    if (s.status !== 'enroute' && s.status !== 'done') html += `<button onclick="setSosStatus('${id}','enroute')" class="text-xs bg-blue-600 text-white px-2 py-1 rounded" title="รับเรื่อง / ส่งทีม"><i class="fas fa-truck-medical"></i> ส่งทีม</button>`;
    if (s.status !== 'done') html += `<button onclick="setSosStatus('${id}','done')" class="text-xs bg-green-600 text-white px-2 py-1 rounded" title="ช่วยเหลือแล้ว"><i class="fas fa-check"></i> ช่วยแล้ว</button>`;
    else html += `<button onclick="setSosStatus('${id}','new')" class="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded"><i class="fas fa-rotate-left"></i> เปิดเคสใหม่</button>`;
    return html;
}
async function setSosStatus(id, status) {
    try { await window.Cloud.setSosStatus(id, status); } catch (e) { cloudError(e); }
}
function renderAdminSos() {
    const list = document.getElementById('adminSosList'), countEl = document.getElementById('sosCount');
    if (!App.isAdmin) {
        countEl.innerText = '-';
        list.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">เฉพาะบัญชีที่อยู่ใน admins เท่านั้นที่เห็นคำขอ SOS</p>';
        return;
    }
    const all = App.data.sos;
    countEl.innerText = all.filter(s => s.status !== 'done').length;
    const items = all.filter(s => sosFilter === 'all' || (sosFilter === 'done' ? s.status === 'done' : s.status !== 'done'));
    if (!items.length) { list.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">ไม่มีรายการ</p>'; return; }
    const order = { red: 0, yellow: 1, green: 2 }, stOrder = { new: 0, enroute: 1, done: 2 };
    items.sort((a, b) => (stOrder[a.status] ?? 0) - (stOrder[b.status] ?? 0) || (order[a.level] ?? 0) - (order[b.level] ?? 0) || num(b.timestamp) - num(a.timestamp));
    list.innerHTML = items.map(s => `
        <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div class="flex justify-between items-start gap-2">
                <div class="min-w-0 text-xs text-gray-600">
                    <p class="text-sm font-bold text-gray-800"><span class="inline-block w-2.5 h-2.5 rounded-full ${SOS_BG[s.level] || 'bg-red-600'} mr-1"></span>${sosLevelText(s.level)} ${statusBadge(s.status)}</p>
                    <p>${fmtTime(s.timestamp)}${s.people ? ' · ' + num(s.people) + ' คน' : ''}${App.myLoc ? ' · ' + distanceKm(App.myLoc, s).toFixed(1) + ' กม.' : ''}</p>
                    ${s.phone ? `<p><a class="text-blue-600 underline" href="tel:${escapeHtml(s.phone)}"><i class="fas fa-phone"></i> ${escapeHtml(s.phone)}</a></p>` : ''}
                </div>
                <div class="flex gap-1 flex-shrink-0">
                    <button onclick="flyTo(${num(s.lat)},${num(s.lng)})" class="text-blue-600 bg-blue-50 hover:bg-blue-100 p-2 rounded-lg" title="ดูบนแผนที่"><i class="fas fa-map-marker-alt"></i></button>
                    <a href="${directionsUrl(s.lat, s.lng)}" target="_blank" rel="noopener" class="text-green-700 bg-green-50 hover:bg-green-100 p-2 rounded-lg" title="นำทาง"><i class="fas fa-route"></i></a>
                    <button onclick="adminDelete('sos','${escapeHtml(s.id)}')" class="text-gray-400 hover:text-red-500 p-2 rounded-lg" title="ลบถาวร"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="flex gap-1 mt-2">${sosActionButtons(s)}</div>
        </div>`).join('');
}

// ===================== 7. Overview & CSV =====================
function renderOverview() {
    const el = document.getElementById('overviewCards');
    if (!App.isAdmin) { el.innerHTML = '<p class="col-span-full text-sm text-gray-500">เฉพาะแอดมินเท่านั้น</p>'; document.getElementById('sosHourlyChart').innerHTML = ''; return; }
    const now = Date.now();
    const sos = App.data.sos;
    const active = sos.filter(s => s.status !== 'done');
    const byLv = (lv) => active.filter(s => (s.level || 'red') === lv).length;
    const enroute = sos.filter(s => s.status === 'enroute').length;
    const done24 = sos.filter(s => s.status === 'done' && now - num(s.updatedAt) < 24 * HOUR).length;
    const sh = App.data.shelters.filter(s => s.type === 'shelter');
    const shOpen = sh.filter(s => s.open);
    const occ = shOpen.reduce((a, s) => a + num(s.occupancy), 0), cap = shOpen.reduce((a, s) => a + num(s.capacity), 0);
    const flags = diseaseAggregate().flags;
    const card = (title, value, sub, color) => `<div class="p-3 rounded-xl border ${color}"><p class="text-xs font-semibold opacity-80">${title}</p><p class="text-2xl font-bold">${value}</p><p class="text-[11px] opacity-80">${sub}</p></div>`;
    el.innerHTML = [
        card('SOS ที่ยังไม่ปิด', active.length, `แดง ${byLv('red')} · เหลือง ${byLv('yellow')} · เขียว ${byLv('green')}`, 'border-red-200 bg-red-50 text-red-800'),
        card('ทีมกำลังเดินทาง', enroute, `ช่วยแล้ว 24 ชม.: ${done24}`, 'border-blue-200 bg-blue-50 text-blue-800'),
        card('ศูนย์พักพิงเปิด', `${shOpen.length}/${sh.length}`, cap ? `ผู้พักพิง ${occ}/${cap} คน (${Math.round(occ / cap * 100)}%)` : `ผู้พักพิง ${occ} คน`, 'border-green-200 bg-green-50 text-green-800'),
        card('แจ้งว่าปลอดภัย', App.data.checkins.length, `สัญญาณเตือนโรค: ${flags}`, flags ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-gray-200 bg-gray-50 text-gray-700')
    ].join('');

    // กราฟ SOS รายชั่วโมง
    const bins = new Array(24).fill(0);
    sos.forEach(s => { const h = Math.floor((now - num(s.timestamp)) / HOUR); if (h >= 0 && h < 24) bins[23 - h]++; });
    const max = Math.max(1, ...bins);
    document.getElementById('sosHourlyChart').innerHTML = bins.map((c, i) =>
        `<div class="flex-1 bg-red-400 rounded-t" style="height:${Math.max(c ? 6 : 1, c / max * 100)}%;opacity:${c ? 1 : .25}" title="${23 - i} ชม.ที่แล้ว: ${c} รายการ"></div>`).join('');
}

function exportCsv(kind) {
    if (!App.isAdmin) return;
    const iso = (ms) => ms ? new Date(ms).toISOString() : '';
    let rows;
    if (kind === 'sos') rows = [['id', 'เวลาแจ้ง', 'ระดับ', 'สถานะ', 'จำนวนคน', 'เบอร์โทร', 'lat', 'lng', 'อัปเดตล่าสุด'],
        ...App.data.sos.map(s => [s.id, iso(s.timestamp), s.level, s.status || 'new', s.people || 0, s.phone || '', s.lat, s.lng, iso(s.updatedAt)])];
    else if (kind === 'shelters') rows = [['id', 'ชื่อ', 'ประเภท', 'เปิด', 'รองรับ', 'ปัจจุบัน', 'lat', 'lng', 'อัปเดตล่าสุด'],
        ...App.data.shelters.map(s => [s.id, s.name, s.type, s.open ? 'Y' : 'N', s.capacity, s.occupancy, s.lat, s.lng, iso(s.updatedAt)])];
    else if (kind === 'disease') rows = [['id', 'เวลา', 'ศูนย์พักพิง', 'ผู้รายงาน', ...DISEASE_FIELDS.map(f => f.th)],
        ...App.data.disease.map(r => [r.id, iso(r.timestamp), r.shelter, r.reporter || '', ...DISEASE_FIELDS.map(f => num(r[f.key]))])];
    else rows = [['id', 'เวลา', 'ชื่อ', 'พื้นที่', 'ข้อความ'], ...App.data.checkins.map(c => [c.id, iso(c.timestamp), c.name, c.area || '', c.message || ''])];
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `pb287-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ===================== 8. Disease Surveillance =====================
const DISEASE_FIELDS = [
    { key: 'fever', th: 'ไข้', en: 'Fever' },
    { key: 'diarrhea', th: 'อุจจาระร่วง', en: 'Diarrhea' },
    { key: 'respiratory', th: 'ไอ/หวัด/หายใจลำบาก', en: 'Respiratory' },
    { key: 'conjunctivitis', th: 'ตาแดง', en: 'Conjunctivitis' },
    { key: 'skin', th: 'ผื่น/น้ำกัดเท้า/แผลติดเชื้อ', en: 'Skin / wound infection' },
    { key: 'lepto', th: 'ไข้+ปวดน่อง (สงสัยฉี่หนู)', en: 'Fever + calf pain (suspected lepto)' }
];
// เกณฑ์แจ้งเตือนตัวอย่าง (ผู้ป่วยใหม่ต่อศูนย์ ใน 24 ชม.) — ปรับให้เหมาะกับขนาดศูนย์และนโยบายของพื้นที่
const DISEASE_THRESHOLDS = { fever: 5, diarrhea: 3, respiratory: 10, conjunctivitis: 5, skin: 10, lepto: 1 };

function renderDiseaseFields() {
    const el = document.getElementById('drFields');
    const prev = {}; el.querySelectorAll('input').forEach(i => prev[i.id] = i.value);
    el.innerHTML = DISEASE_FIELDS.map(f => `<div>
        <label for="dr_${f.key}" class="block font-medium text-gray-700 mb-1 text-xs">${t(f.th, f.en)}</label>
        <input id="dr_${f.key}" type="number" min="0" max="9999" inputmode="numeric" value="${escapeHtml(prev['dr_' + f.key] || '')}" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="0">
    </div>`).join('');
}
async function submitDiseaseReport() {
    const shelter = document.getElementById('drShelter').value.trim().slice(0, 80);
    if (!shelter) return openModal(t('ข้อมูลไม่ครบ', 'Missing info'), t('กรุณาระบุชื่อศูนย์พักพิง', 'Please enter the shelter name.'), 'fa-exclamation-triangle', 'text-yellow-500', 'bg-yellow-50');
    const report = { shelter, reporter: document.getElementById('drReporter').value.trim().slice(0, 60) };
    let total = 0;
    DISEASE_FIELDS.forEach(f => { const v = Math.min(9999, Math.max(0, parseInt(document.getElementById('dr_' + f.key).value, 10) || 0)); report[f.key] = v; total += v; });
    if (!window.Cloud) return openModal(t('ส่งไม่สำเร็จ', 'Not sent'), t('ยังเชื่อมต่อระบบไม่ได้', 'Not connected to EOC.'), 'fa-times-circle', 'text-red-500', 'bg-red-50');
    const btn = document.getElementById('btnDiseaseReport'); btn.disabled = true;
    try {
        const res = await window.Cloud.addDiseaseReport(report);
        DISEASE_FIELDS.forEach(f => document.getElementById('dr_' + f.key).value = '');
        const warn = DISEASE_FIELDS.filter(f => report[f.key] >= DISEASE_THRESHOLDS[f.key]).map(f => t(f.th, f.en));
        let msg = res && res.queued ? t('จะส่งอัตโนมัติเมื่อมีสัญญาณ', 'Will be sent automatically when online.') : t(`ส่งรายงานแล้ว (รวม ${total} ราย)`, `Report sent (${total} cases).`);
        if (warn.length) msg += '\n\n' + t(`⚠️ เกินเกณฑ์เฝ้าระวัง: ${warn.join(', ')}\nควรแจ้งทีม SRRT / โทร 1422`, `⚠️ Above alert threshold: ${warn.join(', ')}\nNotify the SRRT team / call 1422.`);
        openModal(t('รับรายงานแล้ว', 'Report Received'), msg, warn.length ? 'fa-triangle-exclamation' : 'fa-check-circle', warn.length ? 'text-orange-500' : 'text-green-500', warn.length ? 'bg-orange-50' : 'bg-green-50');
    } catch (e) { cloudError(e); }
    btn.disabled = false;
}
function diseaseAggregate() {
    const since = Date.now() - 24 * HOUR;
    const byShelter = {};
    App.data.disease.filter(r => num(r.timestamp) >= since).forEach(r => {
        const k = (r.shelter || '-').trim();
        byShelter[k] = byShelter[k] || { reports: 0 };
        byShelter[k].reports++;
        DISEASE_FIELDS.forEach(f => byShelter[k][f.key] = (byShelter[k][f.key] || 0) + num(r[f.key]));
    });
    let flags = 0;
    Object.values(byShelter).forEach(row => DISEASE_FIELDS.forEach(f => { if ((row[f.key] || 0) >= DISEASE_THRESHOLDS[f.key]) flags++; }));
    return { byShelter, flags };
}
function renderDiseaseSummary() {
    const el = document.getElementById('diseaseSummary');
    if (!App.isAdmin) { el.innerHTML = '<p class="text-sm text-gray-500">เฉพาะแอดมินเท่านั้น</p>'; return; }
    const { byShelter } = diseaseAggregate();
    const names = Object.keys(byShelter).sort();
    if (!names.length) { el.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">ยังไม่มีรายงานใน 24 ชั่วโมงล่าสุด</p>'; return; }
    const cell = (v, k) => `<td class="px-2 py-1.5 text-center ${v >= DISEASE_THRESHOLDS[k] ? 'bg-red-100 text-red-700 font-bold' : ''}">${v || 0}</td>`;
    el.innerHTML = `<table class="w-full text-xs border border-gray-200">
        <thead class="bg-gray-100"><tr><th class="px-2 py-1.5 text-left">ศูนย์พักพิง</th><th class="px-2 py-1.5">รายงาน</th>${DISEASE_FIELDS.map(f => `<th class="px-2 py-1.5">${f.th}<br><span class="font-normal text-gray-400">เกณฑ์ ${DISEASE_THRESHOLDS[f.key]}</span></th>`).join('')}</tr></thead>
        <tbody>${names.map(n => `<tr class="border-t"><td class="px-2 py-1.5 font-semibold">${escapeHtml(n)}</td><td class="px-2 py-1.5 text-center">${byShelter[n].reports}</td>${DISEASE_FIELDS.map(f => cell(byShelter[n][f.key], f.key)).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

// ===================== 9. Safety Check-in =====================
async function submitCheckin() {
    const name = document.getElementById('ciName').value.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (name.length < 2) return openModal(t('ข้อมูลไม่ครบ', 'Missing info'), t('กรุณาใส่ชื่อ-นามสกุล', 'Please enter your full name.'), 'fa-exclamation-triangle', 'text-yellow-500', 'bg-yellow-50');
    if (!window.Cloud) return openModal(t('ส่งไม่สำเร็จ', 'Not sent'), t('ยังเชื่อมต่อระบบไม่ได้ ลองใหม่อีกครั้ง', 'Not connected yet, please try again.'), 'fa-times-circle', 'text-red-500', 'bg-red-50');
    const area = document.getElementById('ciArea').value.trim().slice(0, 60);
    const message = document.getElementById('ciMsg').value.trim().slice(0, 140);
    const btn = document.getElementById('btnCheckin'); btn.disabled = true;
    try {
        const res = await window.Cloud.addCheckin({ name, area, message });
        const mine = lsGet('ah_my_checkins', []);
        mine.unshift({ id: res.id, name, area, timestamp: Date.now() }); lsSet('ah_my_checkins', mine.slice(0, 5));
        renderMyCheckins();
        openModal(t('แจ้งว่าปลอดภัยแล้ว', 'Marked Safe'), res.queued ? t('จะส่งอัตโนมัติเมื่อมีสัญญาณ', 'Will be sent automatically when online.') : t('ญาติสามารถค้นหาชื่อคุณได้แล้ว', 'Your family can now find your name.'), 'fa-user-check', 'text-green-500', 'bg-green-50');
    } catch (e) { cloudError(e); }
    btn.disabled = false;
}
function renderMyCheckins() {
    const mine = lsGet('ah_my_checkins', []);
    document.getElementById('myCheckins').innerHTML = mine.map(c => `<div class="flex justify-between items-center text-xs bg-green-50 border border-green-100 rounded-lg p-2">
        <span><i class="fas fa-check text-green-600 mr-1"></i>${escapeHtml(c.name)}${c.area ? ' · ' + escapeHtml(c.area) : ''} · ${fmtTime(c.timestamp)}</span>
        <button onclick="removeCheckin('${escapeHtml(c.id)}')" class="text-gray-400 hover:text-red-500" title="${t('ลบ', 'Remove')}"><i class="fas fa-trash"></i></button></div>`).join('');
}
async function removeCheckin(id) {
    try { if (window.Cloud) await window.Cloud.deleteCheckin(id); } catch (e) { console.warn(e); }
    lsSet('ah_my_checkins', lsGet('ah_my_checkins', []).filter(c => c.id !== id));
    renderMyCheckins();
}
async function searchCheckins() {
    const q = document.getElementById('ciSearch').value.trim().replace(/\s+/g, ' ');
    const el = document.getElementById('ciResults');
    if (q.length < 2) { el.innerHTML = `<p class="text-gray-400">${t('พิมพ์อย่างน้อย 2 ตัวอักษร', 'Type at least 2 characters.')}</p>`; return; }
    if (!window.Cloud) { el.innerHTML = `<p class="text-red-500">${t('ยังเชื่อมต่อระบบไม่ได้', 'Not connected.')}</p>`; return; }
    el.innerHTML = '<p class="text-gray-400"><i class="fas fa-spinner fa-spin"></i></p>';
    try {
        const results = await window.Cloud.searchCheckins(q);
        if (!results.length) { el.innerHTML = `<p class="text-gray-500">${t('ไม่พบชื่อนี้', 'No match found.')}</p>`; return; }
        el.innerHTML = results.map(c => `<div class="p-3 rounded-lg border border-green-200 bg-green-50">
            <p class="font-bold text-green-800"><i class="fas fa-user-check mr-1"></i> ${escapeHtml(c.name)}</p>
            <p class="text-xs text-gray-600">${c.area ? escapeHtml(c.area) + ' · ' : ''}${fmtTime(c.timestamp)}</p>
            ${c.message ? `<p class="text-sm text-gray-700 mt-1">"${escapeHtml(c.message)}"</p>` : ''}</div>`).join('');
    } catch (e) { console.error(e); el.innerHTML = `<p class="text-red-500">${t('ค้นหาไม่สำเร็จ', 'Search failed.')}</p>`; }
}

// ===================== 10. Mental Health Self-Check (ST-5 & 2Q) =====================
const ST5 = [
    { th: 'มีปัญหาการนอน นอนไม่หลับ หรือนอนมาก', en: 'Sleep problems: insomnia or oversleeping' },
    { th: 'มีสมาธิน้อยลง', en: 'Reduced concentration' },
    { th: 'หงุดหงิด กระวนกระวาย หรือว้าวุ่นใจ', en: 'Irritable, restless or agitated' },
    { th: 'รู้สึกเบื่อ เซ็ง', en: 'Feeling bored or fed up' },
    { th: 'ไม่อยากพบปะผู้คน', en: "Not wanting to meet people" }
];
const ST5_OPTS = [{ th: 'แทบไม่มี', en: 'Rarely' }, { th: 'เป็นบางครั้ง', en: 'Sometimes' }, { th: 'บ่อยครั้ง', en: 'Often' }, { th: 'เป็นประจำ', en: 'Always' }];
const Q2 = [
    { th: 'ท่านรู้สึก หดหู่ เศร้า หรือท้อแท้สิ้นหวัง หรือไม่', en: 'Have you felt down, depressed or hopeless?' },
    { th: 'ท่านรู้สึก เบื่อ ทำอะไรก็ไม่เพลิดเพลิน หรือไม่', en: 'Have you had little interest or pleasure in doing things?' }
];
function renderMentalQuestions() {
    const keep = {}; document.querySelectorAll('#st5Questions input:checked, #q2Questions input:checked').forEach(i => keep[i.name] = i.value);
    const opt = (name, value, label) => `<label class="q-opt cursor-pointer"><input type="radio" class="sr-only" name="${name}" value="${value}" ${keep[name] === String(value) ? 'checked' : ''}><span class="inline-block px-3 py-1.5 border border-gray-300 rounded-full text-xs font-semibold text-gray-600 hover:border-purple-400">${label}</span></label>`;
    document.getElementById('st5Questions').innerHTML = ST5.map((q, i) => `<div><p class="text-sm text-gray-800 mb-2">${i + 1}. ${t(q.th, q.en)}</p><div class="flex flex-wrap gap-2">${ST5_OPTS.map((o, v) => opt('st5_' + i, v, `${t(o.th, o.en)} (${v})`)).join('')}</div></div>`).join('');
    document.getElementById('q2Questions').innerHTML = Q2.map((q, i) => `<div><p class="text-sm text-gray-800 mb-2">${i + 1}. ${t(q.th, q.en)}</p><div class="flex gap-2">${opt('q2_' + i, 1, t('มี', 'Yes'))}${opt('q2_' + i, 0, t('ไม่มี', 'No'))}</div></div>`).join('');
}
function evaluateMental() {
    const get = (n) => { const el = document.querySelector(`input[name="${n}"]:checked`); return el ? Number(el.value) : null; };
    const st = ST5.map((_, i) => get('st5_' + i)), q2 = Q2.map((_, i) => get('q2_' + i));
    if (st.includes(null) || q2.includes(null)) return openModal(t('ตอบยังไม่ครบ', 'Incomplete'), t('กรุณาตอบให้ครบทุกข้อ', 'Please answer every question.'), 'fa-exclamation-triangle', 'text-yellow-500', 'bg-yellow-50');
    const score = st.reduce((a, b) => a + b, 0);
    const lv = score <= 4 ? 0 : score <= 7 ? 1 : score <= 9 ? 2 : 3;
    const levels = [
        { th: 'เครียดน้อย', en: 'Low stress', cls: 'border-green-200 bg-green-50 text-green-800', adv: { th: 'ความเครียดอยู่ในระดับที่จัดการได้ ดูแลตัวเองต่อไป พักผ่อนให้พอ และพูดคุยกับคนใกล้ชิด', en: 'Your stress is manageable. Keep resting well and stay connected with people close to you.' } },
        { th: 'เครียดปานกลาง', en: 'Moderate stress', cls: 'border-yellow-200 bg-yellow-50 text-yellow-800', adv: { th: 'ลองผ่อนคลาย เช่น หายใจช้าๆ ลึกๆ ออกกำลังกายเบาๆ พูดคุยระบายกับคนที่ไว้ใจ และจำกัดการเสพข่าวภัยพิบัติ', en: 'Try slow deep breathing, light exercise, talking with someone you trust, and limit disaster news.' } },
        { th: 'เครียดมาก', en: 'High stress', cls: 'border-orange-200 bg-orange-50 text-orange-800', adv: { th: 'ควรได้รับคำปรึกษา พูดคุยกับเจ้าหน้าที่สาธารณสุขในศูนย์พักพิง หรือโทรสายด่วนสุขภาพจิต 1323 (ฟรี 24 ชม.)', en: 'Please talk to a health worker at your shelter or call the mental health hotline 1323 (free, 24h).' } },
        { th: 'เครียดมากที่สุด', en: 'Very high stress', cls: 'border-red-200 bg-red-50 text-red-800', adv: { th: 'ควรพบผู้เชี่ยวชาญโดยเร็ว โทรสายด่วนสุขภาพจิต 1323 (ฟรี 24 ชม.) หรือแจ้งเจ้าหน้าที่สาธารณสุขในศูนย์พักพิง', en: 'Please seek professional help soon: call 1323 (free, 24h) or tell a health worker at your shelter.' } }
    ];
    const L2 = levels[lv];
    const dep = q2.some(v => v === 1);
    const urgent = lv >= 2 || dep;
    const el = document.getElementById('mentalResult');
    el.className = `mt-6 rounded-xl p-5 border ${L2.cls}`;
    el.innerHTML = `<p class="text-sm font-semibold opacity-80">ST-5</p>
        <p class="text-2xl font-bold mb-1">${score}/15 — ${t(L2.th, L2.en)}</p>
        <p class="text-sm mb-4">${t(L2.adv.th, L2.adv.en)}</p>
        <p class="text-sm font-semibold opacity-80">2Q</p>
        <p class="text-sm mb-1 font-bold">${dep ? t('มีความเสี่ยงหรือมีแนวโน้มเป็นโรคซึมเศร้า', 'At risk of depression') : t('ไม่พบความเสี่ยงซึมเศร้า', 'No depression risk detected')}</p>
        <p class="text-sm">${dep ? t('แนะนำให้ประเมินต่อด้วยแบบประเมิน 9Q กับเจ้าหน้าที่สาธารณสุข หรือปรึกษาสายด่วน 1323', 'We recommend a follow-up 9Q assessment with a health worker, or calling 1323.') : t('หากอาการเปลี่ยนไป สามารถประเมินซ้ำได้ทุกเมื่อ', 'You can repeat this check any time.')}</p>
        ${urgent ? `<a href="tel:1323" class="mt-4 inline-flex items-center gap-2 bg-purple-600 text-white font-bold px-4 py-2 rounded-lg"><i class="fas fa-phone"></i> ${t('โทร 1323 สายด่วนสุขภาพจิต', 'Call 1323 Mental Health Hotline')}</a>` : ''}
        <p class="text-[11px] mt-4 opacity-70">${t('ผลนี้เป็นการคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัย — ที่มา: กรมสุขภาพจิต กระทรวงสาธารณสุข', 'Screening only, not a diagnosis — Source: Department of Mental Health, MOPH Thailand')}</p>`;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===================== 11. Checklist =====================
const checklistIds = ['chk-med', 'chk-firstaid', 'chk-mask', 'chk-whistle', 'chk-doc', 'chk-water', 'chk-power'];
function initChecklist() {
    checklistIds.forEach(id => { const cb = document.getElementById(id); cb.checked = localStorage.getItem('ah_' + id) === 'true'; updateLabelStyle(cb); });
    updateProgress();
}
function saveChecklist() {
    checklistIds.forEach(id => { const cb = document.getElementById(id); try { localStorage.setItem('ah_' + id, cb.checked); } catch (e) {} updateLabelStyle(cb); });
    updateProgress();
}
function updateLabelStyle(cb) {
    const label = cb.nextElementSibling.querySelector('.chk-label');
    label.classList.toggle('line-through', cb.checked); label.classList.toggle('text-gray-400', cb.checked); label.classList.toggle('text-gray-800', !cb.checked);
}
function updateProgress() {
    const count = checklistIds.filter(id => document.getElementById(id).checked).length;
    document.getElementById('progress-bar').style.width = (count / checklistIds.length * 100) + '%';
    return count;
}
function evaluateChecklist() {
    const count = updateProgress();
    if (count === checklistIds.length) openModal(t('พร้อมรับมือ!', 'Ready!'), t('คุณเตรียมกระเป๋าฉุกเฉินครบ 100% (Go Bag)', 'You are 100% prepared.'), 'fa-check-circle', 'text-green-500', 'bg-green-50');
    else openModal(t('ยังไม่ครบถ้วน', 'Incomplete'), t(`เตรียมอุปกรณ์ไปแล้ว ${count}/${checklistIds.length} รายการ`, `Prepared ${count}/${checklistIds.length} items.`), 'fa-exclamation-triangle', 'text-yellow-500', 'bg-yellow-50');
}

// ===================== 12. Modal & Admin helpers =====================
function openModal(title, message, iconClass, iconColor, iconBg) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = message;
    document.getElementById('modalIcon').className = `fas ${iconClass} ${iconColor} text-2xl`;
    document.getElementById('modalIconContainer').className = `mx-auto flex items-center justify-center h-14 w-14 rounded-full ${iconBg} mb-4`;
    document.getElementById('customModal').classList.remove('hidden');
}
function closeModal() { document.getElementById('customModal').classList.add('hidden'); }
function cloudError(e) {
    console.error(e);
    const msg = e && e.code === 'permission-denied' ? t('ไม่มีสิทธิ์ทำรายการนี้', 'You do not have permission for this action.') : (e && e.message) || String(e);
    openModal(t('ทำรายการไม่สำเร็จ', 'Action Failed'), msg, 'fa-times-circle', 'text-red-500', 'bg-red-50');
}
// ลบแบบกดสองครั้งยืนยัน (ไม่ใช้ confirm() ของเบราว์เซอร์)
let pendingDelete = { key: null, at: 0 };
async function adminDelete(kind, id) {
    if (!App.isAdmin || !window.Cloud) return;
    const key = kind + '/' + id, now = Date.now();
    if (pendingDelete.key !== key || now - pendingDelete.at > 3000) {
        pendingDelete = { key, at: now };
        return openModal('ยืนยันการลบ', 'กดปุ่มลบอีกครั้งภายใน 3 วินาทีเพื่อยืนยัน (ลบแล้วกู้คืนไม่ได้)', 'fa-trash', 'text-red-500', 'bg-red-50');
    }
    pendingDelete = { key: null, at: 0 };
    try { await window.Cloud.remove(kind, id); } catch (e) { cloudError(e); }
}

// ===================== 13. Render dispatcher =====================
function renderAll(key) {
    const all = !key;
    if (all || ['obstacles', 'sos', 'shelters'].includes(key)) renderMap();
    if (all || key === 'shelters') { renderShelterList(); renderAdminShelters(); }
    if (all || key === 'sos') { renderMySos(); renderAdminSos(); }
    if (all || key === 'disease') renderDiseaseSummary();
    renderOverview();
    if (all) renderMyCheckins();
}

// ===================== 14. PWA: Service Worker, Install, Offline =====================
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; document.getElementById('btnInstall').classList.remove('hidden'); });
window.addEventListener('appinstalled', () => document.getElementById('btnInstall').classList.add('hidden'));
async function installApp() {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => {});
    deferredInstall = null; document.getElementById('btnInstall').classList.add('hidden');
}
function updateOnlineBanner() { document.getElementById('offlineBanner').classList.toggle('hidden', navigator.onLine); }
window.addEventListener('online', updateOnlineBanner);
window.addEventListener('offline', updateOnlineBanner);
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW:', e)));
}

// ===================== 15. Keyboard =====================
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = (id) => !document.getElementById(id).classList.contains('hidden');
    if (open('customModal')) return closeModal();
    if (open('sosModal')) return cancelSos();
    if (open('shelterModal')) return closeShelterModal();
    if (open('adminLoginModal')) return window.closeAdminLogin && window.closeAdminLogin();
    if (open('adminDashboardModal')) return closeAdminDashboard();
    if (mapMode) setMode(null);
});
function closeAdminDashboard() { document.getElementById('adminDashboardModal').classList.add('hidden'); }
function openAdminDashboard() { document.getElementById('adminDashboardModal').classList.remove('hidden'); renderAll(); }

// ===================== Boot =====================
try { isEnMode = localStorage.getItem('ah_lang') === 'en'; } catch (e) {}
initChecklist();
initMap();
applyLanguage();
updateOnlineBanner();
