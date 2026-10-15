# うしくスポットマップ

Googleスプレッドシート「PoIリスト」の観光スポットを、Leaflet + OpenStreetMapで表示します。
地図と地図に関係する検索・絞り込み・詳細・現在地だけを実装しています。

## 作成したURL

- [GitHubリポジトリ](https://github.com/yuQio-dev/ushiku-map): 地図アプリとAPIのソースを管理します。
- [公開地図（GitHub Pages）](https://yuqio-dev.github.io/ushiku-map/): ChatGPTやGitHubへのログインなしで閲覧できます。
- [読み取り専用API](https://script.google.com/macros/s/AKfycbx787is7b-vhsc7wTEKyIgmdN1xBbNEyWb2uuQSvGZRd-V7dmzEjYrMXKFJBTixXEKt/exec): 公開JSON。観光スポット情報を返します。
- [Apps Scriptの編集画面](https://script.google.com/home/projects/1x8zyuZEEzfK8VXCNSUAvO9VRYmzBcb4xUUEzIHJ16fLvg6nQpwPWQpCH/edit): APIのソースとデプロイ管理。

`dist/config.js`に上記APIのURLを設定済みです。GitHub Pagesへの移行でも接続先は変更しません。地図を開くとAPIから最新データを取得します。
「確認時点のデータを使う」を選んだときだけ同梱データを表示します。

## コードを更新して公開

GitHubでmainブランチにコミットするか、ローカルで変更をcommit・pushします。
GitHub ActionsがテストとJavaScript構文チェックを実行し、成功後に`dist/`だけをGitHub Pagesへ公開します。
パッケージの追加インストールやGitHub Secretsの設定は不要です。

- 画面の構成: `dist/index.html`
- 見た目: `dist/styles.css`
- 地図の操作: `dist/app.js`
- 検索・分類: `dist/model.js`
- APIの接続先: `dist/config.js`
- 自動公開: `.github/workflows/pages.yml`

スポット情報を変える場合は、元のスプレッドシートを編集します。地図の更新ボタンで再取得でき、GitHubへのコミットは不要です。
`apps-script/`の変更はGitHub PagesからGoogleへ自動デプロイされません。APIを変更するときは、Apps Scriptで既存デプロイを新バージョンに更新してください。

## 構成

- `dist/`: 静的Webアプリ。公開API接続済み。明示的に切り替えた場合は2026年10月14日に読み取った21件を表示します。
- `apps-script/Code.gs`: Advanced Google Sheets APIで元シートを読むAPI。シートへの書き込みはありません。
- `apps-script/appsscript.json`: スプレッドシート読み取り専用のOAuth権限。
- `apps-script/Index.html`: 同じ地図をApps Script内で動かす一体型版。`npm run build`で生成します。
- `tests/`: 実シートの列構成、検索、JSONP入力、座標検査、再取得のテスト。

## ローカルで表示

Node.jsがあれば、パッケージの追加インストールは不要です。

```powershell
git clone https://github.com/yuQio-dev/ushiku-map.git
cd ushiku-map
npm run dev
```

表示されたローカルURLを開きます。既定は `http://127.0.0.1:5173`。
停止はターミナルでCtrl+Cです。LeafletとOSM背景地図はインターネット接続が必要です。

## 画面と操作

- 背景地図だけ彩度とコントラストを抑え、ピンはカテゴリの色とアイコンで表示します。
- 近接する地点は件数にまとめます。件数を押すと拡大し、最大拡大でも重なる地点は放射状に展開します。Leaflet.markercluster 1.5.3をCDNから読み込みます。
- 「すべて・食事・観光・買い物・交通」を常時表示します。「絞り込み」を開くと詳細カテゴリと地図範囲を指定できます。詳細カテゴリは選択中の大分類に連動します。
- 一覧にカテゴリ・名称・紹介文・住所を表示します。紹介文は2行まで表示し、全文は詳細で読めます。実画像のURLがある場合は一覧にも写真を表示し、読めない場合はカテゴリのアイコンを表示します。
- 選択したカードとピンを強調し、ピンの名称を表示します。スマホでは一覧を下から開き、詳細カードの上に選択ピンを表示します。
- PCでは検索パネル右上の矢印で一覧を開閉できます。閉じると地図が広がり、再び開いても検索条件・選択・一覧のスクロール位置を保ちます。閉じたパネルはキーボード操作の対象から外します。
- 選択時は既存カードを保持して240msで元の大きさに戻します。ピンの内側は地図の移動後に300msで一度拡縮します。詳細はPCで18px・320ms、スマホで22px・340msのスライドとフェードで表示します。情報の再取得だけでは出現を繰り返しません。パネルの開閉は300msで地図の幅も追従します。
- 詳細を閉じるときは240msでフェードし、PCで12px・スマホで16px下へ戻してから非表示にします。出現途中でも現在の見た目から閉じ、途中で再選択した場合は古い終了処理を解除します。「動きを減らす」設定では即座に閉じ、終了中に設定が変わった場合も非表示を完了します。
- OS・ブラウザの「動きを減らす」設定では、これらの拡縮と出現アニメーションを省き、選択色・名称・文言で状態を伝えます。設定が途中で変わった場合も、実行中の選択・出現アニメーションを停止します。地点選択・全地点表示・現在地への自動移動も設定に従います。
- 件数は一覧の上に集約します。接続元は「接続設定」で確認でき、一覧下部にはデータの状態と取得日時だけを表示します。

## Apps Script APIを接続

1. Google Apps Scriptで新しいプロジェクトを作成します。
2. `Code.gs`の内容をコードエディタに貼り付けます。
3. 「プロジェクトの設定」で「appsscript.json マニフェスト ファイルをエディタで表示する」を有効にし、同ファイルの内容を貼り付けます。Google SheetsのAdvanced Serviceと、読み取り専用OAuthスコープを明示します。標準の`SpreadsheetApp.openById`は書き込みを含むスコープを要求するため、使用しません。デフォルトGCPプロジェクトではサービス追加時にSheets APIが自動で有効になります。独自GCPプロジェクトに変更した場合は、そのプロジェクトでSheets APIを有効にしてください。
4. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」。実行ユーザー「自分」、アクセスできるユーザー「全員」でデプロイします。
5. Google側で、実行アカウントのスプレッドシート読み取り権限を承認します。対象シートを読めるアカウントを使ってください。組織の設定によって匿名公開が許可されない場合があります。
6. コピーした `/exec` URLを、地図画面右上の接続設定に貼り付けます。
7. 一覧下部が「最新データ」、接続設定内が「スプレッドシート接続済み」に変わることを確認します。更新ボタンでシートの最新データを再取得します。

静的ページ共通の接続先にする場合は、`dist/config.js`の`apiUrl`にURLを設定します。
接続設定で保存したURLは、そのブラウザ内にだけ保存され、config.jsより優先されます。
API失敗時に確認時点データへ自動切替はしません。更新失敗と前回データ表示を明示します。

### 一体型で使う場合

Apps ScriptにHTMLファイル`Index`を作り、`apps-script/Index.html`の内容を貼り付けます。
同じデプロイURLの末尾に `?view=map` を付けて開きます。
HTML Serviceの`google.script.run`で直接シートを読み、外部API URLの設定は不要です。
Googleログインが必要な公開範囲でも、この一体型なら利用できます。

## API仕様

`GET /exec?action=pois` がJSONを返します。ContentServiceはリダイレクトするため、HTTPクライアントはリダイレクトに従ってください。

任意の引数:

- `q`: 名称・住所・説明・カテゴリのキーワード。空白で複数指定するとAND検索。
- `category`: シート内のカテゴリとの完全一致。
- `callback`: `__ushiku_cb_` + 数字1〜32桁。ブラウザ向けJSONP。

```json
{"ok":true,"schemaVersion":1,"fetchedAt":"…","source":{"sheetName":"シート1","headerRow":2,"mode":"live"},"total":21,"skippedRows":0,"items":[{"id":"sheet-0-row-4","row":4,"name":"牛久シャトー","location":"…","lat":35.97802056,"lon":140.1473454,"description":"…","time":"…","closed":"…","category":"ワイン醸造所","image":"","sourceUrl":"…","coordinateWarning":""}]}
```

エラーは`ok:false`と`error.code`、`error.message`を返します。ContentServiceの制約によりHTTPステータスはアプリの成功判定に使わず、`ok`を確認します。

公開JSONPは観光情報など非機密の読み取り専用データだけに使用します。
他のシート・列は公開しません。許可されたフィールドだけ返します。
フロントエンドはスクリプトURLをGoogle Apps Scriptの`/exec`に限定し、シートの文字列はDOMのtextContentで表示します。

## シートの形式

接続先: `1UJGEZiVQQ3OYiweZG2CgyhgOUkIg8FlaE2KtkyxfZ74` の「シート1」。
先頭10行から`name`・`lat`・`lon`のある見出し行を検出します。現状は2行目です。
空行は無視します。名称欠損、座標欠損、緯度±90度・経度±180度の範囲外は除外して件数を返します。
`location`・`description`・`time`・`closed`・`category`・`image`・`取得したサイト`は任意です。
上限は5,000行・100列。任意のシートIDをクエリから指定する仕組みはありません。

### 元データの確認点

- 牛久大仏（6行目）の座標`35.585766, 140.13131`は基準点から25km以上離れるため、「座標要確認」と表示します。地図はシート記載値を表示し、推測による補正は行いません。
- 一部住所も数字表記が不自然に見えますが、入力値をそのまま表示します。内容や営業時間の正確性は、今回は検証対象に含めていません。
- `image`列のファイル名を同梱画像に対応させ、一覧と詳細に表示します。公開https URLも利用できます。空欄や未配置の画像は表示しません。詳しくは「ローカル画像の表示」を参照してください。
- IDはシートIDと行番号から作ります。行の挿入・並び替えで変わります。
- 「表示中の地図範囲で絞る」は一覧だけを絞ります。マーカーは検索・ジャンル・カテゴリの条件で表示し、移動時の描き直しを避けます。
- 「全地点を表示」は検索・ジャンル・カテゴリに一致する地点全体を表示します。座標要確認の地点も含みます。

## ローカル画像の表示

`images/` の画像を、スプレッドシートの `image` 列に書かれたファイル名と対応させて、一覧とスポット詳細に表示します。空欄の地点には従来のカテゴリアイコンを表示します。画像が欠けていても地図の操作は続けられます。

`npm run build` で画像を `dist/images/` にコピーし、対応表 `dist/images.js` とApps Script一体型HTMLを生成します。日本語ファイル名はNFCに統一し、URLではエンコードします。指定済みの `.jpg` / `.jpeg` の違いは、同名のJPEGが1件だけ存在する場合に対応させます。GitHub Pagesの公開ワークフローにもこのビルド処理を追加しています。

2026年10月15日の元シート確認では、画像指定12件のうち11件が表示対象です。「Dining いごこち屋」の `いごこち屋.jpg` は未配置です。牛久駅の `牛久駅.jpg` は `牛久駅.jpeg`、天満屋酒店の `天満屋酒店.jpeg` は `天満屋酒店.jpg` を使います。芋千・そば処ふしみ・シャンボール・金剛院・井岡神社はファイルがありますが、列が空欄のため表示しません。シートは変更していません。

既存の公開APIはファイル名を空文字に変換します。そのAPIのままでも動くよう、元シートから確認した名称と画像列を `image-references.json` に保存し、標準接続先の旧APIに限って補います。名称から画像名を推測する処理はありません。別のAPI接続先ではこの補完を使いません。

今後の `image` 列の変更を地図の更新ボタンだけで反映するには、修正済みの `apps-script/Code.gs` を既存のApps Scriptデプロイへ反映してください。修正版はファイル名も返し、`source.imageReferences: true` を返します。この場合は最新の指定・空欄を優先し、古い対応表を使いません。未更新の間に画像列を変更した場合は、`image-references.json` の該当行も更新してビルドします。

新しい画像ファイルを追加した場合は、APIの更新後もビルドとGitHub Pagesへの公開が必要です。https URLによる画像も引き続き使えます。一体型版の画像は `dist/config.js` の `imageBaseUrl` で指定する公開先から取得します。

## 検証

```powershell
npm test
npm run build
```

NodeテストはGoogleサービスのスタブを利用します。実Googleへの権限承認と公開API経由の再取得確認は、デプロイ後の別の検証です。
現在地はブラウザに許可した場合だけ取得します。位置情報をシート、サーバー、localStorageへ送信・保存しません。背景タイルの配信サーバーには、表示範囲に応じた通常のタイルリクエストが届きます。

## 参照

- [Leaflet 1.9.4公式リファレンス](https://leafletjs.com/reference.html)
- [Apps Script Webアプリ](https://developers.google.com/apps-script/guides/web)
- [ContentService / JSONP / リダイレクト](https://developers.google.com/apps-script/guides/content)
- [HTML Serviceとの通信](https://developers.google.com/apps-script/guides/html/communication)
- [Advanced Services](https://developers.google.com/apps-script/guides/services/advanced)
- [Sheets values.getと対応スコープ](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get)
- [OpenStreetMapタイル利用方針](https://operations.osmfoundation.org/policies/tiles/)

OSMの出典表示を地図に常時表示し、ブラウザ標準のキャッシュを利用します。タイルの一括取得・オフライン保存は実装していません。
