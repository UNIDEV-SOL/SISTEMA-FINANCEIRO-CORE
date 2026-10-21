import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["test/setup.ts"],
    // Os testes partilham a mesma base de dados de teste
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/financeiro_test",
      JWT_SECRET: "segredo-de-teste-com-pelo-menos-32-caracteres",
      APP_TZ: "Africa/Maputo",
      // Os testes nunca chamam a API da Anthropic (modo offline; o modo IA usa um cliente falso)
      ANTHROPIC_API_KEY: "",
    },
  },
});
