/**
 * Extension System Types for opencode-telegram-bot
 *
 * Origin: Claude Opus 4.6 (OpenCode)
 * Context: Jarvis extension system - drop-in callback handlers, commands, and background jobs
 * Created: 2026-04-04
 */

import type { Bot, Context } from "grammy";

/**
 * Logger interface provided to extensions.
 */
export interface ExtensionLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Context object passed to extension lifecycle hooks and job executors.
 */
export interface ExtensionContext {
  /** Grammy bot instance for sending messages */
  bot: Bot<Context>;
  /** Chat ID of the allowed user */
  chatId: number;
  /** Structured logger namespaced to the extension */
  log: ExtensionLogger;
  /** Directory for persistent state files (created automatically) */
  stateDir: string;
}

/**
 * Callback query handler configuration.
 */
export interface CallbackConfig {
  /** Prefixes to match against callback_query data (e.g., ["mute:", "unmute:"]) */
  prefixes: string[];
  /** Handler function. Return true if the callback was handled. */
  handle(ctx: Context, bot: Bot<Context>): Promise<boolean>;
}

/**
 * Command definition for Telegram bot commands menu.
 */
export interface CommandDefinition {
  /** Command name without the leading slash (e.g., "muted") */
  command: string;
  /** Human-readable description shown in the commands menu */
  description: string;
}

/**
 * Chat command handler configuration.
 */
export interface CommandConfig {
  /** List of commands this handler provides */
  definitions: CommandDefinition[];
  /** Handler function. Return true if the command was handled. */
  handle(ctx: Context, bot: Bot<Context>): Promise<boolean>;
}

/**
 * Background job configuration.
 */
export interface JobConfig {
  /** Human-readable job name for logging */
  name: string;
  /** Interval between executions in milliseconds */
  intervalMs: number;
  /** Whether to run immediately on bot start (default: false) */
  runOnStart?: boolean;
  /** Job executor function */
  execute(ctx: ExtensionContext): Promise<void>;
}

/**
 * Main extension handler interface.
 * Implement this to create a drop-in extension.
 *
 * All capability fields are optional — implement only what you need.
 */
export interface ExtensionHandler {
  /** Human-readable name for logging */
  name: string;
  /** Semantic version (optional) */
  version?: string;

  /** Inline button callback handlers */
  callbacks?: CallbackConfig;
  /** Chat command handlers */
  commands?: CommandConfig;
  /** Background scheduled jobs */
  jobs?: JobConfig[];

  /** Called once after the handler is loaded, before the bot starts polling */
  init?(ctx: ExtensionContext): Promise<void>;
  /** Called on bot shutdown for cleanup */
  destroy?(): Promise<void>;
}
