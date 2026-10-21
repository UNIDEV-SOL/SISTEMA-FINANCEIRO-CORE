import type { BudgetGroup, CategoryKind } from "../../generated/prisma";

/** Categorias criadas para cada utilizador novo (as mesmas do seed do front). */
export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind; icon: string; color: string; group?: BudgetGroup }[] = [
  { name: "Salário", kind: "INCOME", icon: "briefcase", color: "#059669" },
  { name: "Negócios extra", kind: "INCOME", icon: "trending", color: "#0d9488" },
  { name: "Outros rendimentos", kind: "INCOME", icon: "banknote", color: "#65a30d" },
  { name: "Supermercado", kind: "EXPENSE", icon: "basket", color: "#ea580c", group: "NEEDS" },
  { name: "Pão e mercearia", kind: "EXPENSE", icon: "food", color: "#d97706", group: "NEEDS" },
  { name: "Renda e casa", kind: "EXPENSE", icon: "home", color: "#4f46e5", group: "NEEDS" },
  { name: "Energia e água", kind: "EXPENSE", icon: "energy", color: "#ca8a04", group: "NEEDS" },
  { name: "Internet e telemóvel", kind: "EXPENSE", icon: "wifi", color: "#0891b2", group: "NEEDS" },
  { name: "Transporte", kind: "EXPENSE", icon: "bus", color: "#2563eb", group: "NEEDS" },
  { name: "Saúde", kind: "EXPENSE", icon: "health", color: "#e11d48", group: "NEEDS" },
  { name: "Restaurantes e lanches", kind: "EXPENSE", icon: "food", color: "#db2777", group: "WANTS" },
  { name: "Roupa", kind: "EXPENSE", icon: "shirt", color: "#7c3aed", group: "WANTS" },
  { name: "Lazer e passeios", kind: "EXPENSE", icon: "party", color: "#c026d3", group: "WANTS" },
  { name: "Presentes", kind: "EXPENSE", icon: "gift", color: "#f43f5e", group: "WANTS" },
];

/** Linhas para createMany; um milissegundo por categoria mantém a ordem da lista. */
export const defaultCategoryRows = (now = Date.now()) =>
  DEFAULT_CATEGORIES.map((c, i) => ({ ...c, group: c.group ?? null, createdAt: new Date(now + i) }));
