# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, you take `main`. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`, so after updating read the releases above that one. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.3.0 - 2026-11-19

### ใหม่
- ตอนนี้แต่ละรุ่นมีเลขเวอร์ชันแล้ว เว็บไซต์บอกเวอร์ชันที่ใช้อยู่ใน `version` ของ `GET /api/state` และที่ต้นไฟล์ `/llms.txt` และหัวข้อแต่ละอันในหน้านี้คือหนึ่งเวอร์ชัน ตัวเลขบอกว่าการอัปเดตต้องทำอะไรบ้าง: ถ้าเลขตัวกลางเปลี่ยน (0.3.4 เป็น 0.4.0) จะมีรายการ “ต้องดำเนินการ” ถ้าเปลี่ยนแค่เลขตัวท้าย แค่ดีพลอยก็พอ เว็บไซต์ที่ยังแสดง 0.2.1 เป็นรุ่นก่อนหน้านี้ ให้ดูจากวันที่อัปเดตครั้งล่าสุดแทน [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### ใหม่
- บันทึกการเปลี่ยนแปลงนี้ ที่นี่ และที่ [fluxbio.link](https://fluxbio.link/en/changelog/)

## 2026-11-11

### ต้องดำเนินการ
- อัปเดตและปรับใช้อีกครั้งเพื่อรับการแก้ไขรหัสผ่านลิงก์ด้านล่าง ไม่มีอะไรอื่นเกี่ยวกับไซต์ของคุณเปลี่ยนแปลง [#38](https://github.com/0t2/flux-bio/pull/38)

### ความปลอดภัย
- รหัสผ่านบนลิงก์ของหน้าสามารถข้ามได้: ที่อยู่ `/_c/<handle>/<id>/link` ของหน้าตอบด้วยที่อยู่จริงของลิงก์ ลิงก์ที่มีปุ่มผ่านลิงก์แบบสั้น (รหัสผ่าน ที่อยู่ที่ซ่อนอยู่ ที่อยู่อุปกรณ์ แท็ก UTM) จะไม่ถูกแจกหรือนับที่นั่นอีกต่อไป [#38](https://github.com/0t2/flux-bio/pull/38)

### แก้ไข
- รหัสผ่านลิงก์ที่ถูกต้องไม่เคยไปถึงปลายทางใน Chromium [#38](https://github.com/0t2/flux-bio/pull/38)
- การเผยแพร่จะไม่ทำให้สิ่งที่พิมพ์หลังจากการคลิกลดลงอีกต่อไป และการบันทึกอัตโนมัติระหว่างการเผยแพร่จะไม่ถูกปฏิเสธอีกต่อไป [#38](https://github.com/0t2/flux-bio/pull/38)
- สวิตช์การตั้งค่าแต่ละรายการในแดชบอร์ดจะส่งเฉพาะสิ่งที่เปลี่ยนแปลงเท่านั้น ก่อนหน้านี้ การสลับอาจยกเลิกสิ่งที่ AI ของเจ้าของตั้งค่าไว้ รวมถึงโดเมนและเขตเวลาด้วย [#38](https://github.com/0t2/flux-bio/pull/38)
- การล้างข้อมูลไซต์อาจทำให้ฐานข้อมูลไม่มีตารางเมื่อ KV ปฏิเสธที่จะลบ และเกิน 5,000 KV คีย์ก็หยุดและบอกว่าเสร็จสิ้นแล้ว [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### เปลี่ยนแปลง
- สวิตช์การตั้งค่ามีชื่อว่าลิงก์แบบสั้นเท่านั้น และเปิดหมายความว่าหน้าชีวประวัติปิดอยู่ มันถูกตั้งชื่อตามหน้าชีวประวัติ แต่อธิบายว่าการปิดมันทำอะไร ดังนั้นเจ้าของไซต์ที่มีลิงก์สั้นเท่านั้นจึงอ่านย้อนหลังได้ [#37](https://github.com/0t2/flux-bio/pull/37)

### แก้ไข
- `pnpm dev` ไม่สามารถเริ่มต้นได้เนื่องจาก `cloudflare.config.ts` นำเข้าโมดูลที่ผู้ปฏิบัติงานนำเข้าด้วย [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### ต้องดำเนินการ
- หากคุณจัดส่งรูปภาพของคุณเป็นไฟล์คงที่ด้วย `pnpm deploy:images` ให้ปรับใช้เวอร์ชันนี้แล้วรันอีกครั้ง: ตอนนี้จะอ่านรูปภาพของแต่ละไซต์ผ่าน `GET /api/media/{id}` ใหม่ และสร้างชุดรวมจากเวอร์ชันเหล่านั้นขึ้นมาใหม่ [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07), [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### ความปลอดภัย
- การตรวจสอบโดเมนแบบกำหนดเองจะผูกไว้กับชื่อโฮสต์ที่ถูกถาม ดังนั้นการตรวจสอบที่ตอบสำหรับชื่อโฮสต์หนึ่งจะไม่สามารถส่งต่อไปยังอีกชื่อหนึ่งได้ [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- สำหรับผู้ปฏิบัติงานที่ถือมากกว่าหนึ่งไซต์ รูปภาพของแต่ละไซต์ที่จัดส่งเป็นไฟล์คงที่ขณะนี้อยู่ในโฟลเดอร์ของไซต์นั้น และไซต์จะให้บริการเฉพาะของตนเองที่ `/media/<id>` ก่อนหน้านี้ ทุกไซต์แชร์โฟลเดอร์เดียว [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### ใหม่
- `GET /api/media/{id}` มอบไบต์ปัจจุบันของรูปภาพให้กับโทเค็น สำหรับการสำรองข้อมูล และสำหรับ `pnpm deploy:images` [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### เปลี่ยนแปลง
- `pnpm deploy:images` ดาวน์โหลดทุกภาพในแต่ละรอบ เนื่องจากการอัปโหลดหรือการกู้คืนสามารถเขียนทับ ID และตรวจสอบว่าไซต์ใดและโหมดใดที่อ่านก่อนที่จะดาวน์โหลด [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- คำแนะนำที่ AI ของเจ้าของอ่านจะสำรองข้อมูลด้วย `GET /api/media/{id}` ลงในโฟลเดอร์สแน็ปช็อตซึ่งจะไม่เขียนทับ และตั้งค่าหน้าแรกตามลำดับที่กำหนดไว้ [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### ต้องดำเนินการ
- หากฐานข้อมูลของคุณถูกเปิดครั้งล่าสุดโดยบิลด์ก่อน `7b0bad4` ของวันนี้ ให้ปรับใช้บิลด์ก่อนสควอช (`8d0c435`) ก่อนแล้วเปิดไซต์หนึ่งครั้ง จากนั้นจึงปรับใช้บิลด์นี้ การย้ายข้อมูลถูกบีบอัดเป็นหนึ่งเดียว และฐานข้อมูลที่ใช้งานน้อยกว่าสิบรายการจากฐานข้อมูลเก่า (`SELECT value FROM _meta WHERE key = 'schema_version'` ต่ำกว่า 10) จะได้รับการปฏิบัติให้เป็นข้อมูลล่าสุด ดังนั้นจึงอาจพลาดคอลัมน์และดัชนี การติดตั้งใหม่และฐานข้อมูลที่ 10 จะไม่ได้รับผลกระทบ [#27](https://github.com/0t2/flux-bio/pull/27)
- ใช้ pnpm 10.34.5 หรือใหม่กว่าในการติดตั้ง ขณะนี้โปรเจ็กต์ตั้งชื่อ pnpm 12.18.0 เป็น `package.json` และ pnpm เก่ากว่านั้นหยุดด้วยข้อความ "Failed to switch pnpm" โปรแกรมติดตั้งใน `AGENTS.md` จะแทนที่ และขั้นตอนของโปรแกรมเปลี่ยนไป (`pnpm runtime set node 24 --global`, `bin` ในโฟลเดอร์ pnpm) การตั้งค่าของ pnpm ขณะนี้อยู่ที่ `pnpm-workspace.yaml` [#19](https://github.com/0t2/flux-bio/pull/19)

### ความปลอดภัย
- หน้าของลิงก์จะโหลดรูปภาพจากไซต์เท่านั้น (รวมถึงภาพขนาดย่อของ YouTube บนหน้าเว็บที่มีวิดีโอ) ซึ่งโหลดจากที่อยู่ https ใด ๆ [#32](https://github.com/0t2/flux-bio/pull/32)
- CSS ของเพจจะถูกอ่านในขณะที่เบราว์เซอร์อ่านก่อนที่จะได้รับการยอมรับ และอาจโหลดเฉพาะรูปภาพของไซต์เองเท่านั้น [#32](https://github.com/0t2/flux-bio/pull/32)

### ใหม่
- ไซต์หลายแห่งใน Worker เดียว โดยแต่ละไซต์มีฐานข้อมูล KV สถิติ การตั้งค่า และโดเมนของตัวเอง ซึ่งแสดงอยู่ใน `sites.json` หากไม่มีไฟล์นั้น Worker ก็เป็นเพียงไซต์เดียวเหมือนเมื่อก่อน [#23](https://github.com/0t2/flux-bio/pull/23)
- ฝังบล็อกที่เปิดแผงของ Ko-fi หรือ Calendly บนหน้าด้วยการแตะ และปุ่มลอยสำหรับทั้งสองอย่าง ไม่มีอะไรโหลดจากพวกเขาก่อนที่จะแตะ [#28](https://github.com/0t2/flux-bio/pull/28)
- AI ของเจ้าของสามารถให้หน้าลิงก์ CSS ของตัวเองได้ (`appearance.css`) ดังนั้น "ทำให้หน้าของฉันดูเหมือนภาพนี้" จะเก็บหน้าของลิงก์ไว้ [#32](https://github.com/0t2/flux-bio/pull/32)
- พื้นหลังของหน้าสามารถทำซ้ำตามขนาดที่กำหนด สำหรับรูปแบบ (`appearance.bgTile`) [#29](https://github.com/0t2/flux-bio/pull/29)
- ไอคอนโซเชียลสามารถตามลิงก์ได้ (`appearance.socialPlace`) และสามารถซ่อนชื่อได้แต่เก็บไว้เป็นส่วนหัวของหน้า (`appearance.showName`) [#33](https://github.com/0t2/flux-bio/pull/33)
- รูปภาพที่ไม่มีการใช้สามารถแสดงรายการและลบได้: `GET` และ `DELETE /api/media/unused` [#8](https://github.com/0t2/flux-bio/pull/8)
- การตั้งค่าจะแสดงแผน ขนาดของฐานข้อมูล และการใช้โควต้าฟรีในแต่ละวัน และ `pnpm usage` อ่านจากบัญชี [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7), [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- สถิติรายวันจะถูกเก็บไว้เป็นเวลา 13 เดือน จากนั้นจะรวมเป็นหนึ่งแถวต่อเดือน และสามารถดาวน์โหลดทุกจำนวนเป็น CSV ได้ [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` จัดส่งรูปภาพของไซต์เป็นไฟล์คงที่ ซึ่งไม่ต้องเสียค่าใช้จ่ายในการร้องขอของผู้ปฏิบัติงานหรือการอ่าน KV [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- แบบฟอร์มแจ้งขอบล็อกใหม่ [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link มีเครื่องมือประมาณปริมาณการเข้าชมและต้นทุน [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### เปลี่ยนแปลง
- ไม่จำกัดหน้าหรือลิงก์สั้น: ผู้เยี่ยมชมหรือเจ้าของไม่ต้องรออ่านทั้งตาราง และแดชบอร์ดจะโหลดลิงก์สั้นแบบเต็มหน้าจอในแต่ละครั้ง [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- เรียกใช้ถูกกว่า: การดูหน้าเว็บใช้เวลาอ่าน KV หนึ่งครั้ง การสืบค้น D1 ที่ไม่ขึ้นอยู่กับแต่ละสิ่งมารวมกัน แดชบอร์ดจะขอเงินจากผู้ปฏิบัติงานน้อยลง และการดูหน้าเว็บใช้เวลาประมาณหนึ่งในสามของ CPU [#6](https://github.com/0t2/flux-bio/pull/6), [#7](https://github.com/0t2/flux-bio/pull/7), [#17](https://github.com/0t2/flux-bio/pull/17), [#18](https://github.com/0t2/flux-bio/pull/18)
- การแสดงตัวอย่างหน้าเว็บและแดชบอร์ดจะขอให้ Google ระบุแบบอักษรภาษาจีนโดยแสดงเฉพาะอักขระเท่านั้น ไม่ใช่แบบอักษรทั้งหมด [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- โค้ดที่อ่านข้อมูลที่บันทึกในรูปทรงเก่าหายไปแล้ว: การตั้งค่าและรูปร่างหน้าเก่า ไฟล์สำรองเก่า `ADMIN_TOKEN` หน้า `/shorten` และที่อยู่แดชบอร์ดเก่า [#27](https://github.com/0t2/flux-bio/pull/27)
- ข้อความแจ้งให้ติดตั้ง FluxBio จะดาวน์โหลดโค้ดก่อนและให้ตัวแทนอ่าน `AGENTS.md` จากโฟลเดอร์ในทั้งหมด 13 ภาษา [#21](https://github.com/0t2/flux-bio/pull/21)
- คำแนะนำที่ AI ของเจ้าของอ่านจะแบ่งออกเป็นคำแนะนำหลักสั้นๆ และหัวข้อที่อ่านเมื่อจำเป็น และบอกว่าแต่ละธีมมีสีปุ่มอย่างไร โหลดแบบอักษรอย่างไร และวิธีสร้างรูปแบบ [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- การปรับใช้จาก GitHub Actions ของไซต์ FluxBio จะเกิดขึ้นเฉพาะในที่เก็บนี้และเมื่อตั้งชื่อไซต์เท่านั้น สำเนาไม่ได้ปรับใช้อะไรเลย [#14](https://github.com/0t2/flux-bio/pull/14)

### แก้ไข
- การบันทึกโดเมนที่กำหนดเองล้มเหลวด้วย 522 สำหรับทุกโดเมนที่ต้องการยืนยัน [#35](https://github.com/0t2/flux-bio/pull/35)
- หน้าที่เผยแพร่ก่อน `appearance.css` มีคำตอบ 500 จนกว่าจะมีการเผยแพร่อีกครั้ง [#32](https://github.com/0t2/flux-bio/pull/32)
- แดชบอร์ดไม่ทำให้เกิดการละเมิด CSP ในคอนโซลของเบราว์เซอร์ในทุกการโหลดอีกต่อไป [#20](https://github.com/0t2/flux-bio/pull/20)
- การแก้ไขสำหรับ AI ที่สร้างหน้าใหม่จากภาพหน้าจอ: ตัวเลือกแอตทริบิวต์ CSS บนที่อยู่, `null` สำหรับภาพหน้าปกและพื้นหลังใน `POST /api/themes` และชื่อธีมในภาษาของเจ้าของจาก `GET /api/themes/community?lang=` [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### ใหม่
- การเปิดตัวสู่สาธารณะครั้งแรก: ลิงก์ในประวัติ ลิงก์แบบสั้น และการติดตามการคลิกบน Cloudflare Worker หนึ่งเครื่อง ดำเนินการโดย AI ของเจ้าของ [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

