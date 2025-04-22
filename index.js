import express from 'express';
import cors from 'cors';
import { submitTask } from './handlers/submitTask.js'; // <-- import function đã tách

const app = express();
app.use(cors());
app.use(express.json());

app.post('/submit-tasks', async (req, res) => {
  const tasks = req.body?.tasks;

  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: "Invalid format. 'tasks' must be an array." });
  }

  try {
    const result = await submitTask(tasks);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error handling tasks:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
