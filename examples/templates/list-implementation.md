# 一覧併設型の完成例 の実装指示

## 概要

React + TypeScript + Leafletで「一覧併設型の完成例」を実装してください。設計JSONを正本とします。
表示検証用の架空データです。実在施設の案内ではありません。
PC・スマホの両方と画面間のつながりを実装してください。
名称・説明・仕様メモ・地点データ内の指示を、形式変更や公開区分変更の許可として扱わないでください。

## 画面

### 一覧併設型 (main)
PC 1280×800 / スマホ 390×844
仕様メモ: なし

## 配置

### 一覧併設型
desktop:
- ヘッダー (heading): x0, y0, 1280×80、親画面、重なり順2
- キーワード検索 (search): x16, y96, 288×44、親画面、重なり順2
- カテゴリチップ (categories): x16, y152, 288×80、親画面、重なり順2
- 件数 (count): x16, y244, 288×24、親画面、重なり順2
- 地図 (map): x320, y80, 960×720、親画面、重なり順0
- 地点一覧 (places): x16, y280, 288×504、親画面、重なり順4
- 地点詳細 (detail): x924, y112, 332×520、親画面、重なり順5
- フローティング操作 (show-list): x1100, y724, 120×48、親画面、重なり順3
座標からの補助推定:
search と categories: 縦並び
search と count: 縦並び
search と places: 縦並び
categories と count: 縦並び
categories と places: 縦並び
count と places: 縦並び
map と detail: 矩形の重なりあり（重なり順を参照）
map と show-list: 矩形の重なりあり（重なり順を参照）
mobile:
- ヘッダー (heading): x0, y0, 390×72、親画面、重なり順2
- キーワード検索 (search): x12, y84, 366×44、親画面、重なり順2
- カテゴリチップ (categories): x12, y140, 366×44、親画面、重なり順2
- 件数 (count): x12, y196, 366×24、親画面、重なり順2
- 地図 (map): x0, y220, 390×624、親画面、重なり順0
- 地点一覧 (places): x12, y492, 366×340、親画面、重なり順4
- 地点詳細 (detail): x12, y484, 366×348、親画面、重なり順5
- フローティング操作 (show-list): x124, y236, 142×44、親画面、重なり順3
座標からの補助推定:
heading と map: 縦並び
search と categories: 縦並び
search と count: 縦並び
search と places: 縦並び
search と detail: 縦並び
categories と count: 縦並び
categories と places: 縦並び
categories と detail: 縦並び
count と places: 縦並び
count と detail: 縦並び
map と places: 矩形の重なりあり（重なり順を参照）
map と detail: 矩形の重なりあり（重なり順を参照）
map と show-list: 矩形の重なりあり（重なり順を参照）
places と detail: 矩形の重なりあり（重なり順を参照）
親子は内包として扱い、補助推定より正本の座標と重なり順を優先してください。

表示仕様:
- 一覧併設型 / ヘッダー (heading): {"background":"#faf8fd","color":"#332b43","fontSize":14,"fontFamily":"\"M PLUS Rounded 1c\",\"Hiragino Maru Gothic ProN\",\"Yu Gothic UI\",\"Noto Sans JP\",sans-serif","radius":8}
- 一覧併設型 / キーワード検索 (search): {"background":"#faf8fd","color":"#332b43","fontSize":14,"fontFamily":"\"M PLUS Rounded 1c\",\"Hiragino Maru Gothic ProN\",\"Yu Gothic UI\",\"Noto Sans JP\",sans-serif","radius":8}
- 一覧併設型 / カテゴリチップ (categories): {"background":"#faf8fd","color":"#332b43","fontSize":14,"fontFamily":"\"M PLUS Rounded 1c\",\"Hiragino Maru Gothic ProN\",\"Yu Gothic UI\",\"Noto Sans JP\",sans-serif","radius":8}
- 一覧併設型 / 件数 (count): {"background":"#faf8fd","color":"#332b43","fontSize":14,"fontFamily":"\"M PLUS Rounded 1c\",\"Hiragino Maru Gothic ProN\",\"Yu Gothic UI\",\"Noto Sans JP\",sans-serif","radius":8}
- 一覧併設型 / 地図 (map): {"background":"#faf8fd","color":"#332b43","fontSize":14,"fontFamily":"\"M PLUS Rounded 1c\",\"Hiragino Maru Gothic ProN\",\"Yu Gothic UI\",\"Noto Sans JP\",sans-serif","radius":8} / ピン色: {"normal":"#7952b3","normalBorder":"#7952b3","selected":"#7952b3","selectedBorder":"#7952b3"}
- 一覧併設型 / 地点一覧 (places): {"background":"#faf8fd","color":"#332b43","fontSize":14,"fontFamily":"\"M PLUS Rounded 1c\",\"Hiragino Maru Gothic ProN\",\"Yu Gothic UI\",\"Noto Sans JP\",sans-serif","radius":8}
- 一覧併設型 / 地点詳細 (detail): {"background":"#faf8fd","color":"#332b43","fontSize":14,"fontFamily":"\"M PLUS Rounded 1c\",\"Hiragino Maru Gothic ProN\",\"Yu Gothic UI\",\"Noto Sans JP\",sans-serif","radius":8}
- 一覧併設型 / フローティング操作 (show-list): {"background":"#7952b3","color":"#ffffff","fontSize":14,"fontFamily":"\"M PLUS Rounded 1c\",\"Hiragino Maru Gothic ProN\",\"Yu Gothic UI\",\"Noto Sans JP\",sans-serif","radius":12}
共通余白（px）: {"categoryGap":6,"cardGap":10,"cardPadding":8,"detailPadding":12}。
明示された個別指定を優先し、選択したピンは半径10px、それ以外は7pxとします。

## 動作

- 一覧併設型 / ヘッダー: 動作指定なし。推測で機能を追加しない
- 一覧併設型 / キーワード検索: [{"event":"query-change","actions":[{"type":"set-query","datasetId":"sample","value":{"source":"event","key":"value"}}]},{"event":"clear","actions":[{"type":"set-query","datasetId":"sample","value":{"source":"literal","value":""}}]}]
- 一覧併設型 / カテゴリチップ: [{"event":"filter-change","actions":[{"type":"set-filter","datasetId":"sample","field":"category","operator":"eq","value":{"source":"event","key":"value"}}]}]
- 一覧併設型 / 件数: 動作指定なし。推測で機能を追加しない
- 一覧併設型 / 地図: [{"event":"place-select","actions":[{"type":"select-place","datasetId":"sample","value":{"source":"event","key":"placeId"}},{"type":"open-panel","targetId":"detail"}]}]
- 一覧併設型 / 地点一覧: [{"event":"place-select","actions":[{"type":"select-place","datasetId":"sample","value":{"source":"event","key":"placeId"}},{"type":"open-panel","targetId":"detail"}]}]
- 一覧併設型 / 地点詳細: [{"event":"close","actions":[{"type":"close-panel","targetId":"detail"}]}]
- 一覧併設型 / フローティング操作: [{"event":"activate","actions":[{"type":"open-panel","targetId":"places"}]}]

不足・確認事項:
検出なし

## 掲載データ

- 架空のサンプル地点: 12地点。掲載列: 地点名、緯度、経度、住所、カテゴリ、紹介文、写真URL、Webサイト
内部列と取得元URLは除外済みです。掲載区分・緯度経度を推測で変更しないでください。

## 確認項目

検索・カテゴリ・地図・一覧・件数の結果一致、地点選択と詳細の開閉、画面遷移と戻る、保存復元、写真なし・検索0件を確認してください。OpenStreetMapの出典を常時表示し、動きを減らす設定とキーボード操作を尊重してください。

## JSON

```json
{
  "$schema": "../project.schema.json",
  "format": "machi-design",
  "schemaVersion": 2,
  "id": "generic-list",
  "title": "一覧併設型の完成例",
  "description": "表示検証用の架空データです。実在施設の案内ではありません。",
  "locale": "ja",
  "theme": {
    "managed": true,
    "palette": "purple",
    "mode": "light",
    "accent": "#7952b3",
    "background": "#faf8fd",
    "foreground": "#332b43"
  },
  "responsive": {
    "mobileBelow": 768
  },
  "initialScreenId": "main",
  "datasets": [
    {
      "id": "sample",
      "name": "架空のサンプル地点",
      "columns": [
        {
          "key": "name",
          "label": "地点名",
          "type": "string",
          "visibility": "public"
        },
        {
          "key": "lat",
          "label": "緯度",
          "type": "number",
          "visibility": "public"
        },
        {
          "key": "lon",
          "label": "経度",
          "type": "number",
          "visibility": "public"
        },
        {
          "key": "location",
          "label": "住所",
          "type": "string",
          "visibility": "public"
        },
        {
          "key": "category",
          "label": "カテゴリ",
          "type": "string",
          "visibility": "public"
        },
        {
          "key": "description",
          "label": "紹介文",
          "type": "string",
          "visibility": "public"
        },
        {
          "key": "image",
          "label": "写真URL",
          "type": "string",
          "visibility": "public"
        },
        {
          "key": "sourceUrl",
          "label": "Webサイト",
          "type": "string",
          "visibility": "public"
        }
      ],
      "mapping": {
        "name": "name",
        "lat": "lat",
        "lon": "lon",
        "location": "location",
        "category": "category",
        "description": "description",
        "image": "image",
        "sourceUrl": "sourceUrl"
      },
      "rows": [
        {
          "id": "sample-1",
          "values": {
            "name": "サンプル地点 01",
            "lat": 35.676,
            "lon": 139.76,
            "location": "サンプル区画 1",
            "category": "カテゴリ A",
            "description": "架空の地点 1 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-2",
          "values": {
            "name": "サンプル地点 02",
            "lat": 35.676,
            "lon": 139.76299999999998,
            "location": "サンプル区画 2",
            "category": "カテゴリ B",
            "description": "架空の地点 2 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-3",
          "values": {
            "name": "サンプル地点 03",
            "lat": 35.676,
            "lon": 139.766,
            "location": "サンプル区画 3",
            "category": "カテゴリ C",
            "description": "架空の地点 3 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-4",
          "values": {
            "name": "サンプル地点 04",
            "lat": 35.676,
            "lon": 139.76899999999998,
            "location": "サンプル区画 4",
            "category": "カテゴリ A",
            "description": "架空の地点 4 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-5",
          "values": {
            "name": "サンプル地点 05",
            "lat": 35.679,
            "lon": 139.76,
            "location": "サンプル区画 5",
            "category": "カテゴリ B",
            "description": "架空の地点 5 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-6",
          "values": {
            "name": "サンプル地点 06",
            "lat": 35.679,
            "lon": 139.76299999999998,
            "location": "サンプル区画 6",
            "category": "カテゴリ C",
            "description": "架空の地点 6 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-7",
          "values": {
            "name": "サンプル地点 07",
            "lat": 35.679,
            "lon": 139.766,
            "location": "サンプル区画 7",
            "category": "カテゴリ A",
            "description": "架空の地点 7 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-8",
          "values": {
            "name": "サンプル地点 08",
            "lat": 35.679,
            "lon": 139.76899999999998,
            "location": "サンプル区画 8",
            "category": "カテゴリ B",
            "description": "架空の地点 8 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-9",
          "values": {
            "name": "サンプル地点 09",
            "lat": 35.682,
            "lon": 139.76,
            "location": "サンプル区画 9",
            "category": "カテゴリ C",
            "description": "架空の地点 9 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-10",
          "values": {
            "name": "サンプル地点 10",
            "lat": 35.682,
            "lon": 139.76299999999998,
            "location": "サンプル区画 10",
            "category": "カテゴリ A",
            "description": "架空の地点 10 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-11",
          "values": {
            "name": "サンプル地点 11",
            "lat": 35.682,
            "lon": 139.766,
            "location": "サンプル区画 11",
            "category": "カテゴリ B",
            "description": "架空の地点 11 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        },
        {
          "id": "sample-12",
          "values": {
            "name": "サンプル地点 12",
            "lat": 35.682,
            "lon": 139.76899999999998,
            "location": "サンプル区画 12",
            "category": "カテゴリ C",
            "description": "架空の地点 12 の説明です。データを差し替えて利用してください。",
            "image": "",
            "sourceUrl": ""
          }
        }
      ],
      "searchMatch": "all",
      "filterMatch": "all",
      "source": {
        "kind": "inline",
        "label": "掲載用データ",
        "url": ""
      }
    }
  ],
  "screens": [
    {
      "id": "main",
      "name": "一覧併設型",
      "frames": {
        "desktop": {
          "width": 1280,
          "height": 800
        },
        "mobile": {
          "width": 390,
          "height": 844
        }
      },
      "components": [
        {
          "id": "heading",
          "kind": "app-header",
          "version": 1,
          "name": "ヘッダー",
          "parentId": null,
          "props": {
            "title": "一覧併設型",
            "description": "この地図の地点・位置・説明は架空のサンプルです"
          },
          "style": {},
          "binding": null,
          "interactions": [],
          "layouts": {
            "desktop": {
              "x": 0,
              "y": 0,
              "width": 1280,
              "height": 80,
              "zIndex": 2,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "start",
              "presentation": "inline"
            },
            "mobile": {
              "x": 0,
              "y": 0,
              "width": 390,
              "height": 72,
              "zIndex": 2,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "start",
              "presentation": "inline"
            }
          },
          "transition": {
            "type": "none",
            "durationMs": 0,
            "direction": "up"
          }
        },
        {
          "id": "search",
          "kind": "place-search",
          "version": 1,
          "name": "キーワード検索",
          "parentId": null,
          "props": {
            "placeholder": "地点を検索",
            "searchFields": [
              "name",
              "location",
              "description"
            ]
          },
          "style": {},
          "binding": {
            "datasetId": "sample",
            "mode": "collection"
          },
          "interactions": [
            {
              "event": "query-change",
              "actions": [
                {
                  "type": "set-query",
                  "datasetId": "sample",
                  "value": {
                    "source": "event",
                    "key": "value"
                  }
                }
              ]
            },
            {
              "event": "clear",
              "actions": [
                {
                  "type": "set-query",
                  "datasetId": "sample",
                  "value": {
                    "source": "literal",
                    "value": ""
                  }
                }
              ]
            }
          ],
          "layouts": {
            "desktop": {
              "x": 16,
              "y": 96,
              "width": 288,
              "height": 44,
              "zIndex": 2,
              "hidden": false,
              "horizontal": "start",
              "vertical": "start",
              "presentation": "inline"
            },
            "mobile": {
              "x": 12,
              "y": 84,
              "width": 366,
              "height": 44,
              "zIndex": 2,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "start",
              "presentation": "inline"
            }
          },
          "transition": {
            "type": "none",
            "durationMs": 0,
            "direction": "up"
          }
        },
        {
          "id": "categories",
          "kind": "category-chips",
          "version": 1,
          "name": "カテゴリチップ",
          "parentId": null,
          "props": {
            "field": "category",
            "allLabel": "すべて",
            "multiple": false
          },
          "style": {},
          "binding": {
            "datasetId": "sample",
            "mode": "collection"
          },
          "interactions": [
            {
              "event": "filter-change",
              "actions": [
                {
                  "type": "set-filter",
                  "datasetId": "sample",
                  "field": "category",
                  "operator": "eq",
                  "value": {
                    "source": "event",
                    "key": "value"
                  }
                }
              ]
            }
          ],
          "layouts": {
            "desktop": {
              "x": 16,
              "y": 152,
              "width": 288,
              "height": 80,
              "zIndex": 2,
              "hidden": false,
              "horizontal": "start",
              "vertical": "start",
              "presentation": "inline"
            },
            "mobile": {
              "x": 12,
              "y": 140,
              "width": 366,
              "height": 44,
              "zIndex": 2,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "start",
              "presentation": "inline"
            }
          },
          "transition": {
            "type": "none",
            "durationMs": 0,
            "direction": "up"
          }
        },
        {
          "id": "count",
          "kind": "result-count",
          "version": 1,
          "name": "件数",
          "parentId": null,
          "props": {
            "suffix": "件の地点",
            "showTotal": true
          },
          "style": {},
          "binding": {
            "datasetId": "sample",
            "mode": "collection"
          },
          "interactions": [],
          "layouts": {
            "desktop": {
              "x": 16,
              "y": 244,
              "width": 288,
              "height": 24,
              "zIndex": 2,
              "hidden": false,
              "horizontal": "start",
              "vertical": "start",
              "presentation": "inline"
            },
            "mobile": {
              "x": 12,
              "y": 196,
              "width": 366,
              "height": 24,
              "zIndex": 2,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "start",
              "presentation": "inline"
            }
          },
          "transition": {
            "type": "none",
            "durationMs": 0,
            "direction": "up"
          }
        },
        {
          "id": "map",
          "kind": "map-view",
          "version": 1,
          "name": "地図",
          "parentId": null,
          "props": {
            "center": {
              "lat": 35.679,
              "lon": 139.7645
            },
            "zoom": 14,
            "minZoom": 3,
            "maxZoom": 19,
            "tileSource": "osm-standard"
          },
          "style": {},
          "binding": {
            "datasetId": "sample",
            "mode": "collection"
          },
          "interactions": [
            {
              "event": "place-select",
              "actions": [
                {
                  "type": "select-place",
                  "datasetId": "sample",
                  "value": {
                    "source": "event",
                    "key": "placeId"
                  }
                },
                {
                  "type": "open-panel",
                  "targetId": "detail"
                }
              ]
            }
          ],
          "layouts": {
            "desktop": {
              "x": 320,
              "y": 80,
              "width": 960,
              "height": 720,
              "zIndex": 0,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "stretch",
              "presentation": "inline"
            },
            "mobile": {
              "x": 0,
              "y": 220,
              "width": 390,
              "height": 624,
              "zIndex": 0,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "stretch",
              "presentation": "inline"
            }
          },
          "transition": {
            "type": "none",
            "durationMs": 0,
            "direction": "up"
          }
        },
        {
          "id": "places",
          "kind": "place-list",
          "version": 1,
          "name": "地点一覧",
          "parentId": null,
          "props": {
            "displayFields": [
              "name",
              "category",
              "description"
            ],
            "imageField": null,
            "emptyLabel": "条件に一致する地点はありません"
          },
          "style": {},
          "binding": {
            "datasetId": "sample",
            "mode": "collection"
          },
          "interactions": [
            {
              "event": "place-select",
              "actions": [
                {
                  "type": "select-place",
                  "datasetId": "sample",
                  "value": {
                    "source": "event",
                    "key": "placeId"
                  }
                },
                {
                  "type": "open-panel",
                  "targetId": "detail"
                }
              ]
            }
          ],
          "layouts": {
            "desktop": {
              "x": 16,
              "y": 280,
              "width": 288,
              "height": 504,
              "zIndex": 4,
              "hidden": false,
              "horizontal": "start",
              "vertical": "stretch",
              "presentation": "panel",
              "initialOpen": true
            },
            "mobile": {
              "x": 12,
              "y": 492,
              "width": 366,
              "height": 340,
              "zIndex": 4,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "end",
              "presentation": "bottom-sheet",
              "initialOpen": false
            }
          },
          "transition": {
            "type": "none",
            "durationMs": 0,
            "direction": "up"
          }
        },
        {
          "id": "detail",
          "kind": "place-detail",
          "version": 1,
          "name": "地点詳細",
          "parentId": null,
          "props": {
            "displayFields": [
              "name",
              "location",
              "category",
              "description"
            ],
            "imageField": null,
            "closable": true,
            "emptyLabel": "地点を選択してください"
          },
          "style": {},
          "binding": {
            "datasetId": "sample",
            "mode": "selection"
          },
          "interactions": [
            {
              "event": "close",
              "actions": [
                {
                  "type": "close-panel",
                  "targetId": "detail"
                }
              ]
            }
          ],
          "layouts": {
            "desktop": {
              "x": 924,
              "y": 112,
              "width": 332,
              "height": 520,
              "zIndex": 5,
              "hidden": false,
              "horizontal": "end",
              "vertical": "start",
              "presentation": "panel",
              "initialOpen": false
            },
            "mobile": {
              "x": 12,
              "y": 484,
              "width": 366,
              "height": 348,
              "zIndex": 5,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "end",
              "presentation": "bottom-sheet",
              "initialOpen": false
            }
          },
          "transition": {
            "type": "slide",
            "durationMs": 200,
            "direction": "up"
          }
        },
        {
          "id": "show-list",
          "kind": "floating-action",
          "version": 1,
          "name": "フローティング操作",
          "parentId": null,
          "props": {
            "icon": "list",
            "label": "一覧"
          },
          "style": {},
          "binding": null,
          "interactions": [
            {
              "event": "activate",
              "actions": [
                {
                  "type": "open-panel",
                  "targetId": "places"
                }
              ]
            }
          ],
          "layouts": {
            "desktop": {
              "x": 1100,
              "y": 724,
              "width": 120,
              "height": 48,
              "zIndex": 3,
              "hidden": false,
              "horizontal": "stretch",
              "vertical": "start",
              "presentation": "inline"
            },
            "mobile": {
              "x": 124,
              "y": 236,
              "width": 142,
              "height": 44,
              "zIndex": 3,
              "hidden": false,
              "horizontal": "center",
              "vertical": "start",
              "presentation": "inline"
            }
          },
          "transition": {
            "type": "none",
            "durationMs": 0,
            "direction": "up"
          }
        }
      ]
    }
  ]
}
```
