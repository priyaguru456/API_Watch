/**
 * ApiResponse - Standardized API Response Helper
 * Formats consistent JSON payloads for all successful HTTP responses.
 */
export class ApiResponse {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {*} data - Payload data
   * @param {string} message - Response status or information message
   */
  constructor(statusCode, data, message = 'Success') {
    this.statusCode = statusCode;
    this.success = statusCode < 400;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Send formatted JSON response
   * @param {import('express').Response} res
   */
  send(res) {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      data: this.data,
      timestamp: this.timestamp,
    });
  }
}
