# machi. エディター

公開トップのエントリーは index.html と Editor.tsx です。Viewer.tsx はダウンロードする閲覧用HTMLで同じ部品の描画と操作を実行します。

- contracts/map-template.machi.json: 地点0件の初期設計。
- contracts/map-sample.machi.json: 架空の3地点による操作確認例。
- contracts/generic-components.machi.json: 地点データを使わない汎用画面例。
- contracts/project.schema.json: 設計形式の正本。外部フォルダーからの上書きは行いません。
- runtime.ts: 部品生成、データ列との接続、検索、操作、AI向け出力。
- MapView.tsx / PreviewComponents.tsx: 地図とその他の部品。
- storage.ts: machi.専用のIndexedDB保存。旧版の保存領域は自動読込・削除しません。

データのmappingは地点名・緯度・経度・分類などの役割と実際の列キーを結びます。新規の検索・一覧・詳細・カテゴリ部品は、この対応を使って列と動作を設定します。表示・検索・出力は公開列に限定します。

ビルド、実行、入力データの制限はリポジトリのREADMEを参照してください。
