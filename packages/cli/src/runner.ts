import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { analyze } from "@strata/analysis";
import type { StrataView } from "@strata/analysis";
import {
	computeCognitiveComplexity,
	createParser,
	extractFunctions,
	getLanguage,
	initParser,
	langFromPath,
	parseGitLog,
} from "@strata/extraction";
import type { CognitiveComplexity, FileExtraction } from "@strata/extraction";
import type Parser from "web-tree-sitter";

export async function runAnalysis(
	repoPath: string,
	months = 12,
): Promise<StrataView> {
	const absPath = resolve(repoPath);

	await initParser();
	const tsLang = await getLanguage("typescript");
	const jsLang = await getLanguage("javascript");
	const tsParser = createParser(tsLang);
	const jsParser = createParser(jsLang);

	const files = await collectSourceFiles(absPath);

	const extractions: FileExtraction[] = [];
	const complexities = new Map<string, CognitiveComplexity>();

	for (const filePath of files) {
		const lang = langFromPath(filePath);
		if (!lang) continue;

		const content = await readFile(filePath, "utf-8");
		const parser = lang === "typescript" ? tsParser : jsParser;
		const tree = parser.parse(content);
		const relPath = relative(absPath, filePath);
		const extraction = extractFunctions(tree, relPath);

		extractions.push(extraction);

		for (const fn of extraction.functions) {
			const fnNode = findFunctionNode(tree.rootNode, fn.startLine - 1);
			if (!fnNode) continue;
			complexities.set(fn.id, computeCognitiveComplexity(fnNode, fn.id));
		}
	}

	const { churn, coChanges } = await parseGitLog(absPath, months);

	return analyze({
		extractions,
		complexities,
		churn,
		coChanges,
		repoPath: absPath,
	});
}

async function collectSourceFiles(dir: string): Promise<string[]> {
	const results: string[] = [];
	const skipDirs = new Set([
		"node_modules",
		".git",
		"dist",
		"build",
		"coverage",
		".next",
		".turbo",
	]);

	async function walk(d: string): Promise<void> {
		const entries = await readdir(d);

		for (const entry of entries) {
			if (skipDirs.has(entry)) continue;

			const fullPath = join(d, entry);
			const s = await stat(fullPath);

			if (s.isDirectory()) {
				await walk(fullPath);
				continue;
			}

			const lang = langFromPath(entry);
			if (!lang) continue;
			if (entry.endsWith(".d.ts")) continue;

			results.push(fullPath);
		}
	}

	await walk(dir);
	return results;
}

const FUNCTION_TYPES = new Set([
	"function_declaration",
	"method_definition",
	"arrow_function",
	"function_expression",
	"function",
]);

function findFunctionNode(
	node: Parser.SyntaxNode,
	line: number,
): Parser.SyntaxNode | null {
	if (FUNCTION_TYPES.has(node.type) && node.startPosition.row === line) {
		return node;
	}
	for (const child of node.namedChildren) {
		const found = findFunctionNode(child, line);
		if (found) return found;
	}
	return null;
}
