# 貢獻指南 — OnlinePixelAgents

感謝你有興趣為 OnlinePixelAgents 做出貢獻！歡迎各種類型的貢獻 — 新功能、錯誤修復、文件改進、重構等。

本專案以 [MIT License](LICENSE) 授權，你的貢獻也將適用相同授權。無需 CLA 或 DCO。

## 開始之前

### 前置需求

- [Node.js](https://nodejs.org/) 18+（LTS 推薦）
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)（用於實際代理測試）

### 安裝（Web 版本）

```bash
git clone https://github.com/RD-CAT/OnlinePixelAgents.git
cd OnlinePixelAgents/web
npm install
npm run build
npm start
```

瀏覽器開啟 `http://localhost:3000`。

### 安裝（VS Code 擴充 — 原始版本參考）

```bash
cd OnlinePixelAgents
npm install
cd webview-ui && npm install && cd ..
npm run build
```

在 VS Code 中按 **F5** 啟動 Extension Development Host。

## 開發流程

### Web 版本

```bash
cd web
npm run dev
```

同時啟動 Vite 開發伺服器（客戶端熱重載 :5173）和 tsx watch（伺服器熱重載 :3000）。

演示模式（無需 Claude Code）：

```bash
cd web/server
node dist/index.js --demo
```

### VS Code 擴充

```bash
npm run watch
```

啟動 esbuild 和 TypeScript type-checking 的平行監視器。Webview 變更後需執行 `npm run build:webview`。

### 專案結構

| 目錄 | 說明 |
|---|---|
| `web/server/` | Web 版後端 — Express + Socket.IO |
| `web/client/` | Web 版前端 — React + Vite |
| `src/` | 原始 VS Code 擴充後端（參考用） |
| `webview-ui/` | 原始 VS Code webview 前端（參考用） |
| `scripts/` | 素材擷取和生成工具 |

## 程式碼規範

### 常數管理

所有魔術數字和字串集中管理 — 不要在原始碼中內嵌常數：

- **Web 伺服器：** `web/server/src/constants.ts`
- **Web 客戶端：** `web/client/src/constants.ts`
- **CSS 變數：** `web/client/src/index.css` `:root` 區塊（`--pixel-*` 屬性）
- **i18n 字串：** `web/client/src/i18n.ts`

### TypeScript 限制

- 禁用 `enum`（`erasableSyntaxOnly`）— 使用 `as const` 物件
- 型別匯入需使用 `import type`（`verbatimModuleSyntax`）
- `noUnusedLocals` / `noUnusedParameters` 已啟用

### UI 風格

專案採用像素藝術美學，所有覆蓋層應使用：

- 銳角（`border-radius: 0`）
- 實心背景和 `2px solid` 邊框
- 硬偏移陰影（`2px 2px 0px`，無模糊）
- FS Pixel Sans 字型（在 `index.css` 中載入）

## 提交 Pull Request

1. Fork 倉庫並從 `main` 建立功能分支
2. 進行修改
3. 執行完整建置以驗證：
   ```bash
   cd web && npm run build
   ```
4. 向 `main` 開啟 Pull Request，包含：
   - 清楚描述變更內容和原因
   - 測試方式（重現/驗證步驟）
   - **UI 變更請附截圖或 GIF**

## 回報錯誤

[開啟 Issue](https://github.com/RD-CAT/OnlinePixelAgents/issues)，包含：

- 預期行為
- 實際行為
- 重現步驟
- Node.js 版本和作業系統

## 功能建議

有想法？[開啟 Issue](https://github.com/RD-CAT/OnlinePixelAgents/issues) 先討論，避免重複工作並確保功能符合專案方向。

## 行為準則

本專案遵循[貢獻者公約行為準則](CODE_OF_CONDUCT.md)。參與即表示你同意遵守此規範。
