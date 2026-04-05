/**
 * Job Scheduler - runs background monitoring jobs on intervals.
 *
 * Origin: Claude Opus 4.6 (OpenCode)
 * Context: Jarvis extension system
 * Created: 2026-04-04
 */

import type { Bot, Context } from "grammy";
import type { ExtensionHandler, ExtensionContext, JobConfig } from "./types.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

interface RunningJob {
  config: JobConfig;
  handler: ExtensionHandler;
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
}

class JobScheduler {
  private jobs: RunningJob[] = [];
  private bot: Bot<Context> | null = null;
  private stateDir: string = "";

  initialize(bot: Bot<Context>, stateDir: string): void {
    this.bot = bot;
    this.stateDir = stateDir;
  }

  register(handler: ExtensionHandler): void {
    if (!handler.jobs) return;
    for (const jobConfig of handler.jobs) {
      this.jobs.push({
        config: jobConfig,
        handler,
        timer: null,
        running: false,
      });
      const intervalMin = Math.round(jobConfig.intervalMs / 60000);
      logger.info(`[Extensions] Job: "${jobConfig.name}" (every ${intervalMin}min) -> ${handler.name}`);
    }
  }

  async startAll(): Promise<void> {
    if (!this.bot) {
      logger.error("[Extensions] JobScheduler not initialized");
      return;
    }

    for (const job of this.jobs) {
      if (job.config.runOnStart) {
        // Delay initial run by 10s to let the bot fully initialize
        setTimeout(() => {
          this.executeJob(job).catch((err) => {
            logger.error(`[Extensions] Initial job run failed for "${job.config.name}":`, err);
          });
        }, 10000);
      }

      job.timer = setInterval(() => {
        this.executeJob(job).catch((err) => {
          logger.error(`[Extensions] Interval job failed for "${job.config.name}":`, err);
        });
      }, job.config.intervalMs);

      logger.info(`[Extensions] Job started: "${job.config.name}"`);
    }
  }

  private async executeJob(job: RunningJob): Promise<void> {
    if (job.running) {
      logger.debug(`[Extensions] Job "${job.config.name}" still running, skipping`);
      return;
    }

    job.running = true;
    const startTime = Date.now();

    try {
      const ctx: ExtensionContext = {
        bot: this.bot!,
        chatId: config.telegram.allowedUserId,
        stateDir: this.stateDir,
        log: {
          info: (msg: string, ...args: unknown[]) => logger.info(`[${job.config.name}] ${msg}`, ...args),
          warn: (msg: string, ...args: unknown[]) => logger.warn(`[${job.config.name}] ${msg}`, ...args),
          error: (msg: string, ...args: unknown[]) => logger.error(`[${job.config.name}] ${msg}`, ...args),
          debug: (msg: string, ...args: unknown[]) => logger.debug(`[${job.config.name}] ${msg}`, ...args),
        },
      };

      await job.config.execute(ctx);

      const elapsed = Date.now() - startTime;
      logger.debug(`[Extensions] Job "${job.config.name}" completed in ${elapsed}ms`);
    } catch (err) {
      logger.error(`[Extensions] Job "${job.config.name}" failed:`, err);
    } finally {
      job.running = false;
    }
  }

  async stopAll(): Promise<void> {
    for (const job of this.jobs) {
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = null;
      }
    }
    logger.info("[Extensions] All jobs stopped");
  }

  clear(): void {
    this.stopAll();
    this.jobs = [];
  }
}

export const jobScheduler = new JobScheduler();
