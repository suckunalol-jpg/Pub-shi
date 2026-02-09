const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

let currentJobId = null;

app.use(express.json());

// Endpoint to receive JobId from Roblox
app.post('/update', (req, res) => {
    currentJobId = req.body.jobId;
    console.log('Updated JobId:', currentJobId);
    res.json({ success: true, jobId: currentJobId });
});

// Endpoint for Game A to fetch the JobId
app.get('/getjobid', (req, res) => {
    if (currentJobId) {
        res.json({ jobId: currentJobId });
    } else {
        res.status(404).json({ error: 'No JobId available' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
