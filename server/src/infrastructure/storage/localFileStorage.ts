import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/appError.js';

const uploadRoot = path.resolve(env.UPLOAD_ROOT);

export async function ensureUploadRoot() {
  await mkdir(uploadRoot, { recursive: true });
}

function generatedFilename(originalName: string) {
  const extension = path.extname(originalName).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
  return `${randomUUID()}${safeExtension}`;
}

const diskStorage = multer.diskStorage({
  destination: uploadRoot,
  filename: (_request, file, callback) => callback(null, generatedFilename(file.originalname)),
});

export function createPrivateUpload(options: {
  allowedMimeTypes: ReadonlySet<string>;
  maxFileBytes: number;
  maxFiles?: number;
}) {
  return multer({
    storage: diskStorage,
    limits: {
      fileSize: options.maxFileBytes,
      files: options.maxFiles ?? 1,
    },
    fileFilter: (_request, file, callback) => {
      if (!options.allowedMimeTypes.has(file.mimetype)) {
        callback(new AppError('UPLOAD_TYPE_NOT_ALLOWED', 'This file type is not allowed for this upload.', 422));
        return;
      }
      callback(null, true);
    },
  });
}

export function resolvePrivateFile(storageName: string) {
  if (!/^[a-f0-9-]{36}(?:\.[a-z0-9]{1,10})?$/.test(storageName)) {
    throw new AppError('INVALID_STORAGE_KEY', 'The stored file identifier is invalid.', 400);
  }

  const resolved = path.resolve(uploadRoot, storageName);
  if (path.dirname(resolved) !== uploadRoot) {
    throw new AppError('INVALID_STORAGE_KEY', 'The stored file identifier is invalid.', 400);
  }
  return resolved;
}

export async function removePrivateFile(storageName: string) {
  await rm(resolvePrivateFile(storageName), { force: true });
}
