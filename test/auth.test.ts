import { api, signUp } from "./helpers";

describe("auth", () => {
  it("regista, cria as categorias por omissão e devolve sessão", async () => {
    const { auth, user } = await signUp();

    const me = await api().get("/api/v1/auth/me").set(auth).expect(200);
    expect(me.body).toEqual({
      id: user.id,
      name: "Ana Teste",
      email: user.email,
      currency: "MZN",
      active: true,
      profile: { id: expect.any(String), code: "USER", name: "Utilizador", superAdmin: false },
      actingAs: null,
    });

    const categories = await api().get("/api/v1/categories").set(auth).expect(200);
    expect(categories.body.content).toHaveLength(14);
    expect(categories.body.totalItems).toBe(14);
  });

  it("recusa email repetido com erro no campo", async () => {
    const { user } = await signUp();
    const res = await api()
      .post("/api/v1/auth/register")
      .send({ name: "Outra", email: user.email.toUpperCase(), password: "segredo123" })
      .expect(422);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.errors).toEqual([{ field: "email", message: "Já existe uma conta com este email." }]);
  });

  it("valida os campos do registo em português", async () => {
    const res = await api().post("/api/v1/auth/register").send({ name: " ", email: "x", password: "123" }).expect(422);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        { field: "name", message: "Indique o seu nome." },
        { field: "email", message: "Email inválido." },
        { field: "password", message: "A palavra-passe tem de ter pelo menos 8 caracteres." },
      ]),
    );
  });

  it("faz login e recusa palavra-passe errada", async () => {
    const { user } = await signUp();
    await api().post("/api/v1/auth/login").send({ email: user.email, password: "segredo123" }).expect(200);
    const res = await api().post("/api/v1/auth/login").send({ email: user.email, password: "errada123" }).expect(401);
    expect(res.body.detail).toBe("Email ou palavra-passe incorrectos.");
  });

  it("exige token nas rotas privadas", async () => {
    await api().get("/api/v1/accounts").expect(401);
    await api().get("/api/v1/accounts").set({ Authorization: "Bearer lixo" }).expect(401);
  });
});
