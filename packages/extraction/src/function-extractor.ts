import type Parser from "web-tree-sitter";
import type { CallEdge, FileExtraction, FunctionInfo } from "./types.js";

const FUNCTION_TYPES = new Set([
	"function_declaration",
	"method_definition",
	"arrow_function",
	"function_expression",
	"function",
]);

function makeFunctionId(filePath: string, name: string, line: number): string {
	return `${filePath}:${name}:${line}`;
}

function resolveFunctionName(node: Parser.SyntaxNode): string {
	const nameNode = node.childForFieldName("name");
	if (nameNode) return nameNode.text;

	const parent = node.parent;
	if (!parent) return "<anonymous>";

	if (
		parent.type === "variable_declarator" ||
		parent.type === "pair" ||
		parent.type === "assignment_expression"
	) {
		const lhs =
			parent.childForFieldName("name") ||
			parent.childForFieldName("key") ||
			parent.childForFieldName("left");
		if (lhs) return lhs.text;
	}

	if (parent.type === "export_statement") {
		return "<default_export>";
	}

	return "<anonymous>";
}

function isExported(node: Parser.SyntaxNode): boolean {
	let current = node.parent;
	while (current) {
		if (
			current.type === "export_statement" ||
			current.type === "export_default_declaration"
		)
			return true;
		if (
			current.type === "variable_declaration" ||
			current.type === "lexical_declaration"
		) {
			current = current.parent;
			continue;
		}
		break;
	}
	return false;
}

function findClassName(node: Parser.SyntaxNode): string | undefined {
	let current = node.parent;
	while (current) {
		if (current.type === "class_declaration" || current.type === "class") {
			return current.childForFieldName("name")?.text;
		}
		current = current.parent;
	}
	return undefined;
}

function extractCalls(
	functionNode: Parser.SyntaxNode,
	callerId: string,
): CallEdge[] {
	const calls: CallEdge[] = [];

	function walk(node: Parser.SyntaxNode): void {
		if (node.type === "call_expression") {
			const fn = node.childForFieldName("function");
			if (fn) {
				const callee = fn.type === "member_expression" ? fn.text : fn.text;
				calls.push({ caller: callerId, callee });
			}
		}
		for (const child of node.namedChildren) {
			walk(child);
		}
	}

	walk(functionNode);
	return calls;
}

function extractParams(node: Parser.SyntaxNode): string[] {
	const params = node.childForFieldName("parameters");
	if (!params) return [];
	return params.namedChildren
		.filter(
			(c) =>
				c.type === "required_parameter" ||
				c.type === "optional_parameter" ||
				c.type === "identifier" ||
				c.type === "rest_parameter" ||
				c.type === "assignment_pattern",
		)
		.map((c) => {
			const name = c.childForFieldName("pattern") || c;
			return name.text.split(":")[0].replace("...", "").trim();
		});
}

export function extractFunctions(
	tree: Parser.Tree,
	filePath: string,
): FileExtraction {
	const functions: FunctionInfo[] = [];
	const allCalls: CallEdge[] = [];

	function walk(node: Parser.SyntaxNode): void {
		if (FUNCTION_TYPES.has(node.type)) {
			const name = resolveFunctionName(node);
			const startLine = node.startPosition.row + 1;
			const id = makeFunctionId(filePath, name, startLine);

			functions.push({
				id,
				name,
				filePath,
				startLine,
				endLine: node.endPosition.row + 1,
				params: extractParams(node),
				isExported: isExported(node),
				isMethod: node.type === "method_definition",
				className: findClassName(node),
			});

			allCalls.push(...extractCalls(node, id));
		}

		for (const child of node.namedChildren) {
			walk(child);
		}
	}

	walk(tree.rootNode);

	return { filePath, functions, calls: allCalls };
}
