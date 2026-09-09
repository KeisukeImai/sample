const fs = require("fs");
const path = require("path");
const translate = require("google-translate-api-x");

// ==============================
// 設定
// ==============================

// 作業フォルダ
const BASE_DIR = __dirname;

// 英語Markdown格納先
const SOURCE_DIR = path.join(BASE_DIR, "en");

// 日本語Markdown出力先
const TARGET_DIR = path.join(BASE_DIR, "ja");

// SCxxxx.md のみ対象
const FILE_PATTERN = /^SC\d+\.md$/i;

// 翻訳済みファイルが存在する場合はスキップ
const SKIP_EXISTING = true;

// 翻訳リクエスト間の待機時間
const WAIT_MS = 800;

// ==============================
// 共通処理
// ==============================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Markdown内で翻訳してはいけない部分を退避する。
 */
function protectMarkdown(markdown) {
  const protectedValues = [];

  function protect(value) {
    const index = protectedValues.length;
    const token = `ZXQPROTECTED${index}ZXQ`;

    protectedValues.push(value);

    return token;
  }

  let result = markdown;

  // ``` ～ ``` コードブロック
  result = result.replace(/```[\s\S]*?```/g, (match) => protect(match));

  // ~~~ ～ ~~~ コードブロック
  result = result.replace(/~~~[\s\S]*?~~~/g, (match) => protect(match));

  // インラインコード
  result = result.replace(/`[^`\n]+`/g, (match) => protect(match));

  // URL
  result = result.replace(/https?:\/\/[^\s)>]+/g, (match) => protect(match));

  return {
    text: result,
    protectedValues,
  };
}

/**
 * 退避したMarkdown要素を復元する。
 */
function restoreMarkdown(text, protectedValues) {
  let result = text;

  protectedValues.forEach((value, index) => {
    const token = `ZXQPROTECTED${index}ZXQ`;

    const escaped = token
      .split("")
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s*");

    result = result.replace(new RegExp(escaped, "gi"), value);
  });

  return result;
}

/**
 * Markdownを英語から日本語へ翻訳する。
 */
async function translateMarkdown(markdown) {
  const { text, protectedValues } = protectMarkdown(markdown);

  const result = await translate(text, {
    from: "en",
    to: "ja",
  });

  return restoreMarkdown(result.text, protectedValues);
}

/**
 * SCxxxx.md を翻訳する。
 */
async function translateFile(sourceFile) {
  const sourcePath = path.join(SOURCE_DIR, sourceFile);

  const baseName = path.basename(sourceFile, ".md");

  const targetFile = `${baseName}.ja.md`;

  const targetPath = path.join(TARGET_DIR, targetFile);

  if (SKIP_EXISTING && fs.existsSync(targetPath)) {
    console.log(`[SKIP] ${targetFile}`);

    return;
  }

  console.log(`[START] ${sourceFile}`);

  const markdown = fs.readFileSync(sourcePath, "utf8");

  try {
    const translated = await translateMarkdown(markdown);

    fs.writeFileSync(targetPath, translated, "utf8");

    console.log(`[OK]    ${targetFile}`);
  } catch (error) {
    console.error(`[ERROR] ${sourceFile}`);

    console.error(error.message);

    throw error;
  }
}

// ==============================
// メイン処理
// ==============================

async function main() {
  // enフォルダ存在確認
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`入力フォルダが存在しません: ${SOURCE_DIR}`);

    process.exit(1);
  }

  // jaフォルダがなければ作成
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, {
      recursive: true,
    });

    console.log(`[CREATE] ${TARGET_DIR}`);
  }

  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((file) => FILE_PATTERN.test(file))
    .sort();

  console.log(`対象ファイル数: ${files.length}`);

  console.log("");

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const baseName = path.basename(file, ".md");

    const targetPath = path.join(TARGET_DIR, `${baseName}.ja.md`);

    if (SKIP_EXISTING && fs.existsSync(targetPath)) {
      console.log(`[SKIP] ${baseName}.ja.md`);

      skipCount++;

      continue;
    }

    try {
      await translateFile(file);

      successCount++;
    } catch (error) {
      errorCount++;
    }

    await sleep(WAIT_MS);
  }

  console.log("");
  console.log("==============================");
  console.log("翻訳処理終了");
  console.log(`成功: ${successCount}`);
  console.log(`スキップ: ${skipCount}`);
  console.log(`失敗: ${errorCount}`);
  console.log("==============================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
