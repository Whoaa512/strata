import type Parser from "web-tree-sitter";
import type { CognitiveComplexity } from "./types.js";

const INCREMENTING_NODES = new Set([
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

const NESTING_NODES = new Set([
	"if_statement",
	"for_statement",
	"for_in_statement",
	"while_statement",
	"do_statement",
	"switch_statement",
	"catch_clause",
	"arrow_function",
	"function_expression",
	"function_declaration",
]);

const BOOLEAN_OPERATORS = new Set(["&&", "||", "??"]);

function isBooleanSequence(node: Parser.SyntaxNode): boolean {
	if (node.type !== "binary_expression") return false;
	const op = node.childForFieldName("operator")?.text;
	return op !== undefined && BOOLEAN_OPERATORS.has(op);
}

function countBooleanSwitches(node: Parser.SyntaxNode): number {
	if (node.type !== "binary_expression") return 0;

	const ops: string[] = [];
	flattenBooleanChain(node, ops);

	let switches = 0;
	for (let i = 0; i < ops.length; i++) {
		if (i === 0 || ops[i] !== ops[i - 1]) {
			switches++;
		}
	}
	return switches;
}

function flattenBooleanChain(node: Parser.SyntaxNode, ops: string[]): void {
	if (node.type !== "binary_expression") return;

	const op = node.childForFieldName("operator")?.text;
	if (!op || !BOOLEAN_OPERATORS.has(op)) return;

	const left = node.childForFieldName("left");
	const right = node.childForFieldName("right");

	if (left) flattenBooleanChain(left, ops);
	ops.push(op);
	if (right) flattenBooleanChain(right, ops);
}

export function computeCognitiveComplexity(
	functionNode: Parser.SyntaxNode,
	functionId: string,
): CognitiveComplexity {
	let score = 0;
	let nestingContributions = 0;
	let structuralContributions = 0;

	function walk(node: Parser.SyntaxNode, nesting: number): void {
		if (isBooleanSequence(node)) {
			const switches = countBooleanSwitches(node);
			score += switches;
			structuralContributions += switches;
			return;
		}

		if (node.type === "else_clause") {
			score += 1;
			structuralContributions += 1;

			const firstChild = node.namedChildren[0];
			if (firstChild?.type === "if_statement") {
				walk(firstChild, nesting);
				return;
			}
		}

		if (
			INCREMENTING_NODES.has(node.type) &&
			node.type !== "binary_expression" &&
			node.type !== "else_clause"
		) {
			score += 1 + nesting;
			structuralContributions += 1;
			nestingContributions += nesting;
		}

		const nextNesting =
			NESTING_NODES.has(node.type) && node !== functionNode
				? nesting + 1
				: nesting;

		for (const child of node.namedChildren) {
			if (child.type === "else_clause") {
				walk(child, nesting);
			} else {
				walk(child, nextNesting);
			}
		}
	}

	walk(functionNode, 0);

	return { functionId, score, nestingContributions, structuralContributions };
}
