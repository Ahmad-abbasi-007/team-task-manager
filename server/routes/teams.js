
import { Router } from 'express';
import {
  body,
  param,
  validationResult,
} from 'express-validator';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

function validateRequest(req, res) {
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

async function getMembership(teamId, userId) {
  const result = await pool.query(
    `SELECT role
     FROM team_members
     WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  return result.rows[0] || null;
}

async function requireTeamMember(req, res) {
  const membership = await getMembership(
    req.params.teamId,
    req.userId
  );

  if (!membership) {
    res.status(403).json({
      success: false,
      message: 'You do not have access to this team.',
    });

    return null;
  }

  return membership;
}

async function requireTeamOwner(req, res) {
  const membership = await requireTeamMember(req, res);

  if (!membership) {
    return null;
  }

  if (membership.role !== 'owner') {
    res.status(403).json({
      success: false,
      message: 'Only the team owner can perform this action.',
    });

    return null;
  }

  return membership;
}

// GET /api/teams
// List teams belonging to the logged-in user.
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         t.id,
         t.name,
         t.description,
         t.created_by,
         t.created_at,
         tm.role,
         COUNT(DISTINCT all_members.user_id)::int AS member_count
       FROM teams t
       JOIN team_members tm
         ON tm.team_id = t.id
       LEFT JOIN team_members all_members
         ON all_members.team_id = t.id
       WHERE tm.user_id = $1
       GROUP BY t.id, tm.role
       ORDER BY t.created_at DESC`,
      [req.userId]
    );

    res.json({
      success: true,
      teams: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/teams
// Create a team and make the creator its owner.
router.post(
  '/',
  [
    body('name')
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Team name must be 2–100 characters.'),

    body('description')
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters.'),
  ],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    const client = await pool.connect();

    try {
      const name = req.body.name.trim();
      const description = (req.body.description ?? '').trim();

      await client.query('BEGIN');

      const teamResult = await client.query(
        `INSERT INTO teams (name, description, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, created_by, created_at`,
        [name, description, req.userId]
      );

      const team = teamResult.rows[0];

      await client.query(
        `INSERT INTO team_members (team_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [team.id, req.userId]
      );

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Team created successfully.',
        team: {
          ...team,
          role: 'owner',
          member_count: 1,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  }
);

// GET /api/teams/:teamId/members
// List members of a team.
router.get(
  '/:teamId/members',
  [param('teamId').isUUID().withMessage('Invalid team ID.')],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    try {
      const membership = await requireTeamMember(req, res);
      if (!membership) return;

      const result = await pool.query(
        `SELECT
           u.id,
           u.name,
           u.email,
           tm.role,
           tm.joined_at
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = $1
         ORDER BY
           CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END,
           tm.joined_at ASC`,
        [req.params.teamId]
      );

      res.json({
        success: true,
        members: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/teams/:teamId/members
// Add an already registered user by email. Owner only.
router.post(
  '/:teamId/members',
  [
    param('teamId').isUUID().withMessage('Invalid team ID.'),

    body('email')
      .isString()
      .trim()
      .isEmail()
      .withMessage('Enter a valid email address.')
      .normalizeEmail(),
  ],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    try {
      const membership = await requireTeamOwner(req, res);
      if (!membership) return;

      const { teamId } = req.params;
      const email = req.body.email;

      const userResult = await pool.query(
        `SELECT id, name, email
         FROM users
         WHERE email = $1`,
        [email]
      );

      const user = userResult.rows[0];

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'No registered user found with this email.',
        });
      }

      try {
        const result = await pool.query(
          `INSERT INTO team_members (team_id, user_id, role)
           VALUES ($1, $2, 'member')
           RETURNING role, joined_at`,
          [teamId, user.id]
        );

        res.status(201).json({
          success: true,
          message: 'Team member added successfully.',
          member: {
            id: user.id,
            name: user.name,
            email: user.email,
            ...result.rows[0],
          },
        });
      } catch (error) {
        if (error.code === '23505') {
          return res.status(409).json({
            success: false,
            message: 'This user is already a team member.',
          });
        }

        throw error;
      }
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/teams/:teamId/members/:userId
// Remove a member. The owner cannot be removed by this endpoint.
router.delete(
  '/:teamId/members/:userId',
  [
    param('teamId').isUUID().withMessage('Invalid team ID.'),
    param('userId').isUUID().withMessage('Invalid user ID.'),
  ],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    try {
      const membership = await requireTeamOwner(req, res);
      if (!membership) return;

      const result = await pool.query(
        `DELETE FROM team_members
         WHERE team_id = $1
           AND user_id = $2
           AND role = 'member'
         RETURNING user_id`,
        [req.params.teamId, req.params.userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Member not found, or the owner cannot be removed.',
        });
      }

      res.json({
        success: true,
        message: 'Team member removed successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/teams/:teamId
// Get a single team's details.
router.get(
  '/:teamId',
  [param('teamId').isUUID().withMessage('Invalid team ID.')],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    try {
      const membership = await requireTeamMember(req, res);
      if (!membership) return;

      const result = await pool.query(
        `SELECT
           t.id,
           t.name,
           t.description,
           t.created_by,
           t.created_at,
           t.updated_at,
           tm.role,
           (SELECT COUNT(*)::int
            FROM team_members members
            WHERE members.team_id = t.id) AS member_count
         FROM teams t
         JOIN team_members tm ON tm.team_id = t.id
         WHERE t.id = $1 AND tm.user_id = $2`,
        [req.params.teamId, req.userId]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Team not found.',
        });
      }

      res.json({
        success: true,
        team: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/teams/:teamId
// Update a team. Owner only.
router.patch(
  '/:teamId',
  [
    param('teamId').isUUID().withMessage('Invalid team ID.'),

    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Team name must be 2–100 characters.'),

    body('description')
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters.'),
  ],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    const hasName = Object.hasOwn(req.body, 'name');
    const hasDescription = Object.hasOwn(req.body, 'description');

    if (!hasName && !hasDescription) {
      return res.status(400).json({
        success: false,
        message: 'Provide a name or description to update.',
      });
    }

    try {
      const membership = await requireTeamOwner(req, res);
      if (!membership) return;

      const name = hasName ? req.body.name.trim() : null;
      const description = hasDescription
        ? req.body.description
        : null;

      const result = await pool.query(
        `UPDATE teams
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, name, description, created_by, created_at, updated_at`,
        [name, description, req.params.teamId]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Team not found.',
        });
      }

      res.json({
        success: true,
        message: 'Team updated successfully.',
        team: {
          ...result.rows[0],
          role: 'owner',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/teams/:teamId
// Delete a team. Owner only.
router.delete(
  '/:teamId',
  [param('teamId').isUUID().withMessage('Invalid team ID.')],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    try {
      const membership = await requireTeamOwner(req, res);
      if (!membership) return;

      const result = await pool.query(
        `DELETE FROM teams
         WHERE id = $1
         RETURNING id`,
        [req.params.teamId]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Team not found.',
        });
      }

      res.json({
        success: true,
        message: 'Team deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
