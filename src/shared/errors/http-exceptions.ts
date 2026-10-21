import { StatusCodes } from "http-status-codes";

export interface FieldError {
  field: string;
  message: string;
}

/** Erro de negócio, devolvido ao cliente como application/problem+json. */
export class HttpException extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: FieldError[],
  ) {
    super(detail ?? title);
    this.name = new.target.name;
  }
}

export class BadRequestException extends HttpException {
  constructor(detail: string) {
    super(StatusCodes.BAD_REQUEST, "Pedido inválido", detail);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(detail = "Inicie sessão para continuar.") {
    super(StatusCodes.UNAUTHORIZED, "Não autenticado", detail);
  }
}

export class ForbiddenException extends HttpException {
  constructor(detail = "Não tem permissão para esta operação.") {
    super(StatusCodes.FORBIDDEN, "Acesso negado", detail);
  }
}

export class NotFoundException extends HttpException {
  /** @param what Sujeito com artigo, ex.: "A conta". */
  constructor(what: string) {
    super(StatusCodes.NOT_FOUND, "Não encontrado", `${what} não existe ou foi removido.`);
  }
}

export class ConflictException extends HttpException {
  constructor(detail: string) {
    super(StatusCodes.CONFLICT, "Conflito", detail);
  }
}

/** Erros por campo, prontos para o formulário do front. */
export class ValidationException extends HttpException {
  constructor(errors: FieldError[]) {
    super(StatusCodes.UNPROCESSABLE_ENTITY, "Dados inválidos", "Corrija os campos assinalados.", errors);
  }

  static field(field: string, message: string) {
    return new ValidationException([{ field, message }]);
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(detail: string) {
    super(StatusCodes.TOO_MANY_REQUESTS, "Demasiados pedidos", detail);
  }
}
