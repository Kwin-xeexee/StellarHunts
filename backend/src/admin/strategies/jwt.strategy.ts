import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminService } from '../admin.service';
import type { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('appConfig.jwtSecret'),
    });
  }

  async validate(payload: any) {
    const admin = await this.adminService.findByEmail(payload.email);
    if (!admin) {
      return null;
    }
    return { ...admin, role: payload.role };
  }
}
