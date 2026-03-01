# pixel-agents-node

輕量級 Agent Node — 將遠端機器上的 Claude Code 代理連線到中央 Pixel Agents 伺服器。

## 安裝

```bash
# 在 web/ 目錄中
npm install
npm run build:agent-node
```

## 使用方式

### 1. 登入（取得 JWT Token）

```bash
npx pixel-agents-node login http://<server-ip>:3000
```

系統會提示輸入帳號密碼。預設帳號：`admin` / `admin`。

Token 儲存在 `~/.pixel-agents/node-config.json`。

### 2. 啟動掃描

```bash
# 使用已儲存的配置
npx pixel-agents-node start

# 或直接指定參數
npx pixel-agents-node start --server http://<server-ip>:3000 --token <jwt>
```

Agent Node 會自動掃描本地 `~/.claude/projects/` 下的活躍 JSONL 檔案，並將事件即時推送至中央伺服器。

## 運作原理

1. **掃描**：每 1 秒掃描本地 Claude 專案目錄，偵測活躍的 JSONL 檔案
2. **解析**：增量讀取 JSONL，提取工具使用、思考、表情等事件
3. **推送**：透過 Socket.IO 將事件傳送至中央伺服器
4. **顯示**：中央伺服器將遠端代理放入虛擬辦公室，瀏覽器中以橘色光暈標示

## 配置檔

`~/.pixel-agents/node-config.json`：
```json
{
  "server": "http://192.168.1.100:3000",
  "token": "eyJ..."
}
```

## 認證

使用 JWT 認證。伺服器首次啟動時自動建立預設帳號 `admin:admin`。

- 註冊新帳號：`POST /api/auth/register` （body: `{ username, password }`）
- 登入：`POST /api/auth/login` （body: `{ username, password }`）
- Token 有效期 30 天
