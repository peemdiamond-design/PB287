# PB287 — All-Hazards Emergency Portal

เว็บไซต์ต้นแบบ (Academic Prototype) รายวิชา สธ 287 (PB287) — ระบบ EOC ศูนย์รับมือภัยพิบัติ สำหรับประชาชนและเจ้าหน้าที่

🌐 **เว็บไซต์:** https://pb287.peemcn25.dev

## ฟีเจอร์

**สำหรับประชาชน**
- 🗺️ แผนที่แจ้งภัย (Leaflet + OpenStreetMap) — แจ้งจุดสิ่งกีดขวาง/เส้นทางขาด ที่ทุกคนเห็นร่วมกันแบบ real-time
- 🆘 แจ้งพิกัด SOS พร้อมคัดแยกระดับ (Triage แดง/เหลือง/เขียว) จำนวนคน และเบอร์ติดต่อกลับ — ส่งตรงถึงเจ้าหน้าที่ EOC
- 📍 ปุ่ม "ตำแหน่งฉัน" ใช้ GPS ระบุตำแหน่ง และค้นหาโรงพยาบาล/ศูนย์พักพิงที่ใกล้ที่สุด
- 📖 คู่มือเอาชีวิตรอด 4 ภัยหลัก (น้ำท่วม, แผ่นดินไหว, อัคคีภัย/สารเคมี, โรคระบาด)
- 🎒 Checklist กระเป๋าฉุกเฉิน 72 ชั่วโมง (บันทึกในเครื่อง)
- ☎️ เบอร์โทรฉุกเฉิน กดโทรได้ทันที (1669, 1784, 199, 191, 1323, 1422)
- 🧠 การปฐมพยาบาลทางใจ (PFA: Look-Listen-Link) และอนามัยสิ่งแวดล้อม 3 ระยะ (WASH)
- 🌏 สลับภาษาไทย / English (จำค่าไว้ในเครื่อง)

**สำหรับเจ้าหน้าที่ EOC (แอดมิน)**
- ส่ง/ลบประกาศแจ้งเตือนภัย แสดงบนแถบวิ่งด้านบนทุกหน้าจอแบบ real-time
- ดูรายการคำขอ SOS ทั้งหมด เรียงตามความรุนแรง — ดูบนแผนที่, นำทาง, โทรกลับ, ปิดเคส
- ลบจุดสิ่งกีดขวางที่แก้ไขแล้ว

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้าเว็บทั้งหมด (Tailwind CDN + Leaflet + Firebase SDK) |
| `firestore.rules` | กฎความปลอดภัยของฐานข้อมูล Firestore |
| `firebase.json`, `.firebaserc` | ตั้งค่าสำหรับ deploy rules ด้วย Firebase CLI |
| `CNAME` | โดเมนสำหรับ GitHub Pages |
| `Photo/` | รูปภาพ (ตรากระทรวงสาธารณสุข) |

## การ Deploy

หน้าเว็บโฮสต์บน **GitHub Pages** — push ขึ้น `main` แล้วเว็บอัปเดตเอง

### ตั้งค่า Firebase (ทำครั้งเดียว)

1. **เปิด Authentication** ที่ Firebase Console → Authentication → Sign-in method → เปิด **Anonymous** และ **Email/Password**
2. **Deploy Firestore Rules** (สำคัญมาก — ถ้าไม่ทำ ใครก็เขียนข้อมูลได้)
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules
   ```
   หรือคัดลอกเนื้อหา `firestore.rules` ไปวางใน Console → Firestore Database → Rules แล้วกด Publish
3. **เพิ่มแอดมิน**: ให้เจ้าหน้าที่สมัครบัญชีผ่านหน้าเว็บ (ไอคอนแม่กุญแจ → สมัครสมาชิก) จากนั้น
   - ไปที่ Console → Authentication → Users คัดลอก **User UID**
   - ไปที่ Firestore → สร้าง collection `admins` → Document ID = UID นั้น → ใส่ field อะไรก็ได้ เช่น `email: "..."`
   - ให้เจ้าหน้าที่รีเฟรชหน้าเว็บ จะเห็นป้าย "สิทธิ์ EOC Admin" ใน Dashboard
4. **(แนะนำ)** Console → Authentication → Settings → Authorized domains เพิ่ม `pb287.peemcn25.dev`

### โครงสร้างข้อมูล Firestore

```
admins/{uid}                                   ← รายชื่อแอดมิน (เพิ่มเองผ่าน Console)
artifacts/pb287_portal/public/data/alerts/     ← { text, severity, timestamp }
artifacts/pb287_portal/public/data/obstacles/  ← { lat, lng, uid, timestamp }
artifacts/pb287_portal/public/data/sos/        ← { lat, lng, level, people, phone, uid, timestamp }
```

## หมายเหตุด้านความปลอดภัย

- Firebase Web config (apiKey ฯลฯ) ใน `index.html` **ไม่ใช่ความลับ** — ความปลอดภัยจริงอยู่ที่ `firestore.rules`
- รหัสยืนยันเจ้าหน้าที่ตอนสมัครเป็นเพียงด่านแรกฝั่งหน้าเว็บ (ใครเปิดดู source ก็เห็น) สิทธิ์จริงคุมด้วย collection `admins`
- ข้อมูล SOS (พิกัด + เบอร์โทร) อ่านได้เฉพาะแอดมินและผู้แจ้งเอง
- ข้อความประกาศทุกข้อความถูก escape ก่อนแสดงผล ป้องกัน XSS

## ทดสอบในเครื่อง

```bash
python3 -m http.server 8000
# เปิด http://localhost:8000
```
(ต้องเปิดผ่าน http server เพราะใช้ ES modules; GPS ทำงานบน `localhost` หรือ `https` เท่านั้น)

---
เว็บไซต์ต้นแบบเพื่อการศึกษา — ในเหตุฉุกเฉินจริงโทร **1669**
