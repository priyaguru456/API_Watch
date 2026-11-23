/**
 * asyncHandler - Async Request Wrapper
 * Catches unhandled promise rejections and forwards them to Express error middleware.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
