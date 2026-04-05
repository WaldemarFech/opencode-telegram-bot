/**
 * Callback Router - dispatches inline button callbacks to extension handlers.
 *
 * Origin: Claude Opus 4.6 (OpenCode)
 * Context: Jarvis extension system
 * Created: 2026-04-04
 */

import type { Bot, Context } from "grammy";
import type { ExtensionHandler } from "./types.js";
import { logger } from "../utils/logger.js";

interface PrefixRoute {
  prefix: string;
  handler: ExtensionHandler;
}

class CallbackRouter {
  private routes: PrefixRoute[] = [];

  register(handler: ExtensionHandler): void {
    if (!handler.callbacks) return;
    for (const prefix of handler.callbacks.prefixes) {
      this.routes.push({ prefix, handler });
      logger.info(`[Extensions] Callback route: "${prefix}" -> ${handler.name}`);
    }
  }

  async handle(ctx: Context, bot: Bot<Context>): Promise<boolean> {
    const data = ctx.callbackQuery?.data;
    if (!data) return false;

    for (const route of this.routes) {
      if (data.startsWith(route.prefix)) {
        try {
          const handled = await route.handler.callbacks!.handle(ctx, bot);
          if (handled) {
            logger.debug(`[Extensions] Callback handled by ${route.handler.name}: ${data.substring(0, 50)}`);
            return true;
          }
        } catch (err) {
          logger.error(`[Extensions] Callback error in ${route.handler.name}:`, err);
          await ctx.answerCallbackQuery({ text: "Extension error" }).catch(() => {});
          return true;
        }
      }
    }
    return false;
  }

  clear(): void {
    this.routes = [];
  }
}

export const callbackRouter = new CallbackRouter();
