# OnlinePixelAgents -- 權限系統開發路線圖

> **版本：** 1.0
> **日期：** 2026-03-15
> **狀態：** 草案（Draft）
> **作者：** 需求分析產出

---

## 目錄

- [1. 目標與範圍](#1-目標與範圍)
- [2. 現況分析](#2-現況分析)
- [3. Phase 1：核心認證框架](#3-phase-1核心認證框架)
- [4. Phase 2：用戶專屬樓層](#4-phase-2用戶專屬樓層)
- [5. Phase 3：代理所有權](#5-phase-3代理所有權)
- [6. Phase 4：管理功能](#6-phase-4管理功能)
- [7. Phase 5：安全強化與 UX 打磨](#7-phase-5安全強化與-ux-打磨)
- [8. 資料模型變更](#8-資料模型變更)
- [9. API 端點清單](#9-api-端點清單)
- [10. 遷移計畫](#10-遷移計畫)
- [11. 已知問題與待決事項](#11-已知問題與待決事項)

---

## 1. 目標與範圍

### 為何需要這個系統

OnlinePixelAgents 目前的瀏覽器端完全開放 -- 任何人都可以編輯佈局、關閉代理、查看所有代理的工具詳情。這在個人使用情境下尚可接受，但在多人或公開部署時會產生以下問題：

- **佈局破壞風險**：任何人都可以修改或覆蓋精心設計的辦公室佈局
- **資訊洩漏**：代理的工具呼叫詳情（包含檔案路徑、程式碼片段）對所有訪客可見
- **操作衝突**：多人可同時操作同一代理，造成不可預期的行為
- **無法溯源**：無法區分不同使用者的操作，出問題時無法追查

### 預期效果

- 匿名訪客可觀賞像素辦公室動畫，但不能進行任何操作或查看敏感資訊
- 註冊用戶擁有專屬樓層，可自由佈置並管理自己的代理
- 管理員擁有完全控制權，管理所有使用者、樓層和代理
- 現有的 Agent Node 認證機制統一至同一套體系，API Key 取代 username/password 作為主要登入方式
- 遷移過程平滑，不破壞現有功能或資料

---

## 2. 現況分析

### 目前的問題

| 問題 | 影響 |
|------|------|
| 瀏覽器端 Socket.IO 連線無認證 | 任何人可發送所有 ClientMessage |
| `saveLayout` / `saveFloorLayout` 無權限檢查 | 任何人可覆蓋佈局 |
| `closeAgent` 無所有者驗證 | 任何人可關閉代理 |
| 工具詳情（`agentToolStart/Done`）廣播至所有客戶端 | 敏感資訊洩漏 |
| 角色的 `role` 欄位僅有 `admin` / `viewer` | 不符合三層角色需求（缺 `member`） |

### 已有的基礎設施

以下模組已存在且可直接複用或擴充：

| 模組 | 路徑 | 現狀 | 需擴充 |
|------|------|------|--------|
| 使用者儲存 | `web/server/src/auth/userStore.ts` | `StoredUser` 含 username/passwordHash/role/mustChangePassword，支援 SQLite + JSON 雙路徑 | 新增 `apiKey` 欄位、`member` 角色 |
| JWT 簽發/驗證 | `web/server/src/auth/jwt.ts` | access + refresh + legacy token，Redis 快取驗證 | 新增 API Key 驗證路徑 |
| HTTP 認證路由 | `web/server/src/auth/routes.ts` | register/login/change-password/refresh/users CRUD | 新增 API Key 登入、重新生成、Socket.IO 升級 |
| 密碼驗證 | `web/shared/src/passwordValidation.ts` | 8 字元 + 大小寫 + 數字 | 不需變更 |
| 速率限制 | `web/server/src/rateLimit.ts` | 滑動視窗中間件，登入 10 次/分鐘 | 調整為 5 次/分鐘 |
| 稽核日誌 | `web/server/src/auditLog.ts` | SQLite 優先 + JSONL 備份，自動輪替 | 新增更多 action 類型 |
| 預設帳號 | `ensureDefaultUser()` | admin:admin + mustChangePassword | 不需變更 |
| 多樓層系統 | `buildingPersistence.ts` + `floorAssignment.ts` | building.json + floors/*.json + project-floor-map.json | 新增樓層所有者欄位 |

---

## 3. Phase 1：核心認證框架

**目標**：建立 API Key 認證機制、瀏覽器端 Socket.IO 認證中間件、三層角色基礎架構。完成後瀏覽器訪客被分為 anonymous/member/admin 三級，但尚未實作細粒度權限控制。

### P1.1 擴充使用者資料模型 -- 新增 API Key 與 member 角色

**描述**：在 `StoredUser` 中新增 `apiKey` 欄位（格式 `pa_` + 32 字元隨機字串）。角色欄位從 `'admin' | 'viewer'` 擴充為 `'admin' | 'member' | 'anonymous'`（`anonymous` 僅為型別標記，不存入資料庫）。註冊時自動生成 API Key。

**涉及檔案**：
- 修改：`web/server/src/auth/userStore.ts` -- StoredUser 介面 + createUser() + 新增 regenerateApiKey()
- 修改：`web/server/src/types.ts` -- 新增 UserRole 型別
- 修改：`web/shared/src/index.ts` -- 匯出 UserRole
- 修改：`web/server/src/db/database.ts` -- users 表新增 api_key 欄位（ALTER TABLE 遷移）

**預計影響範圍**：所有使用 `role` 型別的地方需從 `'admin' | 'viewer'` 改為 `UserRole`

**驗收標準**：
- `createUser()` 回傳的 `StoredUser` 包含非空的 `apiKey` 欄位
- `apiKey` 格式符合 `pa_[a-zA-Z0-9]{32}`
- 現有 `viewer` 角色的使用者自動遷移為 `member`
- `regenerateApiKey(userId)` 可產生新 key 並使舊 key 失效
- SQLite 表遷移不影響現有資料

**已知風險**：
- 舊版 JSON 格式的使用者資料需要遷移邏輯（`migrateUser()` 已有先例可參考）
- API Key 以明文儲存（需求要求能顯示給使用者），需確保檔案權限為 600

---

### P1.2 API Key 登入端點

**描述**：新增 `POST /api/auth/login-key` 端點，接受 `{ apiKey: string }` 回傳 JWT token。同時修改現有 `/api/auth/login` 支援雙模式（偵測 body 中有 `apiKey` 時走 API Key 路徑）。

**涉及檔案**：
- 修改：`web/server/src/auth/routes.ts` -- 新增端點 + 修改 login
- 修改：`web/server/src/auth/userStore.ts` -- 新增 `verifyApiKey(key: string): StoredUser | null`

**預計影響範圍**：Agent Node CLI 可改用 API Key 登入（取代 username/password）

**驗收標準**：
- `POST /api/auth/login-key { apiKey: "pa_..." }` 回傳有效 JWT
- 無效 API Key 回傳 401
- 登入成功記錄稽核日誌（action: `login_apikey`）
- Agent Node CLI 的 `login` 子命令支援 `--api-key` 選項

**已知風險**：
- API Key 在 HTTP 傳輸中為明文，必須依賴 HTTPS（生產環境部署指南需說明）

---

### P1.3 API Key 查看與重新生成端點

**描述**：登入後的使用者可查看自己的 API Key，也可重新生成（舊的立即失效）。

**涉及檔案**：
- 修改：`web/server/src/auth/routes.ts` -- 新增 `GET /api/auth/api-key`、`POST /api/auth/api-key/regenerate`

**預計影響範圍**：無副作用

**驗收標準**：
- `GET /api/auth/api-key`（需 Bearer token）回傳 `{ apiKey: "pa_..." }`
- `POST /api/auth/api-key/regenerate`（需 Bearer token）回傳新的 `{ apiKey: "pa_..." }`
- 重新生成後，舊 API Key 登入回傳 401
- 操作記錄稽核日誌（action: `apikey_regenerate`）

**已知風險**：無

---

### P1.4 Socket.IO 認證中間件

**描述**：在主 Socket.IO namespace（`/`）加入認證中間件。連線時 `auth` 物件可帶 `token`（JWT）。無 token 視為 anonymous。中間件解析 token 後將角色資訊附加至 `socket.data`。

**涉及檔案**：
- 修改：`web/server/src/index.ts` -- `io.use()` 加入認證中間件
- 新增：`web/server/src/auth/socketAuth.ts` -- Socket.IO 認證中間件邏輯
- 修改：`web/server/src/types.ts` -- 新增 `SocketAuthData` 介面

**預計影響範圍**：所有 Socket.IO 連線（但 anonymous 不會被拒絕，只是標記角色為 anonymous）

**驗收標準**：
- 無 token 連線成功，`socket.data.role === 'anonymous'`
- 有效 token 連線成功，`socket.data` 包含 userId/username/role
- 無效/過期 token 連線被拒絕（emit error 事件）
- 不影響 `/agent-node` namespace（已有獨立認證）

**已知風險**：
- 現有客戶端（無 token）必須仍能連線，不能斷開

---

### P1.5 Socket.IO 身份升級（auth:upgrade）

**描述**：已連線的 anonymous socket 可透過發送 `auth:upgrade { token }` 訊息升級為 member/admin，無需斷線重連。伺服器驗證 token 後更新 `socket.data` 並回覆確認。

**涉及檔案**：
- 修改：`web/server/src/index.ts` -- 新增 `auth:upgrade` 訊息處理
- 修改：`web/server/src/auth/socketAuth.ts` -- 升級邏輯
- 修改：`web/server/src/types.ts` -- ClientMessage union 新增 `auth:upgrade`
- 修改：`web/client/src/types/messages.ts` -- 對應的客戶端訊息型別

**預計影響範圍**：客戶端登入後需發送升級訊息

**驗收標準**：
- anonymous socket 發送有效 token 後，`socket.data.role` 更新為正確角色
- 伺服器回覆 `auth:upgraded { username, role }` 確認訊息
- 升級後立即推送該角色可見的代理詳情
- 無效 token 回覆 `auth:error` 但不斷線

**已知風險**：
- 升級後需立即補發先前被過濾的代理詳情，時序需謹慎處理

---

### P1.6 基礎訊息權限過濾

**描述**：在伺服器端的訊息廣播路徑中加入角色檢查。anonymous 收不到 `agentToolStart/Done`、`agentTranscript`、`agentModel` 等敏感訊息。member 可收到自己代理的詳情。admin 收到所有資訊。

**涉及檔案**：
- 修改：`web/server/src/index.ts` -- `ctx.sender` 和 `ctx.floorSender()` 改為角色感知廣播
- 新增：`web/server/src/auth/messageFilter.ts` -- 訊息過濾邏輯（依角色 + 代理所有者）

**預計影響範圍**：所有 `sender.postMessage()` 呼叫路徑

**驗收標準**：
- anonymous socket 不收到 `agentToolStart`、`agentToolDone`、`agentTranscript`、`agentModel` 訊息
- anonymous socket 仍收到 `agentCreated`、`agentClosed`、`agentStatus`、`agentEmote` 等基本動畫訊息
- admin socket 收到所有訊息（行為不變）
- member 的過濾邏輯在 Phase 3 實作，此階段 member 暫時等同 admin

**已知風險**：
- `ctx.floorSender()` 目前使用 Socket.IO Room 廣播，改為逐 socket 過濾會影響效能
- 備選方案：使用多個 Room（如 `floor:1F:admin`、`floor:1F:anonymous`）分級廣播

---

### P1.7 客戶端登入 UI

**描述**：右上角新增像素風格的登入/註冊按鈕與 Popover 面板。背後動畫持續播放。支援 username/password 登入與 API Key 貼入登入兩種模式。

**涉及檔案**：
- 新增：`web/client/src/components/AuthPanel.tsx` -- 登入/註冊/API Key 面板
- 修改：`web/client/src/App.tsx` -- 掛載 AuthPanel + 管理認證狀態
- 修改：`web/client/src/components/BottomToolbar.tsx` -- 顯示已登入使用者名稱
- 修改：`web/client/src/i18n.ts` -- 新增認證相關繁中字串
- 修改：`web/client/src/index.css` -- AuthPanel 像素風格樣式
- 新增：`web/client/src/hooks/useAuth.ts` -- 認證狀態管理 hook（token 儲存/刷新/登出）

**預計影響範圍**：App 頂層新增認證 context

**驗收標準**：
- 未登入時右上角顯示「登入」按鈕，不阻擋觀看
- 點擊按鈕展開 Popover，背後動畫持續
- 可切換「帳號登入」和「API Key 登入」兩個分頁
- 登入成功後按鈕變為使用者名稱 + 登出選項
- token 儲存至 localStorage，重新載入頁面自動恢復登入狀態
- 像素風格（`borderRadius: 0`、`--pixel-*` 變數）
- Admin 首次登入（mustChangePassword）彈出強制改密碼對話框

**已知風險**：
- localStorage token 在 XSS 攻擊下可被竊取（Phase 5 考慮 HttpOnly cookie）

---

## 4. Phase 2：用戶專屬樓層

**目標**：每個 member 擁有自動建立的專屬樓層，可自由編輯佈局。公共樓層（如 1F）只有 admin 可編輯。anonymous 不可編輯任何樓層。

### P2.1 樓層所有權模型

**描述**：在 `FloorConfig` 中新增 `ownerId?: string`（使用者 ID）。ownerId 為 null 表示公共樓層。建立樓層時可指定所有者。

**涉及檔案**：
- 修改：`web/server/src/types.ts` -- FloorConfig 新增 ownerId
- 修改：`web/server/src/buildingPersistence.ts` -- 讀寫 ownerId
- 修改：`web/shared/src/protocol.ts` -- FloorConfig 訊息包含 ownerId

**預計影響範圍**：building.json 格式變更（需向下相容）

**驗收標準**：
- `FloorConfig` 含 `ownerId?: string`
- 現有 building.json 讀取時 ownerId 預設為 null（公共樓層）
- `buildingConfig` 訊息包含各樓層的 ownerId

**已知風險**：無

---

### P2.2 註冊時自動建立專屬樓層

**描述**：使用者註冊成功後，自動建立一個以使用者名稱命名的樓層，ownerId 設為該使用者的 ID。樓層使用預設佈局。

**涉及檔案**：
- 修改：`web/server/src/auth/routes.ts` -- register 端點中呼叫樓層建立
- 修改：`web/server/src/buildingPersistence.ts` -- addFloor() 支援 ownerId 參數
- 修改：`web/server/src/index.ts` -- 註冊後廣播 buildingConfig 更新

**預計影響範圍**：註冊流程增加副作用（建立樓層 + 寫入佈局檔案）

**驗收標準**：
- 註冊帳號 "alice" 後，building.json 中新增 `{ id: "alice", name: "alice", ownerId: "<alice-id>" }`
- `floors/alice.json` 存在且包含預設佈局
- 所有已連線客戶端收到 `buildingConfig` 更新
- 樓層名稱全域不可重複（與既有名稱衝突時加數字後綴）

**已知風險**：
- 並行註冊可能產生競爭條件（建議加鎖或用 SQLite 事務）

---

### P2.3 樓層佈局編輯權限檢查

**描述**：`saveFloorLayout` 訊息處理中加入權限檢查。anonymous 不可儲存。member 只能儲存自己的樓層。admin 可儲存任何樓層。

**涉及檔案**：
- 修改：`web/server/src/index.ts` -- `saveFloorLayout` 處理邏輯加入權限檢查
- 修改：`web/client/src/App.tsx` -- 編輯器 UI 依權限禁用/啟用

**預計影響範圍**：佈局編輯操作路徑

**驗收標準**：
- anonymous 發送 `saveFloorLayout` → 伺服器忽略或回傳錯誤
- member 儲存自己樓層 → 成功
- member 儲存他人/公共樓層 → 被拒絕
- admin 儲存任何樓層 → 成功
- 客戶端在無權限的樓層隱藏「佈局」按鈕

**已知風險**：
- 需同時檢查 `saveLayout`（舊版端點）以防繞過

---

### P2.4 樓層改名權限與唯一性驗證

**描述**：member 可改名自己的樓層，但名稱全域不可重複。admin 可改名任何樓層。

**涉及檔案**：
- 修改：`web/server/src/index.ts` -- `renameFloor` 處理邏輯
- 修改：`web/server/src/buildingPersistence.ts` -- 名稱唯一性檢查

**預計影響範圍**：樓層改名操作路徑

**驗收標準**：
- member 改名自己的樓層為不重複名稱 → 成功
- member 改名為已存在的名稱 → 被拒絕，收到錯誤訊息
- member 改名他人樓層 → 被拒絕
- admin 可改名任何樓層（仍受唯一性約束）

**已知風險**：無

---

### P2.5 樓層匯入/匯出權限

**描述**：member 可匯入/匯出自己樓層的佈局。admin 可匯入/匯出任何樓層。anonymous 不可匯入（匯出觀看用可考慮開放）。

**涉及檔案**：
- 修改：`web/server/src/index.ts` -- `requestExportLayout` 權限檢查
- 修改：`web/client/src/components/SettingsModal.tsx` -- 依權限顯示/隱藏匯入按鈕

**預計影響範圍**：佈局匯入匯出路徑

**驗收標準**：
- member 匯出自己樓層 → 成功下載 JSON
- member 匯入至自己樓層 → 成功
- member 匯入至他人樓層 → 被拒絕
- anonymous 匯入 → 被拒絕

**已知風險**：無

---

## 5. Phase 3：代理所有權

**目標**：每個代理有明確的所有者。member 只能操作自己的代理，且只收到自己代理的詳細訊息。

### P3.1 代理所有權映射

**描述**：在 `AgentState` 新增 `ownerId: string | null`。本地掃描代理預設歸 admin。遠端 Agent Node 代理歸屬登入者。admin 可透過新訊息 `assignAgentOwner` 指派代理給 member。

**涉及檔案**：
- 修改：`web/server/src/types.ts` -- AgentState 新增 ownerId、PersistedAgent 新增 ownerId
- 修改：`web/server/src/agentManager.ts` -- 代理建立時設定 ownerId
- 修改：`web/server/src/agentNodeHandler.ts` -- 遠端代理 ownerId = socket.data.userId
- 修改：`web/server/src/index.ts` -- 新增 `assignAgentOwner` 訊息處理
- 修改：`web/server/src/types.ts` -- ClientMessage 新增 `assignAgentOwner`

**預計影響範圍**：代理建立/持久化/恢復全路徑

**驗收標準**：
- 本地掃描代理 ownerId = admin 的 userId
- 遠端代理 ownerId = Agent Node 登入者的 userId
- admin 發送 `assignAgentOwner { agentId, userId }` → 代理 ownerId 更新
- 代理持久化/恢復保留 ownerId

**已知風險**：
- 本地掃描代理預設歸 admin，如果有多個 admin 可能產生歧義（建議取第一個 admin）

---

### P3.2 代理操作權限檢查

**描述**：`closeAgent`、`focusAgent`、`saveAgentSeats`、`setProjectName`、`moveAgentToFloor`、`setAgentTeam`、`approvePermission` 等操作加入所有者檢查。

**涉及檔案**：
- 修改：`web/server/src/index.ts` -- 各 ClientMessage 處理邏輯加入 `checkAgentPermission()`
- 新增：`web/server/src/auth/agentPermission.ts` -- 代理操作權限檢查函式

**預計影響範圍**：所有代理操作的 ClientMessage 處理路徑

**驗收標準**：
- member 對自己的代理執行 closeAgent → 成功
- member 對他人的代理執行 closeAgent → 被拒絕，收到 `permissionDenied` 訊息
- admin 對任何代理執行操作 → 成功
- anonymous 對任何代理執行操作 → 被拒絕

**已知風險**：
- `saveAgentSeats` 是批量操作，需檢查每個代理的所有權

---

### P3.3 訊息分級過濾（完善 P1.6）

**描述**：完善 Phase 1 的基礎過濾。member 只收到自己代理的 `agentToolStart/Done`、`agentTranscript`、`agentModel`、`subagentToolStart/Done`。對於其他人的代理，只收到基本動畫訊息。

**涉及檔案**：
- 修改：`web/server/src/auth/messageFilter.ts` -- 完善 member 級別過濾邏輯
- 修改：`web/server/src/index.ts` -- 代理所有者變更時重新推送/收回訊息

**預計影響範圍**：所有代理相關訊息的廣播路徑

**驗收標準**：
- member 收到自己代理的所有詳情訊息
- member 不收到他人代理的工具/轉錄詳情
- member 仍收到他人代理的 `agentCreated/Closed/Status/Emote`（角色動畫正常）
- admin 收到所有訊息（不受過濾影響）

**已知風險**：
- `existingAgents` 訊息在連線時推送所有代理狀態，需依角色過濾敏感欄位
- 效能考量：逐 socket 過濾 vs Room 分級

---

### P3.4 代理詳情面板權限

**描述**：客戶端的 AgentDetailPanel 依權限顯示/隱藏內容。anonymous 不能打開詳情面板。member 只能查看自己代理的詳情。admin 可查看所有代理。

**涉及檔案**：
- 修改：`web/client/src/components/AgentDetailPanel.tsx` -- 依權限控制顯示
- 修改：`web/client/src/App.tsx` -- 點擊代理時檢查權限

**預計影響範圍**：代理選取/詳情查看 UI

**驗收標準**：
- anonymous 點擊代理 → 無反應或顯示「請登入查看詳情」
- member 點擊自己的代理 → 正常顯示詳情面板
- member 點擊他人的代理 → 顯示簡化資訊（名稱、狀態、無工具詳情）
- admin 點擊任何代理 → 正常顯示完整詳情

**已知風險**：
- 客戶端權限控制僅為 UX 輔助，真正的安全保障在伺服器端訊息過濾（P3.3）

---

## 6. Phase 4：管理功能

**目標**：Admin 可透過 UI 管理使用者、控制註冊策略、查看稽核日誌。

### P4.1 使用者管理面板增強

**描述**：擴充現有的 UserManagementPanel，新增：查看/重設使用者 API Key、刪除使用者時清理其樓層、角色支援 `member` 選項。

**涉及檔案**：
- 修改：`web/client/src/components/UserManagementPanel.tsx` -- UI 增強
- 修改：`web/server/src/auth/routes.ts` -- admin 重設他人 API Key 端點
- 修改：`web/server/src/auth/userStore.ts` -- deleteUser() 連帶清理樓層

**預計影響範圍**：使用者管理 UI + 使用者刪除副作用

**驗收標準**：
- 管理面板顯示每個使用者的角色（admin/member）
- admin 可變更使用者角色為 admin 或 member
- admin 可重設他人的 API Key
- 刪除使用者時，其專屬樓層保留但 ownerId 設為 null（變為公共樓層）
- 操作記錄稽核日誌

**已知風險**：
- 刪除使用者後其代理的 ownerId 指向不存在的使用者，需一併清理

---

### P4.2 註冊策略控制

**描述**：預設為 closed（註冊需要邀請碼或 admin 手動建立）。可透過環境變數或設定檔切換為 open。admin 可生成一次性邀請碼。

**涉及檔案**：
- 修改：`web/server/src/auth/routes.ts` -- register 端點加入邀請碼/策略檢查
- 新增：`web/server/src/auth/inviteStore.ts` -- 邀請碼 CRUD
- 修改：`web/server/src/constants.ts` -- 新增 REGISTRATION_POLICY 常數
- 修改：`web/server/src/config.ts` -- 新增 registrationPolicy 設定
- 修改：`web/client/src/components/UserManagementPanel.tsx` -- 邀請碼管理 UI

**預計影響範圍**：註冊流程

**驗收標準**：
- `REGISTRATION_POLICY=closed`（預設）：無邀請碼的註冊請求回傳 403
- `REGISTRATION_POLICY=open`：任何人可註冊
- admin 可生成邀請碼（一次性使用），過期時間可選
- 邀請碼使用後自動失效
- 管理面板顯示已發出的邀請碼清單

**已知風險**：
- 邀請碼需要獨立的持久化（SQLite 表或 JSON 檔案）

---

### P4.3 登入速率限制調整

**描述**：將登入速率限制從每分鐘 10 次調整為每 IP 每分鐘 5 次。API Key 登入與密碼登入共用計數器。

**涉及檔案**：
- 修改：`web/server/src/constants.ts` -- `RATE_LIMIT_LOGIN_MAX_REQUESTS = 5`
- 修改：`web/server/src/index.ts` -- 確認 rate limiter 涵蓋 `/api/auth/login-key`

**預計影響範圍**：登入端點速率限制

**驗收標準**：
- 同一 IP 第 6 次登入嘗試（60 秒內）回傳 429
- 回應包含 `Retry-After` 標頭
- `/api/auth/login` 和 `/api/auth/login-key` 共用計數器

**已知風險**：
- 反向代理（如 nginx）後方所有請求可能來自同一 IP，需信任 X-Forwarded-For

---

### P4.4 稽核日誌擴充與查詢端點

**描述**：新增更多稽核 action 類型，並提供 admin 可用的查詢端點。

**涉及檔案**：
- 修改：`web/server/src/auditLog.ts` -- 新增 action 類型
- 修改：`web/server/src/auth/routes.ts` -- 新增 `GET /api/auth/audit-log`（admin only）
- 修改：`web/server/src/db/database.ts` -- audit_log 查詢函式

**預計影響範圍**：稽核日誌模組

**驗收標準**：
- 新增 action 類型：`apikey_regenerate`、`floor_edit`、`agent_assign`、`invite_create`、`invite_use`、`registration_blocked`
- `GET /api/auth/audit-log?limit=50&offset=0` 回傳分頁稽核日誌
- 只有 admin 可存取
- 支援依 action 和 userId 過濾

**已知風險**：無

---

## 7. Phase 5：安全強化與 UX 打磨

**目標**：強化安全措施，打磨使用者體驗，完善引導流程。

### P5.1 Content Security Policy (CSP)

**描述**：設定嚴格的 CSP 標頭，防止 XSS 攻擊。

**涉及檔案**：
- 修改：`web/server/src/index.ts` -- Express 中間件設定 CSP 標頭
- 修改：`web/client/src/index.css` -- 移除任何 inline style（如有）

**預計影響範圍**：所有前端頁面

**驗收標準**：
- 回應標頭包含 `Content-Security-Policy`
- `script-src 'self'`（禁止 inline script）
- `style-src 'self' 'unsafe-inline'`（像素字型需要）
- `connect-src 'self' ws: wss:`（Socket.IO + WebSocket）
- 無 console 報錯

**已知風險**：
- Vite 開發模式的 HMR 需要 `unsafe-eval`，需條件性放寬

---

### P5.2 Token 管理最佳實踐

**描述**：Access token 自動刷新（到期前 1 分鐘觸發 refresh）。登出時清除所有 token。考慮 token 撤銷清單（可選）。

**涉及檔案**：
- 修改：`web/client/src/hooks/useAuth.ts` -- 自動刷新邏輯
- 修改：`web/client/src/socketApi.ts` -- token 過期時自動刷新並重連

**預計影響範圍**：客戶端認證生命週期

**驗收標準**：
- access token 過期前 60 秒自動使用 refresh token 換新
- 刷新成功後 Socket.IO 連線自動升級新 token
- refresh token 也過期時引導使用者重新登入
- 登出時清除 localStorage 中所有 token

**已知風險**：
- 自動刷新期間的競爭條件（多個並行請求同時觸發 refresh）

---

### P5.3 API Key 管理面板

**描述**：登入後可查看自己的 API Key（含複製按鈕），可重新生成並確認。像素風格設計。

**涉及檔案**：
- 新增：`web/client/src/components/ApiKeyPanel.tsx` -- API Key 顯示/重新生成面板
- 修改：`web/client/src/components/SettingsModal.tsx` -- 整合 API Key 面板

**預計影響範圍**：設定面板 UI

**驗收標準**：
- 設定面板中新增「API Key」區塊
- 顯示完整 API Key（預設遮罩，點擊顯示）
- 複製按鈕一鍵複製至剪貼簿
- 重新生成按鈕帶確認對話框（「舊 Key 將立即失效」）
- 未登入時此區塊不顯示

**已知風險**：無

---

### P5.4 權限不足友善提示

**描述**：使用者嘗試無權限操作時，以像素風格的 toast 通知提示，而非靜默失敗。

**涉及檔案**：
- 新增：`web/client/src/components/PermissionToast.tsx` -- 權限提示元件
- 修改：`web/client/src/hooks/useExtensionMessages.ts` -- 處理 `permissionDenied` 訊息
- 修改：`web/server/src/index.ts` -- 權限檢查失敗時發送 `permissionDenied` 訊息

**預計影響範圍**：客戶端通知系統

**驗收標準**：
- 伺服器回傳 `{ type: 'permissionDenied', action: string, reason: string }` 訊息
- 客戶端顯示像素風格 toast（如「需要登入才能編輯佈局」）
- Toast 3 秒後自動消失
- 不同 action 顯示對應的繁中提示文字

**已知風險**：無

---

### P5.5 新手引導提示

**描述**：匿名訪客首次進入時，底部顯示簡短引導條（「登入以編輯佈局和管理代理」），可關閉且記憶關閉狀態。

**涉及檔案**：
- 新增：`web/client/src/components/GuideBanner.tsx` -- 引導條元件
- 修改：`web/client/src/App.tsx` -- 掛載引導條

**預計影響範圍**：首頁 UI

**驗收標準**：
- 未登入且未關閉引導條時，底部顯示引導訊息
- 點擊 X 關閉後，localStorage 記憶狀態，不再顯示
- 登入後自動隱藏
- 像素風格，不遮擋核心 UI

**已知風險**：無

---

## 8. 資料模型變更

### 8.1 新增/修改的持久化檔案

| 檔案 | 動作 | 說明 |
|------|------|------|
| `~/.pixel-agents/users.json` | 修改 | StoredUser 新增 `apiKey` 欄位 |
| `~/.pixel-agents/building.json` | 修改 | FloorConfig 新增 `ownerId` 欄位 |
| `~/.pixel-agents/persisted-agents.json` | 修改 | PersistedAgent 新增 `ownerId` 欄位 |
| `~/.pixel-agents/invites.json` | 新增 | 邀請碼清單 |

### 8.2 Schema 定義

#### StoredUser（擴充後）

```typescript
interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  apiKey: string;            // 新增：格式 "pa_" + 32 字元
  role: 'admin' | 'member';  // 修改：viewer → member
  mustChangePassword: boolean;
  createdAt: string;
}
```

#### FloorConfig（擴充後）

```typescript
interface FloorConfig {
  id: FloorId;
  name: string;
  order: number;
  ownerId?: string | null;   // 新增：null = 公共樓層
}
```

#### AgentState（擴充後）

```typescript
// 新增欄位
interface AgentState {
  // ...existing fields...
  ownerId: string | null;     // 新增：代理所有者的使用者 ID
}
```

#### InviteCode（新增）

```typescript
interface InviteCode {
  code: string;               // 隨機 16 字元
  createdBy: string;          // admin userId
  createdAt: string;
  expiresAt?: string;         // 可選的過期時間
  usedBy?: string;            // 使用者 username（使用後填入）
  usedAt?: string;
}
```

#### SocketAuthData（新增）

```typescript
interface SocketAuthData {
  role: 'admin' | 'member' | 'anonymous';
  userId?: string;
  username?: string;
}
```

---

## 9. API 端點清單

### 9.1 新增/修改的 HTTP API

| 方法 | 路徑 | 動作 | 認證 | Phase |
|------|------|------|------|-------|
| POST | `/api/auth/register` | 修改：加入邀請碼檢查 + 自動建立樓層 + 回傳 apiKey | 無（但受策略限制） | P1/P4 |
| POST | `/api/auth/login` | 修改：支援 body 含 apiKey 時走 API Key 路徑 | 無 | P1 |
| POST | `/api/auth/login-key` | 新增：API Key 專用登入 | 無 | P1 |
| GET | `/api/auth/api-key` | 新增：查看自己的 API Key | Bearer token | P1 |
| POST | `/api/auth/api-key/regenerate` | 新增：重新生成 API Key | Bearer token | P1 |
| PUT | `/api/auth/users/:id/role` | 修改：支援 member 角色 | Admin | P1 |
| POST | `/api/auth/invites` | 新增：生成邀請碼 | Admin | P4 |
| GET | `/api/auth/invites` | 新增：列出邀請碼 | Admin | P4 |
| DELETE | `/api/auth/invites/:code` | 新增：撤銷邀請碼 | Admin | P4 |
| GET | `/api/auth/audit-log` | 新增：查詢稽核日誌 | Admin | P4 |
| POST | `/api/auth/users/:id/reset-apikey` | 新增：admin 重設他人 API Key | Admin | P4 |

### 9.2 新增/修改的 Socket.IO 訊息

#### 客戶端 → 伺服器（ClientMessage 新增）

| 類型 | 欄位 | 權限 | Phase |
|------|------|------|-------|
| `auth:upgrade` | `{ token: string }` | anonymous | P1 |
| `assignAgentOwner` | `{ agentId: number, userId: string }` | admin | P3 |

#### 伺服器 → 客戶端（新增）

| 類型 | 欄位 | 說明 | Phase |
|------|------|------|-------|
| `auth:upgraded` | `{ username, role }` | 身份升級確認 | P1 |
| `auth:error` | `{ error: string }` | 認證錯誤 | P1 |
| `permissionDenied` | `{ action, reason }` | 權限不足通知 | P5 |

---

## 10. 遷移計畫

### 10.1 從無認證到有認證的平滑過渡

**原則**：任何時候都不能讓現有使用者突然無法使用系統。

**Phase 1 部署策略**：
1. 部署新版後，所有現有客戶端以 anonymous 身份連線（行為與舊版完全相同）
2. anonymous 暫時保有完整權限（透過設定旗標 `AUTH_ENFORCEMENT=off`）
3. 管理員登入並配置好帳號後，將 `AUTH_ENFORCEMENT` 切為 `on`
4. 切換後 anonymous 降為唯讀

**旗標設計**：
```
AUTH_ENFORCEMENT=off   → anonymous 等同 admin（遷移期間）
AUTH_ENFORCEMENT=on    → anonymous 為唯讀觀察者（正式啟用）
```

### 10.2 現有資料的遷移策略

#### users.json 遷移

- 現有使用者的 `role: 'viewer'` 自動改為 `role: 'member'`
- 現有使用者若無 `apiKey` 欄位，在首次讀取時自動生成並回寫
- `migrateUser()` 已有先例，依同樣模式擴充

#### building.json 遷移

- 現有樓層的 `ownerId` 欄位預設為 `null`（公共樓層）
- 無需特殊處理，JSON 反序列化時自動取預設值

#### persisted-agents.json 遷移

- 現有代理的 `ownerId` 欄位預設為 `null`
- 首次啟動時，所有 `ownerId: null` 的代理歸屬第一個 admin 使用者

#### SQLite 遷移

- users 表新增 `api_key TEXT` 欄位（`ALTER TABLE users ADD COLUMN api_key TEXT`）
- 既有使用者的 api_key 欄位自動回填
- floors 相關查詢新增 owner_id 處理（如有 floors 表的話）

---

## 11. 已知問題與待決事項

### ISSUE-001：API Key 明文儲存安全性

**問題描述**：需求要求使用者能查看自己的 API Key，因此必須以可逆方式儲存（或直接明文）。不同於密碼（bcrypt 單向雜湊），API Key 無法使用相同策略。

**影響範圍**：資料安全，若 users.json / SQLite 被竊取，API Key 直接暴露。

**建議解決方案**：
- 檔案權限設為 600（僅 owner 可讀寫）
- 生產環境強烈建議使用 SQLite（比 JSON 更不容易被意外讀取）
- 考慮對稱加密（AES-256），密鑰存在環境變數中
- 文件中明確標註此設計取捨

**優先級**：P1

---

### ISSUE-002：Socket.IO 訊息逐 socket 過濾的效能影響

**問題描述**：目前使用 Socket.IO Room 進行樓層級廣播（`floor:1F`）。加入角色過濾後，需要對 Room 內的每個 socket 檢查角色，可能影響大量連線時的效能。

**影響範圍**：伺服器效能，尤其在高並行連線場景。

**建議解決方案**：
- 方案 A：使用多層 Room（`floor:1F:admin`、`floor:1F:member`、`floor:1F:anonymous`），不同角色加入不同 Room，廣播至對應 Room
- 方案 B：逐 socket 過濾（簡單但效能較差）
- 建議先用方案 A，分級 Room 可避免逐 socket 遍歷

**優先級**：P1

---

### ISSUE-003：多 Admin 場景下本地代理的歸屬

**問題描述**：本地掃描的代理預設歸 admin，但系統可能有多個 admin 使用者。應歸屬「哪個」admin？

**影響範圍**：代理所有權邏輯。

**建議解決方案**：
- 預設歸屬 `createdAt` 最早的 admin（即初始 admin）
- 提供 admin 手動指派的能力（P3.1 已包含）
- 未來可考慮依代理的專案路徑自動匹配使用者

**優先級**：P2

---

### ISSUE-004：匿名訪客的 Socket.IO 連線數量控制

**問題描述**：匿名訪客不需登入即可建立 Socket.IO 連線。惡意使用者可能建立大量連線消耗伺服器資源。

**影響範圍**：伺服器穩定性。

**建議解決方案**：
- 限制每 IP 的最大 Socket.IO 連線數（如 5 個）
- Socket.IO middleware 中檢查同 IP 的 anonymous 連線數
- 超過限制時拒絕新連線

**優先級**：P2

---

### ISSUE-005：token 儲存在 localStorage 的 XSS 風險

**問題描述**：JWT token 儲存在 localStorage 中，若頁面存在 XSS 漏洞，token 可被竊取。

**影響範圍**：前端安全。

**建議解決方案**：
- Phase 5 考慮改用 HttpOnly cookie（需調整 CORS 和 Socket.IO 認證方式）
- 短效 access token（15 分鐘）限制了竊取的時間窗口
- CSP 標頭（P5.1）減少 XSS 攻擊面
- 暫時可接受 localStorage 方案（配合 CSP）

**優先級**：P2

---

### ISSUE-006：Auth 升級後的訊息補發時序

**問題描述**：anonymous 升級為 member 後，需要補發該使用者所屬代理的詳細訊息（工具狀態等）。若代理正處於活躍狀態，補發的訊息可能與即時推送產生時序衝突。

**影響範圍**：客戶端資料一致性。

**建議解決方案**：
- 升級後先發送 `existingAgents`（含完整狀態快照），客戶端完全重建狀態
- 使用序列號或時間戳確保客戶端丟棄過時的狀態更新
- 簡化方案：升級後強制重新發送 `webviewReady` 流程

**優先級**：P1

---

### ISSUE-007：樓層名稱唯一性的並行衝突

**問題描述**：兩個使用者同時註冊，或同時改名樓層，可能導致名稱衝突。

**影響範圍**：樓層命名一致性。

**建議解決方案**：
- 使用 SQLite 事務確保原子性
- JSON 檔案模式下使用檔案鎖（如 `proper-lockfile`）
- 在 `addFloor()` 和 `renameFloor()` 中加入重試邏輯

**優先級**：P2

---

### ISSUE-008：刪除使用者後的孤兒資源清理

**問題描述**：刪除使用者後，其專屬樓層、代理所有權、邀請碼等關聯資源需要妥善處理。

**影響範圍**：資料一致性。

**建議解決方案**：
- 專屬樓層：ownerId 設為 null（轉為公共樓層），不刪除佈局
- 代理 ownerId：設為 null，由 admin 重新指派
- 邀請碼：該使用者建立的未使用邀請碼標記為無效
- 提供 admin 確認對話框，明確列出影響範圍

**優先級**：P2

---

### ISSUE-009：Agent Node CLI 遷移至 API Key

**問題描述**：現有 Agent Node CLI 使用 username/password 登入（`pixel-agents-node login`）。需要新增 API Key 登入方式，同時保持向後相容。

**影響範圍**：Agent Node CLI 使用流程。

**建議解決方案**：
- `pixel-agents-node login` 預設改為提示輸入 API Key
- 新增 `--password` 旗標保留舊的登入方式
- `node-config.json` 中的 token 格式不變（仍為 JWT）
- 在 CLI 說明中引導使用者從 Web UI 取得 API Key

**優先級**：P3

---

### ISSUE-010：AUTH_ENFORCEMENT 切換的廣播通知

**問題描述**：管理員將 `AUTH_ENFORCEMENT` 從 `off` 切換為 `on` 時，所有已連線的 anonymous socket 應立即降為唯讀。

**影響範圍**：遷移期間的權限切換。

**建議解決方案**：
- 切換後伺服器廣播 `auth:enforcementChanged` 訊息
- 已連線的 anonymous socket 收到後 UI 顯示「此伺服器已啟用認證，請登入以繼續操作」
- 伺服器端立即生效，後續的操作訊息被攔截

**優先級**：P3
