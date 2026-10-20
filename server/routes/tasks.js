
import { Router } from 'express';
import {
  body,
  param,
  query,
  validationResult,
} from 'express-validator';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

const statuses = ['todo', 'in_progress', 'completed'];
const priorities = ['low', 'medium', 'high'];

function validateRequest(req, res) {
  const result = validationResult(req);

  if (result.isEmpty()) return false;

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

async function getTaskAccess(taskId, userId) {
  const result = await pool.query(
    `SELECT t.*
     FROM tasks t
     JOIN team_members tm ON tm.team_id = t.team_id
     WHERE t.id = $1 AND tm.user_id = $2`,
    [taskId, userId]
  );

  return result.rows[0] || null;
}

async function validateAssignee(teamId, assignedTo) {
  if (assignedTo === null || assignedTo === undefined || assignedTo === '') {
    return true;
  }

  const result = await pool.query(
    `SELECT 1
     FROM team_members
     WHERE team_id = $1 AND user_id = $2`,
    [teamId, assignedTo]
  );

  return result.rowCount > 0;
}

// GET /api/tasks?teamId=UUID&status=todo&priority=high&assignedTo=UUID
router.get(
  '/',
  [
    query('teamId').isUUID().withMessage('A valid teamId is required.'),
    query('status')
      .optional()
      .isIn(statuses)
      .withMessage('Invalid task status.'),
    query('priority')
      .optional()
      .isIn(priorities)
      .withMessage('Invalid task priority.'),
    query('assignedTo')
      .optional()
      .isUUID()
      .withMessage('Invalid assignee ID.'),
  ],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    try {
      const { teamId, status, priority, assignedTo } = req.query;
      const membership = await getMembership(teamId, req.userId);

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this team.',
        });
      }

      const values = [teamId];
      const conditions = ['t.team_id = $1'];

      if (status) {
        values.push(status);
        conditions.push(`t.status = $${values.length}`);
      }

      if (priority) {
        values.push(priority);
        conditions.push(`t.priority = $${values.length}`);
      }

      if (assignedTo) {
        values.push(assignedTo);
        conditions.push(`t.assigned_to = $${values.length}`);
      }

      const result = await pool.query(
        `SELECT
           t.id,
           t.team_id,
           t.title,
           t.description,
           t.status,
           t.priority,
           t.assigned_to,
           assignee.name AS assigned_to_name,
           t.created_by,
           creator.name AS created_by_name,
           t.due_date,
           t.created_at,
           t.updated_at
         FROM tasks t
         LEFT JOIN users assignee ON assignee.id = t.assigned_to
         JOIN users creator ON creator.id = t.created_by
         WHERE ${conditions.join(' AND ')}
         ORDER BY
           CASE t.status
             WHEN 'in_progress' THEN 1
             WHEN 'todo' THEN 2
             ELSE 3
           END,
           t.due_date ASC NULLS LAST,
           t.created_at DESC`,
        values
      );

      res.json({ success: true, tasks: result.rows });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/tasks
router.post(
  '/',
  [
    body('team_id').isUUID().withMessage('A valid team_id is required.'),
    body('title')
      .isString()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Title must be 2–200 characters.'),
    body('description')
      .optional()
      .isString()
      .isLength({ max: 5000 })
      .withMessage('Description cannot exceed 5000 characters.'),
    body('status')
      .optional()
      .isIn(statuses)
      .withMessage('Invalid task status.'),
    body('priority')
      .optional()
      .isIn(priorities)
      .withMessage('Invalid task priority.'),
    body('assigned_to')
      .optional({ nullable: true, checkFalsy: true })
      .isUUID()
      .withMessage('Invalid assignee ID.'),
    body('due_date')
      .optional({ nullable: true, checkFalsy: true })
      .isISO8601()
      .withMessage('Due date must be a valid date.'),
  ],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    try {
      const {
        team_id,
        title,
        description = '',
        status = 'todo',
        priority = 'medium',
        assigned_to = null,
        due_date = null,
      } = req.body;

      const membership = await getMembership(team_id, req.userId);

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this team.',
        });
      }

      if (!(await validateAssignee(team_id, assigned_to))) {
        return res.status(400).json({
          success: false,
          message: 'Assignee must be a member of this team.',
        });
      }

      const result = await pool.query(
        `INSERT INTO tasks
           (team_id, title, description, status, priority,
            assigned_to, created_by, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          team_id,
          title.trim(),
          description.trim(),
          status,
          priority,
          assigned_to || null,
          req.userId,
          due_date || null,
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Task created successfully.',
        task: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/tasks/:taskId
router.patch(
  '/:taskId',
  [
    param('taskId').isUUID().withMessage('Invalid task ID.'),
    body('title')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Title must be 2–200 characters.'),
    body('description')
      .optional()
      .isString()
      .isLength({ max: 5000 })
      .withMessage('Description cannot exceed 5000 characters.'),
    body('status')
      .optional()
      .isIn(statuses)
      .withMessage('Invalid task status.'),
    body('priority')
      .optional()
      .isIn(priorities)
      .withMessage('Invalid task priority.'),
    body('assigned_to')
      .optional({ nullable: true })
      .custom((value) => value === null || value === '' || (
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ))
      .withMessage('Invalid assignee ID.'),
    body('due_date')
      .optional({ nullable: true })
      .custom((value) => value === null || value === '' || (
        typeof value === 'string' &&
        !Number.isNaN(Date.parse(value))
      ))
      .withMessage('Due date must be a valid date.'),
  ],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    const allowedFields = [
      'title',
      'description',
      'status',
      'priority',
      'assigned_to',
      'due_date',
    ];

    const suppliedFields = allowedFields.filter((field) =>
      Object.hasOwn(req.body, field)
    );

    if (suppliedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one field to update.',
      });
    }

    try {
      const task = await getTaskAccess(req.params.taskId, req.userId);

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found or you do not have access.',
        });
      }

      if (Object.hasOwn(req.body, 'assigned_to')) {
        const assignee = req.body.assigned_to;

        if (!(await validateAssignee(task.team_id, assignee))) {
          return res.status(400).json({
            success: false,
            message: 'Assignee must be a member of this team.',
          });
        }
      }

      const values = [];
      const updates = [];

      for (const field of suppliedFields) {
        let value = req.body[field];

        if (field === 'title') value = value.trim();
        if (field === 'description') value = value.trim();
        if (field === 'assigned_to' && value === '') value = null;
        if (field === 'due_date' && value === '') value = null;

        values.push(value);
        updates.push(`${field} = $${values.length}`);
      }

      updates.push('updated_at = NOW()');
      values.push(task.id);

      const result = await pool.query(
        `UPDATE tasks
         SET ${updates.join(', ')}
         WHERE id = $${values.length}
         RETURNING *`,
        values
      );

      res.json({
        success: true,
        message: 'Task updated successfully.',
        task: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/tasks/:taskId
router.delete(
  '/:taskId',
  [param('taskId').isUUID().withMessage('Invalid task ID.')],
  async (req, res, next) => {
    if (validateRequest(req, res)) return;

    try {
      const task = await getTaskAccess(req.params.taskId, req.userId);

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found or you do not have access.',
        });
      }

      await pool.query('DELETE FROM tasks WHERE id = $1', [task.id]);

      res.json({
        success: true,
        message: 'Task deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
