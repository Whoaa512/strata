import type Parser from "web-tree-sitter";

type Node = Parser.SyntaxNode;

export interface FunctionInfo {
	name: string;
	startLine: number;
	endLine: number;
	parameterCount: number;
	cognitiveComplexity: number;
	nestingDepth: number;
	lineCount: number;
	callees: string[];
}

const INCREMENTING_NODE_TYPES = new Set([
	"if_statement",
	"else_clause",
	"for_statement",
	"for_in_statement",
	"while_statement",
	"do_statement",
	"switch_case",
	"catch_clause",
	"ternary_expression",
	"binary_expression",
]);

const NESTING_NODE_TYPES = new Set([
	"if_statement",
	"for_statement",
	"for_in_statement",
	"while_statement",
	"do_statement",
	"switch_statement",
	"catch_clause",
	"ternary_expression",
]);

const FUNCTION_NODE_TYPES = new Set([
	"function_declaration",
	"method_definition",
	"arrow_function",
	"function_expression",
	"function",
]);

const BOOLEAN_OPERATORS = new Set(["&&", "||", "??"]);

export function computeCognitiveComplexity(node: Node, nestingLevel = 0): number {
	let complexity = 0;

	if (node.type === "binary_expression") {
		complexity += countBooleanSequences(node);
		return complexity;
	}

	if (INCREMENTING_NODE_TYPES.has(node.type)) {
		if (node.type === "else_clause") {
			complexity += 1;
		} else if (node.type === "binary_expression") {
			// handled above
		} else {
			complexity += 1 + nestingLevel;
		}
	}

	const nextNesting = NESTING_NODE_TYPES.has(node.type) ? nestingLevel + 1 : nestingLevel;

	for (const child of node.children) {
		complexity += computeCognitiveComplexity(child, nextNesting);
	}

	return complexity;
}

function countBooleanSequences(node: Node): number {
	const operators = flattenBooleanOperators(node);
	if (operators.length === 0) return 0;

	let count = 1;
	for (let i = 1; i < operators.length; i++) {
		if (operators[i] !== operators[i - 1]) {
			count++;
		}
	}
	return count;
}

function flattenBooleanOperators(node: Node): string[] {
	if (node.type !== "binary_expression") return [];

	const operatorNode = node.childForFieldName("operator");
	if (!operatorNode || !BOOLEAN_OPERATORS.has(operatorNode.text)) return [];

	const left = node.childForFieldName("left");
	const right = node.childForFieldName("right");
	const ops: string[] = [];

	if (left) ops.push(...flattenBooleanOperators(left));
	ops.push(operatorNode.text);
	if (right) ops.push(...flattenBooleanOperators(right));

	return ops;
}

export function computeMaxNesting(node: Node, currentDepth = 0): number {
	let maxDepth = currentDepth;

	const nextDepth = NESTING_NODE_TYPES.has(node.type) ? currentDepth + 1 : currentDepth;
	if (nextDepth > maxDepth) maxDepth = nextDepth;

	for (const child of node.children) {
		const childMax = computeMaxNesting(child, nextDepth);
		if (childMax > maxDepth) maxDepth = childMax;
	}

	return maxDepth;
}

export function extractFunctions(rootNode: Node, filePath: string): FunctionInfo[] {
	const functions: FunctionInfo[] = [];
	walkForFunctions(rootNode, functions, filePath);
	return functions;
}

function walkForFunctions(node: Node, results: FunctionInfo[], filePath: string): void {
	if (FUNCTION_NODE_TYPES.has(node.type)) {
		const name = resolveFunctionName(node, filePath);
		const params = extractParameters(node);
		const body = node.childForFieldName("body");
		const bodyNode = body ?? node;

		results.push({
			name,
			startLine: node.startPosition.row + 1,
			endLine: node.endPosition.row + 1,
			parameterCount: params,
			cognitiveComplexity: computeCognitiveComplexity(bodyNode),
			nestingDepth: computeMaxNesting(bodyNode),
			lineCount: node.endPosition.row - node.startPosition.row + 1,
			callees: extractCallees(bodyNode),
		});

		return;
	}

	for (const child of node.children) {
		walkForFunctions(child, results, filePath);
	}
}

function resolveFunctionName(node: Node, filePath: string): string {
	const nameNode = node.childForFieldName("name");
	if (nameNode) return nameNode.text;

	const parent = node.parent;
	if (!parent) return `<anonymous@${filePath}:${node.startPosition.row + 1}>`;

	if (parent.type === "variable_declarator") {
		const varName = parent.childForFieldName("name");
		if (varName) return varName.text;
	}

	if (parent.type === "pair") {
		const key = parent.childForFieldName("key");
		if (key) return key.text;
	}

	if (parent.type === "assignment_expression") {
		const left = parent.childForFieldName("left");
		if (left) return left.text;
	}

	return `<anonymous@${filePath}:${node.startPosition.row + 1}>`;
}

function extractParameters(node: Node): number {
	const params = node.childForFieldName("parameters");
	if (!params) return 0;
	return params.namedChildren.filter(
		(c) =>
			c.type === "identifier" ||
			c.type === "required_parameter" ||
			c.type === "optional_parameter" ||
			c.type === "rest_pattern" ||
			c.type === "assignment_pattern",
	).length;
}

function extractCallees(node: Node): string[] {
	const callees = new Set<string>();
	walkForCalls(node, callees);
	return [...callees];
}

function walkForCalls(node: Node, callees: Set<string>): void {
	if (node.type === "call_expression") {
		const fn = node.childForFieldName("function");
		if (fn) {
			const name = resolveCalleeName(fn);
			if (name) callees.add(name);
		}
	}

	for (const child of node.children) {
		walkForCalls(child, callees);
	}
}

function resolveCalleeName(node: Node): string | null {
	if (node.type === "identifier") return node.text;
	if (node.type === "member_expression") {
		const prop = node.childForFieldName("property");
		if (prop) return prop.text;
	}
	return null;
}
