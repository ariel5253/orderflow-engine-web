#!/usr/bin/env node
// RF-9: no template holds literal text. User text comes from the dictionaries (`'key' | translate`) or from data
// (`{{ line.description }}`), never from the markup. Run from the repository root: node scripts/no-literal-text.mjs
//
// Each template is read with Angular's own template parser, so every way markup can carry text is seen:
// - the template is a file (templateUrl), so this script sees it
// - no text node holds anything but whitespace
// - no text attribute (title, alt, placeholder, aria-label, ..., or an input named *Label, *Text, *Title) holds a
//   static value; alt="" is allowed
// - in every interpolation and every property or attribute binding, a quoted string is allowed only as the key of
//   the translate pipe or as an argument of another pipe (`money: quote.currency : 'negative'`). Anywhere else it
//   would reach the screen as written: `{{ 'Text' }}`, `[title]="'Text'"`, a ternary branch, a translate parameter
// - the template is listed in src/app/i18n-keys.spec.ts, so the key checks see it too
import {
  AST,
  BindingPipe,
  BindingType,
  Interpolation,
  LiteralPrimitive,
  TemplateLiteralElement,
  TmplAstRecursiveVisitor,
  parseTemplate,
  tmplAstVisitAll,
} from '@angular/compiler';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'src', 'app');
const keysSpec = join(appDir, 'i18n-keys.spec.ts');
const TEXT_ATTRIBUTES = new Set([
  'title',
  'alt',
  'placeholder',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'label',
]);
const TEXT_INPUT = /(Label|Text|Title|Placeholder|Message)$/;
const CHECKED_BINDINGS = new Set([BindingType.Property, BindingType.Attribute, BindingType.TwoWay]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const toPosix = (path) => relative(appDir, path).split('\\').join('/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const isTextAttribute = (name) => TEXT_ATTRIBUTES.has(name.toLowerCase()) || TEXT_INPUT.test(name);

/** Every quoted string and template-literal text in an expression that is not a translate key or a pipe argument. */
function literalStrings(node, allowed = false, found = []) {
  if (node instanceof LiteralPrimitive) {
    if (typeof node.value === 'string' && !allowed) found.push({ text: node.value, offset: node.sourceSpan.start });
    return found;
  }
  if (node instanceof TemplateLiteralElement) {
    if (node.text.trim()) found.push({ text: node.text, offset: node.sourceSpan.start });
    return found;
  }
  if (node instanceof BindingPipe) {
    const isTranslate = node.name === 'translate';
    literalStrings(node.exp, isTranslate, found);
    for (const argument of node.args) literalStrings(argument, !isTranslate, found);
    return found;
  }
  for (const value of Object.values(node)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (child instanceof AST || child instanceof TemplateLiteralElement) literalStrings(child, false, found);
    }
  }
  return found;
}

class LiteralTextVisitor extends TmplAstRecursiveVisitor {
  constructor(source, path, errors) {
    super();
    this.source = source;
    this.path = path;
    this.errors = errors;
  }

  report(offset, message) {
    this.errors.push(`${this.path}:${lineOf(this.source, offset)}: ${message}`);
  }

  visitText(text) {
    const value = text.value.trim();
    if (value) this.report(text.sourceSpan.start.offset, `literal text "${value}"`);
  }

  visitBoundText(text) {
    const interpolation = text.value.ast;
    if (interpolation instanceof Interpolation) {
      for (const part of interpolation.strings) {
        if (part.trim()) this.report(text.sourceSpan.start.offset, `literal text "${part.trim()}"`);
      }
    }
    this.reportStrings(interpolation);
  }

  visitTextAttribute(attribute) {
    if (attribute.value && isTextAttribute(attribute.name)) {
      this.report(attribute.sourceSpan.start.offset, `literal ${attribute.name}="${attribute.value}"`);
    }
  }

  visitBoundAttribute(attribute) {
    if (CHECKED_BINDINGS.has(attribute.type)) this.reportStrings(attribute.value.ast);
  }

  visitLetDeclaration(declaration) {
    this.reportStrings(declaration.value.ast);
  }

  visitIcu(icu) {
    this.report(icu.sourceSpan.start.offset, 'ICU message; use the dictionaries');
  }

  reportStrings(expression) {
    for (const { text, offset } of literalStrings(expression)) {
      this.report(offset, `literal string '${text}' outside a translate key or a pipe argument`);
    }
  }
}

const errors = [];
const files = walk(appDir);
const templates = files.filter((file) => file.endsWith('.html'));
const components = files.filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));

for (const file of components) {
  const source = readFileSync(file, 'utf8');
  const inline = source.search(/\btemplate\s*:/);
  if (inline >= 0) errors.push(`${toPosix(file)}:${lineOf(source, inline)}: inline template; use templateUrl`);
}

const keysSpecSource = readFileSync(keysSpec, 'utf8');
for (const file of templates) {
  const path = toPosix(file);
  const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const parsed = parseTemplate(source, path, { preserveWhitespaces: false });
  for (const error of parsed.errors ?? []) errors.push(`${path}: cannot parse: ${error.msg}`);
  tmplAstVisitAll(new LiteralTextVisitor(source, path, errors), parsed.nodes);

  if (!keysSpecSource.includes(`'${path}'`)) {
    errors.push(`${path}: not listed in src/app/i18n-keys.spec.ts`);
  }
}

if (errors.length) {
  console.error(`no-literal-text: FAIL (${errors.length} problem${errors.length === 1 ? '' : 's'})`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`no-literal-text: OK (${templates.length} templates, ${components.length} source files)`);
