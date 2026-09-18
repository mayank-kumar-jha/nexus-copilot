'use strict';

const { Router } = require('express');
const SessionController = require('../controllers/session.controller');
const sessionService = require('../services/session.service');

const router = Router();
const controller = new SessionController(sessionService);

router.post('/', controller.createSession);
router.delete('/:id', controller.closeSession);

module.exports = router;
