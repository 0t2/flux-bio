# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, you take `main`. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`, so after updating read the releases above that one. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.3.1 - 2026-11-19

### 新機能
- `GET /api/update` で、FluxBio の新しいバージョンが出ているかがわかります。サイトがいくつ遅れているか、その中にセキュリティ修正や「要対応」があるかを返します。この変更履歴を GitHub から読むのは、尋ねられたときだけです。あなたの AI は会話ごとに 1 回確認し、セキュリティ修正が待っているときは最初に知らせます。

## 0.3.0 - 2026-11-19

### 新機能
- リリースにバージョン番号が付きました。サイトが動かしているバージョンは `GET /api/state` の `version` と `/llms.txt` の冒頭に書かれていて、ここの見出しは 1 つずつがバージョンです。番号を見れば、更新に何が必要かがわかります。真ん中の数字が変わるとき（0.3.4 から 0.4.0）は「要対応」があり、最後の数字だけが変わるときはデプロイするだけで済みます。まだ 0.2.1 と表示されるサイトはこのリリースより前のものなので、最後に更新した日を目安に読んでください。 [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### 新機能
- この変更ログは、ここと [fluxbio.link](https://fluxbio.link/en/changelog/) にあります。

## 2026-11-11

### 要対応
- 更新して再デプロイして、以下のリンクパスワード修正を取得します。サイトに関しては他に何も変わりません。 [#38](https://github.com/0t2/flux-bio/pull/38)

### セキュリティ
- ページのリンクのパスワードはスキップされる可能性があります。ページの `/_c/<handle>/<id>/link` アドレスは、リンクの実際のアドレスで応答されます。ボタンがその短いリンク (パスワード、隠しアドレス、デバイス アドレス、UTM タグ) を通過するリンクは、そこでは配布されず、カウントされなくなります。 [#38](https://github.com/0t2/flux-bio/pull/38)

### 修正
- 正しいリンク パスワードが Chromium の宛先に到達することはありませんでした。 [#38](https://github.com/0t2/flux-bio/pull/38)
- パブリッシュ時にクリック後に入力された内容が削除されなくなり、パブリッシュ中の自動保存が拒否されなくなりました。 [#38](https://github.com/0t2/flux-bio/pull/38)
- ダッシュボードの各設定スイッチは、変更内容のみを送信します。以前は、トグルを切り替えると、ドメインとタイムゾーンを含め、所有者の AI がそれ以降に設定した内容を元に戻すことができました。 [#38](https://github.com/0t2/flux-bio/pull/38)
- KV が削除を拒否し、KV キーが 5,000 を超えると停止して削除が完了したと表示されると、サイトをワイプするとデータベースにテーブルがなくなる可能性があります。 [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### 変更
- 設定スイッチの名前はショート リンクのみで、オンは自己紹介ページがオフであることを意味します。これは自己紹介ページにちなんで命名されたものですが、これをオフにするとどうなるかが説明されていたため、ショートリンクのみのサイトの所有者はそれを逆から読んでいました。 [#37](https://github.com/0t2/flux-bio/pull/37)

### 修正
- `cloudflare.config.ts` がワーカーもインポートするモジュールをインポートしたため、`pnpm dev` を開始できませんでした。 [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### 要対応
- 画像を `pnpm deploy:images` の静的ファイルとして配布する場合は、このバージョンをデプロイしてからもう一度実行します。新しい `GET /api/media/{id}` を通じて各サイトの画像を読み取り、そこからバンドルを再構築します。 [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)、[4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### セキュリティ
- カスタム ドメイン チェックは、質問されたホスト名にバインドされているため、あるホスト名に対して回答されたチェックを別のホスト名に渡すことはできません。 [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- 複数のサイトを保持するワーカーでは、静的ファイルとして出荷された各サイトの画像はそのサイトのフォルダー内に存在し、サイトは `/media/<id>` で独自のサイトのみを提供します。以前は、すべてのサイトが 1 つのフォルダーを共有していました。 [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### 新機能
- `GET /api/media/{id}` は、バックアップおよび `pnpm deploy:images` のために、ピクチャの現在のバイトをトークンに渡します。 [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### 変更
- `pnpm deploy:images` は、アップロードまたは復元によって ID が上書きされる可能性があるため、実行のたびにすべての画像をダウンロードし、ダウンロードする前にどのサイトとどのモードを読み取っているかを確認します。 [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- 所有者の AI が読み取るガイドは、上書きされないスナップショット フォルダーに `GET /api/media/{id}` でバックアップされ、定義された順序で最初のページが設定されます。 [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### 要対応
- データベースが最後にこの日の `7b0bad4` より前のビルドで開かれた場合は、まずスカッシュ (`8d0c435`) の直前のビルドをデプロイし、サイトを 1 回開いてから、このビルドをデプロイします。移行は 1 つにまとめられ、実行された古いデータベースが 10 個未満 (`SELECT value FROM _meta WHERE key = 'schema_version'` が 10 未満) は最新のものとして扱われるため、列とインデックスが失われます。 10 での新規インストールとデータベースは影響を受けません。 [#27](https://github.com/0t2/flux-bio/pull/27)
- インストールには pnpm 10.34.5 以降を使用してください。プロジェクトでは、`package.json` で pnpm 12.18.0 という名前が付けられ、古い pnpm は「pnpm の切り替えに失敗しました」というメッセージで停止します。 `AGENTS.md` のインストーラーによって置き換えられ、その手順が変更されました (pnpm フォルダー内の `pnpm runtime set node 24 --global`、`bin`)。 pnpm の設定は `pnpm-workspace.yaml` になりました。 [#19](https://github.com/0t2/flux-bio/pull/19)

### セキュリティ
- リンクのページは、サイト自体 (およびビデオのあるページの YouTube サムネイル) からのみ画像を読み込み、https アドレスから読み込みます。 [#32](https://github.com/0t2/flux-bio/pull/32)
- ページ独自の CSS は、ブラウザが受け入れる前に読み取られ、サイト独自の画像のみを読み込む場合があります。 [#32](https://github.com/0t2/flux-bio/pull/32)

### 新機能
- 1 つのワーカー内の複数のサイト。それぞれに独自のデータベース、KV、統計、設定、ドメインがあり、`sites.json` にリストされています。このファイルがなければ、以前と同様に、ワーカーは 1 つのサイトになります。 [#23](https://github.com/0t2/flux-bio/pull/23)
- タップするとページ上に Ko-fi または Calendly のパネルを開くブロックと、どちらかのフローティング ボタンを埋め込みます。タップする前には何もロードされません。 [#28](https://github.com/0t2/flux-bio/pull/28)
- オーナーの AI はリンクのページに独自の CSS (`appearance.css`) を与えることができるので、「ページをこの画像のようにする」とリンクのページを維持できます。 [#32](https://github.com/0t2/flux-bio/pull/32)
- ページの背景は、パターン (`appearance.bgTile`) で設定されたサイズで繰り返すことができます。 [#29](https://github.com/0t2/flux-bio/pull/29)
- ソーシャル アイコンはリンクの後に配置することができ (`appearance.socialPlace`)、名前を非表示にしてもページの見出しとして保持することができます (`appearance.showName`)。 [#33](https://github.com/0t2/flux-bio/pull/33)
- 何も使用していない画像をリスト表示して削除できます: `GET` および `DELETE /api/media/unused`。 [#8](https://github.com/0t2/flux-bio/pull/8)
- 設定には、プラン、データベースのサイズ、無料クォータの 1 日の使用量が表示され、`pnpm usage` がアカウントからそれを読み取ります。 [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7)、[2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- 毎日の統計は 13 か月間保持され、その後 1 か月ごとに 1 行に結合され、すべてのカウントを CSV としてダウンロードできます。 [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` は、サイトの画像を静的ファイルとして送信します。これには、ワーカー リクエストや KV 読み取りの費用はかかりません。 [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- 新しいブロックを要求するための発行フォーム。 [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link にはトラフィックとコストの見積もり機能があります。 [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### 変更
- ページや短いリンクに制限はありません。訪問者や所有者がテーブル全体を読み取る必要はなく、ダッシュボードには一度に 1 画面分の短いリンクが読み込まれます。 [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- 実行コストが安くなります。ページ ビューには 1 つの KV 読み取りが必要で、相互に依存しない D1 クエリはまとめて処理され、ダッシュボードがワーカーに求める要求は少なくなり、ページ ビューは CPU の約 3 分の 1 を使用します。 [#6](https://github.com/0t2/flux-bio/pull/6)、[#7](https://github.com/0t2/flux-bio/pull/7)、[#17](https://github.com/0t2/flux-bio/pull/17)、[#18](https://github.com/0t2/flux-bio/pull/18)
- ページとダッシュボードのプレビューは、フォント全体ではなく、表示される文字のみを含む中国語フォントを Google に要求します。 [#9](https://github.com/0t2/flux-bio/pull/9)、[#13](https://github.com/0t2/flux-bio/pull/13)
- 古い形状で保存されたデータを読み取るコードはなくなりました。古い設定とページ形状、古いバックアップ ファイル、`ADMIN_TOKEN`、`/shorten` ページ、および古いダッシュボード アドレスです。 [#27](https://github.com/0t2/flux-bio/pull/27)
- FluxBio をインストールするプロンプトでは、最初にコードがダウンロードされ、エージェントは 13 言語すべてでフォルダーから `AGENTS.md` を読み取ります。 [#21](https://github.com/0t2/flux-bio/pull/21)
- オーナーの AI が読み上げるガイドは、短いメイン ガイドと必要に応じて読み上げられるトピックに分かれており、各テーマでボタンの色付け方法、フォントの読み込み方法、パターンの作成方法が説明されています。 [#30](https://github.com/0t2/flux-bio/pull/30)、[#34](https://github.com/0t2/flux-bio/pull/34)
- FluxBio サイトの GitHub Actions からのデプロイは、このリポジトリ内でのみ、またサイトに名前を付ける場合にのみ発生します。コピーでは何もデプロイされません。 [#14](https://github.com/0t2/flux-bio/pull/14)

### 修正
- カスタム ドメインの保存は、確認する予定だったすべてのドメインで 522 で失敗しました。 [#35](https://github.com/0t2/flux-bio/pull/35)
- `appearance.css` が存在する前に公開されたページは、再度公開されるまで 500 と回答しました。 [#32](https://github.com/0t2/flux-bio/pull/32)
- ダッシュボードでは、読み込みのたびにブラウザー コンソールに CSP 違反が表示されなくなりました。 [#20](https://github.com/0t2/flux-bio/pull/20)
- スクリーンショットからページを再構築する AI の修正: アドレスの CSS 属性セレクター、`POST /api/themes` の表紙と背景画像の `null`、`GET /api/themes/community?lang=` の所有者の言語でのテーマ名。 [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### 新機能
- 最初の公開リリース: オーナーの AI によって実行される、1 つの Cloudflare Worker でのプロフィール内のリンク、短いリンク、およびクリック追跡。 [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

