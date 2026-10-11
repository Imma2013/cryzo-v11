import ts from "typescript";
import type { FileMap } from "@/lib/workspace/types";

const TS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

type LocalModule = { filePath: string; source: ts.SourceFile };
function findModule(files: FileMap, source: string, importPath: string): string | null {
  if (!importPath.startsWith(".")) return null;
  const parts = [...source.split("/").slice(0, -1), ...importPath.split("/")];
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!stack.length) return null; stack.pop(); }
    else stack.push(part);
  }
  const base = stack.join("/");
  for (const ext of ["", ...TS_EXTENSIONS]) {
    const candidate = base + ext;
    if (files[candidate]?.type === "file" && /\.[jt]sx?$/.test(candidate)) return candidate;
  }
  return null;
}

function explicitExports(source: ts.SourceFile): Set<string> {
  const exported = new Set<string>();
  for (const node of source.statements) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const hasExport = !!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isExportDeclaration(node) && node.exportClause) {
      if (ts.isNamedExports(node.exportClause)) {
        for (const spec of node.exportClause.elements) exported.add(spec.name.text);
      } else if (ts.isNamespaceExport(node.exportClause)) exported.add(node.exportClause.name.text);
    }
    if (!hasExport) continue;
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node) ||
      ts.isEnumDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name) exported.add(node.name.text);
    else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) exported.add(decl.name.text);
        else {
          const collect = (name: ts.BindingName) => {
            if (ts.isIdentifier(name)) exported.add(name.text);
            else for (const part of name.elements) if (ts.isBindingElement(part)) collect(part.name);
          };
          collect(decl.name);
        }
      }
    }
  }
  return exported;
}

/** Validate local named imports against actual TS exports before npm/build.
 * Re-exports and wildcard barrels are traversed with cycle protection.
 * Unknown module syntax is left to full TypeScript compilation.
 */
export function localExportContractIssues(files: FileMap): string[] {
  const parsed = new Map<string, LocalModule>();
  for (const [filePath, entry] of Object.entries(files)) {
    if (entry.type !== "file" || !/\.[jt]sx?$/.test(filePath)) continue;
    parsed.set(filePath, { filePath, source: ts.createSourceFile(filePath, entry.content || "", ts.ScriptTarget.Latest, true,
      /\.tsx$/.test(filePath) ? ts.ScriptKind.TSX : /\.jsx$/.test(filePath) ? ts.ScriptKind.JSX : ts.ScriptKind.TS) });
  }
  const exportsName = (filePath: string, name: string, seen: Set<string>): boolean => {
    const entry = parsed.get(filePath);
    if (!entry || seen.has(filePath)) return false;
    seen.add(filePath);
    if (explicitExports(entry.source).has(name)) return true;
    for (const statement of entry.source.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const resolved = findModule(files, filePath, statement.moduleSpecifier.text);
      if (!resolved) continue;
      if (!statement.exportClause) {
        if (exportsName(resolved, name, seen)) return true;
      } else if (ts.isNamedExports(statement.exportClause)) {
        const matching = statement.exportClause.elements.find((e) => e.name.text === name);
        if (matching && exportsName(resolved, matching.propertyName?.text || matching.name.text, seen)) return true;
      }
    }
    return false;
  };
  const issues: string[] = [];
  for (const [filePath, entry] of parsed) {
    for (const statement of entry.source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      const resolved = findModule(files, filePath, statement.moduleSpecifier.text);
      if (!resolved || !parsed.has(resolved)) continue;
      for (const binding of bindings.elements) {
        const exportedName = binding.propertyName?.text || binding.name.text;
        if (!exportsName(resolved, exportedName, new Set())) {
          issues.push(`${filePath}: ${statement.moduleSpecifier.text} does not export "${exportedName}" (imported as "${binding.name.text}"). Generate the missing type/export in ${resolved} or correct the component; do not invent unrelated domain models.`);
        }
      }
    }
  }
  return issues.slice(0, 30);
}
