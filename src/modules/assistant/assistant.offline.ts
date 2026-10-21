import { prisma } from "../../shared/db/prisma";
import { bestSection, tokenize } from "../help/help.search";
import { articleHref, helpService } from "../help/help.service";

/** Pontuação mínima para considerar que o manual responde à pergunta. */
const MIN_SCORE = 2;

/** Perguntas sobre os números da pessoa: sem IA não se consultam os dados, aponta-se o ecrã certo. */
const DATA_QUESTION = /\b(quanto|gastei|gasto|ganhei|recebi|poupei|saldo|tenho|devo|sobra|resta)\b/i;
const DATA_NOTE =
  "Não consulto os seus números, mas encontra-os na aplicação: o **[Dashboard](/)** mostra o mês (receitas, despesas, saldo e onde gastou), " +
  "os **[Orçamentos](/orcamentos)** quanto ainda pode gastar e os **[Relatórios](/relatorios)** o ano inteiro.";

/**
 * Resposta sem IA (sem ANTHROPIC_API_KEY): a melhor FAQ ou a secção mais relevante
 * do melhor artigo, mais ligações para outros artigos. Determinística e sem custos.
 */
export async function offlineAnswer(question: string): Promise<string> {
  const tokens = tokenize(question);
  const { items } = await helpService.search(question, 6);
  const relevant = items.filter((i) => i.score >= MIN_SCORE);

  if (!relevant.length) {
    const articles = await helpService.publishedArticles();
    const topics = articles
      .slice(0, 8)
      .map((a) => `- [${a.title}](${articleHref(a.slug)})`)
      .join("\n");
    return [
      DATA_QUESTION.test(question) ? DATA_NOTE : "",
      "Não encontrei nada no manual sobre isso.",
      "Experimente reformular a pergunta com palavras como *transação*, *orçamento*, *meta* ou *conta*, ou veja um destes temas:",
      topics,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const best = relevant[0];
  const parts: string[] = DATA_QUESTION.test(question) ? [DATA_NOTE] : [];
  let shownArticle: string | undefined;

  if (best.kind === "faq") {
    const faq = await prisma.faq.findUniqueOrThrow({ where: { id: best.id } });
    parts.push(`**${faq.question}**`, faq.answer);
  } else {
    const article = await prisma.helpArticle.findUniqueOrThrow({ where: { id: best.id } });
    shownArticle = article.slug;
    const section = bestSection(article.content, tokens);
    parts.push(`Encontrei isto no manual, em **[${article.title}](${articleHref(article.slug)})**:`);
    if (section) {
      if (section.heading) parts.push(`### ${section.heading}`);
      parts.push(section.body.length > 1800 ? `${section.body.slice(0, 1800).replace(/\s+\S*$/, "")}…` : section.body);
    } else {
      parts.push(article.summary);
    }
  }

  const links = relevant
    .filter((i) => i.kind === "article" && i.slug !== shownArticle)
    .slice(0, 3)
    .map((i) => `[${i.title}](${i.href})`);
  if (shownArticle === undefined && best.kind === "faq" && !links.length) {
    // Uma FAQ sem artigo relacionado: sugere o artigo mais próximo, se existir
    const article = items.find((i) => i.kind === "article");
    if (article) links.push(`[${article.title}](${article.href})`);
  }
  if (links.length) parts.push(`Veja também: ${links.join(" · ")}`);
  return parts.join("\n\n");
}

/** Divide o texto em pedaços pequenos (palavras com o espaço), para o SSE parecer escrito. */
export function chunksOf(text: string, wordsPerChunk = 4): string[] {
  const words = text.split(/(?<=\s)/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) chunks.push(words.slice(i, i + wordsPerChunk).join(""));
  return chunks;
}
