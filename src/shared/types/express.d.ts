
declare global {
  namespace Express {
    interface Request {
      user?: {
        /** Utilizador efectivo: o próprio, ou o dependente por quem está a agir (X-Acting-As). */
        id: string;
        /** Quem iniciou sessão. */
        actorId: string;
        actorName: string;
        /** Perfil de quem iniciou sessão: as permissões são sempre as dele. */
        profile: { id: string; code: string; name: string; superAdmin: boolean };
        actingAs?: import("../access/acting-as").ActingAs;
      };
      /** Funcionalidade da rota, preenchida pelo `authorize` (para a auditoria). */
      functionalityCode?: string;
    }
  }
}

export {};
