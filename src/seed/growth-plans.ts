import { prisma } from "../shared/db/prisma";

/**
 * Tipos de plano iniciais do módulo Crescer. Só se criam os que faltam (pelo `code`):
 * nomes, rendimentos, prazos e dicas alteram-se depois na administração.
 */
export const GROWTH_PLAN_TYPES = [
  {
    code: "EMERGENCY_FUND",
    name: "Fundo de emergência",
    description: "Uma reserva para imprevistos: doença, avaria, perda de rendimento.",
    icon: "shield",
    color: "#0d9488",
    annualReturn: 0,
    defaultMonths: 12,
    tips: "- Guarde-o numa conta separada, fácil de movimentar mas fora do dia-a-dia.\n- Comece por um mês de despesas e vá aumentando.\n- Só use para emergências reais; depois de usar, volte a repor.",
  },
  {
    code: "CAR",
    name: "Comprar um carro",
    description: "Juntar a entrada ou o valor total de um carro, sem depender de crédito caro.",
    icon: "car",
    color: "#2563eb",
    annualReturn: 0,
    defaultMonths: 24,
    tips: "- Some ao preço o seguro, a inspecção, a manutenção e o combustível de um ano.\n- Uma entrada maior reduz os juros do crédito.\n- Compare carros usados com poucos anos: perdem menos valor.",
  },
  {
    code: "HOUSE",
    name: "Construir ou comprar casa",
    description: "Terreno, construção por fases ou entrada para a compra de uma casa.",
    icon: "house",
    color: "#9333ea",
    annualReturn: 0,
    defaultMonths: 60,
    tips: "- Construir por fases (fundação, paredes, cobertura) permite pagar sem dívidas.\n- Peça três orçamentos de materiais e mão-de-obra.\n- Confirme a documentação do terreno antes de investir.",
  },
  {
    code: "BUSINESS",
    name: "Abrir um negócio",
    description: "O capital inicial para começar ou fazer crescer uma actividade própria.",
    icon: "briefcase",
    color: "#ea580c",
    annualReturn: 0,
    defaultMonths: 18,
    tips: "- Comece pequeno e teste se há clientes antes de investir tudo.\n- Inclua no valor três meses de despesas do negócio.\n- Separe sempre o dinheiro do negócio do dinheiro pessoal.",
  },
  {
    code: "INVEST",
    name: "Investir",
    description: "Pôr a poupança a render: depósitos a prazo, obrigações do tesouro, fundos.",
    icon: "trending-up",
    color: "#16a34a",
    annualReturn: 10,
    defaultMonths: 60,
    tips: "- Invista só depois de ter o fundo de emergência.\n- O rendimento indicado é uma referência: confirme as taxas actuais no seu banco.\n- Diversifique e prefira produtos que entende.",
  },
  {
    code: "EDUCATION",
    name: "Estudos e formação",
    description: "Propinas, cursos e formação, seus ou da família.",
    icon: "graduation-cap",
    color: "#db2777",
    annualReturn: 0,
    defaultMonths: 24,
    tips: "- Conte com propinas, material, transporte e alimentação.\n- Procure bolsas e descontos de pagamento anual.",
  },
];

export async function seedGrowthPlans() {
  await prisma.growthPlanType.createMany({
    data: GROWTH_PLAN_TYPES.map((t, i) => ({ ...t, order: i + 1 })),
    skipDuplicates: true,
  });
}
