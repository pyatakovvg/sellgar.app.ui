const ts = require('typescript');
const { createHash } = require('node:crypto');

const entryId = (file) => createHash('sha256').update(file).digest('hex').slice(0, 16);

function entryDeclarations(file) {
  const imports = new Map();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== '@sellgar/app/next') continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const entry of bindings.elements) {
        const name = (entry.propertyName ?? entry.name).text;
        if (name === 'withModule' || name === 'withLayout')
          imports.set(entry.name.text, name === 'withModule' ? 'module' : 'layout');
      }
  }
  const entries = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && imports.has(node.expression.text)) {
      const loader = node.arguments[0];
      let body = loader && (ts.isArrowFunction(loader) || ts.isFunctionExpression(loader)) ? loader.body : undefined;
      if (body && ts.isBlock(body)) body = body.statements.find(ts.isReturnStatement)?.expression;
      if (
        !body ||
        !ts.isCallExpression(body) ||
        body.expression.kind !== ts.SyntaxKind.ImportKeyword ||
        !ts.isStringLiteral(body.arguments[0]) ||
        node.arguments.length !== 1
      ) {
        throw new Error('Передайте один статический загрузчик Next: () => import("@package/name").');
      }
      entries.push({ node, kind: imports.get(node.expression.text), specifier: body.arguments[0].text });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (entries.length > 1) throw new Error('В файле страницы или layout Next допускается одна декларация фреймворка.');
  if (
    entries.length &&
    file.statements.some(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isStringLiteral(statement.expression) &&
        statement.expression.text === 'use client',
    )
  ) {
    throw new Error('Декларации фреймворка нужно размещать в серверном компоненте страницы или layout Next.');
  }
  return entries;
}

module.exports = { entryId, entryDeclarations };
