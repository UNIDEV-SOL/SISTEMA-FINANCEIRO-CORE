---
slug: importar
title: Importar SMS e comprovativos
summary: Cole os SMS do M-Pesa, e-Mola e BIM, ou envie a nota de lançamento do BIM em PDF, e registe os movimentos sem os escrever.
category: Principal
order: 32
---
Em **Principal › Transações**, o botão **Importar** lê as mensagens que o banco e as carteiras móveis lhe enviam e prepara as transações por si.

## SMS do M-Pesa, e-Mola e BIM

1. No telemóvel, copie um ou vários SMS (pode copiar vários seguidos).
2. Em **Importar › Colar SMS**, cole o texto e carregue em **Ler mensagens**.
3. Confira a lista e carregue em **Importar**.

São reconhecidos:

- **Depósitos e levantamentos no agente**: ficam como transferências entre a carteira e o seu dinheiro vivo.
- **Transferências, pagamentos e compras**: ficam como despesas.
- **Dinheiro recebido**: fica como receita.
- **Taxas**: quando a mensagem indica uma taxa, ela aparece numa linha à parte, como despesa.
- **Créditos e débitos na conta BIM**.

As mensagens que não são movimentos (promoções, avisos) aparecem em **Não reconhecidas** e são ignoradas.

## Nota de lançamento do BIM (PDF)

Quando recebe o salário, o BIM permite descarregar a **nota de lançamento**. Em **Importar › PDF do banco**, escolha o ficheiro: a data, o valor e a descrição (por exemplo, *SALARIO SETEMBRO 2026*) são lidos do documento.

Use o PDF original do banco. Uma fotografia ou um documento digitalizado não tem texto para ler.

## Contas e categorias

- No topo escolhe **a conta de cada origem** (M-Pesa, e-Mola, BIM) e a conta de **dinheiro vivo** usada nos depósitos e levantamentos. A conta do BIM é reconhecida pelo **número da conta** (que pode indicar em **Contas**); as outras pelo nome ou pela instituição.
- Se ainda não tem a conta, a aplicação **propõe criá-la** com os dados da mensagem (no BIM, com o número da conta). Pode trocar por uma conta que já existe.
- A **categoria** é sugerida a partir das transações que já registou com a mesma descrição, ou pelo nome da categoria (por exemplo, *Salário* numa descrição com *SALARIO*). Pode mudá-la em cada linha.

## Sem duplicados

- Um SMS ou PDF que **já importou** aparece como *Já importada* e não pode ser importado outra vez.
- Se já existe uma transação do mesmo tipo e valor, com até um dia de diferença (por exemplo, registou o salário à mão, ou importou o SMS e depois o PDF), a linha aparece como **Possível duplicado** e fica desmarcada. Marque-a só se for mesmo outro movimento.

## Acertar o saldo

Os SMS do M-Pesa e do e-Mola dizem o saldo depois de cada movimento. Depois de importar, a aplicação compara o saldo da mensagem mais recente com o saldo da conta nesse dia. Se não baterem certo (por exemplo, numa conta acabada de criar), mostra a diferença e permite **acertar o saldo inicial** da conta com um clique.

As transações importadas ficam liquidadas. Não é possível importar para um ano fechado.
