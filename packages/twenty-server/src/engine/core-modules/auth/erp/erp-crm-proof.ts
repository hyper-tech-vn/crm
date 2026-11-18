import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { type ErpCrmProof } from './erp-crm-access.types';

const key = (secret: string) => {
  if (secret.length < 32) {
    throw new Error('Invalid ERP proof key');
  }
  return createHash('sha256')
    .update('hypertech-erp-crm-proof-v1\0')
    .update(secret)
    .digest();
};

export const sealErpProof = (
  proof: ErpCrmProof,
  userId: string,
  secret: string,
): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(proof), 'utf8'),
    cipher.final(),
  ]);
  return (
    'enc:erp:v1:' +
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
  );
};

export const openErpProof = (
  value: string,
  userId: string,
  secret: string,
): ErpCrmProof => {
  if (!value.startsWith('enc:erp:v1:') || value.length > 32768) {
    throw new Error('Invalid ERP proof');
  }
  const bytes = Buffer.from(value.slice(11), 'base64url');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    key(secret),
    bytes.subarray(0, 12),
  );
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(bytes.subarray(12, 28));
  const parsed: unknown = JSON.parse(
    Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(
      'utf8',
    ),
  );
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('idToken' in parsed) ||
    typeof parsed.idToken !== 'string' ||
    !('clerkSubject' in parsed) ||
    typeof parsed.clerkSubject !== 'string' ||
    !('email' in parsed) ||
    typeof parsed.email !== 'string' ||
    !('expiresAt' in parsed) ||
    typeof parsed.expiresAt !== 'number' ||
    !Number.isFinite(parsed.expiresAt)
  ) {
    throw new Error('Invalid ERP proof');
  }
  return {
    idToken: parsed.idToken,
    clerkSubject: parsed.clerkSubject,
    email: parsed.email,
    expiresAt: parsed.expiresAt,
  };
};
