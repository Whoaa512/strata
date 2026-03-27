import path from "node:path";
import Parser from "web-tree-sitter";
import { type FunctionInfo, extractFunctions } from "../core/complexity.js";

let tsParser: Parser | null = null;
let jsParser: Parser | null = null;

async function getParser(ext: string): Promise<Parser> {
	await Parser.init();

	if (ext === ".ts" || ext === ".tsx") {
		if (!tsParser) {
			tsParser = new Parser();
			const wasmPath = path.join(
				import.meta.dir,
				"..",
				"..",
				"node_modules",
				"tree-sitter-wasms",
				"out",
				"tree-sitter-typescript.wasm",
			);
			const lang = await Parser.Language.load(wasmPath);
			tsParser.setLanguage(lang);
		}
		return tsParser;
	}

	if (!jsParser) {
		jsParser = new Parser();
		const wasmPath = path.join(
			import.meta.dir,
			"..",
			"..",
			"node_modules",
			"tree-sitter-wasms",
			"out",
			"tree-sitter-javascript.wasm",
		);
		const lang = await Parser.Language.load(wasmPath);
		jsParser.setLanguage(lang);
	}
	return jsParser;
}

const TS_JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);

export function isAnalyzableFile(filePath: string): boolean {
	return TS_JS_EXTENSIONS.has(path.extname(filePath));
}

export async function parseFile(filePath: string, content: string): Promise<FunctionInfo[]> {
	const ext = path.extname(filePath);
	if (!TS_JS_EXTENSIONS.has(ext)) return [];

	const parser = await getParser(ext);
	const tree = parser.parse(content);
	return extractFunctions(tree.rootNode, filePath);
}
