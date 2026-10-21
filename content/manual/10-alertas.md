---
slug: alertas
title: Alertas
summary: Que alertas existem, como os ler e marcar como lidos, e como configurar regras, limiares e emails semanais/mensais.
category: Análise
order: 100
---
Os alertas mostram "o que precisa da sua atenção". Aparecem no **sino** do topo (com o número por ler) e em **Análise › Alertas**.

## Tipos de alerta

- **Orçamento** — "X a 85% do orçamento" (atenção) quando uma categoria chega ao limiar, e "Orçamento de X ultrapassado" (urgente) quando passa o limite.
- **Contas por pagar** — despesas e transferências **previstas** que "vence[m] hoje/amanhã/em N dias", ou que estão "em atraso" (a data já passou e não foi marcada como paga).
- **Saldo baixo** — uma conta do dia-a-dia (bancária, carteira móvel, dinheiro) abaixo do mínimo definido; urgente se o saldo for negativo.
- **Metas** — "Meta X cumprida" e "Prazo da meta X a aproximar-se" (menos de 30 dias).
- **Gastos acima das receitas** — "Está a gastar mais do que recebe" quando as despesas liquidadas do mês passam as receitas.

Cada alerta tem a gravidade (**Urgente**, **Atenção**, **Informação**), a data e o link **Ver**, que abre a página onde resolve o assunto.

> Os alertas são recalculados com os seus dados actuais: quando paga a conta ou ajusta o orçamento, o alerta desaparece sozinho.

## Ler e marcar como lidos

- No separador **Alertas**, escolha **Por ler** ou **Todos**.
- **Marcar como lido** num alerta, ou **Marcar todos como lidos** (também no painel do sino).
- O painel do sino mostra até 5 alertas por ler e o link **Ver todos os alertas**.

## Preferências (regras e limiares)

No separador **Preferências**:

1. **Email para notificações** — para onde vão os emails (por omissão, o email da conta).
2. Ligue ou desligue cada regra:
   - **Orçamento a acabar** — com **Avisar a partir de (%)**, entre 50 e 100 (80% por omissão).
   - **Contas por pagar** — com **Dias de antecedência**, entre 1 e 30 (3 por omissão).
   - **Saldo baixo** — com o **Mínimo** (1.000 por omissão).
   - **Metas** — prazos a menos de 30 dias e metas cumpridas.
3. Escolha os emails periódicos:
   - **Resumo semanal por email** — às segundas-feiras: quanto gastou na semana anterior e o que vem aí.
   - **Relatório mensal por email** — no dia 1: o fecho do mês anterior com a regra 50/30/20.
4. Clique em **Guardar preferências**.

## Emails de alertas

Uma vez por dia, a aplicação envia por email os alertas **novos** de atenção e urgentes (os informativos não). O mesmo alerta nunca é enviado duas vezes.

> Os emails dependem de o servidor ter o envio configurado e de o administrador manter ligado o parâmetro **Enviar emails**. Se não recebe nada, verifique a pasta de spam e fale com o administrador.
