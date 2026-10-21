/**
 * Relógio da aplicação. Os testes podem fixar o "agora" (ex.: simular a passagem de ano)
 * sem falsificar o `Date` global — os tokens JWT continuam a usar a hora real.
 */
let fixed: Date | null = null;

export const clock = {
  now: (): Date => (fixed ? new Date(fixed) : new Date()),
  /** Só para testes. */
  set(date: Date | string) {
    fixed = new Date(date);
  },
  reset() {
    fixed = null;
  },
};
