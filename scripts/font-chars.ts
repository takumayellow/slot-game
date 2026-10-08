/**
 * 液晶・盤面・看板に描く文字を集める。キャンバスに描く前にこの文字だけフォントを読み込む。
 *   npm run font-chars（--write）で src/fontChars.ts を書き直す（テストが差分を検出する）
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FONT_SOURCES = ["src/lcd", "src/render", "src/game/spec.ts"];

function files(path: string): string[] {
  if (path.endsWith(".ts")) return [path];
  return readdirSync(path)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(path, f));
}

/** 文字列リテラルの中の ASCII 以外の文字（コメントは除く） */
export function collectChars(root = "."): string {
  const set = new Set<string>();
  for (const src of FONT_SOURCES) {
    for (const f of files(join(root, src))) {
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const m of code.matchAll(/"([^"\n]*)"|`([^`]*)`|'([^'\n]*)'/g)) {
        for (const ch of m[1] ?? m[2] ?? m[3] ?? "") if (ch.charCodeAt(0) > 0x7e) set.add(ch);
      }
    }
  }
  return [...set].sort().join("");
}

if (process.argv.includes("--write")) {
  const chars = collectChars();
  writeFileSync(
    "src/fontChars.ts",
    `// scripts/font-chars.ts が生成する。手で書き換えない\nexport const FONT_CHARS = ${JSON.stringify(chars)};\n`,
  );
  console.log(`${chars.length} chars`);
}
