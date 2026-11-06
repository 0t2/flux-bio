<div align="center">

<img src="../public/favicon.svg" width="72" height="72" alt="">

# FluxBio

**一个链接 通往你做的每件事**

开源的 Link in bio＋短链接，整套运行在你自己的 Cloudflare 账号上，用免费套餐就够了。

<a href="../README.md"><kbd>&nbsp;English&nbsp;</kbd></a>
<a href="README.zh-TW.md"><kbd>&nbsp;繁體中文&nbsp;</kbd></a>
<a href="README.zh-CN.md"><kbd>&nbsp;<b>简体中文</b>&nbsp;</kbd></a>
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

[介绍页](https://fluxbio.link) · [自己部署一个](#自己部署一个) · [给 AI agent 的指南](../AGENTS.md)

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](../LICENSE)
[![Runs on Cloudflare Workers](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

</div>

<br>

**TL;DR**

- 一个工具同时搞定 Link in bio 页面和短链接，还能看点击数据。
- 运行在你自己的 Cloudflare 账号上，免费方案就够用，数据都在你手里。
- [把一段话贴给 AI](#自己部署一个)，它会帮你部署好。之后在后台修改，或者直接告诉 AI 就行。

<img src="https://fluxbio.link/zh-CN/dash-links.webp" alt="FluxBio 后台：一边编辑 bio 页，一边看实时预览">

做几个符合你风格的 bio 页：选一种主题和配色，或让 AI 用你的图片做一套，还能放视频、商品和营业时间。页面上的每个链接也都有短链接，可以看到每个链接的点击，以及来自 IG、Threads 还是 LINE。

## 功能

### 交给 AI 管理

- 在“设置”生成一个 API token，把页面上的提示粘贴给 Claude Code、Codex 或 Cursor，之后用说的就能改页面、做短链接、看数据、换域名和时区。
- 每个部署都附带给 AI 的说明（`/llms.txt`、`/skill.md`）和 API 规范（`/api/openapi.json`）。AI 会在发布、删除、改网址这类操作之前提醒你风险，也会给出建议。

### bio 页

- 一个部署可以管理多个页面，每个页面都有自己的地址、主题和数据。
- 24 种主题，各有自己的版面和几组配色：霓虹、全景、方块、糖果、留白、极光、卡片、雾面、晚霞、晴空、缤纷、肖像、半版、侧栏、双色、浮雕、便当、圆钮、粉彩、信笺、曜石、满月、标签、歌单。
- 只想要短链接？在后台把页面功能关掉：公开页面下线，短链接照常跳转，数据都留着。
- 不想要链接页？任何一页都可以改成自己的 HTML，或跳转到其他网址，也都能当首页。
- 字体：主题的字体从 Google Fonts 加载，不占你的额度。外观页有一个开关，可以改从你自己的 Worker 加载，访客就不会连到 Google（适合有欧盟访客的人）。想用 Google Fonts 的其他字体，跟你的 AI 说；用量见常见问题。
- 自己的主题：让 AI 用你的颜色、字体、封面图和背景图做一套；别人分享的[主题文件](../themes/)也交给 AI 套用。
- 内容区块：链接、标题、视频（YouTube／Vimeo）、图片轮播、商品卡片、营业时间与地图。
- 链接可以设为精选、隐藏，或定时上下线。
- 模板：创作者、小店、活动报名、专业人士、社团组织，一键开始。
- 分享到 LINE、Facebook 时的预览图，会根据主题自动生成。这张图在后台发布时生成；AI 也可以改用页面的截图。
- 右下角可以放一个 LINE 按钮，访客一点就能加你的 LINE。

### 短链接

- bio 页上的每个链接发布后会自动变成短链接，也能单独创建；要一次创建很多个、为各平台加上 UTM，就交给 AI。页面上的按钮默认显示原始网址；联盟营销这类不想露出网址的链接，一个开关就能改用短链接。
- 后缀可以用中文。
- 二维码可以换颜色、点的形状、中间图标和边框文字，支持下载 PNG／SVG／PDF。
- 开放时间、到期日、密码保护、UTM。
- 智能跳转：在 LINE 中改用外部浏览器打开，在 IG／FB 内置浏览器中先显示跳转提示，iPhone 和 Android 分别跳转到不同地址。

### 数据

- 浏览、点击、点击率、来源：精确计数（D1），每天的数字保留 13 个月，之后留每月总数。
- 独立访客、地区、访客地图、运营商、设备、浏览器、语言、外部网站、UTM、点击时段、最近活动：保留 90 天（Cloudflare Analytics Engine，无需配置）。
- 与上一期对比、每个短链接都有自己的数据页、导出 CSV。
- 不用 cookie、不存 IP、不存完整的 User-Agent 字符串，位置只记到城市；访客 ID 是每天更换的单向哈希。也不统计机器人。

<table>
  <tr>
    <td width="50%"><img src="https://fluxbio.link/zh-CN/dash-stats.webp" alt="数据：近 30 天的浏览、点击、点击率和独立访客"></td>
    <td width="50%"><img src="https://fluxbio.link/zh-CN/dash-qr.webp" alt="为短链接设计二维码"></td>
  </tr>
  <tr>
    <td align="center"><sub>数据，与上一期对比</sub></td>
    <td align="center"><sub>每个短链接都有二维码</sub></td>
  </tr>
</table>

### 语言与部署

- **13 种语言**：后台和公开页都支持繁中、简中、English、日本語、한국어、Español、Português、Français、Deutsch、Bahasa Indonesia、ไทย、Tiếng Việt、العربية。公开页使用你选的一种语言，也可以再开放几种，让浏览器是那些语言的访客自动切换。你写的内容也可以让 AI 翻译成那些语言。
- **公开页几乎没有 JavaScript**：纯 HTML，由 Cloudflare 边缘节点直接输出，速度很快。只有一小段代码负责统计点击，没有它页面也正常。视频和地图要等访客点击后才加载。
- **自部署**：只用 Cloudflare 的 Workers、D1、KV、Analytics Engine，全都无需手动配置，也不用另外申请第三方服务（字体默认从 Google Fonts 加载，可以关掉）。让 AI 把所有内容整体导出、再导入，就能备份或迁移到另一个部署。

## 自己部署一个

需要的工具 AI 会帮你装。试用只要有 Claude Code，放到网上时再准备免费的 Cloudflare 账号。自己动手的话，需要 Node.js（22.23+、24.22+ 或 26.12+）和 pnpm。

### 最简单：交给 AI

粘贴给你的 AI。推荐用电脑上的 [Claude Code](https://code.claude.com/docs/en/quickstart)；Codex、OpenCode、Cursor 等能执行命令又能联网的也可以：

```text
帮我试用 FluxBio。先执行这一行，把它下载到这台电脑：

mkdir -p ~/flux-bio && curl -fsSL https://github.com/0t2/flux-bio/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C ~/flux-bio

然后把 ~/flux-bio/AGENTS.md 完整读一遍，按它的第 1 节来做。要读文件夹里的文件，不要上网读。下载失败就停下来告诉我。
页面语言用简体中文（zh-CN）。
```

它会先问你要不要在电脑上做一个展示页看看，不用注册账号。满意了再请你登录 Cloudflare 放到网上，最后把自己连接上来。你说可以才会公开，之后想改什么直接跟它说就好。网页版的 ChatGPT、Claude 做不到，因为它们不能在你的电脑上运行命令。

> [!NOTE]
> 过程中会请你同意几次：AI 执行命令（下载代码、安装依赖、部署）前会先问你，登录 Cloudflare 需要你在浏览器里点允许，最后把 token 保存到你的电脑前也会再问一次。看清楚每一步在做什么，再点允许。

### 自己动手

```sh
git clone https://github.com/0t2/flux-bio.git
cd flux-bio
pnpm install
pnpm exec cf auth login          # 第一次需要登录 Cloudflare

# 生成后台密码（ADMIN_PASSWORD，至少 12 个字符），然后部署
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)" > .secrets.env
pnpm exec cf deploy --secrets-file .secrets.env
cat .secrets.env && rm .secrets.env   # 把密码保存好
```

部署完成后打开 `https://<你的网址>/admin/`，用密码登录。首次设置会带你创建第一个页面，再到“设置”连接你的 AI；之后域名、时区、备份、改密码都可以直接跟它说。第一次部署会自动创建 D1 数据库和 KV。

## 看访客从哪里来

FluxBio 不用 cookie 就能记下每次访问从哪里来。在「数据」页，「来源平台」列出每个平台有多少人打开你的 bio 页、之后点了多少链接；「UTM 活动」再按链接上的标签细分。

### 自动识别的

- **App 内置浏览器**：Instagram、Threads、Facebook（含 Messenger）、LINE、X、TikTok、微信、微博、KakaoTalk、NAVER、Zalo、Snapchat、Pinterest、LinkedIn。
- **链接过来的网站**：X（t.co）、YouTube、Reddit，Google、Bing、Yahoo、百度等搜索引擎，以及其他任何网站（显示域名）。
- FluxBio 生成的**二维码**会自动带上 `?s=qr`。
- bio 页上的链接会带着访客的来源，所以点击会算在访客原本来自的平台。

### 需要自己标记的

有些地方不会透露访客从哪里来，这些访问会算作「直接/其他」：

- WhatsApp、Telegram、Discord、iMessage 和短信
- 邮件、电子报、PDF
- 海报、名片等印刷品（请用 FluxBio 生成的二维码）

在分享出去的网址后面加上 `?s=` 和名称，例如 `https://links.example.com/?s=whatsapp`；短链接则是 `https://links.example.com/talk?s=email`。也可以用简写：`ig`、`fb`、`x`、`th`、`wa`、`tg`、`mail`、`qr`。标了 `?s=` 时，会优先采用你标记的来源。

### 同一个平台的不同位置：`utm_content`

Instagram 个人简介、快拍和帖子都算 Instagram。想比较它们，就给每个位置一个单独的网址：

- Instagram 个人简介：`https://links.example.com/?utm_content=bio`
- 快拍：`https://links.example.com/?utm_content=story`

它们在「UTM 活动」中各占一行，浏览和点击分开统计；访客在 bio 页上点链接时，也会带着这个标签。短链接也可以设置 `utm_source`、`utm_medium`、`utm_campaign` 和 `utm_content`（「短链接」页的「高级设置」），点击时会加到目标网址上，所以对方网站也能看到。

> [!TIP]
> 也可以直接对 AI 说：「帮我给 Instagram 个人简介、快拍、帖子各做一个追踪网址」。

### 注意事项

- 能看到访客从哪里来，看不到是谁。Instagram、Facebook、X 不会把点链接的账号告诉其他网站，FluxBio 也不保存能识别个人的数据。
- `?s=` 的名称只能用英文字母、数字、`-` 和 `_`，会转成小写，其他字符（包括中文）会被去掉。UTM 标签则按原样记录，`story` 和 `Story` 会算成两行，每次请用同样的写法。
- 地点是 Cloudflare 根据访客 IP 推算的城市。使用 VPN、iCloud 专用代理或公司网络的人，可能会显示在别的地方。
- 浏览、点击和来源是精确数字。每天的数字保留 13 个月，之后每月留一个总数，一直保存；在设置页可以全部下载。地区、地图、运营商、设备、语言和 UTM 细项保留 90 天，新的访问约一分钟后出现。社交图标要不要一起算，可以自己选。显示原始网址的按钮靠页面上一小段代码回报点击，被拦截时可能统计不到；走短链接的都统计得到。
- 独立访客按天计算：同一个人第二天再来，或先用手机再用电脑，都会算两次。
- 机器人和链接预览（有人把链接贴进聊天 App 时，App 抓取预览的那一次）不计入，所以数字可能比其他工具少。
- 短链接的 UTM 标签只会加在主要目标网址上，不会加到另外设置的 iPhone/Android 网址，也不会覆盖目标网址原有的标签。修改标签只影响之后的点击。
- App 是靠内置浏览器的自我标识来识别的。如果 App 改了标识，在 FluxBio 更新之前，它的访问可能会算作「直接/其他」。

## 常见问题

<details>
<summary><b>要钱吗？</b></summary>

FluxBio 免费、开源，运行在你自己的 Cloudflare 账号上。Cloudflare 的免费方案每天大约够一万到几万次页面浏览（看页面上的图片多少）和几百次修改，个人和小店通常用不完。Claude、ChatGPT 这类 AI 的订阅费另计，Claude Code 需要 Claude 的付费方案。

</details>

<details>
<summary><b>可以先试用，不注册 Cloudflare 账号吗？</b></summary>

可以。AI 会在你的电脑上做一个展示页，不用任何账号。这个网址只有你的电脑打得开，不能发给朋友看，电脑重启后要请 AI 重新打开，数据还在。满意了再注册免费的 Cloudflare 账号放到网上，做好的页面会一起搬过去；不想用了，请 AI 删掉文件夹就好。

</details>

<details>
<summary><b>不想用 Link in bio 可以吗？</b></summary>

可以。任何一页都能改成自己的 HTML，或跳转到其他网址，也都能当首页；请 AI 改，或到该页的“内容”选择。也可以关掉页面功能，只用短链接。

</details>

<details>
<summary><b>免费额度用完会怎样？会被收费吗？</b></summary>

不会收费，免费方案不用绑卡。当天额度用完时，访客会暂时看到错误，到早上 8 点（北京时间）重新计算。如果 AI 装在你的电脑上，可以问它今天还剩多少。

</details>

<details>
<summary><b>AI 一直问能不能运行，要点什么？</b></summary>

这是正常的，AI 在你的电脑上做事之前都会先问。如果是下载 FluxBio、安装工具或部署，点允许就好；看不懂它要做什么，就先请它解释。

</details>

<details>
<summary><b>关掉电脑后网站还在吗？明天要改怎么办？</b></summary>

放到网上之后就还在。网站放在 Cloudflare，不在你的电脑上。要改的时候，打开 AI 工具，直接说你想改什么就好，例如“把我的 YouTube 频道加到 FluxBio 页面”。Claude Code 会记得你的网站；其他工具要把“设置”里的提示再粘贴一次。

</details>

<details>
<summary><b>一定要有自己的域名吗？</b></summary>

不用。部署好就有一个免费的 workers.dev 网址可以用，不会过期，只是比较长。之后如果有放在 Cloudflare 的域名，随时可以接上，已经分享出去的链接也还能用。

</details>

<details>
<summary><b>试完不想用了怎么办？</b></summary>

可以直接放着，不花钱。想全部删掉，跟 AI 说“帮我把 FluxBio 全部删掉”，它会问你要不要留备份，确认后才删除。

</details>

<details>
<summary><b>可以用其他字体吗？</b></summary>

每个主题都有自己的字体。想用 Google Fonts 的其他字体，跟你的 AI 说就好，例如“把标题换成 Playfair Display”：它会找字体、说明用量，再帮你发布。字体默认从 Google Fonts 加载，不占你的额度，但访客的浏览器会连到 Google；德国法院在 2022 年判决，依 GDPR 这需要访客同意。如果你有欧盟的访客，到外观页打开“字体从你的网站加载”：发布时只把页面用到的字复制到你自己的 Worker，每个字体文件对每位新访客算一次请求和一次 KV 读取（页面的内置字体就有两三个文件）。大部分页面绰绰有余；流量大的页面多加字体会更快碰到每日上限，所以建议最多多加一套、用在标题。如果你用 Claude Code 这类能改代码的 AI 管理 FluxBio 的代码，它还能进一步降低用量（做法写在 AGENTS.md）。

</details>

<details>
<summary><b>数据存在哪里？</b></summary>

全部在你的 Cloudflare 账号里：页面、短链接和数据在 D1，图片在 KV。没有中央服务器，作者看不到你的数据。已发布的页面和短链接是公开的；草稿只有你和拿到预览链接的人看得到，数据和后台要登录才看得到。

</details>

<details>
<summary><b>后台密码、API token、Cloudflare 密钥有什么区别？</b></summary>

**后台密码**是你登录后台用的，部署时会自动生成，之后随时可以改。**API token** 是给 AI 和工具用的：每个 AI 各开一个，可以只给“创建短链接”的权限，也能单独撤销，不影响其他 AI。**Cloudflare 密钥**只用在部署、连接域名这类要到 Cloudflare 才能做的事，管的是整个 Cloudflare 账号，不要贴到聊天里。

</details>

<details>
<summary><b>token 泄露了怎么办？</b></summary>

在“设置”里撤销那一个，再生成一个新的。如果是后台密码泄露了，就请 AI 帮你改密码；改完后所有人都要重新登录，所有 token 也会失效。

</details>

<details>
<summary><b>AI 改错了怎么办？</b></summary>

页面的修改都先存成草稿，发布后访客才看得到；设置和独立短链接则会马上生效。FluxBio 给 AI 的指南会要它先说明影响并征求你的同意、问你要直接发布还是先看预览，也要在动手前先备份。出错了可以还原页面最近 20 次发布的版本，或从备份恢复。没有读指南的工具不会照做，所以完整权限只给你信任的 AI。

</details>

<details>
<summary><b>没有 AI 也能用吗？</b></summary>

可以。编辑页面、外观、短链接、二维码、数据和下载备份都在后台。域名、时区这些设置，还有自己的颜色和图片，都没有界面，需要通过 API 修改，说明在每个 FluxBio 的 `/llms.txt` 里。

</details>

<details>
<summary><b>支持哪些 AI？</b></summary>

部署：推荐用你电脑上的 Claude Code；其他能执行命令又能联网的编程工具也可以，比如 Codex、OpenCode、Cursor、Cline、Roo Code、Kilo Code、Droid、Crush、Goose、Pi、TRAE、Qoder、ZCode、Eigent、Gemini CLI、GitHub Copilot、Windsurf。日常管理：除了上面这些，能调用 API 的工具也可以，比如 Claude App、Claude Cowork、ChatGPT（自定义 GPT）、n8n。后台“设置”里有提示可以粘贴给 Claude Code、Codex 或 Cursor，其他工具请它读你网站的 /llms.txt。

</details>

<details>
<summary><b>怎么换域名、改密码、迁移网站？</b></summary>

直接跟 AI 说：“把域名换成 links.example.com”“帮我改后台密码”“把网站迁移到另一个 FluxBio”。域名要先在 Cloudflare 里接到这个 Worker 上，AI 会一步步带你完成。

</details>

<details>
<summary><b>会追踪访客吗？</b></summary>

FluxBio 不用 cookie，也不存 IP 和完整的 User-Agent 字符串。每次访问会留下时间、来源、设备、浏览器、语言、网络和大致位置（最细约 10 公里），保留 90 天，并附上每天更换的单向哈希；汇总的次数则会一直留着。已知的机器人和链接预览不计入。有两件事会连到 Google：字体默认从 Google Fonts 加载，可以在“外观”里关掉；有 YouTube 视频的页面，缩略图也从那里加载。

</details>

## 开发

```sh
cp .dev.vars.example .dev.vars   # 设置本地的 ADMIN_PASSWORD
pnpm dev                         # http://localhost:5173 ，后台在 /admin/
pnpm test                        # 在 Workers runtime 里运行测试
pnpm typecheck
```

架构、目录结构和开发规范都在 [AGENTS.md](../AGENTS.md)。

技术栈：Cloudflare Workers、D1、KV、Analytics Engine、Hono、React 19、Vite，以及 [`cf` CLI](https://www.npmjs.com/package/cf)。

## 许可证

- 主程序：[AGPL-3.0-only](../LICENSE)。可以自由地自行部署和修改；用来提供公开服务时，修改过的源代码也要公开。
- `src/templates/`（公开页的主题和渲染器）和 `themes/`（主题配色）：[MIT](../src/templates/LICENSE)，方便复用。
