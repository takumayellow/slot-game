import { describe, expect, it } from "vitest";
import { collectChars } from "../scripts/font-chars";
import { FONT_CHARS } from "../src/fontChars";

describe("フォントの事前読み込み", () => {
  it("キャンバスに描く文字がすべて読み込み対象に入っている", () => {
    // 落ちたら npm run font-chars で作り直す
    expect(FONT_CHARS).toBe(collectChars());
  });
});
