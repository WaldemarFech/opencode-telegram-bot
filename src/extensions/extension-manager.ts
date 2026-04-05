/**
 * Extension Manager - central registry and lifecycle manager for extensions.
 *
 * Scans a configured directory for .js handler files (or directories with index.js),
 * loads them, validates the ExtensionHandler interface, and wires up callbacks,
 * commands, and background jobs.
 *
 * Origin: Claude Opus 4.6 (OpenCode)
 * Context: Jarvis extension system
 * Created: 2026-04-04
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { Bot, Context } from "grammy";
import type { ExtensionHandler, ExtensionContext } from "./types.js";
import { callbackRouter } from "./callback-router.js";
import { commandRouter } from "./command-router.js";
import { jobScheduler } from "./job-scheduler.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

class ExtensionManager {
  private handlers: ExtensionHandler[] = [];
  private initialized = false;

  async initialize(bot: Bot<Context>): Promise<void> {
    if (this.initialized) return;

    const handlersDir = config.extensions.handlersDir;
    const stateDir = config.extensions.stateDir;

    if (!handlersDir) {
      logger.debug("[Extensions] No EXTENSION_HANDLERS_DIR configured, extensions disabled");
      return;
    }

    // Resolve ~ to home directory
    const resolvedHandlersDir = handlersDir.replace(/^~/, process.env.HOME || "/root");
    const resolvedStateDir = stateDir
      ? stateDir.replace(/^~/, process.env.HOME || "/root")
      : path.join(resolvedHandlersDir, "..", "state");

    // Ensure directories exist
    await fs.mkdir(resolvedHandlersDir, { recursive: true });
    await fs.mkdir(resolvedStateDir, { recursive: true });

    logger.info(`[Extensions] Loading handlers from ${resolvedHandlersDir}`);

    let entries;
    try {
      entries = await fs.readdir(resolvedHandlersDir, { withFileTypes: true });
    } catch (err) {
      logger.warn(`[Extensions] Cannot read handlers directory: ${err}`);
      return;
    }

    for (const entry of entries) {
      let handlerPath: string;

      if (entry.isDirectory()) {
        // Directory handler: look for index.js or index.mjs
        const jsPath = path.join(resolvedHandlersDir, entry.name, "index.js");
        const mjsPath = path.join(resolvedHandlersDir, entry.name, "index.mjs");

        try {
          await fs.access(jsPath);
          handlerPath = jsPath;
        } catch {
          try {
            await fs.access(mjsPath);
            handlerPath = mjsPath;
          } catch {
            logger.debug(`[Extensions] Skipping directory ${entry.name} (no index.js)`);
            continue;
          }
        }
      } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
        handlerPath = path.join(resolvedHandlersDir, entry.name);
      } else {
        continue;
      }

      try {
        const fileUrl = pathToFileURL(handlerPath).href;
        const mod = await import(fileUrl);
        const handler: ExtensionHandler = mod.default || mod;

        if (!handler.name) {
          logger.warn(`[Extensions] Handler at ${handlerPath} has no name, skipping`);
          continue;
        }

        // Create handler-specific state directory
        const handlerStateDir = path.join(
          resolvedStateDir,
          handler.name.replace(/[^a-zA-Z0-9\-_]/g, "_"),
        );
        await fs.mkdir(handlerStateDir, { recursive: true });

        // Register with routers
        callbackRouter.register(handler);
        commandRouter.register(handler);
        jobScheduler.register(handler);

        // Initialize handler
        if (handler.init) {
          const ctx: ExtensionContext = {
            bot,
            chatId: config.telegram.allowedUserId,
            stateDir: handlerStateDir,
            log: {
              info: (msg: string, ...args: unknown[]) =>
                logger.info(`[${handler.name}] ${msg}`, ...args),
              warn: (msg: string, ...args: unknown[]) =>
                logger.warn(`[${handler.name}] ${msg}`, ...args),
              error: (msg: string, ...args: unknown[]) =>
                logger.error(`[${handler.name}] ${msg}`, ...args),
              debug: (msg: string, ...args: unknown[]) =>
                logger.debug(`[${handler.name}] ${msg}`, ...args),
            },
          };
          await handler.init(ctx);
        }

        this.handlers.push(handler);
        logger.info(
          `[Extensions] Loaded: ${handler.name}${handler.version ? ` v${handler.version}` : ""}`,
        );
      } catch (err) {
        logger.error(`[Extensions] Failed to load handler ${handlerPath}:`, err);
      }
    }

    // Initialize job scheduler (jobs start later via startJobs)
    jobScheduler.initialize(bot, resolvedStateDir);

    this.initialized = true;
    logger.info(`[Extensions] ${this.handlers.length} handler(s) loaded`);
  }

  async startJobs(): Promise<void> {
    await jobScheduler.startAll();
  }

  async handleCallback(ctx: Context, bot: Bot<Context>): Promise<boolean> {
    return callbackRouter.handle(ctx, bot);
  }

  /**
   * Handle an incoming text message by checking if it matches an extension command.
   * Called from middleware BEFORE unknownCommandMiddleware.
   */
  async handleCommand(ctx: Context, bot: Bot<Context>): Promise<boolean> {
    return commandRouter.handle(ctx, bot);
  }

  async shutdown(): Promise<void> {
    await jobScheduler.stopAll();
    for (const handler of this.handlers) {
      if (handler.destroy) {
        try {
          await handler.destroy();
        } catch (err) {
          logger.error(`[Extensions] Error destroying ${handler.name}:`, err);
        }
      }
    }
    callbackRouter.clear();
    commandRouter.clear();
    jobScheduler.clear();
    this.handlers = [];
    this.initialized = false;
    logger.info("[Extensions] Shutdown complete");
  }
}

export const extensionManager = new ExtensionManager();
