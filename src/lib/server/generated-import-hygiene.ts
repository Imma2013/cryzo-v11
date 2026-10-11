import ts from "typescript";

/**
 * This is intentionally conservative. These packages export side-effect-free
 * UI primitives; custom/local imports can initialize modules, so never drop
 * those just because a name looks unused. Syntax-tree traversal avoids regex
 * changes inside comments, strings, JSX text, or type references.
 */
const SAFE_IMPORTS = new Set(["lucide-react", "react", "react-icons", "@phosphor-icons/react"]);
function safeSpecifier(specifier: string) {
  return SAFE_IMPORTS.has(specifier) || specifier.startsWith("react-icons/");
}

export function removeUnusedGeneratedImports(filePath: string, content: string): string {
  if (!/\.[jt]sx?$/.test(filePath) || filePath.endsWith(".d.ts")) return content;
  const kind = /\.tsx$/.test(filePath) ? ts.ScriptKind.TSX :
    /\.jsx$/.test(filePath) ? ts.ScriptKind.JSX :
    /\.js$/.test(filePath) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const file = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, kind);

  const uses = new Set<string>();
  function collect(node: ts.Node) {
    if (ts.isIdentifier(node)) uses.add(node.text);
    ts.forEachChild(node, collect);
  }
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) collect(statement);
  }
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  const edits: Array<{ start: number; end: number; content: string }> = [];
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) ||
        !safeSpecifier(statement.moduleSpecifier.text)) continue;
    const clause = statement.importClause;
    if (!clause) continue; // Bare side-effect imports are always preserved.
    const defaultName = clause.name && uses.has(clause.name.text) ? clause.name : undefined;
    const originalBindings = clause.namedBindings;
    let bindings = originalBindings;
    if (originalBindings && ts.isNamedImports(originalBindings)) {
      const elements = originalBindings.elements.filter((element) => uses.has(element.name.text));
      bindings = elements.length ? ts.factory.updateNamedImports(originalBindings, elements) : undefined;
    } else if (originalBindings && ts.isNamespaceImport(originalBindings) && !uses.has(originalBindings.name.text)) {
      bindings = undefined;
    }
    if (defaultName === clause.name && bindings === originalBindings) continue;
    const replacement = !defaultName && !bindings ? "" : printer.printNode(
      ts.EmitHint.Unspecified,
      ts.factory.updateImportDeclaration(statement, statement.modifiers,
        ts.factory.updateImportClause(clause, clause.isTypeOnly, defaultName, bindings),
        statement.moduleSpecifier, statement.attributes),
      file,
    );
    edits.push({ start: statement.getStart(file), end: statement.getEnd(), content: replacement });
  }
  return edits.sort((a,b) => b.start - a.start).reduce(
    (text, edit) => text.slice(0, edit.start) + edit.content + text.slice(edit.end), content,
  );
}
