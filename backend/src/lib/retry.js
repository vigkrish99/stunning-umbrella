/**
 * Retry Utility with Exponential Backoff
 */

/**
 * Execute a function with retry logic and exponential backoff.
 * @param {Function} fn - Async function to execute
 * @param {number} maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} baseDelay - Base delay in ms before exponential increase (default: 2000)
 * @returns {Promise<*>} Result of the function
 */
export async function withRetry(fn, maxAttempts = 3, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(
        `[retry] Attempt ${attempt}/${maxAttempts} failed: ${error.message}. Retrying in ${delay}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
