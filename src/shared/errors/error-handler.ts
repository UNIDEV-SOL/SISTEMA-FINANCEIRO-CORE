import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma";
import { logger } from "../logger";
import { zodFieldErrors } from "../http/validation";
import { HttpException, type FieldError } from "./http-exceptions";

interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: FieldError[];
}

function send(res: Response, problem: Omit<Problem, "type">) {
  res.status(problem.status).type("application/problem+json").json({ type: "about:blank", ...problem });
}

function fromPrisma(error: Prisma.PrismaClientKnownRequestError): Omit<Problem, "type"> | null {
  switch (error.code) {
    case "P2002":
      return { status: StatusCodes.CONFLICT, title: "Conflito", detail: "Já existe um registo com estes dados." };
    case "P2003":
      return {
        status: StatusCodes.CONFLICT,
        title: "Conflito",
        detail: "O registo está a ser usado noutro sítio e não pode ser alterado desta forma.",
      };
    case "P2025":
      return { status: StatusCodes.NOT_FOUND, title: "Não encontrado", detail: "O registo não existe ou foi removido." };
    default:
      return null;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  send(res, { status: StatusCodes.NOT_FOUND, title: "Não encontrado", detail: `A rota ${req.method} ${req.path} não existe.` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpException) {
    return send(res, { status: error.status, title: error.title, detail: error.detail, errors: error.errors });
  }

  if (error instanceof ZodError) {
    return send(res, { status: StatusCodes.UNPROCESSABLE_ENTITY, title: "Dados inválidos", detail: "Corrija os campos assinalados.", errors: zodFieldErrors(error) });
  }

  // JSON mal formado no corpo do pedido
  if (error instanceof SyntaxError && "body" in error) {
    return send(res, { status: StatusCodes.BAD_REQUEST, title: "Pedido inválido", detail: "O corpo do pedido não é JSON válido." });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const problem = fromPrisma(error);
    if (problem) return send(res, problem);
  }

  logger.error("Erro não tratado", { method: req.method, path: req.path, error });
  send(res, {
    status: StatusCodes.INTERNAL_SERVER_ERROR,
    title: "Erro interno",
    detail: "Ocorreu um erro inesperado. Tente novamente dentro de instantes.",
  });
}
