// Exporta o catálogo do checklist do app Flutter para a WEB
// (src/features/checklist-mecanico/domain/catalogo.gerado.ts). Ver README.md ao lado.
import 'dart:convert';

import 'package:motorista_v2_mki/features/checklist/models/checklist_catalogo.dart';

void main() {
  final catalogos = {
    for (final c in ChecklistCatalogo.values)
      c.id: {
        'id': c.id,
        'titulo': c.titulo,
        'versao': c.versao,
        'itens': [
          for (final item in todosOsItens(c))
            {
              'id': item.id,
              'parte': item.parte.id,
              'titulo': item.titulo,
              'campo': item.campo,
            },
        ],
      },
  };
  final partes = [
    for (final p in ChecklistParte.values) {'id': p.id, 'titulo': p.titulo},
  ];
  const json = JsonEncoder.withIndent('  ');
  print('// GERADO por tools/checklist-catalogo/exportar_catalogo.dart a partir de');
  print('// lib/features/checklist/models/checklist_catalogo.dart do app Flutter. Não editar à mão.');
  print('');
  print('export const PARTES_GERADAS = ${json.convert(partes)} as const;');
  print('');
  print('export const CATALOGOS_GERADOS = ${json.convert(catalogos)} as const;');
}
