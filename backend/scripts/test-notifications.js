#!/usr/bin/env node
/**
 * Manual connectivity check for the outbound notification drivers.
 *
 * It uses the SAME driver resolver as the running app
 * (src/notifications/providers.ts -> dist/src/notifications/providers.js), so a
 * green run here means the channels the API will use really work:
 *
 *   node scripts/test-notifications.js            # every configured channel
 *   node scripts/test-notifications.js email      # one channel
 *   node scripts/test-notifications.js sms 9876543210
 *   node scripts/test-notifications.js whatsapp "+91 99003 08256"
 *   node scripts/test-notifications.js --who      # only print the chosen drivers
 *
 * Run `npm run build` first (the script imports the compiled provider module).
 * Recipients default to NOTIFY_TEST_EMAIL / NOTIFY_TEST_NUMBERS from .env.
 * This is a diagnostic tool: it talks to the live providers and writes nothing
 * to the database (no notification_logs row, no retry).
 */

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const CHANNELS = { email: 'NOTIFY_TEST_EMAIL', sms: 'NOTIFY_TEST_NUMBERS', whatsapp: 'NOTIFY_TEST_NUMBERS' };

let providers;
try {
  providers = require(path.resolve(__dirname, '..', 'dist', 'src', 'notifications', 'providers.js'));
} catch (e) {
  console.error('Cannot load the compiled providers module. Run `npm run build` first.');
  console.error(String(e.message).split('\n')[0]);
  process.exit(1);
}

const { resolveProvider, toE164 } = providers;

function recipientsFor(channel, explicit) {
  if (explicit) return [explicit];
  const raw = process.env[CHANNELS[channel]] ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function mask(to) {
  return to.includes('@') ? to.replace(/^(.).*(@.*)$/, '$1***$2') : to.slice(-4).padStart(to.length, '*');
}

async function main() {
  const args = process.argv.slice(2);
  const onlyWho = args.includes('--who');
  const positional = args.filter((a) => !a.startsWith('--'));
  const requested = positional[0] ? [positional[0]] : Object.keys(CHANNELS);
  const explicit = positional[1];
  const unknown = requested.filter((c) => !CHANNELS[c]);
  if (unknown.length) {
    console.error(`Unknown channel(s): ${unknown.join(', ')}. Use email | sms | whatsapp.`);
    process.exit(1);
  }

  console.log('Notification driver check');
  console.log('────────────────────────');
  let failures = 0;
  let attempted = 0;

  for (const channel of requested) {
    const provider = resolveProvider(channel);
    console.log(`\n${channel.toUpperCase()}: driver = ${provider ? provider.name : 'none (messages are logged as "mocked")'}`);
    if (onlyWho) continue;
    if (!provider) {
      console.log('  skipped: no provider configured for this channel.');
      continue;
    }

    const targets = recipientsFor(channel, explicit);
    if (targets.length === 0) {
      console.log(`  skipped: no recipient. Pass one on the command line or set ${CHANNELS[channel]} in .env.`);
      continue;
    }
    attempted += targets.length;

    for (const recipient of targets) {
      const to = channel === 'email' ? recipient : toE164(recipient);
      try {
        const result = await provider.send({
          channel,
          recipient: to,
          subject: channel === 'email' ? 'Genesis Lumia ERP — delivery test' : null,
          body: `Genesis Lumia ERP delivery test (${channel}). Sent at ${new Date().toISOString()}. No action needed.`,
          ref_type: 'connectivity-test',
          ref_id: null,
          branch_id: process.env.NOTIFY_TEST_BRANCH_ID ?? 'connectivity-test',
        });
        console.log(`  sent -> ${mask(to)} (${result.provider}${result.providerId ? `, id ${result.providerId}` : ''})`);
      } catch (e) {
        failures += 1;
        console.log(`  FAILED -> ${mask(to)}: ${e.message}`);
      }
    }
  }

  if (failures > 0) console.log(`\n${failures} of ${attempted} attempted send(s) FAILED.`);
  else if (attempted > 0) console.log(`\nAll ${attempted} attempted send(s) succeeded.`);
  else console.log('\nNothing was transmitted: no selected channel had both a driver and a recipient.');
  // Set the code instead of calling process.exit: exiting with keep-alive sockets open
  // trips a libuv assertion on Windows, which reads like a crash in the middle of a result.
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
