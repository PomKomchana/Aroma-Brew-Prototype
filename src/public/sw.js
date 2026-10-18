// Service worker: เก็บ "เปลือกแอป" (index.html + ไฟล์ JS/CSS) ไว้ เพื่อให้เปิด/รีเฟรชหน้า POS ตอนออฟไลน์ได้ [NFR-04]
// ไม่แตะคำขอไป Supabase (คนละ origin) ข้อมูลเมนูใช้สำเนาใน localStorage (src/lib/menu.ts)
const CACHE = 'aroma-brew-shell-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/index.html'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // เปิดหน้าเว็บ: ลองเครือข่ายก่อน (ได้เวอร์ชันใหม่) ถ้าไม่ได้ใช้ index.html ที่เก็บไว้
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  // ไฟล์ asset (ชื่อมี hash ไม่เปลี่ยนเนื้อหา): ใช้ของที่เก็บไว้ก่อน
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
