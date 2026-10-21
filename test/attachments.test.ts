import { currentYear } from "../src/shared/lib/dates";
import { addTransaction, api, auditRows, setSetting, setup } from "./helpers";

const Y = currentYear();
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

async function expense(auth: Record<string, string>, bank: { id: string }, cat: (n: string) => string) {
  return addTransaction(auth, { type: "EXPENSE", description: "Farmácia", amount: "350", date: `${Y}-01-15`, accountId: bank.id, categoryId: cat("Saúde") });
}

describe("comprovativos", () => {
  it("guarda o SMS e um PDF, conta-os na transação, abre-os e retira-os", async () => {
    const { auth, bank, cat } = await setup();
    const t = await expense(auth, bank, cat);
    const base = `/api/v1/transactions/${t.id}/attachments`;

    const sms = await api().post(base).set(auth).send({ text: "Confirmado ABC123. Pagaste 350.00MT a FARMACIA." }).expect(201);
    expect(sms.body).toMatchObject({ kind: "MESSAGE", name: "Mensagem de confirmação", text: "Confirmado ABC123. Pagaste 350.00MT a FARMACIA." });
    const pdf = await api().post(base).set(auth).set("Content-Type", "application/pdf").set("X-File-Name", encodeURIComponent("Recibo farmácia.pdf")).send(PDF).expect(201);
    expect(pdf.body).toMatchObject({ kind: "FILE", name: "Recibo farmácia.pdf", mimeType: "application/pdf", size: PDF.length });
    expect(pdf.body).not.toHaveProperty("data");

    const list = (await api().get(`/api/v1/transactions?month=${Y}-01`).set(auth).expect(200)).body.content;
    expect(list[0].attachments).toBe(2);
    expect((await api().get(base).set(auth).expect(200)).body.map((a: { kind: string }) => a.kind)).toEqual(["MESSAGE", "FILE"]);

    const file = await api().get(`${base}/${pdf.body.id}/file`).set(auth).buffer(true).expect(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.headers["content-disposition"]).toContain(encodeURIComponent("Recibo farmácia.pdf"));
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
    const text = await api().get(`${base}/${sms.body.id}/file`).set(auth).expect(200);
    expect(text.text).toContain("Confirmado ABC123");

    await api().delete(`${base}/${sms.body.id}`).set(auth).expect(204);
    expect((await api().get(base).set(auth).expect(200)).body).toHaveLength(1);

    // A auditoria guarda o tamanho, não o conteúdo
    const rows = (await auditRows()).filter((r) => r.path?.includes("/attachments"));
    expect(JSON.stringify(rows)).not.toContain("FARMACIA");
  });

  it("valida tipo, tamanho, limite e dono; anos fechados não mudam", async () => {
    const { auth, bank, cat } = await setup();
    const other = await setup();
    const t = await expense(auth, bank, cat);
    const base = `/api/v1/transactions/${t.id}/attachments`;

    await api().post(base).set(auth).set("Content-Type", "text/csv").send("a,b").expect(400);
    await setSetting("attachments.maxFileMb", 1);
    const big = await api().post(base).set(auth).set("Content-Type", "image/png").send(Buffer.alloc(1024 * 1024 + 1)).expect(422);
    expect(big.body.errors).toEqual([{ field: "file", message: "O ficheiro tem mais de 1 MB." }]);
    await setSetting("attachments.maxPerTransaction", 1);
    await api().post(base).set(auth).send({ text: "Primeira" }).expect(201);
    await api().post(base).set(auth).send({ text: "Segunda" }).expect(409);
    await api().get(base).set(other.auth).expect(404);
  });

  it("a importação guarda o SMS como comprovativo e devolve os ids; o SMS colado no formulário não entra duas vezes", async () => {
    const { auth, bank, cat } = await setup();
    const { body } = await api()
      .post("/api/v1/transactions/import")
      .set(auth)
      .send({
        items: [
          { importRef: "MPESA:Z1", type: "EXPENSE", description: "Pão", amount: "100", date: `${Y}-01-10`, accountId: bank.id, categoryId: cat("Pão e mercearia"), message: "Confirmado Z1. Pagaste 100.00MT." },
        ],
      })
      .expect(201);
    expect(body).toMatchObject({ created: 1, transactions: { "MPESA:Z1": expect.any(String) } });
    const attachments = (await api().get(`/api/v1/transactions/${body.transactions["MPESA:Z1"]}/attachments`).set(auth).expect(200)).body;
    expect(attachments).toEqual([expect.objectContaining({ kind: "MESSAGE", text: "Confirmado Z1. Pagaste 100.00MT." })]);

    const again = await api()
      .post("/api/v1/transactions")
      .set(auth)
      .send({ type: "EXPENSE", description: "Pão", amount: "100", date: `${Y}-01-10`, accountId: bank.id, categoryId: cat("Pão e mercearia"), importRef: "MPESA:Z1" })
      .expect(409);
    expect(again.body.detail).toBe("Esta mensagem já foi registada.");
  });
});

describe("comprovativos — arquivo", () => {
  it("lista os de todas as transações, com pesquisa e tipo; só os próprios", async () => {
    const { auth, bank, cat } = await setup();
    const other = await setup();
    const salary = await addTransaction(auth, { type: "INCOME", description: "Salário setembro", amount: "15000", date: `${Y}-01-28`, accountId: bank.id, categoryId: cat("Salário") });
    const pharmacy = await expense(auth, bank, cat);
    await api().post(`/api/v1/transactions/${salary.id}/attachments`).set(auth).set("Content-Type", "application/pdf").set("X-File-Name", "nota.pdf").send(PDF).expect(201);
    await api().post(`/api/v1/transactions/${pharmacy.id}/attachments`).set(auth).send({ text: "Confirmado Q1. Pagaste 350.00MT a FARMACIA CENTRAL." }).expect(201);

    const all = (await api().get("/api/v1/transactions/attachments").set(auth).expect(200)).body;
    expect(all.content.map((a: { name: string; transaction: { description: string } }) => [a.name, a.transaction.description])).toEqual([
      ["nota.pdf", "Salário setembro"],
      ["Mensagem de confirmação", "Farmácia"],
    ]);
    expect(all.content[0].transaction).toMatchObject({ amount: "15000.00", date: `${Y}-01-28`, type: "INCOME" });

    expect((await api().get("/api/v1/transactions/attachments?search=farmacia%20central").set(auth).expect(200)).body.totalItems).toBe(1);
    expect((await api().get("/api/v1/transactions/attachments?search=salário").set(auth).expect(200)).body.totalItems).toBe(1);
    expect((await api().get("/api/v1/transactions/attachments?kind=FILE").set(auth).expect(200)).body.content).toHaveLength(1);
    expect((await api().get("/api/v1/transactions/attachments").set(other.auth).expect(200)).body.totalItems).toBe(0);
  });
});
