#!/usr/bin/env node
/**
 * CLI: Export accumulated WhatsApp messages for a date to markdown.
 * @see business_modules/whatsapp/app/whatsappToMdCli.js
 */
import 'dotenv/config';
import { runWhatsAppToMdCli } from '../app/whatsappToMdCli.js';

await runWhatsAppToMdCli(process.argv.slice(2));
