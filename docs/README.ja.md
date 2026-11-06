<div align="center">

<img src="../public/favicon.svg" width="72" height="72" alt="">

# FluxBio

**ひとつのリンクで あなたのすべてへ**

オープンソースのリンクまとめ（Link in bio）＋短縮URL。すべてあなたの Cloudflare アカウントの上で動き、無料プランで十分です。

<a href="../README.md"><kbd>&nbsp;English&nbsp;</kbd></a>
<a href="README.zh-TW.md"><kbd>&nbsp;繁體中文&nbsp;</kbd></a>
<a href="README.zh-CN.md"><kbd>&nbsp;简体中文&nbsp;</kbd></a>
<a href="README.ja.md"><kbd>&nbsp;<b>日本語</b>&nbsp;</kbd></a>
<a href="README.ko.md"><kbd>&nbsp;한국어&nbsp;</kbd></a>
<a href="README.es.md"><kbd>&nbsp;Español&nbsp;</kbd></a>
<a href="README.pt-BR.md"><kbd>&nbsp;Português&nbsp;</kbd></a>
<a href="README.fr.md"><kbd>&nbsp;Français&nbsp;</kbd></a>
<a href="README.de.md"><kbd>&nbsp;Deutsch&nbsp;</kbd></a>
<a href="README.id.md"><kbd>&nbsp;Bahasa Indonesia&nbsp;</kbd></a>
<a href="README.th.md"><kbd>&nbsp;ไทย&nbsp;</kbd></a>
<a href="README.vi.md"><kbd>&nbsp;Tiếng Việt&nbsp;</kbd></a>
<a href="README.ar.md"><kbd>&nbsp;العربية&nbsp;</kbd></a>

[紹介ページ](https://fluxbio.link) · [自分で立てる](#自分で立てる) · [AI エージェント向けガイド](../AGENTS.md)

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](../LICENSE)
[![Runs on Cloudflare Workers](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

</div>

<br>

**TL;DR**

- リンクまとめページと短縮 URL、クリック統計が 1 つのツールに。
- 自分の Cloudflare アカウントで動きます。無料プランで十分で、データは自分の手元に残ります。
- [AI にプロンプトを貼り付ける](#自分で立てる)だけで準備完了。あとは管理画面で編集するか、AI に頼むだけです。

<img src="https://fluxbio.link/ja/dash-links.webp" alt="FluxBio の管理画面：bio ページを編集しながらライブプレビューを確認">

自分らしい bio ページをいくつでも作れます。テーマと配色を選ぶか、AI に自分の画像でテーマを作ってもらえて、動画や商品、営業時間も載せられます。ページのリンクにはどれも短縮URLが付き、どのリンクがクリックされたのか、IG・Threads・LINE のどこから来たのかがわかります。

## 機能

### 管理は AI に任せる

- 「設定」で API トークンを作り、画面のプロンプトを Claude Code、Codex、Cursor のいずれかに貼り付けます。あとは話しかけるだけで、ページの編集、短縮URLの作成、データの確認、ドメインやタイムゾーンの変更ができます。
- どのデプロイにも、AI 向けの説明（`/llms.txt`、`/skill.md`）と API 仕様（`/api/openapi.json`）が付いています。AI は公開・削除・URL の変更といった操作の前にリスクを知らせ、提案もしてくれます。

### bio ページ

- 1つのデプロイで複数のページを管理でき、ページごとに URL、テーマ、データが分かれます。
- 24のテーマ。それぞれ独自のレイアウトと数組の配色があります：ネオン、ビスタ、タイル、キャンディ、エアリー、オーロラ、カード、フロスト、サンセット、スカイ、ポップ、ポートレート、シート、レール、ツートーン、レリーフ、ベントー、ドット、パステル、レター、オブシディアン、ムーン、チップ、トラック。
- 短縮URLだけ使いたいときは、管理画面でページ機能をオフにできます。公開ページは非公開になり、短縮URLはそのまま動き、データも消えません。
- リンクページが不要なら、どのページも自分の HTML にしたり別のアドレスへ転送したりでき、どちらもホームページにできます。
- フォント：テーマのフォントは Google Fonts から読み込まれ、使用量はかかりません。外観ページのスイッチで自分の Worker からの配信に切り替えると、訪問者が Google に接続しなくなります（EU の訪問者がいる場合に便利）。Google Fonts のほかのフォントは AI に頼んでください。使用量は FAQ を参照してください。
- 自分だけのテーマ：AI に色、フォント、カバー画像、背景画像を指定して作ってもらえます。人からもらった[テーマファイル](../themes/)も AI に適用してもらえます。
- コンテンツブロック：リンク、見出し、動画（YouTube／Vimeo）、画像カルーセル、商品カード、営業時間と地図。
- リンクはおすすめや非表示に設定したり、表示期間を予約したりできます。
- テンプレート：クリエイター、お店、イベント申し込み、専門職、団体からワンクリックで始められます。
- LINE や Facebook に貼ったときのプレビュー画像は、テーマに合わせて自動で作られます。この画像は管理画面で公開したときに作られます。AI にページのスクリーンショットを使ってもらうこともできます。
- 右下に LINE ボタンを置けるので、訪問者はワンタップで友だちに追加できます。

### 短縮URL

- bio ページのリンクは公開すると自動で短縮URLになり、単独で作ることもできます。まとめて作ったり、プラットフォームごとに UTM を付けたりするのは AI にお任せ。ページのボタンは元のURLを表示します。アフィリエイトリンクのように見せたくないリンクは、スイッチひとつで短縮URLに切り替えられます。
- スラッグには日本語をはじめ、どの言語の文字でも使えます（タイ語やヒンディー語も）。
- QRコードは色、ドットの形、中央のアイコン、枠の文字を変えられ、PNG／SVG／PDF でダウンロードできます。
- 公開開始、有効期限、パスワード保護、UTM。
- スマート転送：LINE では外部ブラウザで開く、IG／FB のアプリ内ブラウザでは先に外部ブラウザへの案内を表示する、iPhone と Android をそれぞれ別の転送先へ送る。

### 分析

- 閲覧数、クリック数、クリック率、流入元：正確にカウント（D1）。日ごとの数値は 13 か月、その後は月ごとの合計で残ります。
- ユニーク訪問者、地域、訪問者マップ、通信事業者、デバイス、ブラウザ、言語、外部サイト、UTM、クリックの時間帯、最近のアクティビティ：90日間保存（Cloudflare Analytics Engine、設定不要）。
- 前の期間との比較、短縮URLごとの分析ページ、CSV エクスポート。
- cookie は使わず、IP アドレスとブラウザの User-Agent 文字列は保存しません。位置は都市までしか記録しません。訪問者 ID は毎日変わる一方向ハッシュです。ボットも数えません。

<table>
  <tr>
    <td width="50%"><img src="https://fluxbio.link/ja/dash-stats.webp" alt="分析：直近 30 日の閲覧数、クリック数、クリック率、ユニーク訪問者"></td>
    <td width="50%"><img src="https://fluxbio.link/ja/dash-qr.webp" alt="短縮URL の QR コードをデザイン"></td>
  </tr>
  <tr>
    <td align="center"><sub>前の期間と比べた分析</sub></td>
    <td align="center"><sub>短縮URL ごとに QR コード</sub></td>
  </tr>
</table>

### 言語とホスティング

- **13言語に対応**：管理画面も公開ページも、繁體中文、简体中文、English、日本語、한국어、Español、Português、Français、Deutsch、Bahasa Indonesia、ไทย、Tiếng Việt、العربية で使えます。公開ページは選んだ 1 つの言語で表示し、ほかの言語も有効にすれば、ブラウザがその言語の訪問者には自動で切り替わります。あなたが書いた内容も、AI にそれらの言語へ翻訳してもらえます。
- **公開ページの JavaScript はごくわずか**：純粋な HTML を Cloudflare のエッジから直接返すので高速です。クリックを数える小さなスクリプトが 1 つあるだけで、なくてもページは動きます。動画や地図は、訪問者がタップしたときだけ読み込みます。
- **セルフホスト**：使うのは Cloudflare の Workers、D1、KV、Analytics Engine だけで、どれも手動の設定は不要。ほかのサービスに登録する必要もありません（フォントは標準で Google Fonts から読み込みますが、オフにできます）。AI に頼んで全データをまとめてエクスポート・インポートすれば、バックアップも別のデプロイへの引っ越しもできます。
- **1 回のインストールで複数のサイト**：2 つのドメインを、同じ FluxBio の中で別々のサイトにできます。たとえば片方にページ、もう片方は短縮URL専用に。サイトごとにページ、短縮URL、統計が分かれていて、管理画面の左上のメニューで切り替えます。サイトの追加は AI に任せてください。管理画面から手動では追加できません。

## 自分で立てる

必要なツールは AI がインストールします。試すだけなら Claude Code があれば十分で、公開するときに無料の Cloudflare アカウントを用意します。自分で進める場合は Node.js（22.23+、24.22+、26.12+ のいずれか）と pnpm が必要です。

### いちばん簡単なのは AI に任せること

AI に貼り付けてください。おすすめはパソコン上の [Claude Code](https://code.claude.com/docs/en/quickstart) ですが、Codex、OpenCode、Cursor など、コマンドを実行できてネットワークにつながるものでもかまいません。

```text
FluxBio を試させてください。まず次のコマンドを実行して、このパソコンにダウンロードしてください：

mkdir -p ~/flux-bio && curl -fsSL https://github.com/0t2/flux-bio/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C ~/flux-bio

次に ~/flux-bio/AGENTS.md を最後まで読み、その第 1 節に従ってください。ウェブではなく、そのフォルダーにあるファイルを読んでください。ダウンロードに失敗したら、そこで止めて知らせてください。
ページの言語は日本語（ja）にしてください。
```

まず、アカウントなしでパソコン上にサンプルページを作って見るかどうかを聞きます。気に入ったら Cloudflare へのログインをお願いして公開し、最後に自分自身を接続します。公開するかどうかはあなたが決めます。その後も、変えたいことを伝えるだけです。ブラウザ版の ChatGPT や Claude ではできません。あなたのパソコンでコマンドを実行できないためです。

> [!NOTE]
> 途中で何度か許可を求められます。AI はコマンドを実行する前（コードのダウンロード、パッケージのインストール、デプロイ）に確認し、Cloudflare へのログインはブラウザで承認します。最後にトークンをパソコンに保存する前にも確認があります。それぞれ何をするのか確かめてから許可してください。

### 自分でやる場合

```sh
git clone https://github.com/0t2/flux-bio.git
cd flux-bio
pnpm install
pnpm exec cf auth login          # 初回は Cloudflare にログイン

# 管理画面のパスワード（ADMIN_PASSWORD、12文字以上）を生成してデプロイ
printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 24)" > .secrets.env
pnpm exec cf deploy --secrets-file .secrets.env
cat .secrets.env && rm .secrets.env   # パスワードを控えておく
```

デプロイが終わったら `https://<あなたのサイト>/admin/` を開き、パスワードでログインします。初期設定で最初のページを作り、「設定」で AI を接続しましょう。そのあとは、ドメイン、タイムゾーン、バックアップ、パスワードの変更も AI に話しかけるだけです。D1 データベースと KV は、最初のデプロイで自動的に作られます。

## 訪問者の流入元を見る

FluxBio は cookie を使わずに、訪問ごとの流入元を記録します。「分析」ページの「流入元プラットフォーム」には、どのプラットフォームから何人が bio ページを開き、その後リンクが何回クリックされたかが表示されます。「UTM キャンペーン」では、リンクに付けたタグごとにさらに細かく分けて見られます。

### 自動で判別されるもの

- **アプリ内ブラウザ**：Instagram、Threads、Facebook（Messenger を含む）、LINE、X、TikTok、WeChat、Weibo、KakaoTalk、NAVER、Zalo、Snapchat、Pinterest、LinkedIn。
- **リンク元のサイト**：X（t.co）、YouTube、Reddit、Google・Bing・Yahoo・Baidu などの検索エンジン、そのほかのサイト（ドメインで表示）。
- FluxBio で作った **QR コード**には `?s=qr` が自動で付きます。
- bio ページのリンクは流入元を引き継ぐので、クリックは訪問者が来たプラットフォームに計上されます。

### 自分でタグを付けるもの

次のような場所からの訪問は流入元が分からないため、「直接・その他」として数えられます。

- WhatsApp、Telegram、Discord、iMessage、SMS
- メール、メールマガジン、PDF
- ポスター、名刺などの印刷物（FluxBio の QR コードを使ってください）

共有する URL の末尾に `?s=` と名前を付けてください。例：`https://links.example.com/?s=whatsapp`。短縮URL なら `https://links.example.com/talk?s=email` です。`ig`、`fb`、`x`、`th`、`wa`、`tg`、`mail`、`qr` などの略称も使えます。`?s=` を付けると、自動判別よりそちらが優先されます。

### 同じプラットフォーム内の場所の違い：`utm_content`

Instagram のプロフィールのリンク、ストーリーズ、投稿は、どれも Instagram として数えられます。比べたいときは、場所ごとに別の URL を使います。

- Instagram のプロフィール：`https://links.example.com/?utm_content=bio`
- ストーリーズ：`https://links.example.com/?utm_content=story`

それぞれ「UTM キャンペーン」で別の行になり、閲覧とクリックは分けて数えられます。訪問者が bio ページのリンクをタップしたときも、このタグは引き継がれます。短縮URL にも `utm_source`、`utm_medium`、`utm_campaign`、`utm_content` を設定できます（「短縮URL」ページの「詳細設定」）。これらはリンク先の URL に付くので、リンク先のサイトでも確認できます。

> [!TIP]
> AI に「Instagram のプロフィール、ストーリーズ、投稿用の追跡リンクを作って」と頼むこともできます。

### 注意事項

- 分かるのはどこから来たかで、誰が来たかは分かりません。Instagram、Facebook、X はリンクをタップしたアカウントを外部サイトに伝えませんし、FluxBio も個人を特定できるデータは保存しません。
- `?s=` の名前に使えるのは英字、数字、`-`、`_` で、小文字に変換されます。それ以外の文字（日本語を含む）は取り除かれます。UTM タグは書いたとおりに記録されるので、`story` と `Story` は別の行になります。毎回同じ書き方にしてください。
- 地域は、訪問者の IP アドレスから Cloudflare が推定した都市です。VPN、iCloud プライベートリレー、会社のネットワークを使っている人は、別の場所として表示されることがあります。
- 閲覧数、クリック数、流入元は正確な数字です。日ごとの数値は 13 か月保存され、その後は月ごとの合計として残り続けます。設定からすべてダウンロードできます。地域、地図、通信事業者、デバイス、言語、UTM の詳細は 90 日間保存され、新しい訪問は 1 分ほどで反映されます。SNSアイコンも数えるかどうかは自分で選べます。元のURLを表示するボタンはページ上の小さなスクリプトでクリックを数えるので、ブロックされると数えられないことがあります。短縮URLならすべて数えられます。
- ユニーク訪問者は日ごとに数えます。同じ人が別の日に来たり、スマートフォンのあとにパソコンで来たりすると、2 人として数えられます。
- ボットとリンクプレビュー（チャットアプリにリンクを貼ったとき、アプリがプレビューを取得するアクセス）は数えないため、ほかのツールより少なく出ることがあります。
- 短縮URL の UTM タグはメインのリンク先にだけ付き、別に設定した iPhone／Android 用の URL には付きません。リンク先に最初からあるタグを上書きすることもありません。タグを変更すると、その後のクリックから反映されます。
- アプリの判別は、アプリ内ブラウザが名乗る情報に基づいています。アプリ側がこれを変えると、FluxBio が対応するまでは「直接・その他」として数えられることがあります。

## よくある質問

<details>
<summary><b>お金はかかりますか？</b></summary>

FluxBio は無料のオープンソースで、あなた自身の Cloudflare アカウントで動きます。Cloudflare の無料プランでは 1 日あたり 1 万〜数万回のページ表示（ページの画像の数によります）と数百回の変更ができ、個人や小さなお店なら通常は十分です。Claude や ChatGPT などの AI の利用料は別で、Claude Code には Claude の有料プランが必要です。

</details>

<details>
<summary><b>Cloudflare アカウントなしで試せますか？</b></summary>

試せます。AI がパソコン上にサンプルページを作るので、アカウントは一切いりません。このアドレスはあなたのパソコンでしか開けないので、友だちには送れません。パソコンを再起動したら AI にもう一度開いてもらえば、データはそのまま残っています。気に入ったら無料の Cloudflare アカウントを作って公開でき、作ったページも一緒に移せます。やめるときは AI にフォルダを削除してもらうだけです。

</details>

<details>
<summary><b>リンクインバイオを使わなくてもいいですか？</b></summary>

はい。どのページも自分の HTML にしたり別のアドレスへ転送したりでき、どちらもホームページにできます。AI に頼むか、そのページの「コンテンツ」で選んでください。ページ機能をオフにして短縮URLだけ使うこともできます。

</details>

<details>
<summary><b>無料枠を使い切るとどうなりますか？課金されますか？</b></summary>

課金はされません。無料プランにカード登録は不要です。その日の枠を使い切ると、午前 9 時（日本時間）にリセットされるまで、訪問者にはエラーが表示されます。AI がパソコンで動いていれば、今日の残りを聞けます。

</details>

<details>
<summary><b>AI が何度も実行してよいか聞いてきます。何を押せばいいですか？</b></summary>

それが普通です。AI はあなたのパソコンで何かをする前に必ず確認します。FluxBio のダウンロード、ツールのインストール、デプロイなら許可して大丈夫です。内容がわからないときは、先に説明してもらいましょう。

</details>

<details>
<summary><b>パソコンの電源を切ってもサイトは残りますか？明日変更するには？</b></summary>

公開した後なら残ります。サイトはパソコンではなく Cloudflare にあります。変更するときは AI ツールを開き、「YouTube チャンネルを FluxBio のページに追加して」のように伝えるだけです。Claude Code はあなたのサイトを覚えています。ほかのツールでは、「設定」のプロンプトをもう一度貼り付けてください。

</details>

<details>
<summary><b>自分のドメインは必要ですか？</b></summary>

必要ありません。デプロイするとすぐ使える無料の workers.dev のアドレスがあり、期限もありません。少し長いだけです。あとで Cloudflare にドメインを用意したときはいつでも追加でき、共有済みのリンクもそのまま使えます。

</details>

<details>
<summary><b>試してみて使わないことにしたら？</b></summary>

そのまま放置しても費用はかかりません。すべて消したいときは AI に「FluxBio を全部削除して」と伝えてください。バックアップを残すか聞かれ、確認してから削除されます。

</details>

<details>
<summary><b>ほかのフォントは使えますか？</b></summary>

テーマにはそれぞれ専用のフォントがあります。Google Fonts のほかのフォントを使いたいときは、AI に「見出しを Playfair Display にして」のように頼んでください。フォントを探し、使用量を説明したうえでページを公開してくれます。フォントは既定で Google Fonts から読み込まれ、使用量はかかりませんが、訪問者のブラウザが Google に接続します。2022年にドイツの裁判所は、GDPR 上これには訪問者の同意が必要だと判断しました。EU の訪問者がいるなら、外観ページで「フォントを自分のサイトから読み込む」をオンにしてください。公開時にページで使う文字だけを自分の Worker にコピーし、フォントファイル1つにつき新しい訪問者ごとに1リクエストと1回の KV 読み取りがかかります（内蔵フォントだけで2〜3ファイル）。たいていのページには十分ですが、アクセスの多いページでフォントを増やすと1日の上限に早く届くので、追加は見出し用に1つまでがおすすめです。Claude Code のようにコードを変更できる AI で FluxBio のコードを管理していれば、さらに使用量を減らせます（方法は AGENTS.md に記載）。

</details>

<details>
<summary><b>データはどこに保存されますか？</b></summary>

すべてあなたの Cloudflare アカウントの中です。ページ、短縮URL、データは D1 に、画像は KV に保存されます。中央サーバーはなく、作者もあなたのデータを見られません。公開したページと短縮URLは誰でも見られます。下書きを見られるのは、あなたとプレビューリンクを持つ人だけです。データと管理画面はログインが必要です。

</details>

<details>
<summary><b>管理画面のパスワード、API token、Cloudflare のキーは何が違いますか？</b></summary>

**管理画面のパスワード**は、あなたが管理画面にログインするためのものです。デプロイ時に自動で作られ、あとからいつでも変更できます。**API token** は AI やツール用です。AI ごとに1つずつ発行し、「短縮URLの作成のみ」の権限に絞ることも、個別に無効化することもでき、ほかには影響しません。**Cloudflare のキー**は、デプロイやドメインの接続のように Cloudflare でしかできない作業にだけ使います。Cloudflare アカウント全体を操作できるので、チャットには貼らないでください。

</details>

<details>
<summary><b>token が漏れてしまったら？</b></summary>

「設定」でその token を無効化し、新しく発行し直してください。管理画面のパスワードが漏れた場合は、AI にパスワードの変更を頼みましょう。変更すると全員がログインし直しになり、すべての token も無効になります。

</details>

<details>
<summary><b>AI が間違えたら？</b></summary>

ページの変更はまず下書きに保存され、公開するまで訪問者には見えません。設定と単独の短縮URLはすぐに反映されます。FluxBio のガイドにより、AI は変更の影響を説明して先に確認し、すぐに公開するか先にプレビューするかを尋ね、始める前にバックアップを取ります。間違えても、ページの直近20回の公開のどれかに戻すか、バックアップから復元できます。ガイドを読まないツールはこのとおりに動かないので、フルアクセスは信頼できる AI にだけ渡してください。

</details>

<details>
<summary><b>AI がなくても使えますか？</b></summary>

使えます。ページの編集、外観、短縮URL、QRコード、分析、バックアップのダウンロードはすべて管理画面にあります。ドメインやタイムゾーンなどの設定や、自分の色や画像を使った外観には画面がないので、API で変更します。説明は各 FluxBio の `/llms.txt` にあります。

</details>

<details>
<summary><b>どの AI に対応していますか？</b></summary>

デプロイには、あなたのパソコンの Claude Code をおすすめします。コマンドを実行できてネットワークにつながる他のコーディングツール（Codex、OpenCode、Cursor、Cline、Roo Code、Kilo Code、Droid、Crush、Goose、Pi、TRAE、Qoder、ZCode、Eigent、Gemini CLI、GitHub Copilot、Windsurf など）でもかまいません。日々の管理には、これらに加えて API を呼び出せるツール（Claude アプリ、Claude Cowork、ChatGPT のカスタム GPT、n8n など）も使えます。管理画面の「設定」に、Claude Code、Codex、Cursor に貼り付けるプロンプトがあります。それ以外のツールには、サイトの /llms.txt を読むよう伝えてください。

</details>

<details>
<summary><b>ドメインやパスワードの変更、引っ越しはどうすれば？</b></summary>

AI に話しかけるだけです。「ドメインを links.example.com に変更してください」「管理画面のパスワードを変えてください」「サイトを別の FluxBio に引っ越してください」。ドメインは先に Cloudflare でこの Worker に接続しておく必要がありますが、AI が一つずつ案内します。

</details>

<details>
<summary><b>訪問者を追跡しますか？</b></summary>

FluxBio は cookie を使わず、IP アドレスとブラウザの User-Agent 文字列の全体は保存しません。訪問ごとに、時刻、流入元、デバイス、ブラウザ、言語、ネットワーク、おおよその位置（最も細かくて約10km）を90日間保存し、毎日変わる一方向ハッシュを添えます。合計の数は残り続けます。既知のボットやリンクプレビューはカウントしません。Google に届くものが2つあります。フォントは、「外観」でオフにしない限り Google Fonts から読み込まれ、YouTube 動画のあるページではサムネイルもそこから読み込まれます。

</details>

## 開発

```sh
cp .dev.vars.example .dev.vars   # ローカル用の ADMIN_PASSWORD を設定
pnpm dev                         # http://localhost:5173 、管理画面は /admin/
pnpm test                        # Workers ランタイムでテストを実行
pnpm typecheck
```

アーキテクチャ、ディレクトリ構成、開発ルールは [AGENTS.md](../AGENTS.md) にまとめてあります。

技術スタック：Cloudflare Workers、D1、KV、Analytics Engine、Hono、React 19、Vite、そして [`cf` CLI](https://www.npmjs.com/package/cf)。

## ライセンス

- 本体：[AGPL-3.0-only](../LICENSE)。自由にセルフホストや改変ができます。公開サービスとして提供する場合は、改変したソースコードも公開する必要があります。
- `src/templates/`（公開ページのテーマとレンダラー）と `themes/`（テーマの配色）：再利用しやすいように [MIT](../src/templates/LICENSE) です。
