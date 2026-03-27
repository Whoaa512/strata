import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScriptLang from "tree-sitter-typescript";

const tsParser = new Parser();
tsParser.setLanguage(TypeScriptLang.typescript);

const tsxParser = new Parser();
tsxParser.setLanguage(TypeScriptLang.tsx);

const jsParser = new Parser();
jsParser.setLanguage(JavaScript);

export interface FunctionInfo {
	id: string;
	name: string;
	filePath: string;
	startLine: number;
	endLine: number;
	parameterCount: number;
	cognitiveComplexity: number;
	cyclomaticComplexity: number;
	nestingDepthMax: number;
	lineCount: number;
	calls: string[];
}

export function getParser(filePath: string): Parser | null {
	if (filePath.endsWith(".tsx")) return tsxParser;
	if (filePath.endsWith(".ts")) return tsParser;
	if (filePath.endsWith(".jsx") || filePath.endsWith(".js")) return jsParser;
	return null;
}

export function extractFunctions(filePath: string, source: string): FunctionInfo[] {
	const parser = getParser(filePath);
	if (!parser) return [];

	const tree = parser.parse(source);
	const functions: FunctionInfo[] = [];

	visitNode(tree.rootNode, filePath, functions, null);
	return functions;
}

type SyntaxNode = Parser.SyntaxNode;

function visitNode(
	node: SyntaxNode,
	filePath: string,
	results: FunctionInfo[],
	parentClass: string | null,
): void {
	if (isFunctionNode(node)) {
		const info = analyzeFunctionNode(node, filePath, parentClass);
		if (info) results.push(info);
	}

	if (node.type === "class_declaration" || node.type === "class") {
		const nameNode = node.childForFieldName("name");
		const className = nameNode?.text ?? "<anonymous-class>";
		for (const child of node.children) {
			visitNode(child, filePath, results, className);
		}
		return;
	}

	for (const child of node.children) {
		visitNode(child, filePath, results, parentClass);
	}
}

function isFunctionNode(node: SyntaxNode): boolean {
	return [
		"function_declaration",
		"function",
		"arrow_function",
		"method_definition",
		"function_expression",
	].includes(node.type);
}

function getFunctionName(node: SyntaxNode, parentClass: string | null): string {
	const nameNode = node.childForFieldName("name");
	if (nameNode) {
		const base = nameNode.text;
		return parentClass ? `${parentClass}.${base}` : base;
	}

	const parent = node.parent;
	if (parent?.type === "variable_declarator") {
		const varName = parent.childForFieldName("name");
		if (varName) return parentClass ? `${parentClass}.${varName.text}` : varName.text;
	}

	if (parent?.type === "pair") {
		const key = parent.childForFieldName("key");
		if (key) return parentClass ? `${parentClass}.${key.text}` : key.text;
	}

	return "<anonymous>";
}

function analyzeFunctionNode(
	node: SyntaxNode,
	filePath: string,
	parentClass: string | null,
): FunctionInfo | null {
	const name = getFunctionName(node, parentClass);
	const params = node.childForFieldName("parameters");
	const parameterCount = params ? countParameters(params) : 0;
	const body = node.childForFieldName("body");
	if (!body) return null;

	const cognitiveComplexity = computeCognitiveComplexity(body);
	const cyclomaticComplexity = computeCyclomaticComplexity(body);
	const nestingDepthMax = computeMaxNesting(body);
	const calls = extractCalls(body);

	return {
		id: `${filePath}::${name}::${node.startPosition.row + 1}`,
		name,
		filePath,
		startLine: node.startPosition.row + 1,
		endLine: node.endPosition.row + 1,
		parameterCount,
		cognitiveComplexity,
		cyclomaticComplexity,
		nestingDepthMax,
		lineCount: node.endPosition.row - node.startPosition.row + 1,
		calls,
	};
}

function countParameters(params: SyntaxNode): number {
	return params.children.filter(
		(c) =>
			c.type === "required_parameter" ||
			c.type === "optional_parameter" ||
			c.type === "identifier" ||
			c.type === "assignment_pattern" ||
			c.type === "rest_pattern",
	).length;
}

const COMPLEXITY_INCREMENTS = new Set([
	"if_statement",
	"else_clause",
	"for_statement",
	"for_in_statement",
	"while_statement",
	"do_statement",
	"switch_case",
	"catch_clause",
	"ternary_expression",
]);

const NESTING_INCREMENTS = new Set([
	"if_statement",
	"for_statement",
	"for_in_statement",
	"while_statement",
	"do_statement",
	"switch_statement",
	"catch_clause",
	"ternary_expression",
]);

const BOOLEAN_OPS = new Set(["&&", "||", "??"]);

export function computeCognitiveComplexity(node: SyntaxNode, depth = 0): number {
	let complexity = 0;

	for (const child of node.children) {
		if (COMPLEXITY_INCREMENTS.has(child.type)) {
			if (child.type === "else_clause") {
				complexity += 1;
			} else {
				complexity += 1 + depth;
			}
		}

		if (child.type === "binary_expression") {
			const op = child.childForFieldName("operator");
			if (op && BOOLEAN_OPS.has(op.text)) {
				complexity += 1;
			}
		}

		const nestMore = NESTING_INCREMENTS.has(child.type);
		complexity += computeCognitiveComplexity(child, nestMore ? depth + 1 : depth);
	}

	return complexity;
}

export function computeCyclomaticComplexity(node: SyntaxNode): number {
	let complexity = 1;

	function walk(n: SyntaxNode) {
		const decisions = [
			"if_statement",
			"for_statement",
			"for_in_statement",
			"while_statement",
			"do_statement",
			"switch_case",
			"catch_clause",
			"ternary_expression",
		];
		if (decisions.includes(n.type)) complexity++;

		if (n.type === "binary_expression") {
			const op = n.childForFieldName("operator");
			if (op && (op.text === "&&" || op.text === "||")) complexity++;
		}

		for (const child of n.children) walk(child);
	}

	walk(node);
	return complexity;
}

function computeMaxNesting(node: SyntaxNode, depth = 0): number {
	let max = depth;
	for (const child of node.children) {
		const nestMore = NESTING_INCREMENTS.has(child.type);
		const childMax = computeMaxNesting(child, nestMore ? depth + 1 : depth);
		if (childMax > max) max = childMax;
	}
	return max;
}

function extractCalls(node: SyntaxNode): string[] {
	const calls: string[] = [];

	function walk(n: SyntaxNode) {
		if (n.type === "call_expression") {
			const fn = n.childForFieldName("function");
			if (fn) calls.push(fn.text);
		}
		for (const child of n.children) walk(child);
	}

	walk(node);
	return [...new Set(calls)];
}
