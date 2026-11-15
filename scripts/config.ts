export type Settings = Record<string, any>;
export type SetupOptions = { proxyPort: number; bridgePort: number; compactWindow: number; profile: "safe" | "replica"; allowBroadTools: boolean };
export const object = (v: unknown): v is Settings => !!v && typeof v === "object" && !Array.isArray(v);

export function parseSettings(text: string): Settings {
  const stack: Array<Set<string> | null> = [];
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]]/g)) {
    const token = match[0];
    if (token === "{") stack.push(new Set());
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (/^\s*:/.test(text.slice(match.index! + token.length)) && stack.at(-1)) {
      const key = JSON.parse(token);
      if (stack.at(-1)!.has(key)) throw new Error("Duplicate JSON key; repair the settings manually first");
      stack.at(-1)!.add(key);
    }
  }
  const v = JSON.parse(text.replace(/^\uFEFF/, ""));
  if (!object(v)) throw new Error("Settings must be a JSON object");
  for (const key of ["env", "permissions", "modelSettings"]) if (v[key] !== undefined && !object(v[key])) throw new Error(`Invalid ${key}`);
  for (const key of ["allow", "deny", "ask"]) if (v.permissions?.[key] !== undefined && (!Array.isArray(v.permissions[key]) || v.permissions[key].some((x: any) => typeof x !== "string"))) throw new Error(`Invalid permissions.${key}`);
  return v;
}
export function validateOptions(o: SetupOptions) {
  for (const port of [o.proxyPort, o.bridgePort]) if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Ports must be integers from 1024 to 65535");
  if (o.proxyPort === o.bridgePort) throw new Error("Proxy and bridge ports must differ");
  if (!Number.isInteger(o.compactWindow) || o.compactWindow < 100000 || o.compactWindow > 1000000) throw new Error("Compaction window must be 100000..1000000");
  if (!["safe", "replica"].includes(o.profile)) throw new Error("Unknown profile");
  if (o.profile === "replica" && !o.allowBroadTools) throw new Error("Replica profile requires --allow-broad-tools; Bash allows arbitrary shell commands");
}
export function mergeClaudeSettings(before: Settings, o: SetupOptions): Settings {
  validateOptions(o);
  const d = structuredClone(parseSettings(JSON.stringify(before)));
  d.env = { ...d.env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${o.proxyPort}`, ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-5", ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-5",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-5-5", API_TIMEOUT_MS: "600000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", CLAUDE_CODE_AUTO_MODE_SERVER: "0",
    ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: "GPT-6.1 Sol", ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: "GPT-6 Astra",
    ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: "GPT-6.1 Sol" };
  // Real credentials stay in cc-switch, never in the client overlay.
  delete d.env.ANTHROPIC_API_KEY;
  // Preserve a current model choice. A fresh installation starts on the Sol selector.
  d.model ??= "claude-opus-5";
  d.autoCompactWindow = o.compactWindow;
  d.autoCompactEnabled = true;
  for (const setting of Object.values(d.modelSettings ?? {})) {
    if (!object(setting)) throw new Error("Invalid per-model settings");
    if (Object.hasOwn(setting, "autoCompactWindow")) setting.autoCompactWindow = o.compactWindow;
  }
  const rows = [
    { model: "claude-opus-5", label: "GPT-6.1 Sol", description: "AgentRouter · OpenAI Responses" },
    { model: "claude-sonnet-5", label: "GPT-6 Astra", description: "AgentRouter · OpenAI Responses" },
  ];
  if (d.modelPicker !== undefined && (!object(d.modelPicker) || !Array.isArray(d.modelPicker.options))) throw new Error("Invalid modelPicker");
  const existingRows = d.modelPicker?.options ?? [];
  d.modelPicker = { replaceBuiltInOptions: true, ...d.modelPicker, options: [...existingRows] };
  for (const row of rows) if (!d.modelPicker.options.some((x: any) => x.model === row.model)) d.modelPicker.options.push(row);
  if (o.profile === "replica") {
    d.modelSettings ??= {};
    for (const model of ["claude-opus-5", "claude-sonnet-5", "claude-haiku-5-5"]) {
      d.modelSettings[model] ??= {};
      d.modelSettings[model].effortLevel ??= "xhigh";
    }

    d.permissions ??= {}; d.permissions.allow ??= [];
    for (const tool of ["Bash", "Workflow", "WebFetch", "WebSearch"]) if (!d.permissions.allow.includes(tool)) d.permissions.allow.push(tool);
    d.enableWorkflows = true;
  }
  return d;
}
export function providerTemplate(key: string, endpoint: string) {
  if (!key.trim() || /[\r\n]/.test(key)) throw new Error("Provide a nonempty recipient-owned key locally");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || /\/(responses|messages|chat\/completions)\/?$/.test(url.pathname)) throw new Error("Use an HTTPS base URL without credentials/query or a full API endpoint");
  return { name: "AgentRouter · Sol + Astra (setup toolkit)", meta: { apiFormat: "openai_responses", claudeReasoningEffort: "passthrough", setupToolkit: "agentrouter-claude-setup-v1" },
    settings_config: { env: { ANTHROPIC_BASE_URL: endpoint.replace(/\/+$/, ""), ANTHROPIC_AUTH_TOKEN: key,
      ANTHROPIC_MODEL: "gpt-6.1-sol", ANTHROPIC_DEFAULT_OPUS_MODEL: "gpt-6.1-sol",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "gpt-6-astra", ANTHROPIC_DEFAULT_HAIKU_MODEL: "gpt-6.1-sol" } } };
}
