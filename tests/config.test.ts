import { describe, expect, test } from "bun:test";

// Import dynamically so missing implementation produces an explicit feature failure.
async function api() {
  try { return await import("../scripts/config"); } catch { return {} as any; }
}
const options = { proxyPort: 15720, bridgePort: 15721, compactWindow: 500000, profile: "safe", allowBroadTools: false };
describe("configuration merge", () => {
  test("merges routing without losing permissions, hooks or selected effort", async () => {
    const { mergeClaudeSettings } = await api();
    expect(typeof mergeClaudeSettings).toBe("function");
    const before = { env: { KEEP: "yes", ANTHROPIC_AUTH_TOKEN: "fixture-existing" },
      permissions: { allow: ["Read"], deny: ["Bash(rm *)"] }, hooks: { Stop: [] }, model: "haiku",
      modelSettings: { "claude-haiku-5-5": { effortLevel: "low", autoCompactWindow: 100000 } } };
    const result = mergeClaudeSettings(before, options);
    expect(result.env).toMatchObject({ KEEP: "yes", ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED", ANTHROPIC_BASE_URL: "http://127.0.0.1:15720" });
    expect(result.permissions).toEqual(before.permissions);
    expect(result.hooks).toEqual(before.hooks);
    expect(result.model).toBe("haiku");
    expect(result.modelSettings["claude-haiku-5-5"]).toEqual({ effortLevel: "low", autoCompactWindow: 500000 });
    expect(before.env.ANTHROPIC_AUTH_TOKEN).toBe("fixture-existing");
    expect(result.env.CLAUDE_CODE_EFFORT_LEVEL).toBeUndefined();
  });
  test("broad permission profile requires explicit consent", async () => {
    const { mergeClaudeSettings } = await api(); expect(typeof mergeClaudeSettings).toBe("function");
    expect(() => mergeClaudeSettings({}, { ...options, profile: "replica" })).toThrow("allow-broad-tools");
    const result = mergeClaudeSettings({ permissions: { allow: ["Read"] } }, { ...options, profile: "replica", allowBroadTools: true, compactWindow: 1000000 });
    expect(result.permissions.allow).toEqual(["Read", "Bash", "Workflow", "WebFetch", "WebSearch"]);
    expect(result.autoCompactWindow).toBe(1000000);
    expect(result.permissions.defaultMode).toBeUndefined();
    expect(result.skipWebFetchPreflight).toBeUndefined();
  });
  test("rejects invalid windows and conflicting ports", async () => {
    const { validateOptions } = await api(); expect(typeof validateOptions).toBe("function");
    for (const compactWindow of [0, 99999, 1500000, NaN]) expect(() => validateOptions({ ...options, compactWindow })).toThrow();
    expect(() => validateOptions({ ...options, bridgePort: 15720 })).toThrow();
    expect(() => validateOptions({ ...options, proxyPort: 1.5 })).toThrow();
  });
  test("rejects ambiguous JSON instead of overwriting it", async () => {
    const { parseSettings } = await api(); expect(typeof parseSettings).toBe("function");
    expect(() => parseSettings('{"env":{},"env":{"KEEP":"yes"}}')).toThrow();
    expect(() => parseSettings('[]')).toThrow();
    expect(() => parseSettings('{"permissions":{"allow":"Bash"}}')).toThrow();
    expect(parseSettings('{"env":{"KEEP":"yes"}}')).toEqual({env:{KEEP:"yes"}});
  });
  test("provider template uses Responses and two actual routing families", async () => {
    const { providerTemplate } = await api(); expect(typeof providerTemplate).toBe("function");
    const p = providerTemplate("fixture-key", "https://agentrouter.org");
    expect(p.meta).toMatchObject({ apiFormat: "openai_responses", claudeReasoningEffort: "passthrough" });
    expect(p.settings_config.env).toMatchObject({ANTHROPIC_MODEL:"gpt-6.1-sol",ANTHROPIC_DEFAULT_OPUS_MODEL:"gpt-6.1-sol",ANTHROPIC_DEFAULT_SONNET_MODEL:"gpt-6-astra",ANTHROPIC_DEFAULT_HAIKU_MODEL:"gpt-6.1-sol"});
    expect(() => providerTemplate("", "https://agentrouter.org")).toThrow();
    expect(() => providerTemplate("fixture-key", "http://evil.invalid")).toThrow();
    expect(() => providerTemplate("fixture-key", "https://user:pass@example.com")).toThrow();
  });
});
