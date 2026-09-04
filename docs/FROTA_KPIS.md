# KPIs da Frota

## Fase 1 — Piloto

O piloto usa exclusivamente o período de 01/01/2026 a 31/08/2026. Viagem é uma Saída registrada; KM é estimado por odômetro de abastecimentos; R$ é custo de manutenção; e obras visitadas ficam indisponíveis no histórico. Não há inferência textual de obra.

## Fase 2 — Dados estruturados

Planejada aproximadamente para outubro/2026, sem implementação neste patch. Avaliará identidades canônicas de veículo e obra, maior precisão de KM, métricas por obra e eventual custo monetário de combustível.

## Definições

- Uma viagem é exatamente um documento de `atividades` com `tipo == "saida"`. Chegadas não participam da contagem: são documentos independentes e não há pareamento nem collection `viagens`.
- Novas Saídas devem gravar, quando disponíveis, `veiculoId` (ID de `veiculos`), `placaSnapshot`, `obraId` (ID de `obras`) e `obraNomeSnapshot`. Placa e nome são snapshots de apresentação; não são identidades analíticas.
- O KM estimado vem das leituras `03-combustivel.km` cronológicas por veículo: última leitura válida menos primeira leitura válida dentro do período. É uma estimativa por odômetro, independente de Saída/Chegada.
- O cálculo fica indisponível com menos de duas leituras, `Sem Odômetro`, Galão, ajuste/bomba/estoque, datas ausentes ou odômetro decrescente. Nunca é exibido como zero artificial.
- Custo de manutenção é a soma de `manutencoes.valor`; não inclui combustível nem `manutencoes-legado`. `R$/km manutenção = custo de manutenção / KM estimado`, somente quando o KM é positivo.

## Limitações e histórico

Não há KM por obra: o intervalo entre abastecimentos não pode ser atribuído com segurança a uma obra. Obras visitadas e viagens por obra usam somente `obraId`; registros históricos sem ele não recebem inferência de destino, local, aka ou texto livre. A UI informa essa cobertura parcial.

É possível acrescentar futuramente uma fonte monetária confiável para combustível, sem renomear manutenção como custo operacional.

## Consultas e índices

Analytics consulta Saídas por `tipo == "saida"`; combustível e manutenção são agregados localmente nesta primeira versão. Não foi criado índice especulativo. Para escala futura, os candidatos são `atividades(tipo, veiculoId, data)`, `atividades(tipo, obraId, data)`, `manutencoes(identificador, data)` e uma identidade canônica de veículo nos abastecimentos.
