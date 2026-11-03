# Catálogo do checklist do mecânico

A lista de itens do checklist (`/checklist` da WEB) é a mesma do app Flutter. Ela vem de
`lib/features/checklist/models/checklist_catalogo.dart` do app e é gerada em
`src/features/checklist-mecanico/domain/catalogo.gerado.ts`. Não edite esse arquivo à mão.

## Gerar de novo (quando a lista mudar no app)

Na raiz da WEB, com o app em `../../App/MotoristaV2_MKI` e o `flutter pub get` dele já feito:

```bash
dart run --packages=../../App/MotoristaV2_MKI/.dart_tool/package_config.json tools/checklist-catalogo/exportar_catalogo.dart > src/features/checklist-mecanico/domain/catalogo.gerado.ts
```

Depois rode `npm run test:checklist-mecanico`. As contagens esperadas estão no teste. Se a lista mudou, atualize
também a versão do catálogo no app (`ChecklistCatalogo.versao`) e as contagens.
