import { describe, expect, it } from "vitest";
import { formatUiText, getUiText, uiText } from "..";

describe("uiText translations", () => {
  it("returns Japanese text as the default locale", () => {
    const text = getUiText();
    expect(text.header.scenarioLabel).toBe(uiText.header.scenarioLabel);
    expect(text.metadata.lang).toBe("ja");
    expect(text.toolbar.connectLabel).toBe("接続");
  });

  it("formats template strings with the provided placeholders", () => {
    const result = formatUiText(uiText.session.errorMessageTemplate, {
      error: "テストエラー",
    });
    expect(result).toContain("テストエラー");
    expect(result).toMatch(/再確認してから再試行してください。$/);
  });
});
