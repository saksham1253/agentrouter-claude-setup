import { describe, expect, test } from "bun:test";
import { mergeClaudeSettings } from "../scripts/config";
import { parseCli } from "../scripts/platform";
const o = { proxyPort:15720, bridgePort:15721, compactWindow:500000, profile:"safe", allowBroadTools:false };
describe("existing preference preservation",()=>{
  test("retains custom model picker rows and picker policy",()=>{
    const d=mergeClaudeSettings({modelPicker:{replaceBuiltInOptions:false,options:[{model:"custom-private-model",label:"Existing"}]}},o as any);
    expect(d.modelPicker.options).toContainEqual({model:"custom-private-model",label:"Existing"});
    expect(d.modelPicker.replaceBuiltInOptions).toBe(false);
  });
  test("replica supplies xhigh only when that model has no existing effort",()=>{
    const d=mergeClaudeSettings({modelSettings:{"claude-haiku-5-5":{effortLevel:"low"}}},{...o,profile:"replica",allowBroadTools:true} as any);
    expect(d.modelSettings["claude-opus-5"].effortLevel).toBe("xhigh");
    expect(d.modelSettings["claude-haiku-5-5"].effortLevel).toBe("low");
    expect(d.env.CLAUDE_CODE_EFFORT_LEVEL).toBeUndefined();
  });
  test("parses each CLI value under its own flag",()=>{
    const d=parseCli(["--endpoint","https://example.com/v1","--profile","replica","--allow-broad-tools","--workspace","C:/work space"]);
    expect(d.values["--endpoint"]).toBe("https://example.com/v1");
    expect(d.values["--workspace"]).toBe("C:/work space");
    expect(d.options.profile).toBe("replica");
    expect(d.options.compactWindow).toBe(1000000);
  });
});
