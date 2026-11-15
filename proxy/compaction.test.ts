import { afterEach, describe, expect, test } from "bun:test";
import { createProxyServer, parseArgs, type Options } from "./proxy";

const servers: Array<{ stop(force?: boolean): unknown }> = [];
const overflow = "Responses upstream invalid_request_error: Your input exceeds the context window of this model.";
const summary = "Earlier work: build the search page; keep the agreed filters. Tests passed. Next: verify the tool result.";
const history = Array.from({ length: 20 }, (_, i) => ({
  role: i % 2 ? "assistant" : "user",
  content: `History ${i}: ${"completed work ".repeat(200)}`,
}));
const current = [
  { role: "user", content: "CURRENT REQUEST: read the result, do not change files." },
  { role: "assistant", content: [{ type: "tool_use", id: "call_current", name: "Read", input: { path: "test.txt" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "call_current", content: "EXPECTED RESULT" }] },
];
const body = { model: "test-model", max_tokens: 100, stream: false, system: "Original system rules",
  tools: [{ name: "Read", input_schema: { type: "object", properties: {} } }], messages: [...history, ...current] };

type RequestRecord = { body: any; raw: string; headers: Headers; path: string; summary: boolean };
function fixture(options: Partial<Options> = {}, handler?: (record: RequestRecord) => Response | Promise<Response>) {
  const requests: RequestRecord[] = [];
  const logs: string[] = [];
  const upstream = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 0, async fetch(req) {
    const raw = await req.text();
    const data = JSON.parse(raw);
    const record = { body: data, raw, headers: req.headers, path: new URL(req.url).pathname + new URL(req.url).search,
      summary: typeof data.system === "string" && data.system.startsWith("AR-Proxy history summarizer") };
    requests.push(record);
    if (handler) return handler(record);
    return Response.json(record.summary
      ? { type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] }
      : { type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "OK" }] });
  } });
  const proxy = createProxyServer({ port: 0, upstream: upstream.url.toString(), bigCtxTokens: 0,
    deadlineMs: 5000, compactAtTokens: 12000, compactTargetTokens: 6000, ...options }, text => logs.push(text));
  servers.push(proxy, upstream);
  const send = (value: unknown = body, path = "/v1/messages?beta=true", headers: Record<string, string> = {}, signal?: AbortSignal) =>
    fetch(new URL(path, proxy.url), { method: "POST", headers: { "content-type": "application/json", ...headers },
      body: typeof value === "string" ? value : JSON.stringify(value), signal });
  return { proxy, requests, logs, send };
}

afterEach(() => { for (const server of servers.splice(0)) server.stop(true); });

describe("opt-in history compaction", () => {
  test("summarizes older history before forwarding, preserving current tool round trip and system/tools", async () => {
    const f = fixture();
    const response = await f.send();
    expect(response.status).toBe(200);
    await response.text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    const forwarded = f.requests.filter(r => !r.summary)[0].body;
    expect(forwarded.system).toBe(body.system);
    expect(forwarded.tools).toEqual(body.tools);
    expect(forwarded.model).toBe("test-model");
    expect(forwarded.messages.slice(-3)).toEqual(current);
    expect(JSON.stringify(forwarded)).toContain(summary);
    expect(JSON.stringify(forwarded).length).toBeLessThan(18000);
    expect(f.requests.filter(r => r.summary).every(r => !r.body.tools && r.body.stream === false)).toBe(true);
  });

  test("disabled compaction forwards exactly the original request without extra calls", async () => {
    const f = fixture({ compactAtTokens: 0 });
    const raw = JSON.stringify(body, null, 2);
    await (await f.send(raw)).text();
    expect(f.requests.length).toBe(1);
    expect(f.requests[0].raw).toBe(raw);
  });

  test.each(["/v1/responses", "/v1/messages/count_tokens"])("leaves %s untouched", async path => {
    const f = fixture();
    await (await f.send(body, path)).text();
    expect(f.requests.length).toBe(1);
    expect(f.requests[0].body).toEqual(body);
  });

  test("reuses exact prefix summaries across appended turns", async () => {
    const f = fixture();
    await (await f.send()).text();
    const count = f.requests.filter(r => r.summary).length;
    expect(count).toBeGreaterThan(0);
    await (await f.send({ ...body, messages: [...body.messages,
      { role: "assistant", content: "Done" }, { role: "user", content: "Next tiny task" }] })).text();
    expect(f.requests.filter(r => r.summary).length).toBe(count);
    expect(JSON.stringify(f.requests.at(-1)!.body)).toContain(summary);
    expect(f.requests.at(-1)!.body.messages.at(-1).content).toBe("Next tiny task");
  });

  test("does not reuse a summary across credentials or changed history", async () => {
    const f = fixture();
    await (await f.send(body, undefined, { authorization: "Bearer test-a" })).text();
    const first = f.requests.filter(r => r.summary).length;
    expect(first).toBeGreaterThan(0);
    await (await f.send(body, undefined, { authorization: "Bearer test-b" })).text();
    expect(f.requests.filter(r => r.summary).length).toBeGreaterThan(first);
    const second = f.requests.filter(r => r.summary).length;
    await (await f.send({ ...body, messages: [{ role: "user", content: "DIFFERENT HISTORY" }, ...body.messages.slice(1)] },
      undefined, { authorization: "Bearer test-b" })).text();
    expect(f.requests.filter(r => r.summary).length).toBeGreaterThan(second);
  });

  test("preserves latest human instruction even during a long tool-only turn", async () => {
    const loops = Array.from({ length: 12 }, (_, i) => [
      { role: "assistant", content: [{ type: "tool_use", id: `loop_${i}`, name: "Read", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: `loop_${i}`, content: "result ".repeat(400) }] },
    ]).flat();
    const instruction = { role: "user", content: "Keep THIS exact instruction while you run the tools." };
    const f = fixture();
    await (await f.send({ ...body, messages: [...history, instruction, ...loops] })).text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    const messages = f.requests.at(-1)!.body.messages;
    expect(messages).toContainEqual(instruction);
    const calls = new Set(messages.flatMap((m: any) => Array.isArray(m.content)
      ? m.content.filter((b: any) => b.type === "tool_use").map((b: any) => b.id) : []));
    for (const message of messages) for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block.type === "tool_result") expect(calls.has(block.tool_use_id)).toBe(true);
    }
  });

  test("context overflow triggers only one smaller retry when below proactive threshold", async () => {
    const f = fixture({ compactAtTokens: 100000 }, r => r.summary
      ? Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] })
      : JSON.stringify(r.body).includes(summary) ? Response.json({ ok: true })
      : Response.json({ error: { type: "invalid_request_error", message: overflow } }, { status: 422 }));
    expect((await f.send()).status).toBe(200);
    expect(f.requests.filter(r => !r.summary).length).toBe(2);
    expect(f.requests.some(r => r.summary)).toBe(true);
  });

  test("preserves unrelated errors without compaction and does not loop on persistent overflow", async () => {
    const f = fixture({ compactAtTokens: 100000 }, r => r.summary
      ? Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] })
      : Response.json({ error: { type: "invalid_request_error", message: overflow } }, { status: 422 }));
    expect((await f.send()).status).toBe(422);
    expect(f.requests.filter(r => !r.summary).length).toBe(2);
    const other = fixture({ compactAtTokens: 100000 }, () => new Response("bad tool schema", { status: 422 }));
    expect(await (await other.send()).text()).toBe("bad tool schema");
    expect(other.requests.length).toBe(1);
  });

  test("summary failure passes the original request unchanged and never uses a partial summary", async () => {
    const f = fixture({}, r => r.summary
      ? Response.json({ type: "message", role: "assistant", stop_reason: "max_tokens", content: [{ type: "text", text: "INCOMPLETE" }] })
      : Response.json({ ok: true }));
    await (await f.send()).text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    expect(f.requests.at(-1)!.body).toEqual(body);
  });

  test("does not summarize when current instruction alone exceeds target", async () => {
    const f = fixture();
    const value = { ...body, messages: [...history, { role: "user", content: "x".repeat(40000) }] };
    await (await f.send(value)).text();
    expect(f.requests.length).toBe(1);
    expect(f.requests[0].body).toEqual(value);
  });

  test("keeps opaque reasoning out of summary prompts, but retains tail signatures", async () => {
    const bridge = { role: "assistant", content: [{ type: "thinking", thinking: "",
      signature: "ccswitch-openai-reasoning-v1:ENCRYPTED_OLD" }] };
    const tail = { role: "assistant", content: [{ type: "thinking", thinking: "",
      signature: "ccswitch-openai-reasoning-v1:ENCRYPTED_TAIL" }, { type: "text", text: "Done" }] };
    const f = fixture();
    await (await f.send({ ...body, messages: [history[0], bridge, ...history.slice(1), ...current, tail] })).text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    for (const r of f.requests.filter(r => r.summary)) expect(r.raw).not.toContain("ENCRYPTED_");
    expect(f.requests.at(-1)!.body.messages.at(-1)).toEqual(tail);
  });

  test("preserves large numeric identifiers in retained tool arguments", async () => {
    const f = fixture();
    const raw = JSON.stringify(body).replace('"path":"test.txt"', '"path":"test.txt","id":900719925474099312345,"fraction":1.234567890123456789');
    await (await f.send(raw)).text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    expect(f.requests.at(-1)!.raw).toContain('"id":900719925474099312345');
    expect(f.requests.at(-1)!.raw).toContain('"fraction":1.234567890123456789');
  });

  test("preserves call dependencies when the latest instruction also contains a tool result", async () => {
    const anchorCall = { role: "assistant", content: [{ type: "tool_use", id: "anchor_call", name: "Read", input: {} }] };
    const anchor = { role: "user", content: [{ type: "tool_result", tool_use_id: "anchor_call", content: "old result" },
      { type: "text", text: "LATEST INSTRUCTION: keep checking" }] };
    const loops = Array.from({ length: 10 }, (_, i) => [
      { role: "assistant", content: [{ type: "tool_use", id: `after_${i}`, name: "Read", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: `after_${i}`, content: "result".repeat(150) }] },
    ]).flat();
    const f = fixture({ compactTargetTokens: 8000 });
    await (await f.send({ ...body, messages: [...history, anchorCall, anchor, ...loops] })).text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    expect(f.requests.at(-1)!.body.messages).toContainEqual(anchor);
    expect(f.requests.at(-1)!.body.messages).toContainEqual(anchorCall);
  });

  test("preserves mid-conversation system instructions and their surrounding tool dependencies", async () => {
    const call = { role: "assistant", content: [{ type: "tool_use", id: "system_call", name: "Read", input: {} }] };
    const result = { role: "user", content: [{ type: "tool_result", tool_use_id: "system_call", content: "system-related result" }] };
    const instruction = { role: "system", content: [{ type: "text", text: "AUTHORITATIVE HISTORICAL RULE" }], clear_at: "next_user_message" };
    const following = { role: "assistant", content: "Acknowledged the constraint" };
    const latestSystem = { role: "system", content: [{ type: "text", text: "LATEST SYSTEM RULE", cache_control: { type: "ephemeral" } }] };
    const f = fixture();
    await (await f.send({ ...body, messages: [...history.slice(0, 4), call, result, instruction, following,
      ...history.slice(4), ...current, latestSystem] })).text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    const forwarded = f.requests.at(-1)!.body.messages;
    expect(forwarded).toContainEqual(instruction);
    expect(forwarded).toContainEqual(call);
    const index = forwarded.findIndex((m: any) => m.role === "system");
    expect(forwarded[index - 1]).toEqual(result);
    expect(forwarded[index + 1]).toEqual(following);
    expect(forwarded.at(-1)).toEqual(latestSystem);
    for (const r of f.requests.filter(r => r.summary)) expect(r.raw).not.toContain("AUTHORITATIVE HISTORICAL RULE");
  });

  test.each([
    { type: "image", source: { type: "base64", media_type: "image/png", data: "fixture" } },
    { type: "thinking", thinking: "native", signature: "native-signed" },
    { type: "unknown_future_block", value: "important" },
    { type: "tool_result", tool_use_id: "missing_call", content: "orphan" },
  ])("refuses to compact unsupported or invalid content $type", async block => {
    const f = fixture();
    const raw = JSON.stringify({ ...body, messages: [{ role: "user", content: [block] }, ...body.messages] });
    await (await f.send(raw)).text();
    expect(f.requests.length).toBe(1);
    expect(f.requests[0].raw).toBe(raw);
  });

  test("rejects duplicate JSON keys for rewriting instead of silently dropping values", async () => {
    const f = fixture();
    const raw = JSON.stringify(body).replace('"max_tokens":100', '"max_tokens":100,"max_tokens":200');
    await (await f.send(raw)).text();
    expect(f.requests.length).toBe(1);
    expect(f.requests[0].raw).toBe(raw);
  });

  test("coordinates concurrent identical compactions without duplicate summary calls", async () => {
    const f = fixture({}, async r => {
      if (r.summary) await Bun.sleep(40);
      return Response.json(r.summary
        ? { type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] }
        : { ok: true });
    });
    await Promise.all([1, 2, 3].map(async () => (await f.send()).text()));
    expect(f.requests.filter(r => r.summary).length).toBe(1);
    expect(f.requests.filter(r => !r.summary).length).toBe(3);
    expect(f.requests.filter(r => !r.summary).every(r => JSON.stringify(r.body).includes(summary))).toBe(true);
  });

  test.each([1, 2])("summary calls share max-attempts=%s with the final request", async maxAttempts => {
    const f = fixture({ maxAttempts }, r => r.summary
      ? Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] })
      : Response.json({ error: { type: "invalid_request_error", message: overflow } }, { status: 422 }));
    expect((await f.send()).status).toBe(422);
    expect(f.requests.length).toBe(maxAttempts);
    expect(f.requests.filter(r => !r.summary).length).toBe(1);
  });

  test("summary HTTP failures do not expose response contents in logs", async () => {
    const f = fixture({}, r => r.summary ? new Response("PRIVATE SUMMARY KEY AND CONTENT", { status: 403 }) : Response.json({ ok: true }));
    await (await f.send()).text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    expect(f.requests.at(-1)!.body).toEqual(body);
    expect(f.logs.join("\n")).not.toContain("PRIVATE SUMMARY");
  });

  test("forwards streaming replies unchanged after proactive compaction", async () => {
    const stream = 'event: message_start\ndata: {"type":"message_start"}\n\nevent: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"HELLO"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n';
    const f = fixture({}, r => r.summary
      ? Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] })
      : new Response(stream, { headers: { "content-type": "text/event-stream" } }));
    expect(await (await f.send({ ...body, stream: true })).text()).toBe(stream);
    expect(f.requests.filter(r => !r.summary).length).toBe(1);
    expect(f.requests.some(r => r.summary)).toBe(true);
  });

  test("never retries a context failure once streaming output has started", async () => {
    const stream = 'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"HELLO"}}\n\n' +
      `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: overflow } })}\n\n`;
    const f = fixture({ compactAtTokens: 100000 }, () => new Response(stream, { headers: { "content-type": "text/event-stream" } }));
    expect(await (await f.send({ ...body, stream: true })).text()).toBe(stream);
    expect(f.requests.length).toBe(1);
  });

  test("summary timeout respects request deadline without forwarding the original afterward", async () => {
    const f = fixture({ deadlineMs: 30 }, async r => {
      if (r.summary) await Bun.sleep(150);
      return Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] });
    });
    expect((await f.send()).status).toBe(504);
    expect(f.requests.filter(r => !r.summary).length).toBe(0);
  });

  test("a disconnected summary owner does not cancel another waiting request", async () => {
    let entered!: () => void;
    const firstSummary = new Promise<void>(resolve => { entered = resolve; });
    const f = fixture({}, async r => {
      if (r.summary) { entered(); await Bun.sleep(60); }
      return Response.json(r.summary
        ? { type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] }
        : { ok: true });
    });
    const controller = new AbortController();
    const owner = f.send(body, undefined, {}, controller.signal).then(r => r.text(), () => "cancelled");
    await firstSummary;
    const waiter = f.send();
    controller.abort();
    expect(await owner).toBe("cancelled");
    expect((await waiter).status).toBe(200);
    const forwarded = f.requests.filter(r => !r.summary);
    expect(forwarded.length).toBe(1);
    expect(JSON.stringify(forwarded[0].body)).toContain(summary);
  });

  test("uses distinct idempotency keys for summaries and final inference", async () => {
    const seen = new Map<string, string>();
    const f = fixture({}, r => {
      const key = r.headers.get("idempotency-key")!;
      if (seen.has(key) && seen.get(key) !== r.raw) return new Response("different body for same key", { status: 409 });
      seen.set(key, r.raw);
      return Response.json(r.summary
        ? { type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] }
        : { ok: true });
    });
    expect((await f.send(body, undefined, { "idempotency-key": "client-request" })).status).toBe(200);
    expect(f.requests.filter(r => r.summary)[0].headers.get("idempotency-key")).not.toBe("client-request");
    expect(f.requests.at(-1)!.headers.get("idempotency-key")).toBe("client-request");
  });

  test("keeps routing query parameters on summary requests", async () => {
    const path = "/v1/messages?tenant=fixture&api-version=1";
    const f = fixture();
    await (await f.send(body, path)).text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    expect(f.requests.every(r => r.path === path)).toBe(true);
  });

  test("individual summary timeout permits unchanged inference within the outer deadline", async () => {
    const f = fixture({ upstreamTimeoutMs: 25, deadlineMs: 500 }, async r => {
      if (r.summary) await Bun.sleep(100);
      return Response.json(r.summary
        ? { type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] }
        : { ok: true });
    });
    expect((await f.send()).status).toBe(200);
    expect(f.requests.at(-1)!.body).toEqual(body);
  });

  test("successful summary calls do not increase retry backoff for the first inference failure", async () => {
    let inferences = 0;
    const f = fixture({ deadlineMs: 250, baseDelayMs: 20, maxDelayMs: 1000 }, r => {
      if (r.summary) return Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }] });
      return ++inferences === 1 ? new Response("unavailable", { status: 503 }) : Response.json({ ok: true });
    });
    const older = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "old ".repeat(750) }));
    expect((await f.send({ ...body, messages: [...older, ...current] })).status).toBe(200);
    expect(f.requests.filter(r => r.summary).length).toBe(4);
    expect(inferences).toBe(2);
  });

  test("does not compact malformed tools even if their result IDs match", async () => {
    const value = { ...body, messages: [{ role: "assistant", content: [{ type: "tool_use", id: "bad" }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "bad", content: "result" }] }, ...body.messages] };
    const f = fixture();
    await (await f.send(value)).text();
    expect(f.requests.length).toBe(1);
    expect(f.requests[0].body).toEqual(value);
  });

  test("rejects malformed text blocks in summaries rather than caching partial output", async () => {
    const f = fixture({}, r => r.summary
      ? Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: summary }, { type: "text", text: null }] })
      : Response.json({ ok: true }));
    await (await f.send()).text();
    expect(f.requests.some(r => r.summary)).toBe(true);
    expect(f.requests.at(-1)!.body).toEqual(body);
  });

  test("validates opt-in thresholds and accepts launcher flags", () => {
    expect(parseArgs(["--compact-at-tokens", "80000", "--compact-target-tokens", "48000"]).compactAtTokens).toBe(80000);
    expect(() => parseArgs(["--compact-at-tokens", "1000", "--compact-target-tokens", "2000"])).toThrow();
    expect(() => parseArgs(["--compact-at-tokens", "-1"])).toThrow();
  });
});
