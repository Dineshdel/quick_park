import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:isPublic';
/** Route needs no access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
