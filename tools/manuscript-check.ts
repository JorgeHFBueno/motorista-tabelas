// Verificador local do The Manuscript: bloco de dados (00_METADADOS.md) e links internos.
// Uso: npm run manuscript:check [-- <pasta do ledur-the-manuscript>]
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { MANUSCRIPT_NAO_CORPUS, buildManuscriptSystemGraph, extractMarkdownLinks, manuscriptTitle, resolveManuscriptLink } from '../functions/manuscriptMetadata';

const root = resolve(process.argv[2] ?? '../../Docs/ledur-the-manuscript');

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.toLowerCase().endsWith('.md') ? [full] : [];
  });
}

const files = markdownFiles(root).map((full) => relative(root, full).replaceAll('\\', '/')).filter((path) => !MANUSCRIPT_NAO_CORPUS.includes(path)).sort();
const known = new Set(files);
const brokenLinks: string[] = [];
const documents = files.map((path) => {
  const content = readFileSync(join(root, path), 'utf8');
  const links: string[] = [];
  for (const link of extractMarkdownLinks(content)) {
    const target = resolveManuscriptLink(path, link.href);
    if (!target) continue;
    if (known.has(target.path)) links.push(target.path); else brokenLinks.push(`${path} -> ${link.href}`);
  }
  return { path, title: manuscriptTitle(content, path.split('/').at(-1) ?? path), content, links };
});

const graph = buildManuscriptSystemGraph(documents);
const entities = graph.nodes.filter((node) => node.kind === 'ENTIDADE').length;
console.log(`The Manuscript: ${files.length} documentos, ${entities} entidades, ${graph.edges.length} relações (${root})`);
for (const { path, problem } of graph.problems) console.log(`  ${path}: ${problem}`);
for (const link of brokenLinks) console.log(`  link quebrado: ${link}`);
const total = graph.problems.length + brokenLinks.length;
console.log(total ? `${total} problema(s).` : 'Nenhum problema.');
process.exitCode = total ? 1 : 0;
