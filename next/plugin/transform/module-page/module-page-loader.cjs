const ts = require('typescript');
const { entryId, entryDeclarations } = require('./entry-declarations.cjs');

module.exports = function entryLoader(source) {
  this.addDependency?.(__filename);
  this.addDependency?.(require.resolve('./entry-declarations.cjs'));
  const file = ts.createSourceFile(this.resourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const entries = entryDeclarations(file);
  if (!entries.length) return source;
  const factory = ts.factory;
  const hasMetadata = file.statements.some(
    (statement) =>
      (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
        ((ts.isFunctionDeclaration(statement) && statement.name?.text === 'generateMetadata') ||
          (ts.isVariableStatement(statement) &&
            statement.declarationList.declarations.some(
              (declaration) =>
                ts.isIdentifier(declaration.name) && ['metadata', 'generateMetadata'].includes(declaration.name.text),
            )))) ||
      (ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some((entry) => ['metadata', 'generateMetadata'].includes(entry.name.text))),
  );
  const generated = [];
  const metadataEntry = entries.find((entry) => entry.kind === 'module');
  const pageName = factory.createUniqueName('__sellgarMetadataPage');
  const result = ts.transform(file, [
    (context) => {
      const visit = (node) =>
        entries.some((entry) => entry.node === node)
          ? (() => {
              const call = factory.updateCallExpression(node, node.expression, node.typeArguments, [
                node.arguments[0],
                factory.createStringLiteral(entryId(this.resourcePath)),
                ...(metadataEntry?.node === node && hasMetadata ? [factory.createFalse()] : []),
              ]);
              if (node !== metadataEntry?.node || hasMetadata) return call;
              generated.push(
                factory.createVariableStatement(
                  undefined,
                  factory.createVariableDeclarationList(
                    [factory.createVariableDeclaration(pageName, undefined, undefined, call)],
                    ts.NodeFlags.Const,
                  ),
                ),
              );
              return pageName;
            })()
          : ts.visitEachChild(node, visit, context);
      return (node) => ts.visitNode(node, visit);
    },
  ]);
  try {
    const transformed = result.transformed[0];
    if (!generated.length) return ts.createPrinter().printFile(transformed);
    const statements = [...transformed.statements];
    const insertion = statements.findIndex(
      (statement) =>
        !ts.isImportDeclaration(statement) &&
        !(ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)),
    );
    statements.splice(insertion < 0 ? statements.length : insertion, 0, ...generated);
    statements.push(
      factory.createVariableStatement(
        [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              'generateMetadata',
              undefined,
              undefined,
              factory.createPropertyAccessExpression(pageName, 'generateMetadata'),
            ),
          ],
          ts.NodeFlags.Const,
        ),
      ),
    );
    return ts.createPrinter().printFile(factory.updateSourceFile(transformed, statements));
  } finally {
    result.dispose();
  }
};

module.exports.moduleId = entryId;
