import * as ts from "typescript";
import type { FunctionInfo } from "./types.js";

export function extractFromRepo(
	repoPath: string,
	fileFilter?: (path: string) => boolean,
): FunctionInfo[] {
	const configPath = ts.findConfigFile(repoPath, ts.sys.fileExists);
	if (!configPath) {
		return extractWithoutConfig(repoPath, fileFilter);
	}

	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		repoPath,
	);

	let files = parsed.fileNames;
	if (fileFilter) {
		files = files.filter(fileFilter);
	}

	const program = ts.createProgram(files, {
		...parsed.options,
		noEmit: true,
	});
	const checker = program.getTypeChecker();

	const results: FunctionInfo[] = [];

	for (const sourceFile of program.getSourceFiles()) {
		if (sourceFile.isDeclarationFile) continue;
		if (!files.includes(sourceFile.fileName)) continue;

		const relativePath = sourceFile.fileName.startsWith(repoPath)
			? sourceFile.fileName.slice(repoPath.length + 1)
			: sourceFile.fileName;

		const isTest = isTestFile(relativePath);
		extractFunctions(sourceFile, checker, relativePath, isTest, results);
	}

	return results;
}

function extractWithoutConfig(
	repoPath: string,
	fileFilter?: (path: string) => boolean,
): FunctionInfo[] {
	const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
	let files = Array.from(glob.scanSync({ cwd: repoPath }))
		.filter((f) => !f.includes("node_modules"))
		.filter((f) => !f.endsWith(".d.ts"));

	if (fileFilter) {
		files = files.filter(fileFilter);
	}

	const absoluteFiles = files.map((f) => `${repoPath}/${f}`);

	const program = ts.createProgram(absoluteFiles, {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		allowJs: true,
		noEmit: true,
		skipLibCheck: true,
	});
	const checker = program.getTypeChecker();

	const results: FunctionInfo[] = [];

	for (const sourceFile of program.getSourceFiles()) {
		if (sourceFile.isDeclarationFile) continue;

		const relativePath = sourceFile.fileName.startsWith(repoPath)
			? sourceFile.fileName.slice(repoPath.length + 1)
			: sourceFile.fileName;

		if (relativePath.includes("node_modules")) continue;

		const isTest = isTestFile(relativePath);
		extractFunctions(sourceFile, checker, relativePath, isTest, results);
	}

	return results;
}

function extractFunctions(
	sourceFile: ts.SourceFile,
	checker: ts.TypeChecker,
	filePath: string,
	isTest: boolean,
	results: FunctionInfo[],
): void {
	function visit(node: ts.Node, parentName?: string) {
		if (ts.isFunctionDeclaration(node) && node.name) {
			const info = buildFunctionInfo(
				node,
				node.name.text,
				checker,
				sourceFile,
				filePath,
				isTest,
			);
			results.push(info);
		}

		if (ts.isMethodDeclaration(node) && node.name) {
			const name = parentName
				? `${parentName}.${node.name.getText(sourceFile)}`
				: node.name.getText(sourceFile);
			const info = buildFunctionInfo(
				node,
				name,
				checker,
				sourceFile,
				filePath,
				isTest,
			);
			results.push(info);
		}

		if (
			ts.isVariableDeclaration(node) &&
			node.name &&
			ts.isIdentifier(node.name) &&
			node.initializer &&
			(ts.isArrowFunction(node.initializer) ||
				ts.isFunctionExpression(node.initializer))
		) {
			const info = buildFunctionInfo(
				node.initializer,
				node.name.text,
				checker,
				sourceFile,
				filePath,
				isTest,
			);
			results.push(info);
		}

		if (ts.isClassDeclaration(node) && node.name) {
			for (const member of node.members) {
				visit(member, node.name.text);
			}
			return;
		}

		ts.forEachChild(node, (child) => visit(child, parentName));
	}

	visit(sourceFile);
}

function buildFunctionInfo(
	node: ts.Node,
	name: string,
	checker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
	filePath: string,
	isTest: boolean,
): FunctionInfo {
	const startLine =
		sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
		1;
	const endLine =
		sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;

	let paramCount = 0;
	if (
		ts.isFunctionDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isArrowFunction(node) ||
		ts.isFunctionExpression(node)
	) {
		paramCount = node.parameters.length;
	}

	const isExported = hasExportModifier(node);
	const complexity = computeCognitiveComplexity(node, sourceFile);
	const nestingDepth = computeMaxNesting(node, 0);
	const calls = extractCalls(node, checker, sourceFile);

	return {
		id: `${filePath}:${name}`,
		name,
		filePath,
		startLine,
		endLine,
		complexity,
		nestingDepth,
		parameterCount: paramCount,
		calls,
		isExported,
		isTestFile: isTest,
	};
}

export function computeCognitiveComplexity(
	node: ts.Node,
	sourceFile: ts.SourceFile,
): number {
	let total = 0;

	function walkElseChain(elseNode: ts.Statement | undefined, nesting: number) {
		if (!elseNode) return;
		if (ts.isIfStatement(elseNode)) {
			total += 1;
			walk(elseNode.expression, nesting);
			walk(elseNode.thenStatement, nesting + 1);
			walkElseChain(elseNode.elseStatement, nesting);
		} else {
			total += 1;
			walk(elseNode, nesting + 1);
		}
	}

	function walk(n: ts.Node, nesting: number) {
		let increment = 0;
		let nestingIncrement = false;

		switch (n.kind) {
			case ts.SyntaxKind.IfStatement: {
				const ifNode = n as ts.IfStatement;
				total += 1 + nesting;
				walk(ifNode.expression, nesting);
				walk(ifNode.thenStatement, nesting + 1);
				walkElseChain(ifNode.elseStatement, nesting);
				return;
			}
			case ts.SyntaxKind.ForStatement:
			case ts.SyntaxKind.ForInStatement:
			case ts.SyntaxKind.ForOfStatement:
			case ts.SyntaxKind.WhileStatement:
			case ts.SyntaxKind.DoStatement:
				increment = 1 + nesting;
				nestingIncrement = true;
				break;
			case ts.SyntaxKind.SwitchStatement:
				increment = 1 + nesting;
				nestingIncrement = true;
				break;
			case ts.SyntaxKind.CatchClause:
				increment = 1 + nesting;
				nestingIncrement = true;
				break;
			case ts.SyntaxKind.ConditionalExpression:
				increment = 1 + nesting;
				nestingIncrement = true;
				break;
			case ts.SyntaxKind.BarBarToken:
			case ts.SyntaxKind.AmpersandAmpersandToken:
			case ts.SyntaxKind.QuestionQuestionToken:
				increment = 1;
				break;
			case ts.SyntaxKind.BreakStatement:
			case ts.SyntaxKind.ContinueStatement: {
				const labeled = n as ts.BreakOrContinueStatement;
				if (labeled.label) {
					increment = 1;
				}
				break;
			}
			case ts.SyntaxKind.ArrowFunction:
			case ts.SyntaxKind.FunctionExpression:
				nestingIncrement = true;
				break;
		}

		total += increment;
		const nextNesting = nestingIncrement ? nesting + 1 : nesting;
		ts.forEachChild(n, (child) => walk(child, nextNesting));
	}

	if (
		ts.isFunctionDeclaration(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isArrowFunction(node) ||
		ts.isFunctionExpression(node)
	) {
		if (node.body) {
			ts.forEachChild(node.body, (child) => walk(child, 0));
		}
	} else {
		ts.forEachChild(node, (child) => walk(child, 0));
	}

	return total;
}

function computeMaxNesting(node: ts.Node, depth: number): number {
	let max = depth;

	function isNestingNode(n: ts.Node): boolean {
		return (
			ts.isIfStatement(n) ||
			ts.isForStatement(n) ||
			ts.isForInStatement(n) ||
			ts.isForOfStatement(n) ||
			ts.isWhileStatement(n) ||
			ts.isDoStatement(n) ||
			ts.isSwitchStatement(n) ||
			ts.isTryStatement(n)
		);
	}

	function walk(n: ts.Node, d: number) {
		if (isNestingNode(n)) {
			const newDepth = d + 1;
			if (newDepth > max) max = newDepth;
			ts.forEachChild(n, (child) => walk(child, newDepth));
		} else {
			ts.forEachChild(n, (child) => walk(child, d));
		}
	}

	ts.forEachChild(node, (child) => walk(child, depth));
	return max;
}

function extractCalls(
	node: ts.Node,
	checker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
): string[] {
	const calls = new Set<string>();

	function walk(n: ts.Node) {
		if (ts.isCallExpression(n)) {
			const resolved = resolveCallTarget(n, checker, sourceFile);
			if (resolved) calls.add(resolved);
		}
		ts.forEachChild(n, walk);
	}

	ts.forEachChild(node, walk);
	return Array.from(calls);
}

function resolveCallTarget(
	call: ts.CallExpression,
	checker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
): string | null {
	try {
		const symbol = checker.getSymbolAtLocation(call.expression);
		if (!symbol) {
			return getCallText(call.expression, sourceFile);
		}

		const resolved =
			symbol.flags & ts.SymbolFlags.Alias
				? checker.getAliasedSymbol(symbol)
				: symbol;

		const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
		if (!decl) {
			return resolved.name || getCallText(call.expression, sourceFile);
		}

		const declFile = decl.getSourceFile();
		if (declFile.isDeclarationFile) {
			return resolved.name;
		}

		const declPath = declFile.fileName;
		const name = resolved.name;
		const line =
			declFile.getLineAndCharacterOfPosition(decl.getStart(declFile)).line + 1;

		return `${declPath}:${name}:${line}`;
	} catch {
		return getCallText(call.expression, sourceFile);
	}
}

function getCallText(expr: ts.Expression, sourceFile: ts.SourceFile): string {
	if (ts.isIdentifier(expr)) return expr.text;
	if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
	return expr.getText(sourceFile).slice(0, 50);
}

function hasExportModifier(node: ts.Node): boolean {
	if (!ts.canHaveModifiers(node)) return false;
	const mods = ts.getModifiers(node);
	if (!mods) return false;
	return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function isTestFile(path: string): boolean {
	return (
		/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(path) ||
		path.includes("__tests__/") ||
		path.startsWith("test/") ||
		path.startsWith("tests/")
	);
}
