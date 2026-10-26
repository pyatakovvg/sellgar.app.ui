const ts = require('typescript');

module.exports = function rootLayoutLoader(source) {
  this.addDependency?.(__filename);
  let file = ts.createSourceFile(this.resourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const factory = ts.factory;
  let hasBodyBoundary = false;
  const document = ts.transform(file, [
    (context) => {
      const visit = (node) => {
        const next = ts.visitEachChild(node, visit, context);
        if (
          !ts.isJsxElement(next) ||
          !ts.isIdentifier(next.openingElement.tagName) ||
          next.openingElement.tagName.text !== 'body'
        )
          return next;
        hasBodyBoundary = true;
        const host = factory.createIdentifier('__SellgarApplicationHost');
        return factory.updateJsxElement(
          next,
          next.openingElement,
          [
            factory.createJsxElement(
              factory.createJsxOpeningElement(host, undefined, factory.createJsxAttributes([])),
              next.children,
              factory.createJsxClosingElement(host),
            ),
          ],
          next.closingElement,
        );
      };
      return (node) => ts.visitNode(node, visit);
    },
  ]);
  file = document.transformed[0];
  const wrap = (component) =>
    factory.createCallExpression(
      factory.createIdentifier('__sellgarWithRootLayout'),
      undefined,
      hasBodyBoundary ? [component, factory.createTrue()] : [component],
    );
  const directives = [];
  const statements = [];
  let found = false;

  for (const statement of file.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      if (statement.expression.text === 'use client') {
        throw new Error('@sellgar/app/next требует серверный корневой layout в текущем прототипе.');
      }
      directives.push(statement);
      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      found = true;
      const name = statement.name ?? factory.createIdentifier('__SellgarOriginalRootLayout');
      const modifiers = statement.modifiers.filter(
        (modifier) => modifier.kind !== ts.SyntaxKind.DefaultKeyword && modifier.kind !== ts.SyntaxKind.ExportKeyword,
      );
      statements.push(
        factory.updateFunctionDeclaration(
          statement,
          modifiers,
          statement.asteriskToken,
          name,
          statement.typeParameters,
          statement.parameters,
          statement.type,
          statement.body,
        ),
        factory.createExportAssignment(undefined, false, wrap(name)),
      );
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      found = true;
      statements.push(factory.updateExportAssignment(statement, statement.modifiers, wrap(statement.expression)));
    } else {
      statements.push(statement);
    }
  }

  if (!found) {
    throw new Error('@sellgar/app/next требует локальный default export в корневом layout текущего прототипа.');
  }

  const imported = factory.createImportDeclaration(
    undefined,
    factory.createImportClause(
      false,
      undefined,
      factory.createNamedImports([
        factory.createImportSpecifier(
          false,
          factory.createIdentifier('withRootLayout'),
          factory.createIdentifier('__sellgarWithRootLayout'),
        ),
        ...(hasBodyBoundary
          ? [
              factory.createImportSpecifier(
                false,
                factory.createIdentifier('ApplicationHost'),
                factory.createIdentifier('__SellgarApplicationHost'),
              ),
            ]
          : []),
      ]),
    ),
    factory.createStringLiteral('sellgar-next-root-layout'),
  );

  try {
    return ts.createPrinter().printFile(factory.updateSourceFile(file, [...directives, imported, ...statements]));
  } finally {
    document.dispose();
  }
};
