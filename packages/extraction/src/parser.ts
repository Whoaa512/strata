import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";

let initialized = false;
const languages: Map<string, Parser.Language> = new Map();

function wasmDir(): string {
	const thisDir = dirname(fileURLToPath(import.meta.url));
	return resolve(thisDir, "..", "node_modules", "tree-sitter-wasms", "out");
}

export async function initParser(): Promise<void> {
	if (initialized) return;
	await Parser.init();
	initialized = true;
}

export async function getLanguage(
	lang: "typescript" | "javascript",
): Promise<Parser.Language> {
	const cached = languages.get(lang);
	if (cached) return cached;

	await initParser();
	const wasmPath = resolve(wasmDir(), `tree-sitter-${lang}.wasm`);
	const language = await Parser.Language.load(wasmPath);
	languages.set(lang, language);
	return language;
}

export function createParser(language: Parser.Language): Parser {
	const parser = new Parser();
	parser.setLanguage(language);
	return parser;
}

export function langFromPath(
	filePath: string,
): "typescript" | "javascript" | null {
	if (filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
		return "typescript";
	if (filePath.endsWith(".js") || filePath.endsWith(".jsx"))
		return "javascript";
	return null;
}
