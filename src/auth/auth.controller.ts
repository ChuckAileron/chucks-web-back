import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CredentialsDto, PasswordResetConfirmDto, PasswordResetRequestDto } from './auth.dto.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() credentials: CredentialsDto) {
    return this.auth.register(credentials.email, credentials.password);
  }

  @Public()
  @Post('login')
  login(@Body() credentials: CredentialsDto) {
    return this.auth.login(credentials.email, credentials.password);
  }

  @Public()
  @Post('password-reset/request')
  requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @Post('password-reset/confirm')
  resetPassword(@Body() body: PasswordResetConfirmDto) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Get('me')
  me() {
    return { authenticated: true };
  }
}
