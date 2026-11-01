import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const internalKey = request.headers['x-internal-api-key'];
    const configuredKey = this.config.get<string>('INTERNAL_API_KEY');
    if (
      configuredKey &&
      configuredKey.length >= 32 &&
      typeof internalKey === 'string' &&
      internalKey === configuredKey
    ) {
      return true;
    }
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    if (!token || !(await this.auth.isValidToken(token))) {
      throw new UnauthorizedException('Inicia sesión para continuar.');
    }
    return true;
  }
}
