// Documento de `manutencoes-v2/{id}`, arquivos do Storage e a leitura de volta, campo a campo como a Manutenção do app
// Flutter (manutencao_pendente.dart → documento(), manutencao_lida.dart, manutencao_envio.dart). The Manuscript,
// 01_FIRESTORE/COLECOES/manutencoes-v2.md.
import type { ChecklistFoto } from '../../checklist-mecanico/domain/rascunho';
import { ACOES, CATEGORIAS, EIXOS, LADOS, TIPOS, UNIDADES, idDe } from './listas';
import { horimetroDe, lerDia, statusDe, type RevisaoItem, type RevisaoPendente, type RevisaoRegistro } from './registro';

/** Foto já no Storage (registro aberto em outro aparelho): o reenvio usa o mesmo caminho e não a sobe de novo. */
export const PREFIXO_FOTO_REMOTA = 'manutencoes-v2/';
export const fotoRemota = (foto: ChecklistFoto) => foto.arquivo.startsWith(PREFIXO_FOTO_REMOTA);

/** Campos gravados só na criação; a atualização mantém os do servidor. */
export const CAMPOS_DE_CRIACAO = ['criadoPor', 'criadoPorUid', 'abertaEm', 'registradoEm'] as const;

/** Nome no Storage: o do arquivo (`<itemId>_<n>.jpg`, n único por foto); remover uma foto não muda o caminho das outras. */
function nomeNoStorage(foto: ChecklistFoto): string {
  const nome = foto.arquivo.split('/').pop() ?? foto.arquivo;
  return nome.toLowerCase().endsWith('.jpg') ? nome : `${nome}.jpg`;
}

export type RevisaoEnvioFoto = { foto: ChecklistFoto; caminhoFoto: string; caminhoMiniatura: string };

export function fotosParaEnvio(p: RevisaoPendente): RevisaoEnvioFoto[] {
  const { id } = p.registro;
  return p.registro.itens.flatMap((item) => item.fotos.map((foto) => ({
    foto,
    caminhoFoto: `manutencoes-v2/${id}/${nomeNoStorage(foto)}`,
    caminhoMiniatura: `manutencoes-v2/${id}/miniaturas/${nomeNoStorage(foto)}`,
  })));
}

/** Fotos e miniaturas do aparelho a enviar; as que já estão no Storage ficam de fora. `local` é a chave no aparelho. */
export function arquivosParaEnvio(p: RevisaoPendente): { caminho: string; local: string }[] {
  return fotosParaEnvio(p).filter((f) => !fotoRemota(f.foto)).flatMap((f) => [
    { caminho: f.caminhoFoto, local: f.foto.arquivo },
    { caminho: f.caminhoMiniatura, local: f.foto.miniatura },
  ]);
}

const textoOuNulo = (texto: string) => (texto.trim() === '' ? null : texto.trim());

/**
 * Documento inteiro. As datas vão como `Date` (o SDK web grava Timestamp); `servidor` é o `serverTimestamp()` de quem
 * grava, para o domínio não depender do Firebase. Na atualização, quem grava tira os `CAMPOS_DE_CRIACAO`.
 */
export function montarDocumento(p: RevisaoPendente, servidor: unknown): Record<string, unknown> {
  const r = p.registro;
  const v = r.veiculo;
  const caminhos = new Map(fotosParaEnvio(p).map((f) => [f.foto.arquivo, f]));
  const fechada = statusDe(r) === 'fechada';
  const autor = { uid: p.autor.uid, nome: p.autor.nome };
  return {
    schemaVersion: 1,
    status: statusDe(r),
    revisao: r.revisao,
    item_frota_id: v.id,
    item_frota_snapshot: { categoria: v.categoria, identificador: v.identificador, nome: v.nome },
    medidor: { tipo: horimetroDe(v) ? 'horimetro' : 'km', valor: r.medidor, anterior: v.medidorUltimo, corrigido: r.medidorCorrigido },
    tipo: r.tipo,
    motivo: r.motivo.trim(),
    numeroNota: textoOuNulo(r.numeroNota),
    datas: { parada: r.dataParada, entrada: r.dataEntrada, retorno: r.dataRetorno },
    itens: r.itens.map((item) => ({
      itemId: item.itemId,
      categoria: item.categoria,
      acao: item.acao,
      peca: item.peca.trim(),
      motivo: textoOuNulo(item.motivo ?? ''),
      posicao: { eixo: item.eixo, lado: item.lado },
      quantidade: item.quantidade == null ? null : { valor: item.quantidade, unidade: item.unidade },
      especificacao: textoOuNulo(item.especificacao),
      numeroNota: textoOuNulo(item.numeroNota),
      fotos: item.fotos.map((foto) => ({
        path: caminhos.get(foto.arquivo)!.caminhoFoto,
        miniatura: caminhos.get(foto.arquivo)!.caminhoMiniatura,
        origem: foto.origem,
        capturadaEm: foto.capturadaEm,
        bytes: foto.bytes,
        largura: foto.largura,
        altura: foto.altura,
      })),
    })),
    criadoPor: autor,
    criadoPorUid: p.autor.uid,
    fechadoPor: fechada ? autor : null,
    abertaEm: r.abertaEm,
    atualizadaEm: p.salvoEm,
    fechadaEm: fechada ? p.salvoEm : null,
    registradoEm: servidor,
    atualizadoServidorEm: servidor,
  };
}

/**
 * Na transação: o cadastro do veículo só muda quando o medidor deste registro mudou (documento novo, ou valor ou
 * correção diferentes dos do servidor), o valor é diferente do cadastro e (o cadastro não tem valor, ou o valor é
 * maior, ou o mecânico confirmou a correção). Uma revisão salva dias depois não baixa um KM que outros já subiram.
 */
export function deveAtualizarMedidor(dados: {
  medidorNoServidor: unknown;
  veiculoExiste: boolean;
  atual: number | null;
  valor: number | null;
  corrigido: boolean;
}): boolean {
  const { medidorNoServidor: m, veiculoExiste, atual, valor, corrigido } = dados;
  const anterior = m && typeof m === 'object' ? (m as { valor?: unknown; corrigido?: unknown }) : null;
  const mudou = anterior == null
    || (typeof anterior.valor === 'number' ? Math.trunc(anterior.valor) : null) !== valor
    || anterior.corrigido !== corrigido;
  return mudou && veiculoExiste && valor != null && valor !== atual && (atual == null || valor > atual || corrigido);
}

// ------------------------------------------------------------------ leitura

/** Registro lido de `manutencoes-v2`, com o que só o servidor sabe (autoria e horas). */
export type RevisaoLida = {
  /** No formato do aparelho: fotos com o caminho do Storage e o "último KM" com o `medidor.anterior` gravado. */
  registro: RevisaoRegistro;
  criadoPorUid: string;
  criadoPorNome: string;
  fechadoPorNome: string | null;
  atualizadaEm: Date | null;
  fechadaEm: Date | null;
};

const mapa = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texto = (v: unknown) => (typeof v === 'string' ? v : '');
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const data = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === 'function' ? t.toDate() : null;
};

function lerItem(i: Record<string, unknown>): RevisaoItem {
  const posicao = mapa(i.posicao);
  const quantidade = mapa(i.quantidade);
  return {
    itemId: texto(i.itemId),
    categoria: idDe(CATEGORIAS, i.categoria),
    acao: idDe(ACOES, i.acao),
    peca: texto(i.peca),
    motivo: typeof i.motivo === 'string' ? i.motivo : null,
    eixo: idDe(EIXOS, posicao.eixo),
    lado: idDe(LADOS, posicao.lado),
    quantidade: numero(quantidade.valor),
    unidade: idDe(UNIDADES, quantidade.unidade),
    especificacao: texto(i.especificacao),
    numeroNota: texto(i.numeroNota),
    fotos: (Array.isArray(i.fotos) ? i.fotos : []).map(mapa).filter((f) => typeof f.path === 'string').map((f) => ({
      arquivo: f.path as string,
      miniatura: typeof f.miniatura === 'string' ? f.miniatura : (f.path as string),
      origem: f.origem === 'galeria' ? 'galeria' : 'camera',
      capturadaEm: data(f.capturadaEm),
      bytes: Math.trunc(numero(f.bytes) ?? 0),
      largura: Math.trunc(numero(f.largura) ?? 0),
      altura: Math.trunc(numero(f.altura) ?? 0),
    })),
  };
}

export function lerRevisao(id: string, d: Record<string, unknown>): RevisaoLida {
  const snapshot = mapa(d.item_frota_snapshot);
  const medidor = mapa(d.medidor);
  const datas = mapa(d.datas);
  const anterior = numero(medidor.anterior);
  const valor = numero(medidor.valor);
  const registro: RevisaoRegistro = {
    id,
    veiculo: {
      id: texto(d.item_frota_id),
      categoria: texto(snapshot.categoria) || (medidor.tipo === 'horimetro' ? 'EXTRA' : 'PLACA'),
      identificador: texto(snapshot.identificador) || '-',
      nome: texto(snapshot.nome),
      medidorUltimo: anterior == null ? null : Math.trunc(anterior),
    },
    abertaEm: data(d.abertaEm) ?? new Date(0),
    revisao: Math.trunc(numero(d.revisao) ?? 1),
    alterado: false,
    medidor: valor == null ? null : Math.trunc(valor),
    medidorCorrigido: medidor.corrigido === true,
    tipo: idDe(TIPOS, d.tipo),
    motivo: texto(d.motivo),
    numeroNota: texto(d.numeroNota),
    dataParada: lerDia(datas.parada),
    dataEntrada: lerDia(datas.entrada),
    dataRetorno: lerDia(datas.retorno),
    itens: (Array.isArray(d.itens) ? d.itens : []).filter((i) => i && typeof i === 'object').map((i) => lerItem(mapa(i))),
  };
  const fechadoPor = mapa(d.fechadoPor);
  return {
    registro,
    criadoPorUid: texto(d.criadoPorUid),
    criadoPorNome: texto(mapa(d.criadoPor).nome),
    fechadoPorNome: typeof fechadoPor.nome === 'string' ? fechadoPor.nome : null,
    atualizadaEm: data(d.atualizadaEm),
    fechadaEm: data(d.fechadaEm),
  };
}

/** Data do cartão no histórico: o fechamento, ou a última gravação, ou a abertura. */
export const dataDoCartao = (l: RevisaoLida) => l.fechadaEm ?? l.atualizadaEm ?? l.registro.abertaEm;
