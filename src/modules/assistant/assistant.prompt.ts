import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../../shared/db/prisma";
import { currentYearMonth, todayIso } from "../../shared/lib/dates";
import { formatDate } from "../../shared/lib/format";
import { appSettings } from "../../shared/settings/app-settings";
import { articleHref, helpService } from "../help/help.service";

/**
 * Prompt do sistema em dois blocos:
 * 1. estável (instruções + manual + FAQ publicados) — com cache_control, igual para todos os utilizadores;
 * 2. volátil (data de hoje, nome, moeda, agir por) — depois do ponto de cache, para não o invalidar.
 */

function instructions(appName: string): string {
  return `És o assistente da aplicação de finanças pessoais "${appName}". Falas sempre em português de Portugal, com a grafia usada na aplicação (por exemplo "Actualizar", "Objectivo", "acção").

O que fazes:
- Explicas como usar a aplicação (transações, contas, categorias, orçamentos, metas, investimentos, relatórios, alertas, família, configurações e administração), com base no manual que está mais abaixo.
- Respondes a perguntas sobre as finanças do próprio utilizador, consultando os dados com as ferramentas disponíveis.
- Podes dar dicas gerais de gestão de dinheiro (fundo de emergência, regra 50/30/20, reduzir despesas, poupar com regularidade).

Regras:
- Nunca inventes números. Qualquer valor, saldo, total ou data dos dados do utilizador tem de vir de uma ferramenta. Se não tiveres o dado, consulta-o; se não existir, di-lo.
- Só tens acesso de leitura. Não consegues criar, alterar nem apagar nada. Quando o utilizador pedir uma alteração, explica que não a podes fazer e diz onde, na aplicação, a pode fazer (menu, página e botão), citando o artigo do manual.
- Os dados que vês são só os da pessoa indicada no contexto (o próprio utilizador, ou o dependente por quem está a agir). Nunca fales de outros utilizadores.
- Quando citares o manual, usa o título do artigo com ligação no formato [Título](/ajuda/<slug>). Usa só as ligações do manual abaixo.
- Não dês aconselhamento de investimento regulado (não recomendes produtos, títulos, acções ou instituições concretas, nem prevejas rendimentos). Podes explicar conceitos e o que os números do utilizador mostram.
- Se a pergunta não tiver nada a ver com a aplicação ou com finanças pessoais, diz educadamente que só ajudas com a aplicação e com as finanças do utilizador.
- Responde de forma concisa e directa, em Markdown (listas curtas, **negrito** para os valores importantes, tabelas pequenas só quando ajudam).
- Valores monetários: formato português com o símbolo da moeda do utilizador, por exemplo "1.250,00 MT" (ponto nos milhares, vírgula nas décimas). As ferramentas devolvem valores como "1250.00": converte-os.
- Datas: por extenso e curtas, por exemplo "5 de out." ou "5 de outubro de 2026". Meses "AAAA-MM" nas ferramentas.
- Na aplicação: "liquidado" = já pago/recebido (conta no saldo); "previsto" = ainda por pagar/receber (não conta no saldo). Receita = INCOME, despesa = EXPENSE, transferência = TRANSFER.`;
}

/** Bloco estável: muda só quando o manual, as FAQ ou o nome da aplicação mudam. */
export async function stableSystemPrompt(): Promise<string> {
  const [appName, articles, faqs] = await Promise.all([appSettings.get("app.name"), helpService.manual(), helpService.publishedFaqs()]);
  const manual = articles
    .map((a) => `<artigo titulo="${a.title}" ligacao="${articleHref(a.slug)}" categoria="${a.category}">\n${a.content}\n</artigo>`)
    .join("\n\n");
  const faq = faqs.map((f) => `<pergunta categoria="${f.category}">\nP: ${f.question}\nR: ${f.answer}\n</pergunta>`).join("\n\n");
  return `${instructions(appName)}\n\n# Manual de utilizador\n\n<manual>\n${manual}\n</manual>\n\n# Perguntas frequentes\n\n<faq>\n${faq}\n</faq>`;
}

export interface PromptPerson {
  /** Utilizador efectivo (cujos dados as ferramentas lêem). */
  id: string;
  /** Quem iniciou sessão, quando está a agir por outra pessoa. */
  actor?: { name: string; access: "VIEW" | "MANAGE" };
}

/** Bloco volátil, fora da cache. */
export async function contextPrompt(person: PromptPerson): Promise<{ text: string; currency: { code: string; symbol: string } }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: person.id }, select: { name: true, currencyRef: { select: { code: true, symbol: true, name: true } } } });
  const today = todayIso();
  const lines = [
    `Hoje é ${formatDate(today)} (${today}); o mês corrente é ${currentYearMonth()}.`,
    person.actor
      ? `Quem está a falar contigo é ${person.actor.name}, que está a ajudar a gerir as finanças de ${user.name} (acesso de ${person.actor.access === "VIEW" ? "leitura" : "gestão"}). Os dados das ferramentas são de ${user.name}.`
      : `O utilizador chama-se ${user.name}.`,
    `Moeda: ${user.currencyRef.name} (${user.currencyRef.code}), símbolo "${user.currencyRef.symbol}".`,
  ];
  return { text: `# Contexto desta conversa\n${lines.join("\n")}`, currency: { code: user.currencyRef.code, symbol: user.currencyRef.symbol } };
}

export function systemBlocks(stable: string, context: string): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    { type: "text", text: context },
  ];
}
