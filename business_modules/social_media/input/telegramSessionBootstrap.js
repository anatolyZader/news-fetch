#!/usr/bin/env node
/**
 * One-time Telegram user session bootstrap for MTProto access.
 *
 * Prerequisites:
 *   1. Create an app at https://my.telegram.org → api_id + api_hash
 *   2. Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env (or pass as env vars)
 *
 * Usage:
 *   npm run social-media:telegram-session
 *
 * Prints a TELEGRAM_SESSION string to paste into .env.
 */

import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

function requireEnv(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) {
    console.error(`Missing ${name}. Set it in .env (from https://my.telegram.org).`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const apiId = Number(requireEnv('TELEGRAM_API_ID'));
  const apiHash = requireEnv('TELEGRAM_API_HASH');
  const rl = readline.createInterface({ input, output });

  const [{ TelegramClient }, { StringSession }] = await Promise.all([
    import('telegram'),
    import('telegram/sessions/index.js'),
  ]);

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.start({
    phoneNumber: async () => rl.question('Phone number (international, e.g. +972...): '),
    phoneCode: async () => rl.question('Telegram code: '),
    password: async () => rl.question('2FA password (if enabled, else leave blank): '),
    onError: (err) => console.error(err),
  });

  const session = client.session.save();
  await client.disconnect();
  rl.close();

  console.log('\nAdd this line to your .env (copy the whole line once — do not paste TELEGRAM_SESSION= twice):\n');
  console.log(`TELEGRAM_SESSION=${session}`);
  console.log('\nThen add public channel @usernames to business_modules/social_media/telegram-public-channels.json');
}

try {
  await main();
} catch (err) {
  console.error(err?.message ?? err);
  process.exit(1);
}
