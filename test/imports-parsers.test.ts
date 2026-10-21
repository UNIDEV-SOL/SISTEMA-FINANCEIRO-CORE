import { parseAmount, parseBimStatement, parseDate, parseMessages, parseTime, splitMessages } from "../src/modules/imports/imports.parsers";

// Amostras reais com nomes, números e contas trocados
const MPESA_DEPOSIT =
  "Confirmado ABC1DE2FGH3. Depositaste o valor de 1,000.00MT no agente 1-MINI MERCEARIA DO BAIRRO aos  14/10/26 as 9:28 PM. O teu novo saldo  M-Pesa e de 1,013.92MT. Aproveita e transfere SEM TAXAS de M-Pesa para M-Pesa. Em caso de duvida, liga 100.";
const EMOLA_TRANSFER =
  "ID da transacao PP260915.1418.a12345. Transferiste 210.00MT para conta 870000000, nome: JOAO ALBERTO MACUACUA as 14:18:46 de 15/09/2026. Taxa: 0.00MT. O saldo da tua conta e 297.00MT. Conteudo: 1. Em caso de duvida, liga 100. Obrigado!";
const BIM_CREDIT = "A conta 100200300 recebeu o valor de 15000.00 MZN as 16:56 do dia 28/09/26. Em  caso de duvida, ligue 8003500. Millennium bim";

describe("importação — valores, datas e horas", () => {
  it.each([
    ["1,000.00", "1000.00"],
    ["15000.00", "15000.00"],
    ["15000", "15000.00"],
    ["15.000,00", "15000.00"],
    ["1 250,5", "1250.50"],
    ["12,345", "12345.00"],
    ["1.500", "1500.00"],
    ["0.00", null],
    ["abc", null],
  ])("%s → %s", (raw, expected) => expect(parseAmount(raw)).toBe(expected));

  it("datas com ano curto ou longo, e datas impossíveis", () => {
    expect(parseDate("14/10/26")).toBe("2026-10-14");
    expect(parseDate("15/09/2026")).toBe("2026-09-15");
    expect(parseDate("28-09-2026")).toBe("2026-09-28");
    expect(parseDate("31/02/26")).toBeNull();
  });

  it("horas em 12h e 24h", () => {
    expect(parseTime("9:28", "PM")).toBe("21:28");
    expect(parseTime("12:05", "AM")).toBe("00:05");
    expect(parseTime("12:05", "PM")).toBe("12:05");
    expect(parseTime("14:18:46")).toBe("14:18");
  });
});

describe("importação — SMS", () => {
  it("separa mensagens coladas seguidas, com ou sem linha em branco", () => {
    expect(splitMessages(`${MPESA_DEPOSIT}\n\n${EMOLA_TRANSFER} ${BIM_CREDIT}`)).toHaveLength(3);
  });

  it("M-Pesa: depósito no agente", () => {
    expect(parseMessages(MPESA_DEPOSIT).items).toEqual([
      expect.objectContaining({
        source: "MPESA",
        kind: "DEPOSIT",
        reference: "MPESA:ABC1DE2FGH3",
        amount: "1000.00",
        date: "2026-10-14",
        time: "21:28",
        counterparty: "Mini Mercearia do Bairro",
        description: "Depósito M-Pesa · Mini Mercearia do Bairro",
        balance: "1013.92",
      }),
    ]);
  });

  it("e-Mola: transferência para outra pessoa, sem taxa", () => {
    const [item] = parseMessages(EMOLA_TRANSFER).items;
    expect(item).toMatchObject({
      source: "EMOLA",
      kind: "EXPENSE",
      reference: "EMOLA:PP260915.1418.a12345",
      amount: "210.00",
      date: "2026-09-15",
      time: "14:18",
      description: "Transferência para Joao Alberto Macuacua",
      balance: "297.00",
      notes: "Conteúdo: 1",
    });
  });

  it("BIM: crédito na conta", () => {
    expect(parseMessages(BIM_CREDIT).items).toEqual([
      expect.objectContaining({ source: "BIM", kind: "INCOME", amount: "15000.00", date: "2026-09-28", time: "16:56", reference: "BIM:100200300:2026-09-28:16:56:15000.00" }),
    ]);
  });

  it("outras mensagens do M-Pesa: recebido, levantamento e transferência com taxa", () => {
    const { items, unrecognized } = parseMessages(
      [
        "Confirmado QWE1RTY2UI. Recebeste 2,500.00MT de 258840000000 - MARIA JOSE aos 3/10/26 as 10:05 AM. O teu novo saldo M-Pesa e de 3,000.00MT.",
        "Confirmado ZXC9VBN8MN. Levantaste 500.00MT no agente 12345 - LOJA CENTRAL aos 4/10/26 as 6:40 PM. Taxa: 15.00MT. O teu novo saldo M-Pesa e de 2,485.00MT.",
        "Confirmado LKJ7HGF6DS. Transferiste 1,200.00MT e a taxa foi de 10.00MT para 258850000000 - ANTONIO SITOE aos 5/10/26 as 8:00 AM. O teu saldo M-Pesa e de 1,275.00MT.",
        "Olá! Ganhe pontos com a nossa promoção.",
      ].join("\n\n"),
    );
    expect(items.map((i) => [i.kind, i.amount, i.description])).toEqual([
      ["INCOME", "2500.00", "Recebido de Maria Jose"],
      ["WITHDRAWAL", "500.00", "Levantamento M-Pesa · Loja Central"],
      ["FEE", "15.00", "Taxa M-Pesa · Levantamento M-Pesa · Loja Central"],
      ["EXPENSE", "1200.00", "Transferência para Antonio Sitoe"],
      ["FEE", "10.00", "Taxa M-Pesa · Transferência para Antonio Sitoe"],
    ]);
    expect(items.filter((i) => i.kind === "FEE").map((i) => i.reference)).toEqual(["MPESA:ZXC9VBN8MN:TAXA", "MPESA:LKJ7HGF6DS:TAXA"]);
    expect(unrecognized).toEqual(["Olá! Ganhe pontos com a nossa promoção."]);
  });
});

describe("importação — nota de lançamento do BIM", () => {
  const lines = [
    "Nota de Lançamento",
    "Conta Dep. à Ordem Nr 100200300",
    "Moeda da conta MZN",
    "Operação: CREDITO DIVERSO",
    "Estado da Operação: Executada com sucesso",
    "Data Valor 28-09-2026",
    "Data da transacção 28-09-2026",
    "Montante 15000 MZN",
    "Tipo de transacção Crédito",
    "Descrição da transacção SALARIO SETEMBRO 2026",
    "Ref. 1",
  ];

  it("lê o crédito do salário", () => {
    expect(parseBimStatement(lines)).toMatchObject({
      source: "BIM",
      kind: "INCOME",
      amount: "15000.00",
      date: "2026-09-28",
      description: "Salario setembro 2026",
      reference: "BIM:100200300:2026-09-28:15000.00:1",
      notes: "Operação: CREDITO DIVERSO",
    });
  });

  it("débitos e documentos que não são notas de lançamento", () => {
    const debit = lines.map((l) => (l.startsWith("Tipo") ? "Tipo de transacção Débito" : l))
    expect(parseBimStatement(debit)?.kind).toBe("EXPENSE");
    expect(parseBimStatement(["Extrato de conta", "Montante 100 MZN"])).toBeNull();
  });
});
