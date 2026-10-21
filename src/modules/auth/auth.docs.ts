import { documentPath } from "../../shared/docs/registry";
import { authUserSchema, loginSchema, preferencesSchema, registerSchema, sessionSchema } from "./auth.schemas";

const tag = "Autenticação";

documentPath({
  method: "post",
  path: "/auth/register",
  tag,
  public: true,
  summary: "Cria uma conta",
  description:
    "Dá o perfil marcado como `isDefault`, a moeda `locale.defaultCurrency`, as categorias por omissão e as definições de alertas iniciais. " +
    "Devolve 403 se `auth.registrationEnabled` estiver desligado; o mínimo da palavra-passe é `auth.passwordMinLength`.",
  body: registerSchema(8),
  response: { status: 201, schema: sessionSchema },
});

documentPath({
  method: "post",
  path: "/auth/login",
  tag,
  public: true,
  summary: "Inicia sessão",
  description: "Contas desactivadas recebem 401 \"Conta desactivada. Contacte o administrador.\". A sessão dura `auth.sessionDays` dias.",
  body: loginSchema,
  response: { schema: sessionSchema },
});

documentPath({
  method: "get",
  path: "/auth/me",
  tag,
  summary: "Utilizador da sessão actual",
  description: "Com o cabeçalho `X-Acting-As`, `actingAs` traz a pessoa por quem está a agir (null se a ligação não for válida).",
  response: { schema: authUserSchema },
});

documentPath({
  method: "put",
  path: "/auth/preferences",
  tag,
  summary: "Preferências de acessibilidade (tamanho do texto, contraste, animações)",
  description: "Sempre de quem iniciou sessão, mesmo a agir por outra pessoa. Os campos omitidos ficam como estão.",
  body: preferencesSchema,
  response: { schema: preferencesSchema },
});
