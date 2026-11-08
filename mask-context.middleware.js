// magpie-mask-context: gateway middleware that tells the model what the
// masking placeholders ({{API_KEY_xxxxxxxx}}, {{EMAIL_xxxxxxxx}}, ...) are
// and how to treat them, appended after the agent's own system prompt.
//
//   {"mode": "on", "prompt": "", "lang": "en",
//    "agents": [], "models": [], "debug": false}
//
// Why unconditional: measured on 0.1.3329, the JS middleware runs BEFORE
// masking (it sees raw values; the Go-side Masker masks after routing, on
// the way out), and the middleware sandbox has no fs/fetch/Bun to probe
// the privacy settings. So the note is always appended, written as a
// conditional ("tokens LIKE this are placeholders") so it is harmless
// when masking is off or the request carries none. Appending keeps the
// agent's own prompt as the cache prefix.
//
// Sandbox rules (0.1.3329): no imports, no Bun, no fetch; plain sync JS
// and ctx {protocol, model, stream, path, agent, options, state, reject}.

const NOTE_EN = [
  "Masked-value placeholders: tokens like {{API_KEY_ab12cd34}} are stable placeholders",
  "created by the user's local privacy gateway, which replaced real values (API keys,",
  "passwords, tokens, emails, phone numbers, masked terms) before the request left",
  "their machine. The same real value always maps to the same placeholder. Treat a",
  "placeholder as the value itself: when you use, store, quote, echo, or configure it,",
  "copy it exactly, character for character — braces, type word and suffix unchanged.",
  "Never guess, invent, translate, reformat, shorten or try to restore the real value,",
  "and do not ask what it is. Your output is restored to real values before the user",
  "or their tools see it. Ordinary IDs (UUIDs, hex hashes) are not placeholders.",
].join(" ")

const NOTE_ZH = [
  "关于脱敏占位符:形如 {{API_KEY_ab12cd34}} 的标记是用户本地隐私网关生成的稳定占位符",
  "——真实值(API 密钥、密码、令牌、邮箱、电话及用户遮蔽的词条)在请求离开这台电脑前",
  "已被替换。同一真实值永远对应同一占位符。请把占位符当作值本身:使用、存储、引用、",
  "复述或配置它时逐字复制,双花括号、类型词与后缀保持原样;不要猜测、编造、翻译、改写",
  "或试图还原真实值,也不要向用户追问。你输出的一切在用户和工具看到之前会被换回真实值。",
  "普通标识符(UUID、十六进制哈希)不是占位符,照常处理。",
].join("")

function defaultNote(lang) {
  return lang === "zh" ? NOTE_ZH : NOTE_EN
}

function anthropic(body, prompt) {
  const s = body.system
  if (s === undefined || s === null || s === "" || (Array.isArray(s) && !s.length)) {
    body.system = prompt
    return true
  }
  if (typeof s === "string") {
    body.system = s + "\n\n" + prompt
    return true
  }
  if (Array.isArray(s)) {
    s.push({ type: "text", text: prompt })
    return true
  }
  return false
}

function chat(body, prompt) {
  if (!Array.isArray(body.messages)) return false
  const first = body.messages.length ? body.messages[0] : null
  if (!first || (first.role !== "system" && first.role !== "developer")) {
    body.messages.unshift({ role: "system", content: prompt })
    return true
  }
  if (typeof first.content === "string") {
    first.content = first.content + "\n\n" + prompt
    return true
  }
  if (Array.isArray(first.content)) {
    first.content.push({ type: "text", text: prompt })
    return true
  }
  return false
}

function responses(body, prompt) {
  const s = body.instructions
  if (typeof s !== "string" || !s) {
    body.instructions = prompt
    return true
  }
  body.instructions = s + "\n\n" + prompt
  return true
}

function gemini(body, prompt) {
  const key = body.system_instruction && !body.systemInstruction ? "system_instruction" : "systemInstruction"
  const s = body[key]
  if (!s || !Array.isArray(s.parts) || !s.parts.length) {
    body[key] = { parts: [{ text: prompt }] }
    return true
  }
  s.parts.push({ text: prompt })
  return true
}

export function onRequest(body, ctx) {
  if (!body || typeof body !== "object") return undefined
  const o = ctx && typeof ctx === "object" ? ctx.options || {} : {}
  if (o.mode === "off") return undefined

  if (Array.isArray(o.agents) && o.agents.length) {
    if (!ctx || o.agents.indexOf(ctx.agent) < 0) return undefined
  }
  if (Array.isArray(o.models) && o.models.length) {
    const m = String(body.model || (ctx ? ctx.model : "") || "")
    let hit = false
    for (let i = 0; i < o.models.length; i++) {
      if (typeof o.models[i] === "string" && o.models[i] && m.indexOf(o.models[i]) === 0) {
        hit = true
        break
      }
    }
    if (!hit) return undefined
  }

  const prompt = typeof o.prompt === "string" && o.prompt ? o.prompt : defaultNote(o.lang)

  let done = false
  switch (ctx ? ctx.protocol : "") {
    case "anthropic":
      done = anthropic(body, prompt)
      break
    case "chat":
      done = chat(body, prompt)
      break
    case "responses":
      done = responses(body, prompt)
      break
    case "gemini":
      done = gemini(body, prompt)
      break
    default:
      done = false
  }
  if (done && o.debug) {
    console.log("mask-context: note appended, agent=" + (ctx && ctx.agent) + " model=" + (ctx && ctx.model))
  }
  return done ? body : undefined
}
