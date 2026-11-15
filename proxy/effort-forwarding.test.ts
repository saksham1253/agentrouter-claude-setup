import { afterEach, describe, expect, test } from "bun:test";
import { createProxyServer } from "./proxy";

const servers: Array<{ stop(force?: boolean): unknown }> = [];
afterEach(() => { for (const server of servers.splice(0)) server.stop(true); });

// Characterization of the existing native-client boundary, not a new converter.
// Removing/replacing top-level output_config or sharing it between requests must fail these tests.
function fixture() {
  const received: Array<Record<string, any>> = [];
  const upstream = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
    received.push(await req.json());
    return new Response("OK");
  } });
  const proxy = createProxyServer({ port: 0, upstream: upstream.url.toString(),
    omitBridgeReasoning: true, compactAtTokens: 0 }, () => {});
  servers.push(proxy, upstream);
  const send = async (effort: string, previous = "max") => {
    const response = await fetch(new URL("/v1/messages?beta=true", proxy.url), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 4096,
        thinking: { type: "adaptive", display: "updates" }, output_config: { effort },
        messages: [
          { role: "user", content: "Earlier synthetic task" },
          { role: "system", content: [], output_config: { effort: previous } },
          { role: "assistant", content: [
            { type: "thinking", thinking: "", signature: "ccswitch-openai-reasoning-v1:synthetic" },
            { type: "text", text: "Earlier completed work" },
          ] },
          { role: "user", content: "Current synthetic task" },
          { role: "system", content: [], output_config: { effort } },
        ] }),
    });
    expect(await response.text()).toBe("OK");
  };
  return { send, received };
}

describe("native selected-effort forwarding", () => {
  test.each(["low", "medium", "high", "xhigh", "max"])("preserves current %s effort while omitting only stale bridge state", async effort => {
    const f = fixture();
    await f.send(effort);
    expect(f.received).toHaveLength(1);
    expect(f.received[0].output_config).toEqual({ effort });
    expect(f.received[0].thinking).toEqual({ type: "adaptive", display: "updates" });
    expect(f.received[0].model).toBe("claude-haiku-5-5");
    expect(f.received[0].messages[1].output_config).toEqual({ effort: "max" });
    expect(f.received[0].messages.at(-1).output_config).toEqual({ effort });
    expect(f.received[0].messages[2].content).toEqual([{ type: "text", text: "Earlier completed work" }]);
  });

  test("isolates simultaneous independent effort selections", async () => {
    const f = fixture();
    await Promise.all([f.send("max"), f.send("low"), f.send("medium")]);
    expect(f.received.map(body => body.output_config.effort).sort()).toEqual(["low", "max", "medium"]);
    for (const body of f.received) {
      expect(body.messages.at(-1).output_config.effort).toBe(body.output_config.effort);
    }
  });

  test("does not turn explicit user-off thinking into adaptive reasoning", async () => {
    let received: any;
    const upstream = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
      received = await req.json();
      return new Response("OK");
    } });
    const proxy = createProxyServer({ port: 0, upstream: upstream.url.toString(),
      omitBridgeReasoning: true }, () => {});
    servers.push(proxy, upstream);
    const response = await fetch(new URL("/v1/messages", proxy.url), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 4096,
        thinking: { type: "disabled" }, output_config: { effort: "xhigh" },
        messages: [{ role: "user", content: "Synthetic user-off task" }] }),
    });
    expect(await response.text()).toBe("OK");
    expect(received.thinking).toEqual({ type: "disabled" });
    expect(received.output_config).toEqual({ effort: "xhigh" });
  });
});
