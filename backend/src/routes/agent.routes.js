'use strict';

const { Router } = require('express');
const AgentController = require('../controllers/agent.controller');
const sessionService = require('../services/session.service');

const router = Router();
const controller = new AgentController(sessionService);

// Run a task (sync or async background queue)
router.post('/run', controller.run);

// Execute a single step (interactive / debug mode)
router.post('/step', controller.step);

// List all agent tasks
router.get('/tasks', controller.listTasks);

// Get task details, steps and history
router.get('/tasks/:id', controller.getTask);

// Human-in-the-loop approval endpoint
router.post('/tasks/:id/approve', controller.approveAction);

// Cancel a task
router.post('/tasks/:id/cancel', controller.cancelTask);

module.exports = router;
