import * as Crypto from 'expo-crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

import {
  appendLocalEvent,
  createLocalId,
  getLocalDatabase,
  getLocalDeviceId,
  withLocalTransaction,
  type LocalProfile,
} from './local-database';
import {
  clearUserAccess,
  getUserAccess,
  saveUserAccess,
  type CachedUserAccess,
} from './user-cache';

const PASSWORD_HASH_ITERATIONS = 210_000;
const PASSWORD_HASH_LENGTH = 32;
const DEFAULT_ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_ADMIN_SALT = '6c6962726172792d61646d696e2d7631';
const DEFAULT_ADMIN_PASSWORD_HASH =
  '82e12c4355864cf1cc2db404be9611d639601ba07d1d9b89410630aff1b2e220';
const DEFAULT_ADMIN_CREATED_AT = '1970-01-01T00:00:00.000Z';

export type LocalAccount = LocalProfile;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function validateCredentials(username: string, password: string): void {
  if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
    throw new Error(
      'Username must be 3-32 characters and contain only letters, numbers, underscores, or hyphens.'
    );
  }
  if (password.length < 6 || password.length > 128) {
    throw new Error('Password must be between 6 and 128 characters.');
  }
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const hash = await pbkdf2Async(sha256, password, salt, {
    c: PASSWORD_HASH_ITERATIONS,
    dkLen: PASSWORD_HASH_LENGTH,
  });
  return bytesToHex(hash);
}

function hashesMatch(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function profilePayload(
  profile: LocalProfile,
  passwordSalt: string,
  passwordHash: string
): Record<string, unknown> {
  return {
    ...profile,
    password_salt: passwordSalt,
    password_hash: passwordHash,
  };
}

function accountFromRow(row: {
  id: string;
  username: string;
  full_name: string | null;
  mobile_number: string | null;
  subscription_start: string | null;
  subscription_expiry: string | null;
  is_enabled: number;
  created_at: string | null;
  role: 'admin' | 'subscriber';
  is_library_subscriber: number;
}): LocalAccount {
  return {
    ...row,
    is_enabled: Boolean(row.is_enabled),
    is_library_subscriber: Boolean(row.is_library_subscriber),
  };
}

export async function ensureDefaultAdminAccount(): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const existing = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM profiles WHERE username = ? COLLATE NOCASE',
    'admin'
  );
  if (existing) {
    return;
  }

  const profile: LocalProfile = {
    id: DEFAULT_ADMIN_ID,
    username: 'admin',
    full_name: 'Administrator',
    mobile_number: null,
    subscription_start: null,
    subscription_expiry: null,
    is_enabled: true,
    created_at: DEFAULT_ADMIN_CREATED_AT,
    role: 'admin',
    is_library_subscriber: false,
  };
  const deviceId = await getLocalDeviceId();
  const changedAt = profile.created_at!;

  await withLocalTransaction(database, async (transaction) => {
    const result = await transaction.runAsync(
      `INSERT OR IGNORE INTO profiles (
        id, username, password_salt, password_hash, full_name, mobile_number,
        subscription_start, subscription_expiry, is_enabled, created_at, role,
        is_library_subscriber, sync_changed_at, sync_device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      profile.id,
      profile.username,
      DEFAULT_ADMIN_SALT,
      DEFAULT_ADMIN_PASSWORD_HASH,
      profile.full_name,
      profile.mobile_number,
      profile.subscription_start,
      profile.subscription_expiry,
      1,
      profile.created_at,
      profile.role,
      0,
      changedAt,
      deviceId
    );
    if (result.changes === 0) {
      return;
    }
    await appendLocalEvent(
      transaction,
      'profiles',
      profile.id,
      profilePayload(profile, DEFAULT_ADMIN_SALT, DEFAULT_ADMIN_PASSWORD_HASH),
      changedAt,
      deviceId
    );
  });
}

export async function createLocalAccount(
  usernameInput: string,
  password: string,
  fullName: string,
  mobileNumber: string
): Promise<LocalAccount> {
  await ensureDefaultAdminAccount();
  const username = normalizeUsername(usernameInput);
  validateCredentials(username, password);

  const database = await getLocalDatabase({ seedCatalog: false });
  const existing = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM profiles WHERE username = ? COLLATE NOCASE',
    username
  );
  if (existing) {
    throw new Error('That username is already in use.');
  }

  const salt = Crypto.getRandomBytes(16);
  const passwordSalt = bytesToHex(salt);
  const passwordHash = await hashPassword(password, salt);
  const deviceId = await getLocalDeviceId();
  const now = new Date().toISOString();
  const profile: LocalAccount = {
    id: createLocalId(),
    username,
    full_name: fullName.trim() || null,
    mobile_number: mobileNumber.trim() || null,
    subscription_start: null,
    subscription_expiry: null,
    is_enabled: true,
    created_at: now,
    role: 'subscriber',
    is_library_subscriber: false,
  };

  await withLocalTransaction(database, async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO profiles (
        id, username, password_salt, password_hash, full_name, mobile_number,
        subscription_start, subscription_expiry, is_enabled, created_at, role,
        is_library_subscriber, sync_changed_at, sync_device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      profile.id,
      profile.username,
      passwordSalt,
      passwordHash,
      profile.full_name,
      profile.mobile_number,
      profile.subscription_start,
      profile.subscription_expiry,
      Number(profile.is_enabled),
      profile.created_at,
      profile.role,
      0,
      now,
      deviceId
    );
    await appendLocalEvent(
      transaction,
      'profiles',
      profile.id,
      profilePayload(profile, passwordSalt, passwordHash),
      now,
      deviceId
    );
  });

  return profile;
}

export async function signInLocal(
  usernameInput: string,
  password: string
): Promise<LocalAccount> {
  const username = normalizeUsername(usernameInput);
  if (!username || !password) {
    throw new Error('Enter your username and password.');
  }
  await ensureDefaultAdminAccount();

  const database = await getLocalDatabase({ seedCatalog: false });
  const row = await database.getFirstAsync<{
    id: string;
    username: string;
    password_salt: string | null;
    password_hash: string | null;
    full_name: string | null;
    mobile_number: string | null;
    subscription_start: string | null;
    subscription_expiry: string | null;
    is_enabled: number;
    created_at: string | null;
    role: 'admin' | 'subscriber';
    is_library_subscriber: number;
  }>(
    `SELECT id, username, password_salt, password_hash, full_name, mobile_number,
       subscription_start, subscription_expiry, is_enabled, created_at, role,
       is_library_subscriber
     FROM profiles WHERE username = ? COLLATE NOCASE`,
    username
  );

  if (
    !row ||
    !row.password_salt ||
    !row.password_hash ||
    !hashesMatch(
      await hashPassword(password, hexToBytes(row.password_salt)),
      row.password_hash
    )
  ) {
    throw new Error('Username or password is incorrect.');
  }
  if (!row.is_enabled) {
    throw new Error('This account is disabled. Contact an administrator.');
  }

  const profile = accountFromRow(row);
  await saveUserAccess({
    id: profile.id,
    username: profile.username,
    role: profile.role,
    is_enabled: profile.is_enabled,
  });
  return profile;
}

export async function getCurrentLocalAccount(): Promise<LocalAccount | null> {
  const access = await getUserAccess();
  if (!access) {
    return null;
  }
  const database = await getLocalDatabase({ seedCatalog: false });
  const row = await database.getFirstAsync<{
    id: string;
    username: string;
    full_name: string | null;
    mobile_number: string | null;
    subscription_start: string | null;
    subscription_expiry: string | null;
    is_enabled: number;
    created_at: string | null;
    role: 'admin' | 'subscriber';
    is_library_subscriber: number;
  }>(
    `SELECT id, username, full_name, mobile_number, subscription_start,
       subscription_expiry, is_enabled, created_at, role, is_library_subscriber
     FROM profiles WHERE id = ?`,
    access.id
  );
  return row ? accountFromRow(row) : null;
}

export async function signOutLocal(): Promise<void> {
  await clearUserAccess();
}

export async function changeLocalPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const access: CachedUserAccess | null = await getUserAccess();
  if (!access) {
    throw new Error('Sign in before changing your password.');
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    throw new Error('New password must be between 8 and 128 characters.');
  }
  const database = await getLocalDatabase({ seedCatalog: false });
  const row = await database.getFirstAsync<{
    password_salt: string | null;
    password_hash: string | null;
  }>(
    'SELECT password_salt, password_hash FROM profiles WHERE id = ?',
    access.id
  );
  if (!row?.password_salt || !row.password_hash) {
    throw new Error('This account does not have a local password yet.');
  }
  const currentHash = await hashPassword(
    currentPassword,
    hexToBytes(row.password_salt)
  );
  if (!hashesMatch(currentHash, row.password_hash)) {
    throw new Error('Your current password is incorrect.');
  }

  const passwordSalt = bytesToHex(Crypto.getRandomBytes(16));
  const passwordHash = await hashPassword(
    newPassword,
    hexToBytes(passwordSalt)
  );
  const profile = await getCurrentLocalAccount();
  if (!profile) {
    throw new Error('The local account could not be found.');
  }
  const changedAt = new Date().toISOString();
  const deviceId = await getLocalDeviceId();

  await withLocalTransaction(database, async (transaction) => {
    await transaction.runAsync(
      `UPDATE profiles SET password_salt = ?, password_hash = ?,
       sync_changed_at = ?, sync_device_id = ? WHERE id = ?`,
      passwordSalt,
      passwordHash,
      changedAt,
      deviceId,
      access.id
    );
    await appendLocalEvent(
      transaction,
      'profiles',
      profile.id,
      profilePayload(profile, passwordSalt, passwordHash),
      changedAt,
      deviceId
    );
  });
}
