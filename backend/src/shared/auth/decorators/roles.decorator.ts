import { SetMetadata } from '@nestjs/common';
import { type Role } from '@qp/types';

export const ROLES = 'auth:roles';
/** Restrict a route/controller to these roles. Without it, any user with a role may call it. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const ALLOW_NO_ROLE = 'auth:allowNoRole';
/** Allow logged-in users who have not chosen a role yet (first Google login). */
export const AllowNoRole = () => SetMetadata(ALLOW_NO_ROLE, true);
