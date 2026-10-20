
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import { pool } from '../db.js';

const router = Router();

function getValidationErrors(req, res) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return false;
  }

  res.status(400).json({
    success: false,
    message: 'Please check your input.',
    errors: result.array().map((error) => ({
      field: error.path,
      message: error.msg,
    })),
  });

  return true;
}

function createUserSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);

      req.session.userId = userId;

      req.session.save((saveError) => {
        if (saveError) return reject(saveError);
        resolve();
      });
    });
  });
}

// REGISTER
router.post(
  '/register',
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be 2–100 characters.'),

    body('email')
      .trim()
      .isEmail()
      .withMessage('Enter a valid email address.')
      .normalizeEmail(),

    body('password')
      .isString()
      .isLength({ min: 8, max: 72 })
      .withMessage('Password must be 8–72 characters.'),
  ],
  async (req, res, next) => {
    if (getValidationErrors(req, res)) return;

    try {
      const { name, email, password } = req.body;

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, created_at`,
        [name, email, passwordHash]
      );

      const user = result.rows[0];

      await createUserSession(req, user.id);

      res.status(201).json({
        success: true,
        message: 'Account created successfully.',
        user,
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists.',
        });
      }

      next(error);
    }
  }
);

// LOGIN
router.post(
  '/login',
  [
    body('email')
      .trim()
      .isEmail()
      .withMessage('Enter a valid email address.')
      .normalizeEmail(),

    body('password')
      .isString()
      .notEmpty()
      .withMessage('Password is required.'),
  ],
  async (req, res, next) => {
    if (getValidationErrors(req, res)) return;

    try {
      const { email, password } = req.body;

      const result = await pool.query(
        `SELECT id, name, email, password_hash
         FROM users
         WHERE email = $1`,
        [email]
      );

      const user = result.rows[0];

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.',
        });
      }

      await createUserSession(req, user.id);

      res.json({
        success: true,
        message: 'Login successful.',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// CURRENT USER
router.get('/me', async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in first.',
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, created_at
       FROM users
       WHERE id = $1`,
      [req.session.userId]
    );

    if (!result.rows[0]) {
      return req.session.destroy(() => {
        res.status(401).json({
          success: false,
          message: 'Session user no longer exists.',
        });
      });
    }

    res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// LOGOUT
router.post('/logout', (req, res, next) => {
  if (!req.session) {
    return res.json({
      success: true,
      message: 'Logged out.',
    });
  }

  req.session.destroy((error) => {
    if (error) return next(error);

    const isProduction = process.env.NODE_ENV === 'production';

    res.clearCookie('connect.sid', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });

    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  });
});

export default router;
