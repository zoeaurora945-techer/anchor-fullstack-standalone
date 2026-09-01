import { describe, expect, it } from "vitest";
import { i18n } from "./i18nContract";

describe("shared i18n contract", () => {
  it("keeps the Chinese and English dictionaries structurally aligned", () => {
    expect(Object.keys(i18n.zh).sort()).toEqual(Object.keys(i18n.en).sort());
    expect(i18n.zh.addTask).toBeTruthy();
    expect(i18n.en.addTask).toBeTruthy();
  });
});
