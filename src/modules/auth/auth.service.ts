import bcrypt from "bcryptjs";
import type { Profile, User } from "../../generated/prisma";
import { findActingAs } from "../../shared/access/acting-as";
import { prisma } from "../../shared/db/prisma";
import { ForbiddenException, UnauthorizedException } from "../../shared/errors/http-exceptions";
import { INACTIVE_ACCOUNT, signToken } from "../../shared/middleware/authenticate";
import { appSettings } from "../../shared/settings/app-settings";
import type { LoginInput, PreferencesInput, RegisterInput } from "./auth.schemas";
import type { AuthUser, Preferences, Session } from "./auth.types";
import { BCRYPT_ROUNDS, createUserAccount, defaultProfileId } from "./user-accounts";

type UserWithProfile = User & { profile: Profile };

const toAuthUser = (u: UserWithProfile, actingAs: AuthUser["actingAs"] = null): AuthUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  currency: u.currency,
  active: u.active,
  profile: { id: u.profile.id, code: u.profile.code, name: u.profile.name, superAdmin: u.profile.superAdmin },
  actingAs,
  preferences: { textSize: u.textSize, highContrast: u.highContrast, reduceMotion: u.reduceMotion },
});

// Hash fixo para comparar quando o email não existe, para a resposta demorar o mesmo
const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

export const authService = {
  async ensureRegistrationOpen() {
    if (!(await appSettings.get("auth.registrationEnabled")))
      throw new ForbiddenException("O registo de novas contas está desactivado. Contacte o administrador.");
  },

  async register(input: RegisterInput): Promise<Session> {
    await this.ensureRegistrationOpen();
    const created = await createUserAccount({ ...input, profileId: await defaultProfileId() });
    const user = await prisma.user.update({ where: { id: created.id }, data: { lastLoginAt: new Date() }, include: { profile: true } });
    return { token: await signToken(user.id), user: toAuthUser(user) };
  },

  async login(input: LoginInput): Promise<Session> {
    const user = await prisma.user.findUnique({ where: { email: input.email }, include: { profile: true } });
    const valid = await bcrypt.compare(input.password, user?.password ?? DUMMY_HASH);
    if (!user || !valid) throw new UnauthorizedException("Email ou palavra-passe incorrectos.");
    // Só se revela que a conta está desactivada a quem sabe a palavra-passe
    if (!user.active) throw new UnauthorizedException(INACTIVE_ACCOUNT);
    const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, include: { profile: true } });
    return { token: await signToken(user.id), user: toAuthUser(updated) };
  },

  /** `actingAsId` é o cabeçalho X-Acting-As: devolve-se a pessoa se a ligação for válida, senão null. */
  async updatePreferences(userId: string, input: PreferencesInput): Promise<Preferences> {
    const u = await prisma.user.update({ where: { id: userId }, data: input, select: { textSize: true, highContrast: true, reduceMotion: true } });
    return u;
  },

  async me(userId: string, actingAsId?: string): Promise<AuthUser> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
    const actingAs = actingAsId ? await findActingAs({ id: user.id, profile: user.profile }, actingAsId.trim()) : null;
    return toAuthUser(user, actingAs);
  },
};
