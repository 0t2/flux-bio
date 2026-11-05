# 主題配色 Theme color sets

這個資料夾裡的配色會出現在 FluxBio 後台的「外觀」。
The color sets listed here show up in every FluxBio dashboard, on 外觀.

## 投稿 How to add yours

1. 把一組配色加進 [`community.json`](community.json) 的 `themes` 陣列，補上 `id`（英文小寫和 `-`）和 `author`（你的 GitHub 帳號）。
   Add a color set to the `themes` array in `community.json` with an `id` (lowercase letters and `-`) and `author` (your GitHub handle).
2. 開 pull request。Open a pull request.

這份清單是每個主題可以選的配色：一組配色就是一個基礎主題，加上主色、背景和文字顏色，再標上適合的頁面。每個主題只留幾組，名稱請用英文。
This list holds the color sets each theme offers: a base theme plus an accent, background and text colors, tagged with the kinds of page it suits. Each theme keeps only a few, named in English.

```json
{ "id": "night-market", "name": "Night Market", "base": "liquid", "accent": "#FF5FA2", "accent2": "#3A1E31", "bg": "#0E0A1F", "fg": "#FFFFFF", "font": "auto", "button": "auto", "uses": ["event", "creator"], "author": "your-github" }
```

| 欄位 Field | 可以填 Values |
|---|---|
| `base` | `liquid` 霓虹 Neon、`editorial` 全景 Vista、`brutal` 方塊 Tiles、`jelly` 糖果 Candy、`minimal` 留白 Airy、`aurora` 極光 Aurora、`notebook` 卡片 Card、`boutique` 霧面 Frost、`sunset` 晚霞 Sunset、`sky` 晴空 Sky、`pop` 繽紛 Pop、`portrait` 肖像 Portrait、`sheet` 半版 Sheet、`rail` 側欄 Rail、`duo` 雙色 Two-tone、`relief` 浮雕 Relief、`bento` 便當 Bento、`dots` 圓鈕 Dots、`pastel` 粉彩 Pastel、`letter` 信箋 Letter、`obsidian` 曜石 Obsidian、`moon` 滿月 Moon、`chips` 標籤 Chips、`tracks` 歌單 Tracks |
| `accent` | `#RRGGBB` |
| `accent2` | 第二個顏色：卡片外的底色、漸層的另一端或列的底色，看主題而定 The second color: the field around a card, the far end of a gradient or tinted rows, depending on the theme: `#RRGGBB` |
| `bg` | 背景 background，`#RRGGBB`。`liquid`、`editorial`、`brutal`、`aurora`、`portrait`、`rail`、`dots`、`obsidian` 要深色，其他要淺色 These take a dark color, the others a light one |
| `fg` | 文字 text，`#RRGGBB`；和背景對比至少 4.5:1 At least 4.5:1 on the background |
| `font`、`button` | `auto` |
| `headFont`、`bodyFont` | 不填。Left out. |
| `uses` | 至少一個 at least one of: `creator` 創作者、`shop` 小店、`event` 活動、`pro` 專業人士、`org` 社團組織 |

想要有自己的圖片和字型的主題，請你的 AI 做：它會存進你 FluxBio 裡的「我的主題」。
A look with pictures and fonts of its own is for your AI to make: it stays in your deployment, under 我的主題.

`pnpm test` 會檢查每組配色都有 `uses`，而且顏色不用調整就符合基礎主題的規定。
`pnpm test` checks that every set has `uses`, and that its colors fit its base theme as they are.

這個資料夾裡的主題以 MIT 授權釋出，和 `src/templates/` 相同。
Themes in this folder are MIT-licensed, like `src/templates/`.
