import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleIdentityService } from './google-identity.service';
import { MfaService } from './mfa.service';
import { EmailLinksService } from './email-links.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleIdentityService, TokenService, MfaService, EmailLinksService],
  exports: [TokenService, AuthService, GoogleIdentityService, MfaService, EmailLinksService, JwtModule],
})
export class AuthModule {}
