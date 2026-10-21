import { documentPath } from "../../shared/docs/registry";
import { idParamSchema } from "../../shared/http/schemas";
import { dependentCreateSchema, familyLinkSchema, familyOverviewSchema, invitationCreateSchema, linkAccessSchema } from "./family.schemas";

const tag = "Família";

documentPath({
  method: "get",
  path: "/family",
  tag,
  summary: "Ligações familiares do utilizador",
  description:
    "Para agir por um dependente, envie `X-Acting-As: <person.id>` nos pedidos às rotas pessoais. Com acesso VIEW, as escritas dão 403. " +
    "As rotas /admin, /family, /auth e /access ignoram o cabeçalho.",
  response: { schema: familyOverviewSchema },
});

documentPath({
  method: "post",
  path: "/family/dependents",
  tag,
  summary: "Cria a conta de um dependente, já ligada",
  description: "A conta fica com o perfil `family.dependentProfile`. 409 ao atingir `family.maxDependents`; 403 com `family.enabled` desligado.",
  body: dependentCreateSchema(8),
  response: { status: 201, schema: familyLinkSchema },
});

documentPath({
  method: "post",
  path: "/family/invitations",
  tag,
  summary: "Convida uma conta existente",
  description: "422 no campo `email` se não existir, for o próprio ou já estiver ligado. Fica PENDING até a pessoa aceitar.",
  body: invitationCreateSchema,
  response: { status: 201, schema: familyLinkSchema },
});

documentPath({
  method: "post",
  path: "/family/invitations/{id}/accept",
  tag,
  summary: "Aceita um convite recebido",
  params: idParamSchema,
  response: { schema: familyLinkSchema },
});

documentPath({
  method: "post",
  path: "/family/invitations/{id}/decline",
  tag,
  summary: "Recusa um convite recebido",
  params: idParamSchema,
  response: { schema: familyLinkSchema },
});

documentPath({
  method: "patch",
  path: "/family/links/{id}",
  tag,
  summary: "Muda o tipo de acesso (só o responsável)",
  params: idParamSchema,
  body: linkAccessSchema,
  response: { schema: familyLinkSchema },
});

documentPath({
  method: "delete",
  path: "/family/links/{id}",
  tag,
  summary: "Termina a ligação (qualquer dos lados)",
  description: "A ligação passa a REVOKED e o responsável deixa de poder agir pela pessoa.",
  params: idParamSchema,
});
