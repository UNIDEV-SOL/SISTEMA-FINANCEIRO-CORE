# Perguntas frequentes

Cada pergunta começa com "## ", seguida de `<!-- key: <chave-estável>; category: <categoria> -->` e da resposta em Markdown.
A chave identifica a pergunta no seed: não a mude depois de publicada.

## Registei uma despesa mas o saldo da conta não mudou. Porquê?
<!-- key: saldo-nao-mudou; category: Transações -->
Provavelmente a despesa ficou como **prevista**. As transações previstas não mexem no saldo até serem pagas. Abra a transação em **Transações**, ligue **Já pago** e guarde. Confirme também que escolheu a conta certa. Veja [Transações](/ajuda/transacoes).

## Qual é a diferença entre uma transação prevista e uma liquidada?
<!-- key: prevista-liquidada; category: Transações -->
**Liquidada** já aconteceu: conta no saldo, nos totais do mês e nos relatórios. **Prevista** ainda vai acontecer (uma conta a pagar, um salário a receber): aparece no Dashboard em **Previstas**, como faixa clara nos orçamentos e gera alertas de vencimento, mas não mexe no saldo.

## Como registo dinheiro que passei do banco para a carteira móvel ou para a poupança?
<!-- key: transferencia-entre-contas; category: Transações -->
Use uma **Transferência**: em **Nova transação**, escolha o tipo **Transferência**, a conta **De** e a conta **Para**. Não é despesa nem receita, por isso não altera o património. Se a conta de destino for do tipo **Poupança** ou **Investimento**, o valor conta como poupança na regra 50/30/20.

## O saldo da aplicação não bate certo com o do banco. O que faço?
<!-- key: acertar-saldo; category: Contas -->
1. Verifique se falta registar alguma transação ou se alguma ficou como prevista.
2. Confirme as datas e as contas das transferências.
3. Se a diferença vem de antes de começar a usar a aplicação, edite o **Saldo inicial** da conta em **Contas**.

O saldo é sempre calculado: saldo inicial mais as transações liquidadas.

## Posso apagar uma conta ou uma categoria?
<!-- key: apagar-conta-categoria; category: Contas -->
Não, para não perder o histórico. Uma conta que fechou pode ser **arquivada** (deixa de aparecer nas listas, mas as transações mantêm-se). As categorias não se apagam; pode mudar-lhes o nome, o ícone ou o grupo.

## Como é calculada a sugestão de orçamento?
<!-- key: sugestao-orcamento; category: Orçamentos -->
É a média das despesas liquidadas da categoria nos **últimos 3 meses completos**, arredondada para cima aos 50. No diálogo do limite tem ainda os atalhos **Média −10%**, **Média** e **Média +10%**.

## Tenho de criar o orçamento todos os meses?
<!-- key: orcamento-mensal; category: Orçamentos -->
Não. O limite **repete-se todos os meses** até o alterar ou remover. Use o selector de mês para ver como correu cada mês.

## O que significa "Pode gastar X por dia"?
<!-- key: gastar-por-dia; category: Orçamentos -->
É o que ainda está disponível nos seus orçamentos do mês (orçado menos gasto) a dividir pelos dias que faltam até ao fim do mês, contando hoje. Ajuda a não chegar ao fim do mês sem margem.

## O que é a regra 50/30/20?
<!-- key: regra-50-30-20; category: Dashboard -->
Uma referência simples para distribuir o rendimento: cerca de **50%** para necessidades, **30%** para desejos e **20%** para poupança e investimento. O Dashboard mostra a sua distribuição do mês; o grupo de cada despesa vem da categoria e a poupança conta as transferências para contas de poupança ou investimento. Veja [Dashboard](/ajuda/dashboard).

## Mudei a moeda e os valores continuam iguais. Está errado?
<!-- key: moeda-sem-conversao; category: Configurações -->
Não. A moeda **só muda a apresentação** (o símbolo e o formato); os valores não são convertidos. Escolha a moeda em que regista as suas contas.

## Como faço uma cópia de segurança dos meus dados?
<!-- key: exportar-dados; category: Configurações -->
Em **Configurações › Os seus dados**, clique em **Exportar tudo**: descarrega um ficheiro JSON com contas, categorias, transações, orçamentos, metas e investimentos. Para uma tabela anual no Excel, use **Relatórios › Exportar CSV**.

## Não recebo os emails de alertas nem os resumos. Porquê?
<!-- key: emails-alertas; category: Alertas -->
Confirme em **Alertas › Preferências** o **Email para notificações** e se as regras e os emails semanal/mensal estão ligados (e guardados). O resumo semanal sai às segundas-feiras e o relatório mensal no dia 1. Veja também a pasta de spam. Se mesmo assim não chegar nada, o envio de emails pode estar desligado no servidor: fale com o administrador.

## Como ajudo um familiar a gerir as finanças dele?
<!-- key: ajudar-familiar; category: Família -->
Em **Família**, use **Criar conta para dependente** (para quem ainda não tem conta) ou **Convidar conta existente**. Depois escolha a pessoa em **A gerir**, no topo, para trabalhar nas contas dela. Com acesso **Leitura** só consulta; com **Gestão** pode registar e alterar. Veja [Família](/ajuda/familia).

## O assistente pode registar transações ou mudar os meus orçamentos?
<!-- key: assistente-alteracoes; category: Assistente -->
Não. O assistente responde a dúvidas a partir do manual e das perguntas frequentes: não altera nem consulta os seus dados. Quando pedir uma alteração, explica onde a pode fazer na aplicação. Veja [Assistente](/ajuda/assistente).

## Esqueci-me da palavra-passe. Como volto a entrar?
<!-- key: esqueci-palavra-passe; category: Conta -->
Peça ao administrador da aplicação para a **repor** em **Administração › Utilizadores**. Depois de entrar, use a palavra-passe nova que lhe for indicada.

## Porque é que não vejo algumas páginas do menu ou alguns botões?
<!-- key: sem-acesso; category: Conta -->
O menu e os botões dependem do seu **perfil**. Se uma página não aparece ou mostra "Sem acesso", o seu perfil não tem essa permissão. Peça acesso ao administrador.

## Posso importar os SMS do M-Pesa em vez de escrever as transações?
<!-- key: importar-sms; category: Transações -->
Sim. Em **Transações › Importar**, cole os SMS do M-Pesa, e-Mola ou BIM (vários de uma vez) e confira a lista antes de importar. Também pode enviar a nota de lançamento do BIM em PDF. O mesmo SMS nunca é importado duas vezes. Veja o artigo *Importar SMS e comprovativos*.
