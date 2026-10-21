import { loadFaqs, loadManual, seedHelpContent } from "../src/seed/help-content";
import { prisma } from "../src/shared/db/prisma";
import { api, setSetting, signUp, signUpAs } from "./helpers";

const article = (overrides: Record<string, unknown> = {}) => ({
  title: "Guia de câmbios",
  summary: "Como ver valores noutra moeda.",
  content: "## Moedas\n\nA moeda escolhida só muda a apresentação dos valores.",
  category: "Teste",
  ...overrides,
});

describe("ajuda — manual e FAQ", () => {
  it("o seed cria o manual e as FAQ, é idempotente e não sobrescreve edições", async () => {
    const manual = loadManual();
    const faqs = loadFaqs();
    expect(manual.length).toBeGreaterThanOrEqual(14);
    expect(faqs.length).toBeGreaterThanOrEqual(15);
    expect(await prisma.helpArticle.count()).toBe(manual.length);
    expect(await prisma.faq.count()).toBe(faqs.length);

    await prisma.helpArticle.update({ where: { slug: "orcamentos" }, data: { title: "Orçamentos (editado)" } });
    await prisma.faq.updateMany({ where: { seedKey: "faq/regra-50-30-20" }, data: { question: "Editada?" } });
    await seedHelpContent();
    expect(await prisma.helpArticle.count()).toBe(manual.length);
    expect(await prisma.faq.count()).toBe(faqs.length);
    expect((await prisma.helpArticle.findUniqueOrThrow({ where: { slug: "orcamentos" } })).title).toBe("Orçamentos (editado)");
    expect(await prisma.faq.count({ where: { question: "Editada?" } })).toBe(1);
  });

  it("o utilizador lê o índice, os artigos e as FAQ publicados", async () => {
    const { auth } = await signUp();
    const index = (await api().get("/api/v1/help/articles").set(auth).expect(200)).body;
    expect(index[0]).toEqual({ id: expect.any(String), slug: "ajuda", title: "Como usar a Ajuda", summary: expect.any(String), category: "Começar", order: 5 });
    expect(index.map((a: { slug: string }) => a.slug)).toEqual(expect.arrayContaining(["primeiros-passos", "orcamentos", "familia", "administracao"]));
    expect(index[0]).not.toHaveProperty("content");

    const full = (await api().get("/api/v1/help/articles/orcamentos").set(auth).expect(200)).body;
    expect(full).toMatchObject({ slug: "orcamentos", title: "Orçamentos", published: true });
    expect(full.content).toContain("média");
    await api().get("/api/v1/help/articles/nao-existe").set(auth).expect(404);

    const faqs = (await api().get("/api/v1/help/faqs").set(auth).expect(200)).body;
    expect(faqs.length).toBeGreaterThanOrEqual(15);
    expect(faqs[0]).toMatchObject({ question: expect.any(String), answer: expect.any(String), category: expect.any(String), published: true });

    await setSetting("help.showFaq", false);
    expect((await api().get("/api/v1/help/faqs").set(auth).expect(200)).body).toEqual([]);
  });

  it("não publicados ficam escondidos do utilizador e da pesquisa", async () => {
    const { auth } = await signUp();
    await prisma.helpArticle.update({ where: { slug: "metas" }, data: { published: false } });
    await prisma.faq.updateMany({ data: { published: false } });

    const index = (await api().get("/api/v1/help/articles").set(auth)).body;
    expect(index.map((a: { slug: string }) => a.slug)).not.toContain("metas");
    await api().get("/api/v1/help/articles/metas").set(auth).expect(404);
    expect((await api().get("/api/v1/help/faqs").set(auth)).body).toEqual([]);

    const search = (await api().get("/api/v1/help/search").query({ q: "reforçar meta" }).set(auth).expect(200)).body;
    expect(search.items.every((i: { kind: string; slug?: string }) => i.kind === "article" && i.slug !== "metas")).toBe(true);
  });

  it("pesquisa por palavras, sem acentos, ordenada por relevância", async () => {
    const { auth } = await signUp();
    const search = async (q: string) => (await api().get("/api/v1/help/search").query({ q }).set(auth).expect(200)).body;

    const budgets = await search("orçamento");
    expect(budgets.query).toBe("orçamento");
    expect(budgets.items[0]).toMatchObject({ kind: "article", slug: "orcamentos", title: "Orçamentos", href: "/ajuda/orcamentos" });
    expect(budgets.items[0].score).toBeGreaterThan(budgets.items.at(-1).score);

    // Sem acentos e no plural dá o mesmo primeiro resultado
    expect((await search("ORCAMENTOS")).items[0].slug).toBe("orcamentos");

    const archive = await search("como arquivar uma conta");
    expect(archive.items[0].slug).toBe("contas");
    expect(archive.items[0].snippet.toLowerCase()).toContain("arquiv");

    const faq = (await search("regra 50/30/20")).items.find((i: { kind: string }) => i.kind === "faq");
    expect(faq).toMatchObject({ title: "O que é a regra 50/30/20?", href: expect.stringMatching(/^\/ajuda#faq-/) });

    expect((await search("")).items).toEqual([]);
    expect((await search("xyzzy quasar")).items).toEqual([]);
    expect((await api().get("/api/v1/help/search").query({ q: "conta", limit: 2 }).set(auth)).body.items).toHaveLength(2);
  });

  it("as perguntas sugeridas no assistente levam ao artigo certo", async () => {
    const { auth } = await signUp();
    const first = async (q: string) => (await api().get("/api/v1/help/search").query({ q }).set(auth).expect(200)).body.items[0];
    const orcamento = await first("Como crio um orçamento?");
    expect(orcamento.slug === "orcamentos" || orcamento.category === "Orçamentos").toBe(true);
    expect((await first("Como defino uma meta com prazo?")).slug).toBe("metas");
    expect((await first("Como adiciono um dependente?")).slug).toBe("familia");
    const despesa = await first("Como registo uma despesa?");
    expect(despesa.slug === "transacoes" || despesa.kind === "faq").toBe(true);
  });

  it("USER não escreve no manual (403); ADMIN gere artigos e FAQ", async () => {
    const user = await signUp();
    await api().get("/api/v1/admin/help/articles").set(user.auth).expect(403);
    await api().post("/api/v1/admin/help/articles").set(user.auth).send(article()).expect(403);

    const admin = await signUpAs("ADMIN");
    const page = (await api().get("/api/v1/admin/help/articles").query({ size: 5 }).set(admin.auth).expect(200)).body;
    expect(page).toMatchObject({ page: 0, size: 5, hasNext: true, hasPrevious: false });
    expect(page.content[0].content).toEqual(expect.any(String));

    const created = (await api().post("/api/v1/admin/help/articles").set(admin.auth).send(article({ published: false })).expect(201)).body;
    expect(created).toMatchObject({ slug: "guia-de-cambios", published: false, category: "Teste" });
    expect(created.order).toBeGreaterThan(140);
    // Endereço repetido gera sufixo; pedido explícito repetido dá 422
    expect((await api().post("/api/v1/admin/help/articles").set(admin.auth).send(article()).expect(201)).body.slug).toBe("guia-de-cambios-2");
    const dup = await api().post("/api/v1/admin/help/articles").set(admin.auth).send(article({ slug: "orcamentos" })).expect(422);
    expect(dup.body.errors).toEqual([{ field: "slug", message: "Já existe um artigo com este endereço." }]);
    const invalid = await api().post("/api/v1/admin/help/articles").set(admin.auth).send({ title: "", content: "" }).expect(422);
    expect(invalid.body.errors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(["title", "summary", "content", "category"]));

    // Não publicado: o admin vê-o, o utilizador não
    const search = (await api().get("/api/v1/admin/help/articles").query({ search: "câmbios", published: false }).set(admin.auth)).body;
    expect(search.content.map((a: { id: string }) => a.id)).toEqual([created.id]);
    await api().get(`/api/v1/help/articles/${created.slug}`).set(user.auth).expect(404);

    const published = (await api().patch(`/api/v1/admin/help/articles/${created.id}/published`).set(admin.auth).send({ published: true }).expect(200)).body;
    expect(published.published).toBe(true);
    await api().get(`/api/v1/help/articles/${created.slug}`).set(user.auth).expect(200);

    const updated = (await api().put(`/api/v1/admin/help/articles/${created.id}`).set(admin.auth).send(article({ title: "Moedas", order: 1 })).expect(200)).body;
    expect(updated).toMatchObject({ title: "Moedas", slug: "guia-de-cambios", order: 1 });
    expect((await api().get("/api/v1/help/articles").set(user.auth)).body[0].id).toBe(created.id);

    const reordered = (await api().put("/api/v1/admin/help/articles/order").set(admin.auth).send({ items: [{ id: created.id, order: 999 }] }).expect(200)).body;
    expect(reordered.at(-1).id).toBe(created.id);

    await api().delete(`/api/v1/admin/help/articles/${created.id}`).set(admin.auth).expect(204);
    await api().get(`/api/v1/admin/help/articles/${created.id}`).set(admin.auth).expect(404);

    // FAQ
    await api().post("/api/v1/admin/help/faqs").set(user.auth).send({ question: "?", answer: "!", category: "X" }).expect(403);
    const faq = (await api().post("/api/v1/admin/help/faqs").set(admin.auth).send({ question: "Posso usar dólares?", answer: "Sim.", category: "Configurações" }).expect(201)).body;
    expect(faq).toMatchObject({ question: "Posso usar dólares?", published: true });
    const faqs = (await api().get("/api/v1/admin/help/faqs").query({ search: "dólares" }).set(admin.auth).expect(200)).body;
    expect(faqs.totalItems).toBe(1);
    await api().patch(`/api/v1/admin/help/faqs/${faq.id}/published`).set(admin.auth).send({ published: false }).expect(200);
    expect((await api().get("/api/v1/help/faqs").set(user.auth)).body.map((f: { id: string }) => f.id)).not.toContain(faq.id);
    await api().put(`/api/v1/admin/help/faqs/${faq.id}`).set(admin.auth).send({ question: "Posso usar euros?", answer: "Sim.", category: "Configurações" }).expect(200);
    await api().delete(`/api/v1/admin/help/faqs/${faq.id}`).set(admin.auth).expect(204);
  });
});
