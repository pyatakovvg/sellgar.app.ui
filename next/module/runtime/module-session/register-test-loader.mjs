import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) {
        for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
          const url = new URL(specifier + suffix, context.parentURL);
          if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
        }
      }
      if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url?.startsWith('file:')) {
        const url = new URL(error.url + '.js');
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (/\.module\.(css|scss)$/.test(url)) {
      return { format: 'module', source: 'export default {};', shortCircuit: true };
    }
    if (!/\.[cm]?tsx?$/.test(url) || url.includes('/node_modules/')) return nextLoad(url, context);
    const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      fileName: fileURLToPath(url),
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    }).outputText;
    return { format: 'module', source, shortCircuit: true };
  },
});
