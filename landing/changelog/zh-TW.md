# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, you take `main`. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`, so after updating read the releases above that one. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.1 - 2026-11-20

### 新功能
- 儀表板的「設定」頁會告訴你 FluxBio 有沒有新版，有安全性修正時會先講，並附上一句可以直接對 AI 說的更新指令。只有打開這一頁時才會問 GitHub；網站已是最新版時，頁尾的版號旁會寫出來。 [#48](https://github.com/0t2/flux-bio/pull/48)

## 0.4.0 - 2026-11-20

### 需要處理
- 如果你改過 `cloudflare.config.ts`（換了 `WORKER_NAME`、加了自訂網域，或拿掉 `ANALYTICS`），部署這一版之前，請把那些設定寫進 FluxBio 資料夾裡的 `worker.json`，例如 `{ "name": "my-links" }`。這個檔案不屬於程式碼，之後更新都不會動到它。忘了寫的話，部署會停下來，告訴你該寫哪個名稱。 [#45](https://github.com/0t2/flux-bio/pull/45)

### 新功能
- `pnpm run deploy` 上傳前會先問 Cloudflare 現在跑的是什麼；會多出一個空網站、讓你的某個網站斷線、蓋掉別的 Worker 或換掉密碼的部署，都會被擋下來。請用它取代 `cf deploy`。 [#45](https://github.com/0t2/flux-bio/pull/45)
- `pnpm reset-password` 會設一組新的管理密碼，並替每個網站建立新的 API token，兩者都不會顯示在畫面上。登入頁的「忘記密碼？」現在給的就是這個指令。 [#45](https://github.com/0t2/flux-bio/pull/45)

## 0.3.2 - 2026-11-20

### 新功能
- 用來部署的資料夾不見了（被刪掉，或留在另一台電腦上），你的 AI 可以把它重建回來：網站指南的 `/api/guide/rebuild` 有完整步驟，裡面寫著你的 Worker 名稱。這段期間網站照常運作，網站上的內容一樣都不會少。 [#44](https://github.com/0t2/flux-bio/pull/44)

## 0.3.1 - 2026-11-20

### 新功能
- `GET /api/update` 會回報 FluxBio 有沒有新版：你的網站落後幾個版本，其中有沒有安全性修正或「需要處理」的事項。它只在被問到時才從 GitHub 讀這份更新紀錄。你的 AI 每次對話會問一次，有安全性修正在等的時候會先告訴你。 [#43](https://github.com/0t2/flux-bio/pull/43)

## 0.3.0 - 2026-11-19

### 新功能
- 每次發布都有版號了。網站執行的版本寫在 `GET /api/state` 的 `version` 和 `/llms.txt` 的開頭，這裡每個標題就是一個版本。看數字就知道更新要做什麼：中間的數字變了（0.3.4 到 0.4.0）代表有「需要處理」的事項，只有最後一個數字變的話，重新部署就好。還顯示 0.2.1 的網站是這一版之前的，請依上次更新的日期往上讀。 [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### 新功能
- 這份更新紀錄也刊載於 fluxbio.link。 [fluxbio.link](https://fluxbio.link/en/changelog/)

## 2026-11-11

### 需要處理
- 請更新並重新部署以取得下方的連結密碼修正；網站其他部分不會改變。 [#38](https://github.com/0t2/flux-bio/pull/38)

### 安全性
- 頁面連結密碼曾可被略過：追蹤網址會回傳真正網址。若按鈕透過短網址導向（例如使用密碼、隱藏網址、裝置網址或 UTM 標籤），現在不會再提供該網址，也不會在此計數。 `/_c/<handle>/<id>/link` [#38](https://github.com/0t2/flux-bio/pull/38)

### 修正
- 在 Chromium 中，正確的連結密碼過去無法抵達目的地。 [#38](https://github.com/0t2/flux-bio/pull/38)
- 發布時不再遺失點擊後輸入的內容，發布期間的自動儲存也不會再遭拒。 [#38](https://github.com/0t2/flux-bio/pull/38)
- 後台每個設定開關現在只送出變更項目；以前切換開關可能覆蓋 AI 後來設定的值，包括網域與時區。 [#38](https://github.com/0t2/flux-bio/pull/38)
- 若 KV 拒絕刪除，清除網站可能留下沒有資料表的資料庫；KV 金鑰超過 5,000 個時也曾提前停止並誤報完成。 [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### 變更
- 設定開關現在稱為「僅短網址」，開啟代表關閉個人簡介頁。舊名稱以個人簡介頁命名，說明卻描述關閉時的效果，讓僅使用短網址的網站擁有者看反了。 [#37](https://github.com/0t2/flux-bio/pull/37)

### 修正
- 開發伺服器曾因設定檔匯入 Worker 也會匯入的模組而無法啟動。 `pnpm dev` `cloudflare.config.ts` [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### 需要處理
- 若以部署命令將圖片作為靜態檔案提供，請部署此版本後再執行一次：現在會透過新的媒體 API 讀取各網站圖片，並據此重建套件。 `pnpm deploy:images` `GET /api/media/{id}` [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07) [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### 安全性
- 自訂網域檢查現在綁定被查詢的主機名稱，因此對一個主機名稱的檢查結果不能冒用到另一個名稱。 [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- 同一 Worker 有多個網站時，各網站的靜態圖片現在放在各自資料夾，每個網站只會取得自己的媒體路徑；以前所有網站共用同一資料夾。 `/media/<id>` [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### 新功能
- 媒體 API 會把圖片目前的位元組提供給權杖，用於備份及圖片部署工具。 `GET /api/media/{id}` `pnpm deploy:images` [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### 變更
- 圖片部署工具現在每次都下載全部圖片，因為上傳或還原可能覆寫 ID；下載前也會確認讀取的是哪個網站及模式。 `pnpm deploy:images` [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- AI 操作指南現在會透過媒體 API 備份到不會覆寫的快照資料夾，並按明確順序建立第一個頁面。 `GET /api/media/{id}` [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### 需要處理
- 若資料庫最後由當日指定提交之前的版本開啟，請先部署合併前最後一版並開啟網站一次，再部署本版本。遷移已合併成一項；少於十項舊遷移的資料庫現在會被視為最新，因而漏掉欄位與索引。新安裝及版本為 10 的資料庫不受影響。 `7b0bad4` `8d0c435` `SELECT value FROM _meta WHERE key = 'schema_version'` [#27](https://github.com/0t2/flux-bio/pull/27)
- 安裝請使用指定的最低 pnpm 版本。專案現在指定較新的版本；舊版會因無法切換 pnpm 而停止。安裝器會替換舊版，步驟也已更新；pnpm 設定現在位於工作區設定檔。 `package.json` `AGENTS.md` `pnpm runtime set node 24 --global` `bin` `pnpm-workspace.yaml` [#19](https://github.com/0t2/flux-bio/pull/19)

### 安全性
- 連結頁面現在只會從網站本身載入圖片（含有影片頁面的 YouTube 縮圖），以前任何 HTTPS 網址都能載入。 [#32](https://github.com/0t2/flux-bio/pull/32)
- 頁面自訂 CSS 現在會先依瀏覽器規則讀取後才接受，而且只能載入網站自己的圖片。 [#32](https://github.com/0t2/flux-bio/pull/32)

### 新功能
- 單一 Worker 現在可容納多個網站，各自擁有資料庫、KV、統計、設定與網域，並列在網站設定檔中。沒有該檔案時，Worker 仍如以往只代表一個網站。 `sites.json` [#23](https://github.com/0t2/flux-bio/pull/23)
- 嵌入區塊可在點擊後於頁面上開啟 Ko-fi 或 Calendly 面板，也可使用各自的浮動按鈕；點擊前不會載入這些服務。 [#28](https://github.com/0t2/flux-bio/pull/28)
- 擁有者可讓 AI 為連結頁設定自己的 CSS，讓「把頁面做得像這張圖片」時仍保留連結頁。 `appearance.css` [#32](https://github.com/0t2/flux-bio/pull/32)
- 頁面背景現在可按指定尺寸重複顯示，適合製作圖樣。 `appearance.bgTile` [#29](https://github.com/0t2/flux-bio/pull/29)
- 社群圖示可放在連結後面；名稱也能隱藏，同時保留為頁面標題。 `appearance.socialPlace` `appearance.showName` [#33](https://github.com/0t2/flux-bio/pull/33)
- 現在可以列出並刪除沒有使用的圖片。 `GET` `DELETE /api/media/unused` [#8](https://github.com/0t2/flux-bio/pull/8)
- 設定頁現在顯示方案、資料庫大小及當日免費額度用量；用量工具可直接從帳號讀取這些資訊。 `pnpm usage` [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7) [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- 每日統計保留 13 個月，之後合併為每月一筆；所有計數都能下載為 CSV。 [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- 圖片部署工具可將網站圖片作為靜態檔案提供，不會耗用 Worker 請求或 KV 讀取。 `pnpm deploy:images` [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- 新增可提交新增區塊需求的表單。 [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link 現在提供流量與費用估算器。 [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### 變更
- 頁面或短網址不再有數量上限：訪客與擁有者等待的流程都不會讀取整張資料表，後台則每次載入一個畫面份量的短網址。 [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- 執行成本降低：頁面瀏覽只需一次 KV 讀取；互不依賴的 D1 查詢會一起執行；後台向 Worker 請求的資料變少；每次頁面瀏覽的 CPU 用量約降至三分之一。 [#6](https://github.com/0t2/flux-bio/pull/6) [#7](https://github.com/0t2/flux-bio/pull/7) [#17](https://github.com/0t2/flux-bio/pull/17) [#18](https://github.com/0t2/flux-bio/pull/18)
- 頁面與後台預覽現在只向 Google 要求實際顯示字元所需的中文字型，不再下載整套字型。 [#9](https://github.com/0t2/flux-bio/pull/9) [#13](https://github.com/0t2/flux-bio/pull/13)
- 讀取舊資料格式的相容程式碼已移除，包括舊設定與頁面格式、舊備份、管理員權杖、舊縮網址頁面及舊後台網址。 `ADMIN_TOKEN` `/shorten` [#27](https://github.com/0t2/flux-bio/pull/27)
- 安裝 FluxBio 的提示現在會先下載程式碼，再要求代理讀取該資料夾中的代理指南；共提供 13 種語言。 `AGENTS.md` [#21](https://github.com/0t2/flux-bio/pull/21)
- AI 操作指南現在分成精簡主指南及按需讀取的主題，並說明主題如何為按鈕配色、載入字型及建立圖樣。 [#30](https://github.com/0t2/flux-bio/pull/30) [#34](https://github.com/0t2/flux-bio/pull/34)
- GitHub Actions 只有在此儲存庫且設定了網站時才會部署 FluxBio；複製品不會觸發部署。 [#14](https://github.com/0t2/flux-bio/pull/14)

### 修正
- 儲存自訂網域過去會對所有待確認網域回傳 522。 [#35](https://github.com/0t2/flux-bio/pull/35)
- 在自訂 CSS 功能出現前發布的頁面，過去會回傳 500，直到再次發布。 `appearance.css` [#32](https://github.com/0t2/flux-bio/pull/32)
- 後台現在不會在每次載入時都於瀏覽器主控台產生 CSP 違規。 [#20](https://github.com/0t2/flux-bio/pull/20)
- 修正 AI 根據截圖重建頁面的問題：包含網址上的 CSS 屬性選擇器、主題 API 中封面與背景圖片使用空值，以及社群主題 API 以擁有者語言回傳主題名稱。 `null` `POST /api/themes` `GET /api/themes/community?lang=` [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### 新功能
- 首次公開版本：由擁有者的 AI 操作，在單一 Cloudflare Worker 上提供個人簡介頁、短網址及點擊追蹤。 [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)
