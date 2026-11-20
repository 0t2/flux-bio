# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, you take `main`. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`, so after updating read the releases above that one. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.0 - 2026-11-20

### 需要处理
- 如果你改过 `cloudflare.config.ts`（换了 `WORKER_NAME`、加了自定义域名，或去掉了 `ANALYTICS`），部署这一版之前，请把这些设置写进 FluxBio 文件夹里的 `worker.json`，例如 `{ "name": "my-links" }`。这个文件不属于代码，以后更新都不会动它。如果忘了写，部署会停下来，告诉你该写哪个名称。 [#45](https://github.com/0t2/flux-bio/pull/45)

### 新增
- `pnpm run deploy` 在上传前会先问 Cloudflare 现在运行的是什么；会多出一个空站点、让你的某个站点下线、覆盖别的 Worker 或换掉密码的部署，都会被拦下。请用它代替 `cf deploy`。 [#45](https://github.com/0t2/flux-bio/pull/45)
- `pnpm reset-password` 会设置一个新的管理密码，并为每个站点创建新的 API token，两者都不会显示在屏幕上。登录页的“忘记密码？”现在给出的就是这条命令。 [#45](https://github.com/0t2/flux-bio/pull/45)

## 0.3.2 - 2026-11-20

### 新增
- 用来部署的文件夹不见了（被删除，或留在另一台电脑上），你的 AI 可以把它重建回来：站点指南的 `/api/guide/rebuild` 有完整步骤，里面写着你的 Worker 名称。这期间站点照常运行，站点上的内容一样都不会丢。 [#44](https://github.com/0t2/flux-bio/pull/44)

## 0.3.1 - 2026-11-20

### 新增
- `GET /api/update` 会告诉你 FluxBio 有没有新版本：你的站点落后几个版本，其中有没有安全修复或“需要处理”的事项。它只在被询问时才从 GitHub 读取这份更新日志。你的 AI 每次对话会问一次，有安全修复在等待时会先告诉你。 [#43](https://github.com/0t2/flux-bio/pull/43)

## 0.3.0 - 2026-11-19

### 新增
- 每次发布都有版本号了。站点运行的版本写在 `GET /api/state` 的 `version` 和 `/llms.txt` 的开头，这里每个标题就是一个版本。看数字就知道更新要做什么：中间的数字变了（0.3.4 到 0.4.0）表示有“需要处理”的事项，只有最后一个数字变的话，重新部署即可。仍显示 0.2.1 的站点早于这一版，请按上次更新的日期往上读。 [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### 新增
- 此变更日志位于此处和 [fluxbio.link](https://fluxbio.link/en/changelog/)。

## 2026-11-11

### 需要处理
- 更新并重新部署以获得下面的链接密码修复。您的网站没有任何其他变化。 [#38](https://github.com/0t2/flux-bio/pull/38)

### 安全
- 可以跳过页面链接上的密码：页面的 `/_c/<handle>/<id>/link` 地址用链接的真实地址进行回答。按钮通过其短链接（密码、隐藏地址、设备地址、UTM 标签）的链接不再在那里分发或计数。 [#38](https://github.com/0t2/flux-bio/pull/38)

### 修复
- 正确的链接密码从未到达 Chromium 中的目的地。 [#38](https://github.com/0t2/flux-bio/pull/38)
- 发布不再删除单击后键入的内容，并且不再拒绝发布期间的自动保存。 [#38](https://github.com/0t2/flux-bio/pull/38)
- 仪表板中的每个设置开关仅发送其更改的内容。以前，切换一个可以撤消所有者的人工智能自此以来设置的内容，包括域和时区。 [#38](https://github.com/0t2/flux-bio/pull/38)
- 当 KV 拒绝删除时，擦除站点可能会导致数据库中没有表，并且超过 5,000 个 KV 键时它会停止并表示已完成。 [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### 变更
- 设置开关名为“仅短链接”，打开表示生物页面关闭。它以个人简介页面命名，但描述了关闭它的作用，因此仅短链接网站的所有者向后阅读它。 [#37](https://github.com/0t2/flux-bio/pull/37)

### 修复
- `pnpm dev` 无法启动，因为 `cloudflare.config.ts` 导入了 Worker 也导入的模块。 [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### 需要处理
- 如果您将图片作为带有 `pnpm deploy:images` 的静态文件发送，请部署此版本，然后再次运行它：它现在通过新的 `GET /api/media/{id}` 读取每个站点的图片并从中重建捆绑包。 [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)、[4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### 安全
- 自定义域检查绑定到它所询问的主机名，因此针对一个主机名回答的检查不能传递给另一个主机名。 [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- 在拥有多个站点的 Worker 上，作为静态文件提供的每个站点的图片现在都位于该站点的文件夹中，并且站点仅在 `/media/<id>` 处提供其自己的服务。以前，所有站点共享一个文件夹。 [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### 新增
- `GET /api/media/{id}` 将图片的当前字节提供给令牌，用于备份和 `pnpm deploy:images`。 [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### 变更
- `pnpm deploy:images` 每次运行时都会下载每张图片，因为上传或恢复可能会覆盖 ID，并在下载之前检查正在读取的站点和模式。 [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- 所有者的 AI 读取的指南会使用 `GET /api/media/{id}` 备份到它永远不会覆盖的快照文件夹中，并按定义的顺序设置第一页。 [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### 需要处理
- 如果您的数据库最后一次由当天 `7b0bad4` 之前的版本打开，请先在压缩 (`8d0c435`) 之前部署该版本，然后打开该站点一次，然后部署此站点。迁移被压缩为一个，并且运行少于 10 个旧数据库（`SELECT value FROM _meta WHERE key = 'schema_version'` 低于 10）的数据库现在被视为最新的，因此它会丢失列和索引。新安装和 10 的数据库不受影响。 [#27](https://github.com/0t2/flux-bio/pull/27)
- 使用 pnpm 10.34.5 或更高版本进行安装。该项目现在在 `package.json` 中命名 pnpm 12.18.0，较旧的 pnpm 因“无法切换 pnpm”而停止。 `AGENTS.md` 中的安装程序替换了它，并且其步骤发生了更改（pnpm 文件夹中的 `pnpm runtime set node 24 --global`、`bin`）。 pnpm 的设置现在位于 `pnpm-workspace.yaml`。 [#19](https://github.com/0t2/flux-bio/pull/19)

### 安全
- 链接页面仅从网站本身加载图片（加上带有视频的页面上的 YouTube 缩略图），它们从任何 https 地址加载。 [#32](https://github.com/0t2/flux-bio/pull/32)
- 页面自身的 CSS 会在浏览器被接受之前读取，并且可能仅加载网站自己的图片。 [#32](https://github.com/0t2/flux-bio/pull/32)

### 新增
- 一个 Worker 中有多个站点，每个站点都有自己的数据库、KV、统计信息、设置和域，在 `sites.json` 中列出。如果没有该文件，Worker 就是一个站点，就像以前一样。 [#23](https://github.com/0t2/flux-bio/pull/23)
- 嵌入可在页面上点击打开 Ko-fi 或 Calendly 面板的块，以及任一浮动按钮。在点击之前，它们不会加载任何内容。 [#28](https://github.com/0t2/flux-bio/pull/28)
- 所有者的AI可以为链接页面提供自己的CSS（`appearance.css`），因此“使我的页面看起来像这张图片”保留了链接页面。 [#32](https://github.com/0t2/flux-bio/pull/32)
- 对于图案 (`appearance.bgTile`)，页面背景可以按设定大小重复。 [#29](https://github.com/0t2/flux-bio/pull/29)
- 社交图标可以位于链接之后 (`appearance.socialPlace`)，名称可以隐藏但保留为页面标题 (`appearance.showName`)。 [#33](https://github.com/0t2/flux-bio/pull/33)
- 可以列出和删除没有任何用途的图片：`GET` 和`DELETE /api/media/unused`。 [#8](https://github.com/0t2/flux-bio/pull/8)
- 设置显示计划、数据库大小以及当天使用的免费配额，`pnpm usage` 从帐户中读取。 [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7)、[2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- 每日统计数据保留 13 个月，然后每月合并为一行，并且每个计数都可以以 CSV 格式下载。 [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` 将站点的图片作为静态文件发送，这不会消耗 Worker 请求或 KV 读取。 [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- 用于请求新区块的问题表。 [#31](https://github.com/0t2/flux-bio/pull/31)
- Fluxbio.link 有一个流量和成本估算器。 [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### 变更
- 页面或短链接没有限制：访问者或所有者无需等待即可读取整个表格，仪表板一次加载一屏短链接。 [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- 运行成本更低：页面视图需要一次 KV 读取，彼此不依赖的 D1 查询一起进行，仪表板对 Worker 的要求更少，页面视图占用大约三分之一的 CPU。 [#6](https://github.com/0t2/flux-bio/pull/6)、[#7](https://github.com/0t2/flux-bio/pull/7)、[#17](https://github.com/0t2/flux-bio/pull/17)、[#18](https://github.com/0t2/flux-bio/pull/18)
- 页面和仪表板的预览要求谷歌提供中文字体，仅包含它们显示的字符，而不是整个字体。 [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- 读取旧形状中保存的数据的代码消失了：旧设置和页面形状、旧备份文件、`ADMIN_TOKEN`、`/shorten` 页面和旧仪表板地址。 [#27](https://github.com/0t2/flux-bio/pull/27)
- 安装 FluxBio 的提示首先下载代码，并让代理从文件夹中读取所有 13 种语言的 `AGENTS.md`。 [#21](https://github.com/0t2/flux-bio/pull/21)
- 主人的人工智能阅读的指南分为简短的主要指南和需要时阅读的主题，并说明每个主题如何为按钮着色、如何加载字体以及如何制作图案。 [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- 从 FluxBio 站点的 GitHub Actions 进行的部署仅发生在该存储库中，并且仅在它命名站点时发生。副本不部署任何内容。 [#14](https://github.com/0t2/flux-bio/pull/14)

### 修复
- 对于要确认的每个域，保存自定义域失败，错误代码为 522。 [#35](https://github.com/0t2/flux-bio/pull/35)
- 在 `appearance.css` 存在之前发布的页面回答了 500，直到再次发布。 [#32](https://github.com/0t2/flux-bio/pull/32)
- 仪表板不再在每次加载时都会在浏览器控制台中显示 CSP 违规。 [#20](https://github.com/0t2/flux-bio/pull/20)
- 修复了 AI 从屏幕截图重建页面的问题：地址上的 CSS 属性选择器、封面和背景图片的 `null` 为 `POST /api/themes`，主题名称为所有者语言的主题名称为 `GET /api/themes/community?lang=`。 [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### 新增
- 首次公开发布：简介中的链接、短链接以及在一个 Cloudflare Worker 上的点击跟踪，由所有者的 AI 运行。 [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

