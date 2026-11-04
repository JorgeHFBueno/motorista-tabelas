import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { CURADORIA, FONTES, CATEGORIAS_EXTERNAS } from '../lib/portalNoticias/config.js';
import {
  decodificarEntidades, hashDedupe, imagemValida, normalizarTitulo, normalizarUrl, primeiraImagemDoHtml, removerHtml, similaridadeJaccard,
} from '../lib/portalNoticias/normalizar.js';
import { baixarFeed, itensDoFeed } from '../lib/portalNoticias/rss.js';
import { classificar, curarCategoria, dataDePublicacao, escolherComDiversidade, pontuarCategoria } from '../lib/portalNoticias/curadoria.js';
import { alemDoLimite, encontrarExistente, salvarCategoria } from '../lib/portalNoticias/salvar.js';
import { executarColeta } from '../lib/portalNoticias/coleta.js';

const AGORA = new Date('2026-11-04T12:00:00Z');
const RESUMO = 'A operação de transporte de cargas ganhou novos centros de distribuição e armazenagem, com frota renovada e frete mais barato.';

const itemLogistica = (extra = {}) => ({
  titulo: 'Logística: transporte de cargas e frete rodoviário crescem com nova frota',
  resumo: RESUMO,
  url: 'https://exemplo.com.br/logistica/cargas',
  imagemUrl: 'https://exemplo.com.br/media/foto.jpg',
  publicadoEmBruto: 'Tue, 03 Nov 2026 10:00:00 -0300',
  fonte: 'Transporte Moderno',
  dicas: ['transporte', 'frota', 'cargas', 'rodoviario', 'operacao', 'logistica'],
  urlFonte: 'https://transportemoderno.com.br/feed/',
  ...extra,
});

test('config keeps the 16 sources and the four external categories', () => {
  assert.deepEqual([...CATEGORIAS_EXTERNAS], ['economia', 'infraestrutura', 'logistica', 'inovacao']);
  assert.equal(CATEGORIAS_EXTERNAS.flatMap((c) => FONTES[c]).length, 16);
  assert.equal(CURADORIA.maxPorCategoria, 5);
  assert.equal(CURADORIA.maxItensPorFonte, 12);
});

test('text cleanup: entities, HTML, accents and spaces', () => {
  assert.equal(decodificarEntidades('A &amp; B &#8217;s &#x2013; &hellip; &nbsp;x &desconhecida;'), 'A & B ’s – …  x &desconhecida;');
  assert.equal(decodificarEntidades('&amp;lt;'), '&lt;', 'one pass, no double decoding');
  assert.equal(removerHtml('<p>Olá <b>mundo</b></p>\n  fim'), 'Olá mundo fim');
  assert.equal(normalizarTitulo('  Logística   Ágil '), 'logistica agil');
});

test('URL normalization drops query, fragment and trailing slash and resolves relative links', () => {
  assert.equal(normalizarUrl('https://a.com/noticia/?utm_source=x#topo'), 'https://a.com/noticia');
  assert.equal(normalizarUrl('/n/1/', 'https://a.com/feed/'), 'https://a.com/n/1');
  assert.equal(normalizarUrl('  não é url  '), 'não é url');
  assert.equal(normalizarUrl(''), '');
});

test('dedupe hash is sha256 of "{categoria}::{url}" or of the normalized title without URL', () => {
  const esperado = createHash('sha256').update('economia::https://a.com/n').digest('hex');
  assert.equal(hashDedupe('economia', 'https://a.com/n/?x=1', 'Qualquer'), esperado);
  assert.equal(hashDedupe('economia', null, 'Título Ágil'), createHash('sha256').update('economia::titulo agil').digest('hex'));
  assert.notEqual(hashDedupe('logistica', 'https://a.com/n', 'x'), esperado);
});

test('title similarity is Jaccard over words without accents', () => {
  assert.equal(similaridadeJaccard('Porto de Santos bate recorde', 'porto de santos bate recorde!'), 1);
  assert.ok(similaridadeJaccard('Porto de Santos bate recorde', 'Ferrovia nova no Paraná') < 0.2);
});

test('image validity: http(s), not SVG, known extension or /image, /media path', () => {
  assert.ok(imagemValida('https://a.com/x/foto.JPG'));
  assert.ok(imagemValida('http://a.com/media/123'));
  assert.ok(imagemValida('https://a.com/images/abc'));
  assert.ok(!imagemValida('https://a.com/logo.svg'));
  assert.ok(!imagemValida('ftp://a.com/foto.jpg'));
  assert.ok(!imagemValida('https://a.com/pagina'));
  assert.ok(!imagemValida('nada'));
  assert.equal(primeiraImagemDoHtml('<meta content="/img/a.png" property="og:image">', 'https://s.com/p/'), 'https://s.com/img/a.png');
});

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>Canal Teste</title>
  <item>
    <title>Frete &amp; armazenagem: novo &#8220;centro&#8221;</title>
    <link>https://site.com/noticia-1/?utm_source=rss</link>
    <pubDate>Tue, 03 Nov 2026 10:00:00 -0300</pubDate>
    <description><![CDATA[<p>Texto com <b>HTML</b> &amp; entidade&#8230;</p>]]></description>
    <enclosure url="https://site.com/wp-content/uploads/foto.jpg" type="image/jpeg" length="1"/>
  </item>
  <item>
    <title>Sem imagem no topo</title>
    <link>https://site.com/noticia-2</link>
    <description>Resumo simples</description>
    <content:encoded><![CDATA[<p><img src="/uploads/b.webp"/> corpo</p>]]></content:encoded>
  </item>
  <item>
    <title>Link perigoso</title>
    <link>javascript:alert(1)</link>
    <description>x</description>
  </item>
</channel>
</rss>`;

test('RSS 2.0: title, cleaned summary, normalized link, enclosure and HTML images, date', () => {
  const itens = itensDoFeed(RSS, 'https://site.com/feed/');
  assert.equal(itens.length, 3);
  assert.equal(itens[0].titulo, 'Frete & armazenagem: novo “centro”');
  assert.equal(itens[0].resumo, 'Texto com HTML & entidade…');
  assert.equal(itens[0].url, 'https://site.com/noticia-1');
  assert.equal(itens[0].imagemUrl, 'https://site.com/wp-content/uploads/foto.jpg');
  assert.equal(itens[0].publicadoEmBruto, 'Tue, 03 Nov 2026 10:00:00 -0300');
  assert.equal(itens[0].canal, 'Canal Teste');
  assert.equal(itens[1].imagemUrl, 'https://site.com/uploads/b.webp');
  assert.equal(itens[1].publicadoEmBruto, null);
  assert.equal(itens[2].url, null, 'only http(s) links are kept');
});

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Feed Atom</title>
  <entry>
    <title type="html">Ferrovia &amp;amp; porto</title>
    <link rel="self" href="https://atom.com/api/1"/>
    <link rel="alternate" type="text/html" href="https://atom.com/posts/1/"/>
    <id>tag:atom.com,2026:1</id>
    <published>2026-11-02T08:00:00Z</published>
    <summary type="html">&lt;p&gt;Resumo &lt;img src="https://atom.com/media/x.png"&gt; do post&lt;/p&gt;</summary>
  </entry>
  <entry>
    <title>Só id</title>
    <id>https://atom.com/posts/2</id>
    <updated>2026-11-01T08:00:00Z</updated>
    <content type="html">conteúdo</content>
  </entry>
</feed>`;

test('Atom: text of elements with attributes, alternate link, summary HTML, published/updated', () => {
  const itens = itensDoFeed(ATOM, 'https://atom.com/feed');
  assert.equal(itens.length, 2);
  assert.equal(itens[0].titulo, 'Ferrovia & porto');
  assert.equal(itens[0].url, 'https://atom.com/posts/1');
  assert.equal(itens[0].resumo, 'Resumo do post');
  assert.equal(itens[0].imagemUrl, 'https://atom.com/media/x.png');
  assert.equal(itens[0].publicadoEmBruto, '2026-11-02T08:00:00Z');
  assert.equal(itens[0].canal, 'Feed Atom');
  assert.equal(itens[1].url, 'https://atom.com/posts/2');
  assert.equal(itens[1].resumo, 'conteúdo');
  assert.equal(itens[1].publicadoEmBruto, '2026-11-01T08:00:00Z');
});

test('regressions from the real feeds: many escaped entities parse; an escaped <p> inside an attribute does not leak', () => {
  const escapado = '&lt;b&gt;x&lt;/b&gt; '.repeat(400); // 1600 entity expansions (Agência Brasil passed the parser default of 1000)
  const muitos = `<rss><channel><item><title>T</title><link>https://x.com/1</link><description>${escapado}</description></item></channel></rss>`;
  assert.equal(itensDoFeed(muitos, 'https://x.com/feed')[0].resumo.slice(0, 7), 'x x x x');

  const infomoney = `<rss><channel><item><title>T</title><link>https://x.com/2</link><description><![CDATA[<img src="https://x.com/a.jpg" data-image-caption="&lt;p&gt;Legenda &amp;#8211; foto&lt;/p&gt;" data-large-file="https://x.com/a.jpg" />Texto da notícia &#8211; fim]]></description></item></channel></rss>`;
  assert.equal(itensDoFeed(infomoney, 'https://x.com/feed')[0].resumo, 'Texto da notícia – fim');
  assert.deepEqual(pontuarCategoria('infraestrutura', { titulo: 'Metrô e metrô', resumo: '', fonte: '', dicas: [], imagemUrl: null }).tags, ['metro']);
});

test('a document that is neither RSS nor Atom is an error; items are capped per source', () => {
  assert.throws(() => itensDoFeed('<html><body>oi</body></html>', 'https://x.com'));
  const muitos = `<rss><channel>${Array.from({ length: 20 }, (_, i) => `<item><title>n${i}</title><link>https://x.com/${i}</link></item>`).join('')}</channel></rss>`;
  assert.equal(itensDoFeed(muitos, 'https://x.com/feed').length, CURADORIA.maxItensPorFonte);
});

test('baixarFeed sends the user-agent and falls back to og:image of the article page', async () => {
  const pedidos = [];
  const buscar = async (url, init) => {
    pedidos.push({ url, ua: init.headers['user-agent'] });
    if (url === 'https://f.com/feed') {
      return { ok: true, status: 200, text: async () => '<rss><channel><item><title>A</title><link>https://f.com/a</link></item><item><title>B</title><link>https://f.com/b</link></item></channel></rss>' };
    }
    if (url === 'https://f.com/a') return { ok: true, status: 200, text: async () => '<meta property="og:image" content="https://f.com/media/capa.jpg">' };
    return { ok: false, status: 404, text: async () => '' };
  };
  const itens = await baixarFeed('https://f.com/feed', buscar);
  assert.equal(itens[0].imagemUrl, 'https://f.com/media/capa.jpg');
  assert.equal(itens[1].imagemUrl, null);
  assert.ok(pedidos.every((p) => p.ua === 'ledur-news-ingest/1.0'));
  await assert.rejects(baixarFeed('https://f.com/nada', buscar));
});

test('scoring and classification: a logistics item goes to logistica; a gadget item to none', () => {
  const item = itemLogistica();
  const pontos = pontuarCategoria('logistica', item);
  assert.ok(pontos.exigidaPresente);
  assert.ok(pontos.pontuacao >= CURADORIA.pontuacaoMinima.logistica, `score ${pontos.pontuacao}`);
  assert.ok(pontos.tags.length > 0 && pontos.tags.length <= 6);
  assert.equal(classificar(item).categoria, 'logistica');

  const gadget = {
    titulo: 'Review do novo smartphone com câmera incrível',
    resumo: 'O celular traz câmera tripla, streaming em 4K e games; veja a análise do produto hands-on e o rumor do próximo.',
    fonte: 'Olhar Digital',
    dicas: [],
    imagemUrl: null,
  };
  assert.equal(classificar(gadget).categoria, null);
  assert.ok(pontuarCategoria('inovacao', gadget).pontuacao < 0);
});

test('inovacao requires context: AI without an industrial/business context loses 6 points', () => {
  const base = { titulo: 'Inteligência artificial e automação', resumo: 'Novidades de automação com inteligência artificial.', fonte: 'X', dicas: [], imagemUrl: null };
  const semContexto = pontuarCategoria('inovacao', base);
  const comContexto = pontuarCategoria('inovacao', { ...base, resumo: `${base.resumo} Na indústria e na engenharia.` });
  assert.equal(semContexto.contextoPresente, false);
  assert.equal(comContexto.contextoPresente, true);
  assert.ok(comContexto.pontuacao > semContexto.pontuacao + 6);
});

test('curation: short summary, repeated URL, similar title and better fit elsewhere are discarded', () => {
  const itens = [
    itemLogistica(),
    itemLogistica({ titulo: 'Outro título sobre frete e cargas no transporte rodoviário' }), // same URL
    itemLogistica({ url: 'https://exemplo.com.br/outra', titulo: 'Logística: transporte de cargas e frete rodoviário crescem com nova frota!' }),
    itemLogistica({ url: 'https://exemplo.com.br/curta', resumo: 'curto demais' }),
    itemLogistica({ url: 'https://exemplo.com.br/sem-titulo', titulo: '  ' }),
  ];
  const { noticias, descartes } = curarCategoria('logistica', itens, AGORA);
  assert.equal(noticias.length, 1);
  assert.deepEqual(descartes.map((d) => d.motivo), ['url_repetida', 'titulo_parecido', 'resumo_curto', 'sem_titulo']);

  const [n] = noticias;
  assert.equal(n.categoria, 'logistica');
  assert.equal(n.url, 'https://exemplo.com.br/logistica/cargas');
  assert.equal(n.hashDedupe, hashDedupe('logistica', n.url, n.titulo));
  assert.equal(n.publicadoEm.toISOString(), '2026-11-03T13:00:00.000Z');
  assert.ok(n.resumo.length <= CURADORIA.maxResumo);

  const outra = curarCategoria('economia', [itemLogistica()], AGORA);
  assert.equal(outra.noticias.length, 0);
  assert.equal(outra.descartes[0].motivo, 'melhor_em_outra_categoria');
  assert.equal(outra.descartes[0].melhorCategoria, 'logistica');
});

test('resumo is cut at 280 characters; an invalid or missing date becomes "now"', () => {
  const longo = itemLogistica({ resumo: `${RESUMO} ${'mais texto '.repeat(40)}` });
  const { noticias } = curarCategoria('logistica', [longo], AGORA);
  assert.equal(noticias[0].resumo.length, 280);
  assert.equal(dataDePublicacao('não é data', AGORA), AGORA);
  assert.equal(dataDePublicacao(null, AGORA), AGORA);
});

const curada = (fonte, relevanciaScore, dia = 1, extra = {}) => ({
  titulo: `t-${fonte}-${relevanciaScore}-${dia}`, resumo: 'r', url: null, imagemUrl: null, categoria: 'logistica', fonte,
  publicadoEm: new Date(Date.UTC(2026, 10, dia)), tags: [], hashDedupe: `h-${fonte}-${relevanciaScore}-${dia}`, relevanciaScore, ...extra,
});

test('selection: at most 5 per category, with a penalty of 3 per item already taken from the same source', () => {
  const escolhidas = escolherComDiversidade([curada('A', 30), curada('A', 29), curada('A', 28), curada('B', 25), curada('A', 10), curada('C', 9), curada('C', 8)]);
  assert.equal(escolhidas.length, 5);
  assert.deepEqual(escolhidas.map((n) => `${n.fonte}${n.relevanciaScore}`), ['A30', 'A29', 'B25', 'A28', 'C9']);
});

function memoria(iniciais = []) {
  const docs = new Map(iniciais.map((d) => [d.id, { ...d }]));
  const chamadas = { criar: [], atualizar: [], rebaixar: [] };
  let proximo = 1;
  return {
    docs,
    chamadas,
    store: {
      async externasDaCategoria(categoria) {
        return [...docs.values()].filter((d) => d.categoria === categoria && d.origem === 'externa').map((d) => ({ ...d }));
      },
      async criar(dados) {
        const id = `novo${proximo++}`;
        chamadas.criar.push(dados);
        docs.set(id, { ...dados, id, semExcluidoEm: false, semStatus: false });
        return id;
      },
      async atualizar(id, dados) {
        chamadas.atualizar.push({ id, dados });
        Object.assign(docs.get(id), dados);
      },
      async rebaixar(ids) {
        chamadas.rebaixar.push(...ids);
        for (const id of ids) docs.get(id).status = 'rascunho';
      },
    },
  };
}

const existente = (id, extra = {}) => ({
  id, titulo: `existente ${id}`, resumo: 'r', url: null, imagemUrl: null, fonte: 'F', tags: [], hashDedupe: `hash-${id}`, relevanciaScore: 12,
  publicadoEm: new Date(Date.UTC(2026, 9, 1)), status: 'publicada', excluidoEm: null, semExcluidoEm: false, semStatus: false,
  categoria: 'logistica', origem: 'externa', ...extra,
});

test('save: creates with the full portal-noticias shape', async () => {
  const { store, chamadas } = memoria();
  const r = await salvarCategoria(store, 'logistica', [curada('A', 20, 3)]);
  assert.deepEqual(r, { criadas: 1, atualizadas: 0, ignoradas: 0, rebaixadas: 0 });
  const [criado] = chamadas.criar;
  assert.deepEqual(Object.keys(criado).sort(), [
    'categoria', 'conteudo', 'criadoPor', 'destaque', 'excluidoEm', 'excluidoPor', 'fonte', 'hashDedupe', 'imagem', 'imagemUrl',
    'origem', 'publicadoEm', 'relevanciaScore', 'resumo', 'status', 'tags', 'titulo', 'url',
  ]);
  assert.equal(criado.origem, 'externa');
  assert.equal(criado.status, 'publicada');
  assert.equal(criado.excluidoEm, null);
  assert.equal(criado.excluidoPor, null);
  assert.equal(criado.criadoPor, null);
  assert.equal(criado.destaque, false);
  assert.equal(criado.conteudo, null);
  assert.equal(criado.imagem, null);
});

test('save: never brings back a document in the trash (match by hash, URL or title)', async () => {
  const naLixeira = { excluidoEm: new Date(), excluidoPor: { uid: 'u', nome: 'n' } };
  const { store, chamadas } = memoria([
    existente('h', { ...naLixeira, hashDedupe: 'h-A-20-3' }),
    existente('u', { ...naLixeira, url: 'https://a.com/u' }),
    existente('t', { ...naLixeira, titulo: 'Porto de Santos bate recorde de cargas' }),
  ]);
  const r = await salvarCategoria(store, 'logistica', [
    curada('A', 20, 3),
    curada('A', 21, 3, { url: 'https://a.com/u' }),
    curada('A', 22, 3, { titulo: 'Porto de Santos bate recorde de cargas' }),
  ]);
  assert.deepEqual(r, { criadas: 0, atualizadas: 0, ignoradas: 3, rebaixadas: 0 });
  assert.equal(chamadas.atualizar.length + chamadas.criar.length + chamadas.rebaixar.length, 0);
});

test('save: an update keeps status (a draft stays a draft) and unchanged ones are ignored', async () => {
  const mesma = curada('A', 20, 3);
  const { store, chamadas, docs } = memoria([
    existente('rascunho', { status: 'rascunho', hashDedupe: 'h-B-15-2' }),
    existente('igual', { ...mesma, id: 'igual' }),
  ]);
  const r = await salvarCategoria(store, 'logistica', [curada('B', 15, 2, { resumo: 'novo resumo' }), mesma]);
  assert.deepEqual(r, { criadas: 0, atualizadas: 1, ignoradas: 1, rebaixadas: 0 });
  assert.equal(chamadas.atualizar[0].id, 'rascunho');
  assert.ok(!('status' in chamadas.atualizar[0].dados));
  assert.ok(!('excluidoEm' in chamadas.atualizar[0].dados));
  assert.equal(docs.get('rascunho').status, 'rascunho');
  assert.equal(docs.get('rascunho').resumo, 'novo resumo');
});

test('save: missing excluidoEm/status are filled on update (client queries need them)', async () => {
  const { store, chamadas } = memoria([existente('velho', { hashDedupe: 'h-A-20-3', semExcluidoEm: true, semStatus: true, excluidoEm: undefined, status: undefined })]);
  await salvarCategoria(store, 'logistica', [curada('A', 20, 3)]);
  assert.equal(chamadas.atualizar[0].dados.excluidoEm, null);
  assert.equal(chamadas.atualizar[0].dados.excluidoPor, null);
  assert.equal(chamadas.atualizar[0].dados.status, 'publicada');
});

test('visibility limit: beyond the newest 5 published external outside the trash become drafts', async () => {
  const iniciais = [
    ...[1, 2, 3, 4, 5].map((dia) => existente(`p${dia}`, { publicadoEm: new Date(Date.UTC(2026, 9, dia)) })),
    existente('lixo', { publicadoEm: new Date(Date.UTC(2026, 8, 1)), excluidoEm: new Date() }),
    existente('rasc', { publicadoEm: new Date(Date.UTC(2026, 8, 2)), status: 'rascunho' }),
  ];
  const { store, chamadas, docs } = memoria(iniciais);
  const r = await salvarCategoria(store, 'logistica', [curada('A', 20, 3), curada('B', 18, 2)]);
  assert.equal(r.criadas, 2);
  assert.equal(r.rebaixadas, 2);
  assert.deepEqual(chamadas.rebaixar.sort(), ['p1', 'p2']);
  assert.equal(docs.get('lixo').status, 'publicada', 'trash is not touched');
  assert.equal(alemDoLimite([...docs.values()]).length, 0);
});

test('save: nothing accepted, nothing read or demoted (as before)', async () => {
  const { store, chamadas } = memoria([1, 2, 3, 4, 5, 6].map((d) => existente(`p${d}`)));
  assert.deepEqual(await salvarCategoria(store, 'logistica', []), { criadas: 0, atualizadas: 0, ignoradas: 0, rebaixadas: 0 });
  assert.equal(chamadas.rebaixar.length, 0);
});

test('existing match order: hash, then URL, then similar title of the newest', () => {
  const lista = [
    existente('titulo-velho', { titulo: 'Porto bate recorde', publicadoEm: new Date(Date.UTC(2026, 0, 1)) }),
    existente('titulo-novo', { titulo: 'Porto bate recorde', publicadoEm: new Date(Date.UTC(2026, 5, 1)) }),
    existente('url', { url: 'https://a.com/x' }),
    existente('hash', { hashDedupe: 'H' }),
  ];
  assert.equal(encontrarExistente(lista, curada('A', 1, 1, { hashDedupe: 'H', url: 'https://a.com/x' })).id, 'hash');
  assert.equal(encontrarExistente(lista, curada('A', 1, 1, { url: 'https://a.com/x' })).id, 'url');
  assert.equal(encontrarExistente(lista, curada('A', 1, 1, { titulo: 'Porto bate recorde' })).id, 'titulo-novo');
  assert.equal(encontrarExistente(lista, curada('A', 1, 1)), null);
});

test('a full run reads each feed URL once, survives a failing source and sums the summary', async () => {
  const pedidos = [];
  const xmlLogistica = `<rss><channel><item><title>Logística: transporte de cargas e frete rodoviário crescem com nova frota</title>
    <link>https://tm.com/n1</link><description>${RESUMO}</description><enclosure url="https://tm.com/media/1.jpg"/></item></channel></rss>`;
  const buscar = async (url) => {
    pedidos.push(url);
    if (url === 'https://transportemoderno.com.br/feed/') return { ok: true, status: 200, text: async () => xmlLogistica };
    if (url === 'https://www.abralog.com.br/feed/') throw new Error('timeout');
    return { ok: true, status: 200, text: async () => '<rss><channel></channel></rss>' };
  };
  const { store } = memoria();
  const { resumo, categorias } = await executarColeta(store, { buscar, agora: AGORA });
  assert.equal(pedidos.length, 15, 'Agencia iNFRA is read once for two categories');
  assert.equal(resumo.fontes, 14);
  assert.deepEqual({ ...resumo, fontes: undefined }, { fontes: undefined, lidas: 1, aceitas: 1, criadas: 1, atualizadas: 0, ignoradas: 0, rebaixadas: 0 });
  assert.deepEqual(categorias.logistica.falhas, [{ fonte: 'Abralog', erro: 'timeout' }]);
});
