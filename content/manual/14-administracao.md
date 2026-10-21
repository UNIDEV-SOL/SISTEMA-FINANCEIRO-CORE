---
slug: administracao
title: Administração
summary: Para administradores — utilizadores, perfis e a matriz de permissões, menus, parâmetros e moedas, manual e FAQ, e auditoria.
category: Administração
order: 140
---
A secção **Administração** do menu só aparece a quem tem perfil de administrador. Cada página depende de permissões próprias: o perfil **Administrador** gere utilizadores, o manual e consulta a auditoria e os perfis; o **Super administrador** tem acesso a tudo.

## Utilizadores

Em **Administração › Utilizadores** ("quem pode entrar na aplicação e com que perfil"):
- Pesquise por nome ou email e filtre por **perfil** e **estado** (Activos / Inactivos).
- **Novo utilizador**: nome, email, palavra-passe e **Perfil**.
- **Editar**: nome, email e perfil.
- **Desactivar / Activar**: uma conta desactivada não consegue entrar e perde as sessões abertas. Não pode desactivar a sua própria conta nem o último super administrador activo.
- **Repor palavra-passe**: define uma nova palavra-passe (com confirmação) para quem a esqueceu.

> Só um super administrador pode alterar outro super administrador ou dar esse perfil.

## Perfis e permissões

Em **Administração › Perfis e permissões**: "cada perfil define que menus os utilizadores vêem e o que podem criar, editar, apagar ou exportar".

Perfis de sistema (não se apagam): **Super administrador** (acesso total, não configurável), **Administrador**, **Utilizador** (dado a quem se regista) e **Dependente** (dado às contas criadas na Família). Pode criar outros (ex.: "Gestor financeiro"), escolher o **Perfil por omissão** para os novos registos e apagar perfis sem utilizadores.

### A matriz de permissões

1. Escolha um perfil na lista.
2. A matriz tem uma linha por entrada do menu e uma coluna por acção:
   - **Ver** — a entrada aparece no menu e pode consultar;
   - **Criar**, **Editar**, **Apagar**;
   - **Exportar** (ex.: CSV dos relatórios, exportação de dados);
   - **Importar**.
3. Marque as acções e clique em **Guardar**. As entradas de uma secção **herdam** as acções marcadas na secção.

Sem uma acção, os botões correspondentes desaparecem e a API recusa o pedido ("O seu perfil não pode criar em …"). Com só **Ver**, a pessoa consulta mas não altera.

## Menus

Em **Administração › Menus** define as entradas do menu, que são também a unidade de permissão: **Nome**, **Código**, **Secção**, **Página** (caminho na aplicação), **Ícone**, **Ordem**, **Rotas da API** que a entrada protege (ex.: `/transactions/**`), **Proteger leituras** e **Activa** (inactiva, desaparece do menu e a API recusa-a a todos excepto ao super administrador). Pode reordenar as entradas.

## Parâmetros e moedas

Em **Administração › Parâmetros** ("valores que mudam o comportamento da aplicação para todos, sem alterar código"):
- **Aplicação** (nome, subtítulo, email de suporte), **Autenticação** (permitir registo, tamanho mínimo da palavra-passe, duração da sessão), **Região e moeda** (moeda por omissão), **Listagens** (itens por página), **Alertas** (valores iniciais), **Emails** (ligar/desligar), **Família** (ligar, máximo de dependentes, perfil dos dependentes), **Assistente** (ligado, modelo, esforço, mensagens por dia, boas-vindas) e **Ajuda** (mostrar perguntas frequentes).
- **Moedas**: crie moedas (código, nome, símbolo, casas decimais, ordem) e active/desactive-as. Uma moeda em uso ou a moeda por omissão não se apaga — desactive-a (quem já a usa mantém-na).

## Manual e FAQ

Em **Administração › Manual e FAQ** edita este manual e as perguntas frequentes (em Markdown): criar, editar, **publicar/retirar**, reordenar e apagar. Só o conteúdo publicado aparece na Ajuda, na pesquisa e no Assistente.

> Para esconder um artigo, prefira **retirá-lo** (despublicar) em vez de o apagar: os artigos de origem voltam a ser criados quando o sistema é actualizado.

## Auditoria

Em **Administração › Auditoria** ("entradas na aplicação, alterações e acessos recusados"): quem fez o quê e quando — entradas e tentativas falhadas, criações, edições, remoções, exportações e acessos recusados, com a funcionalidade, quem agia por quem, IP, navegador, duração e os **dados enviados** (palavras-passe e tokens aparecem mascarados como `***`). Filtre por utilizador, acção, datas (**Desde**/até) ou pesquise por utilizador ou caminho.
