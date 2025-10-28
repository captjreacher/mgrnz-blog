/**
 * Lightweight in-memory job scheduler for recurring analytics exports and
 * maintenance tasks.
 */
export class Scheduler {
  constructor(options = {}) {
    this.jobs = new Map();
    this.logger = options.logger || console;
  }

  /**
   * Schedule a job to run at a fixed interval.
   *
   * @param {string} name - Job name.
   * @param {Function} handler - Function to execute.
   * @param {Object} options - Job options.
   * @param {number} options.interval - Interval in milliseconds.
   * @param {boolean} [options.immediate=false] - Run immediately on schedule.
   * @param {Object} [options.meta] - Arbitrary metadata for the job.
   */
  scheduleJob(name, handler, options = {}) {
    if (!name) throw new Error('Job name is required');
    if (typeof handler !== 'function') throw new Error('Job handler must be a function');
    if (!options.interval || options.interval <= 0) {
      throw new Error(`Job interval must be greater than zero for job ${name}`);
    }

    this.cancelJob(name);

    const job = {
      name,
      handler,
      options,
      timer: null
    };

    const execute = async () => {
      try {
        this.logger.debug?.(`Scheduler executing job: ${name}`);
        await handler(job);
      } catch (error) {
        this.logger.error?.(`Scheduler job ${name} failed: ${error.message}`);
      }
    };

    if (options.immediate) {
      setTimeout(execute, 0);
    }

    job.timer = setInterval(execute, options.interval);
    this.jobs.set(name, job);
    this.logger.info?.(`Scheduled job '${name}' every ${options.interval}ms`);
    return job;
  }

  /**
   * Run a scheduled job immediately.
   */
  async runJobNow(name) {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Job not found: ${name}`);
    this.logger.debug?.(`Manually triggering job ${name}`);
    await job.handler(job);
  }

  /**
   * Cancel a scheduled job if it exists.
   */
  cancelJob(name) {
    const job = this.jobs.get(name);
    if (job && job.timer) {
      clearInterval(job.timer);
      this.logger.info?.(`Cancelled job '${name}'`);
    }
    this.jobs.delete(name);
  }

  /**
   * Cancel all scheduled jobs.
   */
  cancelAll() {
    for (const name of this.jobs.keys()) {
      this.cancelJob(name);
    }
  }

  /**
   * Load and schedule jobs from configuration.
   *
   * @param {Array<Object>} jobConfigs - Job configuration entries.
   * @param {Function} handlerFactory - Factory returning job handlers.
   */
  loadFromConfig(jobConfigs, handlerFactory) {
    if (!Array.isArray(jobConfigs)) {
      throw new Error('Scheduler config must be an array of job definitions');
    }

    jobConfigs.forEach(jobConfig => {
      const handler = handlerFactory(jobConfig);
      this.scheduleJob(jobConfig.name, handler, {
        interval: jobConfig.interval,
        immediate: jobConfig.immediate,
        meta: jobConfig.meta
      });
    });
  }
}

export default Scheduler;
