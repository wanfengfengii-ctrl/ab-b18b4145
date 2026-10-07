# 环状质粒片段标记（plasmid-mapper）

分子克隆团队在环状质粒图上标记待验证片段的小工具。页面加载一条内置的确定性质粒记录
（`pMCL-DEMO-1`，4832 bp），以环形轨道显示碱基刻度与已有注释；用户可设置任意显示起点
（仅旋转视图），并在圆环上**沿顺时针拖动**创建带名称的片段。

## 坐标约定

- 所有保存坐标一律对应实验室登记的**原始序列**：零基起点 `start` + 正整数长度 `length`。
- 选区吸附到整数碱基；可跨越原始序列末端（`start + length > 序列长度`），但不得覆盖整圈
  （`length` 最大为 `序列长度 - 1`）。
- 显示起点（旋转）与窗口尺寸只影响渲染：选区始终以原始坐标存储，旋转/缩放后覆盖的
  碱基集合不变；即使显示起点位于片段内部，片段弧仍连续呈现。
- 参考起点固定为原始序列的 0 号碱基（圆环上以深色圆点标出）。

## API

### `GET /api/plasmid`

```json
{
  "name": "pMCL-DEMO-1",
  "length": 4832,
  "origin": 0,
  "annotations": [{ "name": "ori", "start": 3187, "length": 589 }]
}
```

### `PUT /api/annotations`

原子保存**完整**注释集（整体替换）。请求体：`{ "annotations": [{ "name", "start", "length" }] }`。
全部校验通过后先写临时文件再 rename，任何失败都不会改变既有数据。

错误响应为 `400`（`413` 为请求体过大），形体稳定：

```json
{ "error": { "code": "DUPLICATE_NAME", "message": "..." } }
```

| 错误码 | 含义 |
| --- | --- |
| `INVALID_PAYLOAD` | 请求体不是合法 JSON / 结构或字段类型错误 |
| `INVALID_NAME` | 名称为空或超过 64 字符 |
| `INVALID_COORDS` | `start`/`length` 非整数或越界；`length ≥ 序列长度`（覆盖整圈） |
| `EMPTY_FRAGMENT` | `length ≤ 0` 的空片段 |
| `DUPLICATE_NAME` | 名称重复（忽略大小写） |

### `GET /healthz`

健康检查，返回 `{"ok": true}`。

## 本地运行

```bash
npm start          # http://localhost:8080（PORT、DATA_FILE 可配置）
npm test           # 代码测试（node:test）
npm run build      # 前端构建：public/ -> dist/（内联单文件 + 哈希清单）
npm run smoke      # 针对运行中服务的 API 冒烟（APP_URL 可配置，默认 127.0.0.1:8080）
```

## Docker / Compose

```bash
HOST_PORT=9090 docker compose up --build app     # 宿主机端口由 HOST_PORT 决定（默认 8080）
HOST_PORT=9090 docker compose up --build \
  --exit-code-from verify --abort-on-container-exit verify
```

- `app`：应用服务，Compose 中配置健康检查（轮询 `/healthz`），注释数据存于命名卷。
- `verify`：一次性服务，等待 `app` 健康后依次执行代码测试（`node --test`）、
  前端构建（`scripts/build-frontend.js`）和跨末端片段的 API 冒烟（`scripts/smoke.js`），
  以退出码报告结果（0 = 全部通过）。

## 目录结构

```
server/    纯 node:http 后端（plasmid 记录、校验、原子存储、路由）
public/    前端源码（SVG 环形图、旋转、顺时针拖动选区）
scripts/   前端构建与 API 冒烟
tests/     node:test 单元与 API 测试
```
