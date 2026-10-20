
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({
      success: false,
      message: 'Please log in to access this resource.',
    });
  }

  req.userId = req.session.userId;
  next();
}
