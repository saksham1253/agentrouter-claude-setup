import { afterEach, describe, expect, test } from "bun:test";
import { createProxyServer, parseArgs, type Options } from "./proxy";

const servers: Array<{ stop(force?: boolean): unknown }> = [];
const signature = "ccswitch-openai-reasoning-v1:fixture-opaque-state";
const messages = [
  { role: "user", content: [{ type: "text", text: "Keep my original work" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" } }] },
  { role: "assistant", content: [{ type: "thinking", thinking: "", signature }] },
  { role: "assistant", content: [{ type: "redacted_thinking", data: signature },
    { type: "text", text: "I will read the file." },
    { type: "tool_use", id: "call_original", name: "Read", input: { file_path: "test.txt" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "call_original", content: "Original tool output" }] },
];
const body = { model: "fixture", max_tokens: 2048, system: "Original system rules",
  tools: [{ name: "Read", input_schema: { type: "object", properties: {} } }], messages };
const expectedMessages = [messages[0], { ...messages[2], content: messages[2].content.slice(1) }, messages[3]];

function fixture(options: Partial<Options> = {}) {
  const received: Array<{ raw: string; path: string }> = [];
  const logs: string[] = [];
  const upstream = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
    const raw = await req.text();
    received.push({ raw, path: new URL(req.url).pathname });
    return new Response("OK");
  } });
  const proxy = createProxyServer({ port: 0, upstream: upstream.url.toString(),
    omitBridgeReasoning: true, compactAtTokens: 0, ...options }, line => logs.push(line));
  servers.push(proxy, upstream);
  const send = (raw = JSON.stringify(body), path = "/v1/messages?beta=true", headers: Record<string, string> = {}) =>
    fetch(new URL(path, proxy.url), { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw });
  return { received, logs, send };
}

afterEach(() => { for (const server of servers.splice(0)) server.stop(true); });

describe("bridge compatibility", () => {
  test("omits opaque state on the first call but preserves full text, images, system and tool history", async () => {
    const f = fixture();
    expect(await (await f.send()).text()).toBe("OK");
    expect(f.received).toHaveLength(1);
    expect(JSON.parse(f.received[0].raw)).toEqual({ ...body, messages: expectedMessages });
    expect(f.received[0].raw).not.toContain(signature);
    expect(f.logs.some(line => line.includes("bridge compatibility"))).toBe(true);
    expect(f.logs.join("\n")).not.toContain("fixture-opaque-state");
  });

  test("native signed thinking and readable bridge summaries are not lost", async () => {
    const readable = { type: "thinking", thinking: "User-visible earlier summary", signature };
    const native = { type: "thinking", thinking: "Native reasoning", signature: "native-signature" };
    const value = { ...body, messages: [{ role: "assistant", content: [readable, native, { type: "text", text: "Original reply" }] }] };
    const f = fixture();
    await (await f.send(JSON.stringify(value))).text();
    expect(JSON.parse(f.received[0].raw).messages[0].content).toEqual([
      { type: "text", text: "User-visible earlier summary" }, native, { type: "text", text: "Original reply" },
    ]);
  });

  test("does not interpret carrier-looking tool arguments or user text as reasoning", async () => {
    const value = { ...body, messages: [
      { role: "user", content: signature },
      { role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "test", input: { signature } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: signature }] },
    ] };
    const raw = JSON.stringify(value, null, 2);
    const f = fixture();
    await (await f.send(raw)).text();
    expect(f.received[0].raw).toBe(raw);
  });

  test("preserves exact numeric identifiers when filtering unrelated opaque state", async () => {
    const raw = JSON.stringify(body).replace('"file_path":"test.txt"', '"file_path":"test.txt","id":900719925474099312345,"decimal":0.123456789012345678901,"negativeZero":-0');
    const f = fixture();
    await (await f.send(raw)).text();
    expect(f.received[0].raw).not.toContain(signature);
    expect(f.received[0].raw).toContain('"id":900719925474099312345');
    expect(f.received[0].raw).toContain('"decimal":0.123456789012345678901');
    expect(f.received[0].raw).toContain('"negativeZero":-0');
  });

  test("off by default and explicit disabling leave requests byte-for-byte unchanged", async () => {
    expect(parseArgs([]).omitBridgeReasoning).toBe(false);
    const f = fixture({ omitBridgeReasoning: false });
    const raw = JSON.stringify(body, null, 2);
    await (await f.send(raw)).text();
    expect(f.received[0].raw).toBe(raw);
  });

  test.each(["/v1/responses", "/v1/messages/count_tokens", "/other"])("does not rewrite %s", async path => {
    const f = fixture();
    const raw = JSON.stringify(body);
    await (await f.send(raw, path)).text();
    expect(f.received[0].raw).toBe(raw);
  });

  test("skips encoded request bodies", async () => {
    const f = fixture();
    const raw = JSON.stringify(body);
    await (await f.send(raw, undefined, { "content-encoding": "identity" })).text();
    expect(f.received[0].raw).toBe(raw);
  });

  test("refuses ambiguous duplicate keys rather than dropping unrelated data", async () => {
    const f = fixture();
    const raw = JSON.stringify(body).replace('"max_tokens":2048', '"max_tokens":2048,"max_tokens":4096');
    await (await f.send(raw)).text();
    expect(f.received[0].raw).toBe(raw);
  });

  test.each([
    { type: "thinking", thinking: "", signature, extra: "important metadata" },
    { type: "thinking", thinking: null, signature },
    { type: "redacted_thinking", data: signature, extra: "important metadata" },
  ])("leaves unfamiliar or malformed carrier shapes unchanged", async block => {
    const value = { ...body, messages: [{ role: "assistant", content: [block] }, ...messages] };
    const raw = JSON.stringify(value, null, 2);
    const f = fixture();
    await (await f.send(raw)).text();
    expect(f.received[0].raw).toBe(raw);
  });

  test("does not filter user or system blocks, or nested native tool content", async () => {
    const carrierBlock = { type: "thinking", thinking: "", signature };
    const value = { ...body, messages: [
      { role: "user", content: [carrierBlock] },
      { role: "system", content: [carrierBlock] },
      { role: "assistant", content: [{ type: "tool_use", id: "call_2", name: "Read", input: { content: [carrierBlock] } }] },
    ] };
    const raw = JSON.stringify(value, null, 2);
    const f = fixture();
    await (await f.send(raw)).text();
    expect(f.received[0].raw).toBe(raw);
  });

  test("preserves a preexisting empty message and cache metadata on visible summary text", async () => {
    const empty = { role: "assistant", content: [] };
    const cache = { type: "ephemeral" };
    const value = { ...body, messages: [empty, { role: "assistant", content: [
      { type: "thinking", thinking: "Visible summary", signature, cache_control: cache },
    ] }, messages[0]] };
    const f = fixture();
    await (await f.send(JSON.stringify(value))).text();
    expect(JSON.parse(f.received[0].raw).messages).toEqual([empty,
      { role: "assistant", content: [{ type: "text", text: "Visible summary", cache_control: cache }] }, messages[0]]);
  });

  test("leaves input unchanged when exact numeric representation is unavailable", async () => {
    const original = JSON.rawJSON;
    const f = fixture();
    try {
      (JSON as any).rawJSON = undefined;
      const raw = JSON.stringify(body);
      await (await f.send(raw)).text();
      expect(f.received[0].raw).toBe(raw);
    } finally { (JSON as any).rawJSON = original; }
  });

  test("rejects filtering that would erase message-level metadata or all messages", async () => {
    const f = fixture();
    for (const value of [
      { ...body, messages: [{ role: "assistant", content: [{ type: "thinking", thinking: "", signature }], important: "keep" }, messages[0]] },
      { ...body, messages: [{ role: "assistant", content: [{ type: "thinking", thinking: "", signature }] }] },
    ]) {
      const raw = JSON.stringify(value);
      await (await f.send(raw)).text();
      expect(f.received.at(-1)!.raw).toBe(raw);
    }
  });

  test("validates the explicit enable and disable flags", () => {
    expect(parseArgs(["--omit-bridge-reasoning"]).omitBridgeReasoning).toBe(true);
    expect(parseArgs(["--omit-bridge-reasoning", "--keep-bridge-reasoning"]).omitBridgeReasoning).toBe(false);
  });
});
