# 环状质粒待验证片段标记

单仓库全栈应用：环形质粒 SVG 视图 + 注释原子保存 API。零生产运行时依赖（前端构建使用 esbuild）。

## 功能要点

- 页面加载内置确定性质粒记录 `pVERIFY-1`（5400 bp），环形轨道显示碱基刻度与既有注释。
- 顶部可设置**任意显示起点**（仅旋转显示）；实验室登记的原始序列由 `referenceStart`（固定 0）锚定，保存坐标始终是原始序列坐标。
- 在琥珀色环带上**按下并顺时针拖动**创建带名称片段，可拖动两端手柄微调：
  - 吸附整数碱基，采用**零基起点 + 正整数长度** `{start, length}`；
  - 允许跨越原始序列末端（`start + length > L`），**不得覆盖整圈**（`length >= L` 被拒绝）。
- 片段坐标是唯一数据源；旋转视图、窗口尺寸变化只改角度/像素映射，片段覆盖的碱基集合不变。跨末端弧直接由未归一化的 `start`、`start+length` 计算，因此**显示起点位于片段内部时仍连续呈现**。
- 保存成功后刷新页面：GET 重新载入，片段还原在原碱基位置。
- 保存失败（非法坐标、重复名称、空片段等）时，环形选区与名称输入保留，页面明确显示服务端稳定错误码与原因。

## API

- `GET /api/plasmid` → `{ name, length, circular, referenceStart, annotations }`
- `PUT /api/annotations`，请求体 `{ "annotations": [{ name, start, length, kind? }] }`
  - **原子整集合替换**：全部校验通过后单次提交，任一非法则既有数据不变。
  - 稳定错误码（响应体形如 `{"error":{"code","message"}}`）：

| code | HTTP | 触发条件 |
| --- | --- | --- |
| `INVALID_PAYLOAD` | 400 | 非 JSON 或不含 `annotations` 数组 |
| `INVALID_ANNOTATION` | 400 | 元素非对象，或 `kind` 非 annotation/fragment |
| `EMPTY_NAME` | 400 | 名称缺失或空白 |
| `INVALID_COORDINATES` | 400 | start 非 [0, L-1] 内整数，或坐标非整数 |
| `EMPTY_FRAGMENT` | 400 | length < 1 |
| `FULL_CIRCLE` | 400 | length >= L（覆盖整圈） |
| `DUPLICATE_NAME` | 409 | 集合内名称（去空白后）重复 |

- `GET /healthz` 供健康检查使用。

## 本地开发

```bash
npm install
npm test         # node:test：几何 + 校验 + API（23 个用例）
npm run build    # esbuild 打包 src/ -> web/dist/
npm start        # http://localhost:3000
npm run smoke    # 对运行中的服务执行跨末端片段 API 冒烟（BASE_URL 可覆盖）
```

## Docker / Compose

```bash
HOST_PORT=9090 docker compose up -d app      # 宿主端口由 HOST_PORT 决定，默认 8080
docker compose run --rm verify               # 一次性验证服务
```

- Dockerfile 构建镜像并预构建前端，`HEALTHCHECK` 命中 `/healthz`；
- Compose 中 `app` 配置健康检查，端口映射 `"${HOST_PORT:-8080}:3000"`；
- `verify` 为一次性服务（`restart: "no"`），`depends_on: app: service_healthy`，健康后依次执行
  **代码测试 → 前端构建 → 跨末端片段 API 冒烟**，以退出码报告结果（`scripts/verify.sh`，任一步失败即非零）。

## 目录结构

```
server/    HTTP 服务、确定性记录、注释校验
shared/    环形几何纯函数（前后端共用）
src/       前端入口（打包到 web/dist/）
web/       静态页面与样式
test/      node:test 单元/API 测试
scripts/   构建、健康检查、冒烟、verify 编排
```
