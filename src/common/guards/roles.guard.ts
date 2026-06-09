import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // 获取请求的控制器和方法上的角色
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 如果角色为空，则直接放行
    if (!requiredRoles) {
      return true;
    }

    // 获取请求的用户
    const { user } = context.switchToHttp().getRequest();
    // 如果用户角色在所需角色中，则放行
    return requiredRoles.some((role) => user.role === role);
  }
}