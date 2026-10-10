import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const cost = 32_768;
const blockSize = 8;
const parallelization = 1;
const maxMemory = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelization, maxmem: maxMemory },
      (error, derivedKey) => error ? reject(error) : resolve(derivedKey),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt);
  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue] = encodedHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    Number(costValue) !== cost ||
    Number(blockSizeValue) !== blockSize ||
    Number(parallelizationValue) !== parallelization ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  const expected = Buffer.from(hashValue, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltValue, 'base64url'));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
