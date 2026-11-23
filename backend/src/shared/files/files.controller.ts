import { existsSync } from 'node:fs';
import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { type Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { Errors } from '../http/app-exception';
import { StorageService } from './storage.service';

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Serves PUBLIC files in local-storage mode (S3 mode links straight to the bucket). */
@ApiExcludeController()
@Public()
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get('*path')
  serve(@Param('path') path: string | string[], @Res() res: Response) {
    const key = Array.isArray(path) ? path.join('/') : path;
    const file = this.storage.localPath('public', key);
    const type = TYPES[key.split('.').pop() ?? ''];
    if (!type || !existsSync(file)) throw Errors.notFound('File');
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.sendFile(file);
  }
}
