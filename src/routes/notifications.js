const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();
router.use(requireAuth);

router.patch('/:id/read', async (req, res) => {
  const data = db.read();
  const note = data.notifications.find(n => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'Ntibonetse.' });
  note.read = true;
  await db.write(data);
  res.json(note);
});

module.exports = router;
