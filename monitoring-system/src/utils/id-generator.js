import { v4 as uuidv4 } from 'uuid';

/**
 * Unique ID generation system for pipeline runs and monitoring records
 */
export class IdGenerator {
  /**
   * Generate a unique pipeline run ID
   * Format: run_YYYYMMDD_HHMMSS_shortUuid
   * @returns {string} Unique pipeline run ID
   */
  static generatePipelineRunId() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const shortUuid = uuidv4().slice(0, 8);
    
    return `run_${dateStr}_${timeStr}_${shortUuid}`;
  }

  /**
   * Generate a unique webhook record ID
   * Format: webhook_shortUuid
   * @returns {string} Unique webhook ID
   */
  static generateWebhookId() {
    const shortUuid = uuidv4().replace(/-/g, '').slice(0, 12);
    return `webhook_${shortUuid}`;
  }

  /**
   * Generate a unique error record ID
   * Format: error_shortUuid
   * @returns {string} Unique error ID
   */
  static generateErrorId() {
    const shortUuid = uuidv4().replace(/-/g, '').slice(0, 10);
    return `error_${shortUuid}`;
  }

  /**
   * Generate a unique stage ID for pipeline stages
   * Format: stage_shortUuid
   * @returns {string} Unique stage ID
   */
  static generateStageId() {
    const shortUuid = uuidv4().replace(/-/g, '').slice(0, 8);
    return `stage_${shortUuid}`;
  }

  /**
   * Generate a full UUID for general purposes
   * @returns {string} Full UUID
   */
  static generateUuid() {
    return uuidv4();
  }

  /**
   * Extract timestamp from pipeline run ID
   * @param {string} runId - Pipeline run ID
   * @returns {Date|null} Extracted date or null if invalid format
   */
  static extractTimestampFromRunId(runId) {
    try {
      const match = runId.match(/^run_(\d{8})_(\d{6})_/);
      if (!match) return null;
      
      const [, dateStr, timeStr] = match;
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const hour = timeStr.slice(0, 2);
      const minute = timeStr.slice(2, 4);
      const second = timeStr.slice(4, 6);
      
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    } catch {
      return null;
    }
  }

  /**
   * Validate ID format
   * @param {string} id - ID to validate
   * @param {'run'|'webhook'|'error'|'stage'|'uuid'} type - Expected ID type
   * @returns {boolean} Whether ID is valid for the specified type
   */
  static validateId(id, type) {
    if (!id || typeof id !== 'string') return false;

    const patterns = {
      run: /^run_\d{8}_\d{6}_[a-f0-9]{8}$/,
      webhook: /^webhook_[a-f0-9]{12}$/,
      error: /^error_[a-f0-9]{10}$/,
      stage: /^stage_[a-f0-9]{8}$/,
      uuid: /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
    };

    return patterns[type]?.test(id) || false;
  }

  /**
   * Generate a batch of unique IDs
   * @param {'run'|'webhook'|'error'|'stage'|'uuid'} type - Type of IDs to generate
   * @param {number} count - Number of IDs to generate
   * @returns {string[]} Array of unique IDs
   */
  static generateBatch(type, count) {
    const generators = {
      run: this.generatePipelineRunId,
      webhook: this.generateWebhookId,
      error: this.generateErrorId,
      stage: this.generateStageId,
      uuid: this.generateUuid
    };

    const generator = generators[type];
    if (!generator) {
      throw new Error(`Unknown ID type: ${type}`);
    }

    const ids = new Set();
    while (ids.size < count) {
      ids.add(generator());
    }

    return Array.from(ids);
  }
}