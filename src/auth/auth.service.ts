import {
  ConflictException,
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service.js';

const scrypt = promisify(scryptCallback);
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_KEY_LENGTH = 64;

@Injectable()
export class AuthService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('AUTH_SECRET');
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const apiKey = this.configValue('RESEND_API_KEY');
    const from = this.configValue('PASSWORD_RESET_FROM');
    const frontendUrl = this.configValue('FRONTEND_URL') || 'http://localhost:5177';
    if (!apiKey || !from) {
      throw new ServiceUnavailableException('La recuperación de contraseña no está configurada.');
    }

    const user = await this.prisma.authUser.findUnique({ where: { id: 1 } });
    if (!user || user.email !== normalizedEmail) return { message: 'Si el correo corresponde a la cuenta, recibirás instrucciones para restablecer la contraseña.' };

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.prisma.authUser.update({
      where: { id: user.id },
      data: { passwordResetToken: tokenHash, passwordResetExpiresAt: expiresAt },
    });

    const resetUrl = new URL('/', frontendUrl);
    resetUrl.hash = new URLSearchParams({ resetPassword: token }).toString();
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: 'Restablece tu contraseña de CHUCK\'s Web',
          text: `Recibimos una solicitud para restablecer tu contraseña. Abre este enlace en la próxima hora: ${resetUrl.toString()}\n\nSi no solicitaste este cambio, ignora este mensaje.`,
          html: `<p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href="${resetUrl.toString()}">Crear una nueva contraseña</a></p><p>El enlace vence en una hora. Si no solicitaste este cambio, ignora este mensaje.</p>`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      await this.clearPasswordResetToken(user.id, tokenHash);
      throw new ServiceUnavailableException('No se pudo enviar el correo de recuperación. Inténtalo de nuevo más tarde.');
    }
    if (!response.ok) {
      await this.clearPasswordResetToken(user.id, tokenHash);
      throw new ServiceUnavailableException('No se pudo enviar el correo de recuperación. Inténtalo de nuevo más tarde.');
    }
    return { message: 'Si el correo corresponde a la cuenta, recibirás instrucciones para restablecer la contraseña.' };
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.authUser.findUnique({ where: { passwordResetToken: tokenHash } });
    const now = new Date();
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt <= now) {
      throw new BadRequestException('El enlace de recuperación no es válido o ya venció. Solicita uno nuevo.');
    }
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
    const passwordHash = `scrypt$${salt}$${derived.toString('hex')}`;
    const updated = await this.prisma.authUser.updateMany({
      where: { id: user.id, passwordResetToken: tokenHash, passwordResetExpiresAt: { gt: now } },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new BadRequestException('El enlace de recuperación no es válido o ya fue utilizado.');
    return { message: 'La contraseña se actualizó. Ya puedes iniciar sesión.' };
  }

  async register(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.authUser.findUnique({ where: { id: 1 } });
    if (existing) {
      throw new ConflictException('El registro está cerrado: ya existe un usuario.');
    }

    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
    const passwordHash = `scrypt$${salt}$${derived.toString('hex')}`;
    try {
      const user = await this.prisma.authUser.create({
        data: { id: 1, email: normalizedEmail, passwordHash },
        select: { id: true, email: true, sessionVersion: true },
      });
      return { user: { id: user.id, email: user.email }, accessToken: this.createToken(user.id, user.sessionVersion) };
    } catch (error) {
      // Primary key id=1 serializes concurrent registration attempts safely.
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('El registro está cerrado: ya existe un usuario.');
      }
      throw error;
    }
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.authUser.findUnique({
      where: { id: 1 },
    });
    if (!user || user.email !== normalizedEmail || !(await this.verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }
    return {
      user: { id: user.id, email: user.email },
      accessToken: this.createToken(user.id, user.sessionVersion),
    };
  }

  async isValidToken(token: string): Promise<boolean> {
    const [encodedPayload, signature, extra] = token.split('.');
    if (!encodedPayload || !signature || extra !== undefined) return false;
    const expected = this.sign(encodedPayload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;
    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as {
        sub?: number;
        exp?: number;
        ver?: number;
      };
      if (payload.sub !== 1 || typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000) return false;
      const user = await this.prisma.authUser.findUnique({ where: { id: 1 }, select: { id: true, sessionVersion: true } });
      return user !== null && payload.ver === user.sessionVersion;
    } catch {
      return false;
    }
  }

  private createToken(userId: number, sessionVersion: number): string {
    const payload = Buffer.from(
      JSON.stringify({ sub: userId, ver: sessionVersion, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }),
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  private async verifyPassword(password: string, encoded: string): Promise<boolean> {
    const [algorithm, salt, expectedHex] = encoded.split('$');
    if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = (await scrypt(password, salt, expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }

  private configValue(key: string) { return this.config.get<string>(key)?.trim() ?? ''; }

  private clearPasswordResetToken(id: number, tokenHash: string) {
    return this.prisma.authUser.updateMany({
      where: { id, passwordResetToken: tokenHash },
      data: { passwordResetToken: null, passwordResetExpiresAt: null },
    });
  }
}
