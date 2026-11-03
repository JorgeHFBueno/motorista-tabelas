// Documento de `checklists-v2/{id}` e arquivos do Storage, campo a campo como o app Flutter
// (checklist_pendente.dart → documento(), fotos, caminhoAssinatura) e a transação de checklist_envio.dart.
import { catalogoDoRascunho, itensDoRascunho, respostaDe, type ChecklistFoto, type ChecklistPendente } from './rascunho';
import { CATALOGOS, usaHorimetro } from './catalogo';
import { totais } from './regras';

export type ChecklistEnvioFoto = { foto: ChecklistFoto; itemId: string; caminhoFoto: string; caminhoMiniatura: string };

/** Fotos dos itens que valem, com caminho `checklists-v2/{id}/{itemId}_{n}.jpg` (n começa em 1). */
export function fotosParaEnvio(p: ChecklistPendente): ChecklistEnvioFoto[] {
  const id = p.rascunho.id;
  return itensDoRascunho(p.rascunho).flatMap((item) =>
    respostaDe(p.rascunho, item.id).fotos.map((foto, i) => ({
      foto,
      itemId: item.id,
      caminhoFoto: `checklists-v2/${id}/${item.id}_${i + 1}.jpg`,
      caminhoMiniatura: `checklists-v2/${id}/miniaturas/${item.id}_${i + 1}.jpg`,
    })),
  );
}

/** Caminho da assinatura no Storage (padrão `<nome>_<n>.jpg` das fotos, aceito pelas Rules). */
export const caminhoAssinatura = (id: string) => `checklists-v2/${id}/assinatura_1.jpg`;

/** Todos os arquivos a enviar, em ordem: foto e miniatura de cada foto, e a assinatura. `local` é a chave no aparelho. */
export function arquivosParaEnvio(p: ChecklistPendente): { caminho: string; local: string }[] {
  const arquivos = fotosParaEnvio(p).flatMap((f) => [
    { caminho: f.caminhoFoto, local: f.foto.arquivo },
    { caminho: f.caminhoMiniatura, local: f.foto.miniatura },
  ]);
  const assinatura = p.rascunho.assinatura;
  if (assinatura && !assinatura.ausente) arquivos.push({ caminho: caminhoAssinatura(p.rascunho.id), local: assinatura.arquivo });
  return arquivos;
}

const textoOuNulo = (texto: string) => (texto.trim() === '' ? null : texto.trim());

/**
 * Documento de `checklists-v2/{id}`. As datas vão como `Date` (o SDK web grava Timestamp); `registradoEm` recebe o
 * `serverTimestamp()` de quem grava, para o domínio não depender do Firebase.
 */
export function montarDocumento(p: ChecklistPendente, registradoEm: unknown): Record<string, unknown> {
  const r = p.rascunho;
  const catalogo = catalogoDoRascunho(r);
  const fotos = new Map(fotosParaEnvio(p).map((f) => [f.foto, f]));
  const t = totais(r);
  const a = r.assinatura;
  return {
    schemaVersion: 1,
    tipo: r.tipo,
    catalogo,
    catalogoVersao: CATALOGOS[catalogo].versao,
    item_frota_id: r.veiculo.id,
    item_frota_snapshot: { categoria: r.veiculo.categoria, identificador: r.veiculo.identificador, nome: r.veiculo.nome },
    medidor: {
      tipo: usaHorimetro(catalogo) ? 'horimetro' : 'km',
      valor: r.medidor,
      anterior: r.veiculo.medidorUltimo,
      // Menor que o anterior, confirmado pelo mecânico: corrige o cadastro.
      corrigido: r.medidorCorrigido,
    },
    guincho: r.guincho,
    // Mesmo formato do Combustível: uid nulo para nome digitado.
    motoristaOperador: r.motorista ? { uid: r.motorista.uid, nome: r.motorista.nome } : null,
    assinatura: a == null
      ? null
      : a.ausente
        ? { status: 'ausente', motivo: a.motivo, em: a.em }
        : { status: 'assinada', path: caminhoAssinatura(r.id), em: a.em, bytes: a.bytes, largura: a.largura, altura: a.altura },
    criadoPor: { uid: p.autor.uid, nome: p.autor.nome },
    criadoPorUid: p.autor.uid,
    iniciadoEm: r.iniciadoEm,
    concluidoEm: p.concluidoEm,
    registradoEm,
    totais: { ok: t.ok, avaria: t.avaria, naoSeAplica: t.nao_se_aplica },
    itens: itensDoRascunho(r).map((item) => {
      const resposta = respostaDe(r, item.id);
      return {
        itemId: item.id,
        parte: item.parte,
        titulo: item.titulo,
        status: resposta.status,
        observacao: textoOuNulo(resposta.observacao),
        fotos: resposta.fotos.map((foto) => ({
          path: fotos.get(foto)!.caminhoFoto,
          miniatura: fotos.get(foto)!.caminhoMiniatura,
          origem: foto.origem,
          capturadaEm: foto.capturadaEm,
          bytes: foto.bytes,
          largura: foto.largura,
          altura: foto.altura,
        })),
      };
    }),
  };
}

/**
 * Na transação de gravação: atualiza `operacional.quilometragemUltima` só se o veículo existe, o valor é diferente do
 * atual e (o atual é nulo, ou o valor é maior, ou o mecânico confirmou a correção). Sem a confirmação nunca baixa,
 * porque outro registro pode ter chegado antes com um valor maior.
 */
export function deveAtualizarMedidor(dados: {
  veiculoExiste: boolean;
  atual: number | null;
  valor: number | null;
  corrigido: boolean;
}): boolean {
  const { veiculoExiste, atual, valor, corrigido } = dados;
  return veiculoExiste && valor != null && valor !== atual && (atual == null || valor > atual || corrigido);
}
