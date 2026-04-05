/**
 * Command Router - registers and dispatches extension chat commands.
 *
 * Origin: Claude Opus 4.6 (OpenCode)
 * Context: Jarvis extension system
 * Created: 2026-04-04
 */

import type { Bot, Context } from "grammy";
import type { ExtensionHandler, CommandDefinition } from "./types.js";
import { logger } from "../utils/logger.js";

interface CommandRoute {
  command: string;
  handler: ExtensionHandler;
}

class CommandRouter {
  private routes: CommandRoute[] = [];
  private definitions: CommandDefinition[] = [];

  register(handler: ExtensionHandler): void {
    if (!handler.commands) return;
    for (const def of handler.commands.definitions) {
      this.routes.push({ command: def.command, handler });
      this.definitions.push(def);
      logger.info(`[Extensions] Command: /${def.command} -> ${handler.name}`);
    }
  }

  /**
   * Handle an incoming text message by checking if it matches an extension command.
   * Called from middleware BEFORE unknownCommandMiddleware to ensure extension
   * commands are dispatched before being rejected as unknown.
   */
  async handle(ctx: Context, bot: Bot<Context>): Promise<boolean> {
    const text = ctx.message?.text || "";
    if (!text.startsWith("/")) return false;

    // Extract command name: "/muted" -> "muted", "/muted@botname" -> "muted"
    const match = text.match(/^\/([a-zA-Z0-9_]+)/);
    if (!match) return false;
    const commandName = match[1].toLowerCase();

    for (const route of this.routes) {
      if (route.command === commandName) {
        try {
          return await route.handler.commands!.handle(ctx, bot);
        } catch (err) {
          logger.error(`[Extensions] Command error in ${route.handler.name}:`, err);
          await ctx.reply(`Extension error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
          return true; // Handled (with error)
        }
      }
    }
    return false;
  }

  getDefinitions(): CommandDefinition[] {
    return [...this.definitions];
  }

  clear(): void {
    this.routes = [];
    this.definitions = [];
  }
}

export const commandRouter = new CommandRouter();
