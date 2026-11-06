<div align="center">

<img src="../public/favicon.svg" width="72" height="72" alt="">

# FluxBio

**一個連結 通往你做的每件事**

開源的 Link in bio＋短網址，整套跑在你自己的 Cloudflare 帳號上，用免費方案就夠了。

<a href="../README.md"><kbd>&nbsp;English&nbsp;</kbd></a>
<a href="README.zh-TW.md"><kbd>&nbsp;<b>繁體中文</b>&nbsp;</kbd></a>
<a href="README.zh-CN.md"><kbd>&nbsp;简体中文&nbsp;</kbd></a>
<a href="README.ja.md"><kbd>&nbsp;日本語&nbsp;</kbd></a>
<a href="README.ko.md"><kbd>&nbsp;한국어&nbsp;</kbd></a>
<a href="README.es.md"><kbd>&nbsp;Español&nbsp;</kbd></a>
<a href="README.pt-BR.md"><kbd>&nbsp;Português&nbsp;</kbd></a>
<a href="README.fr.md"><kbd>&nbsp;Français&nbsp;</kbd></a>
<a href="README.de.md"><kbd>&nbsp;Deutsch&nbsp;</kbd></a>
<a href="README.id.md"><kbd>&nbsp;Bahasa Indonesia&nbsp;</kbd></a>
<a href="README.th.md"><kbd>&nbsp;ไทย&nbsp;</kbd></a>
<a href="README.vi.md"><kbd>&nbsp;Tiếng Việt&nbsp;</kbd></a>
<a href="README.ar.md"><kbd>&nbsp;العربية&nbsp;</kbd></a>

[介紹頁](https://fluxbio.link) · [自己架一個](#自己架一個) · [給 AI agent 的指引](../AGENTS.md)

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](../LICENSE)
[![Runs on Cloudflare Workers](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

</div>

<br>

**TL;DR**

- 一個工具同時做 Link in bio 頁面和短網址，還看得到點擊數據。
- 跑在你自己的 Cloudflare 帳號，免費方案就夠用，資料都在你手上。
- [把一段話貼給 AI](#自己架一個)，它會幫你架好。之後在後台改，或直接跟 AI 說就好。

<img src="https://fluxbio.link/zh-TW/dash-links.webp" alt="FluxBio 後台：一邊編輯 bio 頁，一邊看即時預覽">

照你的風格做幾個 bio 頁：選一種主題和配色，或請 AI 用你的圖片做一套，還能放影片、商品和營業時間。頁面上每個連結也都有短網址，可以看到每個連結的點擊，以及來自 IG、Threads 還是 LINE。

## 功能

### 交給 AI 管理

- 在「設定」產生一個 API token，把畫面上的提示貼給 Claude Code、Codex 或 Cursor，之後用說的就能改頁面、做短網址、看數據、換網域和時區。
- 每個 FluxBio 都附上給 AI 的說明（`/llms.txt`、`/skill.md`）和 API 規格（`/api/openapi.json`）。AI 會在發布、刪除、改網址這類動作前提醒你風險，也會給建議。

### bio 頁

- 一個 FluxBio 可以管理多個頁面，每頁有自己的網址、主題和數據。
- 24 種主題，各有自己的版面和幾組配色：霓虹、全景、方塊、糖果、留白、極光、卡片、霧面、晚霞、晴空、繽紛、肖像、半版、側欄、雙色、浮雕、便當、圓鈕、粉彩、信箋、曜石、滿月、標籤、歌單。
- 只想要短網址？在後台把頁面功能關掉：公開頁面下線，短網址照常轉址，資料都留著。
- 不想要連結頁？任何一頁都可以改成自己的 HTML，或轉址到其他網址，也都能當首頁。
- 字型：主題的字型從 Google Fonts 載入，不佔你的額度。外觀頁有一個開關，可以改從你自己的網站載入，訪客就不會連到 Google（適合有歐盟訪客的人）。想用 Google Fonts 的其他字型，跟你的 AI 說；用量見常見問題。
- 自己的主題：請 AI 用你的顏色、字型、封面圖和背景圖做一套；別人分享的[主題檔](../themes/)也交給 AI 套用。
- 內容區塊：連結、標題、影片（YouTube／Vimeo）、圖片輪播、商品卡、營業時間與地圖。
- 連結可以設精選、隱藏，或排程上下架。
- 範本：創作者、小店、活動報名、專業人士、社團組織，一鍵開始。
- 貼到 LINE、Facebook 時的預覽圖，會依主題自動產生。這張圖在後台發布時產生；AI 也可以改用頁面的截圖。
- 右下角可以放一顆 LINE 按鈕，訪客一點就能加你的 LINE。

### 短網址

- bio 頁上的每個連結發布後自動變成短網址，也能單獨建立；一次建很多個、各平台帶 UTM，交給 AI。頁面上的按鈕預設顯示原始網址；聯盟行銷這類不想露出網址的連結，一個開關就能改用短網址。
- 網址後面的代稱可以用中文。
- QR Code 可以換顏色、點的形狀、中間圖示、外框文字，下載 PNG／SVG／PDF。
- 開放時間、到期日、密碼保護、UTM。
- 智慧導向：LINE 裡改用外部瀏覽器開、IG／FB 內建瀏覽器先顯示跳出提示、iPhone 和 Android 各自導向。

### 數據

- 瀏覽、點擊、點擊率、來源：精確計數（D1），每天的數字保留 13 個月，之後留每月總數。
- 不重複訪客、地區、訪客地圖、電信商、裝置、瀏覽器、語言、外部網站、UTM、點擊時段、最近活動：保留 90 天（Cloudflare Analytics Engine，免設定）。
- 和上一期比較、每個短網址自己的數據頁、匯出 CSV。
- 不用 cookie、不存 IP、不存完整的瀏覽器字串，位置只記到城市；不重複訪客用的是每天更換的單向雜湊。機器人也不算進去。

<table>
  <tr>
    <td width="50%"><img src="https://fluxbio.link/zh-TW/dash-stats.webp" alt="數據：近 30 天的瀏覽、點擊、點擊率和不重複訪客"></td>
    <td width="50%"><img src="https://fluxbio.link/zh-TW/dash-qr.webp" alt="為短網址設計 QR Code"></td>
  </tr>
  <tr>
    <td align="center"><sub>數據，和上一期比較</sub></td>
    <td align="center"><sub>每個短網址都有 QR Code</sub></td>
  </tr>
</table>

### 語言與架設

- **13 種語言**：後台和公開頁都有繁中、简中、English、日本語、한국어、Español、Português、Français、Deutsch、Bahasa Indonesia、ไทย、Tiếng Việt、العربية。公開頁用你選的一種語言，也可以再開放幾種，瀏覽器設成那些語言的訪客會自動看到對應的語言。你寫的內容也可以請 AI 翻譯成那些語言。
- **公開頁幾乎沒有 JavaScript**：純 HTML，在 Cloudflare 邊緣直接輸出，很快。只有一小段程式負責計算點擊，沒有它頁面也正常。影片和地圖要等訪客點了才載入。
- **自己架**：只用 Cloudflare 的 Workers、D1、KV、Analytics Engine，全部免手動設定，不用另外申請第三方服務（字型預設從 Google Fonts 載入，可以關掉）。請 AI 把所有內容整包匯出、匯入，就能備份或搬到另一個 FluxBio。

## 自己架一個

需要的工具 AI 會幫你裝。試用只要有 Claude Code，放上網時再準備免費的 Cloudflare 帳號。自己動手的話，需要 Node.js（22.23+、24.22+ 或 26.12+）和 pnpm。

### 最簡單：交給 AI

貼給你的 AI。推薦用電腦上的 [Claude Code](https://code.claude.com/docs/en/quickstart)；Codex、OpenCode、Cursor 等能執行指令又能連網的也可以：

```text
照 https://github.com/0t2/flux-bio 的 AGENTS.md 幫我試用 FluxBio。
頁面語言用繁體中文（zh-TW）。
```

它會先問你要不要在電腦上做一個展示頁看看，不用申請帳號。滿意了再請你登入 Cloudflare 放上網，最後把自己接上來管理網站。你說可以才會公開，之後想改什麼直接跟它說就好。網頁版的 ChatGPT、Claude 做不到，因為它們不能在你的電腦上執行指令。

> [!NOTE]
> 過程中會請你同意幾次：AI 執行指令（下載程式碼、安裝套件、部署）前會先問你，登入 Cloudflare 要你在瀏覽器按允許，最後把 token 存進你的電腦之前也會再問一次。看清楚每一步在做什麼，再按允許。

### 自己動手

```sh
git clone https://github.com/0t2/flux-bio.git
cd flux-bio
pnpm install
pnpm exec cf auth login          # 第一次要登入 Cloudflare

# 產生後台密碼（ADMIN_PASSWORD，至少 12 個字元），然後部署
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)" > .secrets.env
pnpm exec cf deploy --secrets-file .secrets.env
cat .secrets.env && rm .secrets.env   # 把密碼存好
```

部署完成後打開 `https://<你的網址>/admin/`，用密碼登入。首次設定會帶你建立第一個頁面，再到「設定」接上你的 AI；之後網域、時區、備份、改密碼都可以直接跟它說。第一次部署會自動建立 D1 資料庫和 KV。

## 看訪客從哪裡來

FluxBio 不用 cookie 就能記下每次造訪從哪裡來。在「數據」頁，「來源平台」列出每個平台有多少人打開你的 bio 頁、之後點了多少連結；「UTM 活動」再依連結上的標籤細分。

### 自動認得的

- **App 內建瀏覽器**：Instagram、Threads、Facebook（含 Messenger）、LINE、X、TikTok、微信、微博、KakaoTalk、NAVER、Zalo、Snapchat、Pinterest、LinkedIn。
- **連過來的網站**：X（t.co）、YouTube、Reddit，Google、Bing、Yahoo、百度等搜尋引擎，以及其他任何網站（顯示網域）。
- FluxBio 產生的 **QR Code** 會自動帶 `?s=qr`。
- bio 頁上的連結會帶著訪客的來源，所以點擊會算在訪客原本來自的平台。

### 要自己標的

有些地方不會透露訪客從哪來，這些造訪會算成「直接／其他」：

- WhatsApp、Telegram、Discord、iMessage 和簡訊
- Email、電子報、PDF
- 海報、名片等印刷品（請用 FluxBio 產生的 QR Code）

在分享出去的網址後面加上 `?s=` 和名稱，例如 `https://links.example.com/?s=whatsapp`；短網址則是 `https://links.example.com/talk?s=email`。也可以用簡寫：`ig`、`fb`、`x`、`th`、`wa`、`tg`、`mail`、`qr`。有標 `?s=` 時，會優先採用你標的來源。

### 同一個平台的不同位置：`utm_content`

IG 個人簡介、限動和貼文都算 Instagram。想比較它們，就給每個位置一個自己的網址：

- IG 個人簡介：`https://links.example.com/?utm_content=bio`
- 限動：`https://links.example.com/?utm_content=story`

它們在「UTM 活動」各佔一列，瀏覽和點擊分開計；訪客在 bio 頁上點連結時，也會帶著這個標籤。短網址也能設定 `utm_source`、`utm_medium`、`utm_campaign` 和 `utm_content`（「短網址」頁的「進階設定」），點擊時會加到目的地網址上，所以對方網站也看得到。

> [!TIP]
> 或者直接跟 AI 說：「幫我做 IG 個人簡介、限動、貼文各一個追蹤網址」。

### 注意事項

- 看得到訪客從哪來，看不到是誰。IG、FB、X 不會把點連結的帳號告訴其他網站，FluxBio 也不存能認出個人的資料。
- `?s=` 的名稱只能用英文字母、數字、`-` 和 `_`，會轉成小寫，其他字元（包括中文）會被去掉。UTM 標籤則照原樣記錄，`story` 和 `Story` 會算成兩列，每次請用同樣的寫法。
- 地點是 Cloudflare 依訪客 IP 推算的城市。用 VPN、iCloud 私密轉送或公司網路的人，可能會顯示在別的地方。
- 瀏覽、點擊和來源是精確數字。每天的數字保留 13 個月，之後每月留一個總數，一直保存；在設定頁可以全部下載。地區、地圖、電信商、裝置、語言和 UTM 細項保留 90 天，新的造訪約一分鐘後出現。社群圖示要不要一起算，可以自己選。顯示原始網址的按鈕靠頁面上一小段程式回報點擊，被攔截時可能算不到；走短網址的都算得到。
- 不重複訪客以天計算：同一個人隔天再來，或先用手機再用電腦，都會算兩次。
- 機器人和連結預覽（有人把連結貼進聊天 App 時，App 抓取預覽的那一次）不算，所以數字可能比其他工具少。
- 短網址的 UTM 標籤只會加在主要目的地，不會加到另外設定的 iPhone／Android 網址，也不會蓋掉目的地原有的標籤。修改標籤只影響之後的點擊。
- App 是靠內建瀏覽器的自我標示來辨認的。如果 App 改了標示，在 FluxBio 更新之前，它的造訪可能會算成「直接／其他」。

## 常見問題

<details>
<summary><b>要錢嗎？</b></summary>

FluxBio 免費、開源，跑在你自己的 Cloudflare 帳號。Cloudflare 的免費方案每天大約夠一萬到幾萬次頁面瀏覽（看頁面上的圖片多少）和幾百次修改，個人和小店通常用不完。Claude、ChatGPT 這類 AI 的訂閱費另計，Claude Code 需要 Claude 的付費方案。

</details>

<details>
<summary><b>可以先試用，不申請 Cloudflare 帳號嗎？</b></summary>

可以。AI 會在你的電腦上做一個展示頁，不用任何帳號。這個網址只有你的電腦開得到，不能傳給朋友看，電腦重開後要請 AI 重新打開，資料還在。滿意了再申請免費的 Cloudflare 帳號放上網，做好的頁面會一起搬過去；不想用了，請 AI 刪掉資料夾就好。

</details>

<details>
<summary><b>不想用 Link in bio 可以嗎？</b></summary>

可以。任何一頁都能改成自己的 HTML，或轉址到其他網址，也都能當首頁；請 AI 改，或到該頁的「內容」選。也可以關掉頁面功能，只用短網址。

</details>

<details>
<summary><b>免費額度用完會怎樣？會被收費嗎？</b></summary>

不會收費，免費方案不用綁卡。當天額度用完時，訪客會暫時看到錯誤，到早上 8 點（台灣時間）重新計算。如果 AI 裝在你的電腦上，可以問它今天還剩多少。

</details>

<details>
<summary><b>AI 一直問能不能執行，要按什麼？</b></summary>

這是正常的，AI 在你的電腦上做事之前都會先問。如果是下載 FluxBio、安裝工具或部署，按允許就好；看不懂它要做什麼，就先請它解釋。

</details>

<details>
<summary><b>關掉電腦後網站還在嗎？明天要改怎麼辦？</b></summary>

放上網之後就還在。網站放在 Cloudflare，不在你的電腦上。要改的時候，打開 AI 工具，直接說你想改什麼就好，例如「把我的 YouTube 頻道加到 FluxBio 頁面」。Claude Code 會記得你的網站；其他工具要把「設定」裡的提示再貼一次。

</details>

<details>
<summary><b>一定要有自己的網域嗎？</b></summary>

不用。部署好就有一個免費的 workers.dev 網址可以用，不會過期，只是比較長。之後如果有放在 Cloudflare 的網域，隨時可以接上，已經分享出去的連結也還能用。

</details>

<details>
<summary><b>試完不想用了怎麼辦？</b></summary>

可以直接放著，不用錢。想全部刪掉，跟 AI 說「幫我把 FluxBio 全部刪掉」，它會問你要不要留備份，確認後才刪除。

</details>

<details>
<summary><b>可以用其他字型嗎？</b></summary>

每個主題都有自己的字型。想用 Google Fonts 的其他字型，跟你的 AI 說就好，例如「把標題換成 Playfair Display」：它會找字型、說明用量，再幫你發布。字型預設從 Google Fonts 載入，不佔你的額度，但訪客的瀏覽器會連到 Google；德國法院在 2022 年判決，依 GDPR 這需要訪客同意。如果你有歐盟的訪客，到外觀頁打開「字型從你的網站載入」：發布時只把頁面用到的字複製到你自己的 Worker，每個字型檔對每位新訪客算一次請求和一次 KV 讀取（頁面的內建字型就有兩、三個檔案）。大部分頁面的額度都綽綽有餘；流量大的頁面多加字型會比較快碰到每日上限，所以建議頂多再加一套，用在標題。如果你用 Claude Code 這類能改程式的 AI 管理 FluxBio 的程式碼，它還能進一步降低用量（做法寫在 AGENTS.md）。

</details>

<details>
<summary><b>資料存在哪？</b></summary>

全部在你的 Cloudflare 帳號：頁面、短網址和數據在 D1，圖片在 KV。沒有中央伺服器，作者看不到你的資料。已發布的頁面和短網址是公開的；草稿只有你和拿到預覽連結的人看得到，數據和後台要登入才看得到。

</details>

<details>
<summary><b>後台密碼、API token、Cloudflare 金鑰有什麼不同？</b></summary>

**後台密碼**是你登入後台用的，部署時會自動產生，之後隨時可以改。**API token** 是給 AI 和工具用的：每個 AI 各開一把，可以只給「建立短網址」的權限，也能單獨撤銷，不會影響其他 AI。**Cloudflare 金鑰**只用在部署、接網域這類要到 Cloudflare 才能做的事，管的是整個 Cloudflare 帳號，不要貼進聊天視窗。

</details>

<details>
<summary><b>token 外洩了怎麼辦？</b></summary>

在「設定」撤銷那一把再開新的。後台密碼外洩的話，請 AI 幫你改密碼；改完所有人都要重新登入，所有 token 也會失效。

</details>

<details>
<summary><b>AI 改錯了怎麼辦？</b></summary>

頁面的修改都先存成草稿，發布後訪客才看得到；設定和獨立短網址則會馬上生效。FluxBio 給 AI 的指南會要它先說明影響並問你、問你要直接發布還是先看預覽，也要在動手前先備份。做錯了可以還原頁面最近 20 次發布的版本，或從備份還原。沒有讀指南的工具不會照做，所以完整權限只給你信任的 AI。

</details>

<details>
<summary><b>沒有 AI 也能用嗎？</b></summary>

可以。編頁面、外觀、短網址、QR Code、數據和下載備份都在後台。網域、時區這些設定，還有自己的顏色和圖片，都沒有畫面，要用 API 改，說明在每個 FluxBio 的 `/llms.txt`。

</details>

<details>
<summary><b>支援哪些 AI？</b></summary>

部署：推薦用你電腦上的 Claude Code；其他能執行指令又能連網的程式開發工具也可以，例如 Codex、OpenCode、Cursor、Cline、Roo Code、Kilo Code、Droid、Crush、Goose、Pi、TRAE、Qoder、ZCode、Eigent、Gemini CLI、GitHub Copilot、Windsurf。日常管理：除了上面這些，能呼叫 API 的工具也可以，例如 Claude App、Claude Cowork、ChatGPT（自訂 GPT）、n8n。後台「設定」有提示可以貼給 Claude Code、Codex 或 Cursor，其他工具請它讀你網站的 /llms.txt。

</details>

<details>
<summary><b>怎麼換網域、改密碼、搬家？</b></summary>

直接跟 AI 說：「把網域換成 links.example.com」、「幫我改後台密碼」、「把網站搬到另一個 FluxBio」。網域要先在 Cloudflare 接到你的 FluxBio，AI 會一步步帶你做。

</details>

<details>
<summary><b>會追蹤訪客嗎？</b></summary>

FluxBio 不用 cookie，也不存 IP 和完整的瀏覽器字串。每次造訪會留下時間、來源、裝置、瀏覽器、語言、網路業者和大略位置（最細約 10 公里），保留 90 天，並附上每天更換的單向雜湊；加總的次數則會一直留著。已知的機器人和連結預覽不算進去。有兩件事會連到 Google：字型預設從 Google Fonts 載入，可以在「外觀」關掉；有 YouTube 影片的頁面，縮圖也從那裡載入。

</details>

## 開發

```sh
cp .dev.vars.example .dev.vars   # 設定本機的 ADMIN_PASSWORD
pnpm dev                         # http://localhost:5173 ，後台在 /admin/
pnpm test                        # 在 Workers runtime 裡跑測試
pnpm typecheck
```

架構、目錄結構和開發規範都在 [AGENTS.md](../AGENTS.md)。

技術：Cloudflare Workers、D1、KV、Analytics Engine、Hono、React 19、Vite，以及 [`cf` CLI](https://www.npmjs.com/package/cf)。

## 授權

- 主程式：[AGPL-3.0-only](../LICENSE)。可以自由自架和修改；拿去提供公開服務時，修改過的原始碼也要公開。
- `src/templates/`（公開頁的主題和渲染器）和 `themes/`（主題配色）：[MIT](../src/templates/LICENSE)，方便重用。
