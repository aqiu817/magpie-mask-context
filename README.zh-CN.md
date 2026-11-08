# magpie-mask-context

[magpie](https://usemagpie.ai) 网关中间件:向模型解释**脱敏占位符**——`{{API_KEY_a1b2c3d4}}` 这类标记是什么、为什么会出现、该怎么对待:逐字复用,绝不猜测真实值。

[English](README.md)

## 问题

magpie 的本地脱敏(设置 → 隐私)会把敏感值——API 密钥、密码、令牌、邮箱、电话、你自定义的脱敏词——在请求离开这台电脑之前替换成 `{{TYPE_8位哈希}}` 形态的稳定占位符,并在模型输出里换回真实值。但模型从未被告知这套约定:没有说明时,它可能改写占位符的格式、翻译它、编造一个像样的 key 来代替,或者追问用户这背后是什么——每一种都会破坏"占位符 → 真实值"的回传闭环。

## 做什么

本中间件向每个请求的 system 提示词**末尾**追加一段简短说明(约 120 token),告诉模型:

- 这些标记是用户本地隐私网关生成的稳定占位符;
- 同一真实值永远对应同一占位符;
- 把占位符当作值本身,**逐字复制**;
- 不猜测、不编造、不翻译、不改写、不试图还原,也不追问;
- 普通 ID(UUID、十六进制哈希)不是占位符,照常处理。

说明用条件句式写成("形如这样的标记是占位符"),所以脱敏没开、或请求里没有占位符时也无副作用。追加在 agent 自己的提示词之后,保持提示词缓存前缀不变。

| API | 说明放哪 |
|---|---|
| Chat | 追加到首条 `system` / `developer` 消息(没有则新增) |
| Anthropic | 追加到 `system`(字符串或 blocks) |
| Responses | 追加到 `instructions` |
| Gemini | 追加到 `systemInstruction` / `system_instruction` 的 parts |

## 安装

在 magpie 的 **插件 → 发现** 里搜 "mask-context",或:

```
magpie plugin add github:aqiu817/magpie-mask-context
```

选项在 **插件 → 已安装 → 选项** 里改,或:

```
magpie plugin options magpie-mask-context '{"lang": "zh"}'
```

## 选项

```json
{ "mode": "on", "prompt": "", "lang": "en",
  "agents": [], "models": [], "debug": false }
```

| 选项 | 含义 |
|---|---|
| `mode` | `"on"`(默认)给每个请求追加说明;`"off"` 停用中间件。 |
| `prompt` | 完全替换内置说明文本。 |
| `lang` | 内置说明语言:`"en"`(默认)或 `"zh"`。 |
| `agents` | 填了就只对这些 magpie agent id 生效(如 `["dsh", "codex"]`)。 |
| `models` | 填了就只对模型名以这些前缀开头的请求生效。 |
| `debug` | 每次追加打一条日志(终端 magpie 命令的 `plugin: …` 输出可见)。 |

## 为什么是无条件注入(实测,非猜测)

在 magpie 0.1.3329 上实测:网关中间件运行在脱敏**之前**——探针中间件看到的是 `sk-…` 原文,Go 侧的脱敏器在路由之后、发出之前才执行。中间件沙箱也没有 `fetch`、没有 `Bun`、不允许 import 模块——在中间件内部无法读取隐私设置、无法检测占位符。所以说明是无条件追加的,并用条件句式保证无害。(探针方法:`ctx.reject(403, msg)` 会把诊断文本原样带回客户端——调试中间件的小技巧。)

## 验证

- `node test.mjs` — 29 个单测:四种 API × system 形态 × 选项 × 防御。
- 真机冒烟(magpie 0.1.3329,免费档模型):
  - 经 options 注入的标记句被模型确认("Yes");
  - 默认说明下,`.env` 占位符任务得到 "I only see the masked placeholders, never the real values"——不猜、不编、不问;
  - 要求逐字引用被遮蔽的邮箱时,模型原样输出 `{{EMAIL_e5f6a7b8}}`,一字不差。

## 许可

MIT
