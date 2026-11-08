// node test.mjs — magpie-mask-context 单元测试(不依赖 magpie/Bun)
import { strict as A } from "node:assert"
import { onRequest } from "./mask-context.middleware.js"

const EN = "Masked-value placeholders"
const ZH = "关于脱敏占位符"
let n = 0
function t(name, fn) {
  fn()
  n++
  console.log("ok " + n + " - " + name)
}

function chatCtx(extra) {
  const c = { protocol: "chat", model: "m", agent: "test", options: {} }
  if (extra) { for (const k in extra) c[k] = extra[k] }
  return c
}

// ---- chat 协议 ----
t("chat: no system message -> unshift one", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  const out = onRequest(b, chatCtx())
  A.equal(out, b)
  A.equal(b.messages.length, 2)
  A.equal(b.messages[0].role, "system")
  A.ok(b.messages[0].content.startsWith(EN))
  A.equal(b.messages[1].content, "hi")
})

t("chat: system string first -> appended with blank line", () => {
  const b = { model: "m", messages: [{ role: "system", content: "Be nice." }, { role: "user", content: "hi" }] }
  onRequest(b, chatCtx())
  A.equal(b.messages[0].content, "Be nice.\n\n" + b.messages[0].content.split("\n\n")[1])
  A.ok(b.messages[0].content.startsWith("Be nice.\n\n"))
  A.ok(b.messages[0].content.includes("{{API_KEY_ab12cd34}}"))
})

t("chat: developer role first -> appended", () => {
  const b = { model: "m", messages: [{ role: "developer", content: "X" }] }
  onRequest(b, chatCtx())
  A.equal(b.messages[0].role, "developer")
  A.ok(b.messages[0].content.startsWith("X\n\n"))
})

t("chat: system array content -> part pushed", () => {
  const b = { model: "m", messages: [{ role: "system", content: [{ type: "text", text: "A" }] }] }
  onRequest(b, chatCtx())
  A.equal(b.messages[0].content.length, 2)
  A.equal(b.messages[0].content[0].text, "A")
  A.ok(b.messages[0].content[1].text.startsWith(EN))
})

t("chat: first message user -> unshift before it", () => {
  const b = { model: "m", messages: [{ role: "user", content: "u" }, { role: "system", content: "s" }] }
  onRequest(b, chatCtx())
  A.equal(b.messages[0].role, "system")
  A.ok(b.messages[0].content.startsWith(EN))
})

t("chat: no messages array -> untouched, undefined", () => {
  const b = { model: "m" }
  A.equal(onRequest(b, chatCtx()), undefined)
  A.equal(b.messages, undefined)
})

// ---- anthropic ----
t("anthropic: no system -> set", () => {
  const b = { model: "m", system: undefined, messages: [] }
  onRequest(b, { protocol: "anthropic", options: {} })
  A.ok(b.system.startsWith(EN))
})

t("anthropic: system string -> appended", () => {
  const b = { model: "m", system: "Base.", messages: [] }
  onRequest(b, { protocol: "anthropic", options: {} })
  A.ok(b.system.startsWith("Base.\n\n"))
  A.ok(b.system.includes(EN))
})

t("anthropic: system blocks -> text block pushed, cache_control preserved", () => {
  const b = { model: "m", system: [{ type: "text", text: "B", cache_control: { type: "ephemeral" } }] }
  onRequest(b, { protocol: "anthropic", options: {} })
  A.equal(b.system.length, 2)
  A.equal(b.system[0].cache_control.type, "ephemeral")
  A.equal(b.system[0].text, "B")
  A.ok(b.system[1].text.startsWith(EN))
})

t("anthropic: empty system array -> set", () => {
  const b = { model: "m", system: [], messages: [] }
  onRequest(b, { protocol: "anthropic", options: {} })
  A.ok(typeof b.system === "string")
  A.ok(b.system.startsWith(EN))
})

// ---- responses ----
t("responses: no instructions -> set", () => {
  const b = { model: "m", input: [] }
  onRequest(b, { protocol: "responses", options: {} })
  A.ok(b.instructions.startsWith(EN))
})

t("responses: instructions string -> appended", () => {
  const b = { model: "m", instructions: "I." }
  onRequest(b, { protocol: "responses", options: {} })
  A.ok(b.instructions.startsWith("I.\n\n"))
  A.ok(b.instructions.includes(EN))
})

// ---- gemini ----
t("gemini: systemInstruction parts -> text pushed", () => {
  const b = { model: "m", systemInstruction: { parts: [{ text: "G" }] } }
  onRequest(b, { protocol: "gemini", options: {} })
  A.equal(b.systemInstruction.parts.length, 2)
  A.equal(b.systemInstruction.parts[0].text, "G")
  A.ok(b.systemInstruction.parts[1].text.startsWith(EN))
})

t("gemini: snake_case system_instruction honored", () => {
  const b = { model: "m", system_instruction: { parts: [{ text: "G" }] } }
  onRequest(b, { protocol: "gemini", options: {} })
  A.equal(b.system_instruction.parts.length, 2)
  A.equal(b.systemInstruction, undefined)
})

t("gemini: none -> created", () => {
  const b = { model: "m", contents: [] }
  onRequest(b, { protocol: "gemini", options: {} })
  A.ok(b.systemInstruction.parts[0].text.startsWith(EN))
})

// ---- options ----
t("mode off -> untouched", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  A.equal(onRequest(b, chatCtx({ options: { mode: "off" } })), undefined)
  A.equal(b.messages.length, 1)
})

t("agents whitelist: no match -> untouched", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  A.equal(onRequest(b, chatCtx({ agent: "dsh", options: { agents: ["codex"] } })), undefined)
  A.equal(b.messages.length, 1)
})

t("agents whitelist: match -> appended", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  onRequest(b, chatCtx({ agent: "dsh", options: { agents: ["codex", "dsh"] } }))
  A.equal(b.messages[0].role, "system")
})

t("models prefix: no match -> untouched", () => {
  const b = { model: "claude-x", messages: [{ role: "user", content: "hi" }] }
  A.equal(onRequest(b, chatCtx({ options: { models: ["gpt"] } })), undefined)
  A.equal(b.messages.length, 1)
})

t("models prefix: match -> appended", () => {
  const b = { model: "gpt-5.2", messages: [{ role: "user", content: "hi" }] }
  onRequest(b, chatCtx({ options: { models: ["gpt"] } }))
  A.equal(b.messages.length, 2)
})

t("prompt override replaces default note", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  onRequest(b, chatCtx({ options: { prompt: "Custom note." } }))
  A.equal(b.messages[0].content, "Custom note.")
})

t("lang zh -> Chinese default note", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  onRequest(b, chatCtx({ options: { lang: "zh" } }))
  A.ok(b.messages[0].content.startsWith(ZH))
  A.ok(b.messages[0].content.includes("{{API_KEY_ab12cd34}}"))
})

t("lang unknown falls back to en", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  onRequest(b, chatCtx({ options: { lang: "fr" } }))
  A.ok(b.messages[0].content.startsWith(EN))
})

t("debug option does not throw", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  onRequest(b, chatCtx({ options: { debug: true } }))
  A.equal(b.messages.length, 2)
})

// ---- 防御 ----
t("null body -> undefined, no throw", () => {
  A.equal(onRequest(null, chatCtx()), undefined)
})

t("unknown protocol -> untouched", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  A.equal(onRequest(b, chatCtx({ protocol: "unknown" })), undefined)
  A.equal(b.messages.length, 1)
})

t("no options in ctx -> default on", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  onRequest(b, { protocol: "chat", model: "m", agent: "t" })
  A.equal(b.messages.length, 2)
})

t("missing ctx -> undefined, no throw", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  A.equal(onRequest(b, null), undefined)
  A.equal(b.messages.length, 1)
})

t("default note has no real sensitive value and keeps placeholder sample", () => {
  const b = { model: "m", messages: [{ role: "user", content: "hi" }] }
  onRequest(b, chatCtx())
  const note = b.messages[0].content
  A.ok(!note.includes("sk-"))
  A.ok(note.includes("{{API_KEY_ab12cd34}}"))
})

console.log("\n" + n + "/" + n + " tests passed")
