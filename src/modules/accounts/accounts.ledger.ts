import { Prisma } from "../../generated/prisma";
import { prisma } from "../../shared/db/prisma";
import { fromIsoDate, type IsoDate } from "../../shared/lib/dates";
import { Decimal } from "../../shared/lib/money";

/**
 * Saldos das contas do utilizador: saldo inicial mais o efeito das transações liquidadas.
 * Receita soma, despesa subtrai; transferência subtrai na origem e soma no destino.
 * Pendentes não mexem no saldo.
 *
 * @param asOf Só conta transações até este dia, inclusive (saldo no fim do dia).
 */
export async function accountBalances(userId: string, asOf?: IsoDate): Promise<Map<string, Decimal>> {
  const dateFilter = asOf ? Prisma.sql`AND t."date" <= ${fromIsoDate(asOf)}::date` : Prisma.empty;

  const rows = await prisma.$queryRaw<{ id: string; balance: Prisma.Decimal | string }[]>`
    SELECT a."id",
           a."initialBalance" + COALESCE(SUM(
             CASE
               WHEN t."accountId" = a."id" AND t."type" = 'INCOME' THEN t."amount"
               WHEN t."accountId" = a."id" THEN -t."amount"
               WHEN t."destinationAccountId" = a."id" THEN t."amount"
               ELSE 0
             END
           ), 0) AS "balance"
    FROM "accounts" a
    LEFT JOIN "transactions" t
      ON t."status" = 'CLEARED'
     AND (t."accountId" = a."id" OR t."destinationAccountId" = a."id")
     ${dateFilter}
    WHERE a."userId" = ${userId}::uuid
    GROUP BY a."id"`;

  return new Map(rows.map((r) => [r.id, new Decimal(r.balance.toString())]));
}
