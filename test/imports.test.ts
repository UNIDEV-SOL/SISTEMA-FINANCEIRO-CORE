import { prisma } from "../src/shared/db/prisma";
import { currentYear } from "../src/shared/lib/dates";
import { addTransaction, api, auditRows, setup } from "./helpers";

type Auth = Record<string, string>;

const Y = currentYear();
const yy = String(Y).slice(2);

const mpesaDeposit = (ref = "ABC1DE2FGH3", day = "14") =>
  `Confirmado ${ref}. Depositaste o valor de 1,000.00MT no agente 1-MINI MERCEARIA DO BAIRRO aos ${day}/03/${yy} as 9:28 PM. O teu novo saldo M-Pesa e de 1,013.92MT.`;
const emolaTransfer = `ID da transacao PP${yy}0315.1418.a12345. Transferiste 210.00MT para conta 870000000, nome: JOAO ALBERTO MACUACUA as 14:18:46 de 15/03/${Y}. Taxa: 0.00MT. O saldo da tua conta e 297.00MT.`;
const mpesaWithFee = `Confirmado ZXC9VBN8MN. Levantaste 500.00MT no agente 12345 - LOJA CENTRAL aos 16/03/${yy} as 6:40 PM. Taxa: 15.00MT. O teu novo saldo M-Pesa e de 485.00MT.`;
const bimCredit = `A conta 100200300 recebeu o valor de 15000.00 MZN as 16:56 do dia 25/03/${yy}. Millennium bim`;

/** PDF mínimo com uma linha de texto por entrada [x, y, texto], como o da nota de lançamento do BIM. */
function pdfWith(lines: [number, number, string][]): Buffer {
  const escape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = lines.map(([x, y, s]) => `BT /F1 10 Tf ${x} ${y} Td (${escape(s)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

const bimPdf = (amount = "15000") =>
  pdfWith([
    [24, 808, "Nota de Lançamento"],
    [24, 773, "Conta Dep. à Ordem Nr"],
    [155, 773, "100200300"],
    [26, 556, "Operação:"],
    [80, 556, "CREDITO DIVERSO"],
    [26, 445, "Data Valor"],
    [200, 445, `27-03-${Y}`],
    [26, 398, "Montante"],
    [200, 398, `${amount} MZN`],
    // O valor sai uns pontos acima da etiqueta, como no PDF verdadeiro
    [200, 378, "Crédito"],
    [26, 374, "Tipo de transacção"],
    [200, 355, `SALARIO MARCO ${Y}`],
    [26, 351, "Descrição da transacção"],
    [200, 332, "7"],
    [26, 328, "Ref."],
  ]);

async function wallets(auth: Auth) {
  const create = async (body: Record<string, unknown>) => (await api().post("/api/v1/accounts").set(auth).send({ color: "#dc2626", includeInTotal: true, initialBalance: "0", ...body }).expect(201)).body;
  const mpesa = await create({ name: "M-Pesa", type: "MOBILE_WALLET", institution: "Vodacom" });
  const emola = await create({ name: "Carteira e-Mola", type: "MOBILE_WALLET" });
  const cash = await create({ name: "Dinheiro", type: "CASH" });
  return { mpesa, emola, cash };
}

const preview = (auth: Auth, text: string) => api().post("/api/v1/transactions/import/preview").set(auth).send({ text });

describe("importação — pré-visualização", () => {
  it("lê os SMS, sugere contas e categorias e não grava nada", async () => {
    const { auth, cat } = await setup();
    const { mpesa, emola, cash } = await wallets(auth);
    const before = await prisma.transaction.count();

    const { body } = await preview(auth, [mpesaDeposit(), emolaTransfer, mpesaWithFee, bimCredit, "Promoção: ganhe pontos!"].join("\n\n")).expect(200);
    expect(body.accounts).toEqual({ MPESA: mpesa.id, EMOLA: emola.id, CASH: cash.id });
    expect(body.unrecognized).toEqual(["Promoção: ganhe pontos!"]);
    expect(body.items.map((i: { kind: string; type: string; amount: string; date: string; status: string }) => [i.kind, i.type, i.amount, i.date, i.status])).toEqual([
      ["INCOME", "INCOME", "15000.00", `${Y}-03-25`, "NEW"],
      ["WITHDRAWAL", "TRANSFER", "500.00", `${Y}-03-16`, "NEW"],
      ["FEE", "EXPENSE", "15.00", `${Y}-03-16`, "NEW"],
      ["EXPENSE", "EXPENSE", "210.00", `${Y}-03-15`, "NEW"],
      ["DEPOSIT", "TRANSFER", "1000.00", `${Y}-03-14`, "NEW"],
    ]);
    expect(await prisma.transaction.count()).toBe(before);
    // Sem histórico, não há categoria para uma transferência para uma pessoa
    expect(body.items.find((i: { kind: string }) => i.kind === "EXPENSE").categoryId).toBeUndefined();
    expect(cat("Salário")).toBeDefined();
  });

  it("aprende a categoria com transações iguais e reconhece-a pelo nome", async () => {
    const { auth, bank, cat } = await setup();
    await addTransaction(auth, { type: "EXPENSE", description: "Transferência para Joao Alberto Macuacua", amount: "50", date: `${Y}-02-01`, accountId: bank.id, categoryId: cat("Presentes") });
    const { body } = await preview(auth, emolaTransfer).expect(200);
    expect(body.items[0].categoryId).toBe(cat("Presentes"));

    const pdf = await api().post("/api/v1/transactions/import/pdf").set(auth).set("Content-Type", "application/pdf").send(bimPdf()).expect(200);
    expect(pdf.body.items[0]).toMatchObject({ source: "BIM", type: "INCOME", amount: "15000.00", date: `${Y}-03-27`, description: `Salario marco ${Y}`, categoryId: cat("Salário") });
  });

  it("marca as já importadas e as que parecem já registadas à mão", async () => {
    const { auth, bank, cat } = await setup();
    const { mpesa, cash } = await wallets(auth);
    const manual = await addTransaction(auth, { type: "INCOME", description: "Salário", amount: "15000", date: `${Y}-03-26`, accountId: bank.id, categoryId: cat("Salário") });
    await api()
      .post("/api/v1/transactions/import")
      .set(auth)
      .send({ items: [{ importRef: "MPESA:ABC1DE2FGH3", type: "TRANSFER", description: "Depósito", amount: "1000", date: `${Y}-03-14`, accountId: cash.id, destinationAccountId: mpesa.id }] })
      .expect(201);

    const { body } = await preview(auth, `${mpesaDeposit()}\n\n${mpesaDeposit()}\n\n${bimCredit}`).expect(200);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ status: "POSSIBLE_DUPLICATE", match: { id: manual.id, description: "Salário", date: `${Y}-03-26`, amount: "15000.00" } });
    expect(body.items[1]).toMatchObject({ reference: "MPESA:ABC1DE2FGH3", status: "DUPLICATE" });
  });

  it("valida o texto e o PDF", async () => {
    const { auth } = await setup();
    const empty = await preview(auth, "   ").expect(422);
    expect(empty.body.errors).toEqual([{ field: "text", message: "Cole as mensagens." }]);
    await api().post("/api/v1/transactions/import/pdf").set(auth).set("Content-Type", "application/pdf").send(Buffer.from("não é um pdf")).expect(400);
    const other = await api().post("/api/v1/transactions/import/pdf").set(auth).set("Content-Type", "application/pdf").send(pdfWith([[24, 800, "Extrato de conta"]])).expect(400);
    expect(other.body.detail).toBe("Este PDF não foi reconhecido. Por agora lê as notas de lançamento do BIM.");
  });
});

describe("importação — contas e saldos", () => {
  it("propõe as contas que faltam, com o número da conta do BIM, e o saldo da mensagem mais recente", async () => {
    const { auth } = await setup();
    const { body } = await preview(auth, [mpesaDeposit("AAA1111111", "10"), mpesaDeposit("BBB2222222", "12"), bimCredit].join("\n\n")).expect(200);
    // O setup cria uma conta "Banco" sem número nem instituição: não é a do BIM
    expect(body.accounts).toEqual({});
    expect(body.newAccounts).toEqual([
      { origin: "MPESA", name: "M-Pesa", type: "MOBILE_WALLET", institution: "Vodacom", color: "#dc2626" },
      { origin: "BIM", name: "Millennium bim 100200300", type: "BANK", institution: "Millennium bim", number: "100200300", color: "#db2777" },
      { origin: "CASH", name: "Dinheiro", type: "CASH", color: "#16a34a" },
    ]);
    expect(body.balances).toEqual([{ source: "MPESA", balance: "1013.92", date: `${Y}-03-12`, time: "21:28" }]);
  });

  it("reconhece a conta do BIM pelo número, mesmo com outro nome", async () => {
    const { auth } = await setup();
    const other = (await api().post("/api/v1/accounts").set(auth).send({ name: "Outro banco", type: "BANK", color: "#2563eb", number: "999", institution: "BIM" }).expect(201)).body;
    const salary = (await api().post("/api/v1/accounts").set(auth).send({ name: "Ordenado", type: "BANK", color: "#2563eb", number: "100 200 300" }).expect(201)).body;
    expect(salary.number).toBe("100 200 300");
    const { body } = await preview(auth, bimCredit).expect(200);
    expect(body.accounts.BIM).toBe(salary.id);
    expect(body.accounts.BIM).not.toBe(other.id);
    expect(body.newAccounts).toEqual([]);
  });

  it("depois de importar, compara o saldo da mensagem com o da aplicação nesse dia", async () => {
    const { auth } = await setup();
    const { mpesa, cash } = await wallets(auth);
    const { body } = await api()
      .post("/api/v1/transactions/import")
      .set(auth)
      .send({
        items: [{ importRef: "MPESA:R1", type: "TRANSFER", description: "Depósito", amount: "1000", date: `${Y}-03-14`, accountId: cash.id, destinationAccountId: mpesa.id }],
        balances: [{ accountId: mpesa.id, balance: "1013.92", date: `${Y}-03-14` }],
      })
      .expect(201);
    expect(body.differences).toEqual([{ accountId: mpesa.id, date: `${Y}-03-14`, reported: "1013.92", actual: "1000.00", difference: "13.92" }]);

    // Com o saldo inicial acertado, já não há diferença
    await api().put(`/api/v1/accounts/${mpesa.id}`).set(auth).send({ name: "M-Pesa", type: "MOBILE_WALLET", color: "#dc2626", initialBalance: "13.92" }).expect(200);
    const again = await api()
      .post("/api/v1/transactions/import")
      .set(auth)
      .send({ items: [{ importRef: "MPESA:R1", type: "TRANSFER", description: "Depósito", amount: "1000", date: `${Y}-03-14`, accountId: cash.id, destinationAccountId: mpesa.id }], balances: [{ accountId: mpesa.id, balance: "1013.92", date: `${Y}-03-14` }] })
      .expect(201);
    expect(again.body).toEqual({ created: 0, skipped: 1, differences: [], transactions: {} });
  });
});

describe("importação — gravar", () => {
  it("grava tudo ou nada, com erros por item; repetir não duplica", async () => {
    const { auth, bank, cat } = await setup();
    const { mpesa, cash } = await wallets(auth);
    const items: Record<string, unknown>[] = [
      { importRef: "BIM:1", type: "INCOME", description: "Salario marco", amount: "15000.00", date: `${Y}-03-27`, accountId: bank.id, categoryId: cat("Salário") },
      { importRef: "MPESA:X1", type: "TRANSFER", description: "Depósito M-Pesa", amount: "1000.00", date: `${Y}-03-14`, accountId: cash.id, destinationAccountId: mpesa.id, notes: "Agente" },
      { importRef: "MPESA:X1:TAXA", type: "EXPENSE", description: "Taxa M-Pesa", amount: "15.00", date: `${Y}-03-14`, accountId: mpesa.id },
    ];

    const invalid = await api().post("/api/v1/transactions/import").set(auth).send({ items }).expect(422);
    expect(invalid.body.errors).toEqual([{ field: "items.2.categoryId", message: "Escolha uma categoria." }]);
    expect(await prisma.transaction.count({ where: { importRef: { not: null } } })).toBe(0);

    items[2] = { ...items[2], categoryId: cat("Transporte") };
    const ok = await api().post("/api/v1/transactions/import").set(auth).send({ items }).expect(201);
    expect(ok.body).toEqual({ created: 3, skipped: 0, differences: [], transactions: { "BIM:1": expect.any(String), "MPESA:X1": expect.any(String), "MPESA:X1:TAXA": expect.any(String) } });
    const again = await api().post("/api/v1/transactions/import").set(auth).send({ items }).expect(201);
    expect(again.body).toEqual({ created: 0, skipped: 3, differences: [], transactions: {} });

    const saved = await prisma.transaction.findMany({ where: { importRef: { not: null } }, orderBy: { amount: "desc" } });
    expect(saved.map((t) => [t.importRef, t.type, t.status, t.amount.toFixed(2)])).toEqual([
      ["BIM:1", "INCOME", "CLEARED", "15000.00"],
      ["MPESA:X1", "TRANSFER", "CLEARED", "1000.00"],
      ["MPESA:X1:TAXA", "EXPENSE", "CLEARED", "15.00"],
    ]);
  });

  it("anos fechados, limites e acção IMPORT; a auditoria não guarda o conteúdo", async () => {
    const { auth, bank, cat, user } = await setup();
    const item = { importRef: "BIM:2", type: "INCOME", description: "Antigo", amount: "10", date: `${Y - 1}-12-30`, accountId: bank.id, categoryId: cat("Salário") };
    const closed = await api().post("/api/v1/transactions/import").set(auth).send({ items: [item] }).expect(422);
    expect(closed.body.errors).toEqual([{ field: "items.0.date", message: `O ano ${Y - 1} ainda não está aberto: pode consultar, mas não alterar.` }]);

    await api().post("/api/v1/transactions/import").set(auth).send({ items: [] }).expect(422);
    await preview(auth, mpesaDeposit()).expect(200);
    const rows = (await auditRows()).filter((r) => r.path?.startsWith("/transactions/import"));
    expect(rows.map((r) => [r.action, r.details])).toEqual(
      expect.arrayContaining([["IMPORT", { characters: mpesaDeposit().length }]]),
    );
    expect(JSON.stringify(rows)).not.toContain("MERCEARIA");

    const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { profileId: true } });
    const functionality = await prisma.functionality.findUniqueOrThrow({ where: { code: "TRANSACTIONS" } });
    await prisma.profileFunctionality.update({
      where: { profileId_functionalityId: { profileId: profile.profileId, functionalityId: functionality.id } },
      data: { actions: ["VIEW", "CREATE", "EDIT", "DELETE"] },
    });
    const { accessPolicy } = await import("../src/shared/access/policy");
    accessPolicy.invalidate();
    await preview(auth, mpesaDeposit()).expect(403);
  });
});
