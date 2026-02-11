const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

let currentJobId = null;
let exemptList = new Set();
let activePlayers = new Map();
let waitlist = new Map();

// ========================================================
// API KEY MIDDLEWARE
// ========================================================

const requireApiKey = (req, res, next) => {
    const apiKey = req.body.apiKey || req.query.apiKey || req.headers['x-api-key'];
    if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Invalid or missing API key' });
    }
    next();
};

// ========================================================
// ROOT & HEALTH
// ========================================================

app.get('/', (req, res) => {
    res.send(`
        <h1>🎮 SAB Waitlist System</h1>
        <p>📋 Current JobId: ${currentJobId || 'Not set'}</p>
        <p>👥 Active Players: ${activePlayers.size}</p>
        <p>✅ Exempt Users: ${exemptList.size}</p>
        <p>⏳ Waitlist: ${waitlist.size} users</p>
        <hr>
        <p>🔑 API Key: ${process.env.API_KEY ? 'Configured ✓' : '❌ Not Set'}</p>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        jobId: currentJobId,
        playerCount: activePlayers.size,
        waitlistCount: waitlist.size
    });
});

// ========================================================
// JOBID MANAGEMENT
// ========================================================

app.post('/update', (req, res) => {
    const { jobId, username } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    currentJobId = jobId;
    console.log(`✅ JobId updated: ${currentJobId}${username ? ` by ${username}` : ''}`);
    res.json({ success: true, jobId: currentJobId });
});

app.get('/getjobid', (req, res) => {
    if (currentJobId) {
        res.json({ jobId: currentJobId });
    } else {
        res.status(404).json({ error: 'No JobId available' });
    }
});

// ========================================================
// PLAYER SESSION MANAGEMENT
// ========================================================

app.post('/player/join', (req, res) => {
    const { username, displayName, userId, device, avatar } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });

    const avatarUrl = avatar || `https://www.roblox.com/headshot-thumbnail/image?userId=${userId || 1}&width=420&height=420&format=png`;

    const player = {
        username,
        displayName: displayName || username,
        userId: userId || 0,
        device: device || 'Unknown',
        avatar: avatarUrl,
        joinedAt: Date.now()
    };

    activePlayers.set(username, player);
    console.log(`✅ Player joined: ${username} on ${device || 'Unknown'}`);
    res.json({ success: true, player });
});

app.post('/player/leave', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });

    const existed = activePlayers.has(username);
    activePlayers.delete(username);
    if (existed) console.log(`🚪 Player left: ${username}`);
    res.json({ success: true, existed });
});

app.get('/players/list', (req, res) => {
    const players = Array.from(activePlayers.values()).sort((a, b) => a.joinedAt - b.joinedAt);
    res.json({ players, count: players.length, jobId: currentJobId });
});

app.get('/players/count', (req, res) => {
    res.json({ count: activePlayers.size, jobId: currentJobId });
});

// ========================================================
// EXEMPT LIST (WHITELIST)
// ========================================================

app.post('/exempt/add', requireApiKey, (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });

    const normalized = username.toLowerCase().trim();
    exemptList.add(normalized);
    console.log(`✅ Added to exempt list: ${normalized}`);
    res.json({ success: true, username: normalized });
});

app.post('/exempt/remove', requireApiKey, (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });

    const normalized = username.toLowerCase().trim();
    const existed = exemptList.has(normalized);
    exemptList.delete(normalized);
    console.log(`🗑️ Removed from exempt list: ${normalized} (existed: ${existed})`);
    res.json({ success: true, username: normalized, existed });
});

app.get('/exempt/check/:username', (req, res) => {
    const username = req.params.username.toLowerCase().trim();
    res.json({ exempt: exemptList.has(username), username });
});

app.get('/exempt/list', (req, res) => {
    const users = Array.from(exemptList).sort();
    res.json({ users, count: users.length });
});

app.get('/checkwhitelist', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username is required' });

    const normalized = username.toLowerCase().trim();
    const isWhitelisted = exemptList.has(normalized);
    console.log(`🔍 Whitelist check: ${normalized} = ${isWhitelisted}`);
    res.json({ isWhitelisted, username: normalized });
});

// ========================================================
// WAITLIST MANAGEMENT
// ========================================================

app.post('/waitlist/add', requireApiKey, (req, res) => {
    const { discordId, discordUsername, brainrotPaid, steals } = req.body;
    if (!discordId || !discordUsername) {
        return res.status(400).json({ error: 'discordId and discordUsername are required' });
    }

    if (waitlist.has(discordId)) {
        return res.status(409).json({ error: 'User already in waitlist', user: waitlist.get(discordId) });
    }

    let maxPosition = 0;
    waitlist.forEach(u => { if (u.position > maxPosition) maxPosition = u.position; });

    const newUser = {
        discordId,
        discordUsername,
        position: maxPosition + 1,
        brainrotPaid: brainrotPaid || 0,
        steals: steals || 0,
        addedAt: Date.now()
    };

    waitlist.set(discordId, newUser);
    console.log(`✅ Added to waitlist: ${discordUsername} (Position: ${newUser.position})`);
    res.json({ success: true, position: newUser.position, user: newUser });
});

app.post('/waitlist/remove', requireApiKey, (req, res) => {
    const { discordId } = req.body;
    if (!discordId) return res.status(400).json({ error: 'discordId is required' });

    const user = waitlist.get(discordId);
    if (!user) return res.status(404).json({ error: 'User not in waitlist' });

    waitlist.delete(discordId);
    console.log(`🗑️ Removed from waitlist: ${user.discordUsername}`);
    res.json({ success: true, user });
});

app.post('/waitlist/addsteals', requireApiKey, (req, res) => {
    const { discordId, amount } = req.body;
    if (!discordId) return res.status(400).json({ error: 'discordId is required' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

    const user = waitlist.get(discordId);
    if (!user) return res.status(404).json({ error: 'User not in waitlist' });

    user.steals = (user.steals || 0) + amount;
    waitlist.set(discordId, user);
    console.log(`✅ Added ${amount} steals to ${user.discordUsername} (Total: ${user.steals})`);
    res.json({ success: true, user });
});

app.post('/waitlist/usesteals', (req, res) => {
    const { discordId, amount } = req.body;
    if (!discordId) return res.status(400).json({ error: 'discordId is required' });

    const user = waitlist.get(discordId);
    if (!user) return res.status(404).json({ error: 'User not in waitlist' });

    const stealAmount = amount || 1;
    const prev = user.steals || 0;
    user.steals = Math.max(0, prev - stealAmount);

    if (user.steals === 0) {
        waitlist.delete(discordId);
        console.log(`🗑️ Out of steals, removed: ${user.discordUsername}`);
        res.json({ success: true, removed: true, user });
    } else {
        waitlist.set(discordId, user);
        console.log(`📉 Used ${stealAmount} steals for ${user.discordUsername} (${prev} -> ${user.steals})`);
        res.json({ success: true, removed: false, user });
    }
});

app.post('/waitlist/updateposition', requireApiKey, (req, res) => {
    const { discordId, newPosition } = req.body;
    if (!discordId) return res.status(400).json({ error: 'discordId is required' });
    if (newPosition == null || newPosition < 0) return res.status(400).json({ error: 'newPosition must be >= 0' });

    const user = waitlist.get(discordId);
    if (!user) return res.status(404).json({ error: 'User not in waitlist' });

    const oldPosition = user.position;
    user.position = newPosition;
    waitlist.set(discordId, user);
    console.log(`📊 Position updated for ${user.discordUsername}: ${oldPosition} -> ${newPosition}`);
    res.json({ success: true, user, oldPosition });
});

app.get('/waitlist/list', (req, res) => {
    const users = Array.from(waitlist.values()).sort((a, b) => a.position - b.position);
    const active = users.filter(u => u.position > 1);
    const waiting = users.filter(u => u.position <= 1);

    res.json({
        all: users,
        active,
        waiting,
        totalCount: users.length,
        activeCount: active.length,
        waitingCount: waiting.length
    });
});

app.get('/waitlist/get/:discordId', (req, res) => {
    const user = waitlist.get(req.params.discordId);
    if (!user) return res.status(404).json({ error: 'User not in waitlist' });
    res.json({ success: true, user });
});

// ========================================================
// ERROR HANDLING
// ========================================================

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path, method: req.method });
});

app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ========================================================
// CLEANUP
// ========================================================

setInterval(() => {
    const now = Date.now();
    let removed = 0;
    activePlayers.forEach((player, username) => {
        if (now - player.joinedAt > 600000) {
            activePlayers.delete(username);
            removed++;
        }
    });
    if (removed > 0) console.log(`🧹 Cleaned up ${removed} stale player session(s)`);
}, 300000);

process.on('SIGTERM', () => { console.log('📴 Shutting down...'); process.exit(0); });
process.on('SIGINT', () => { console.log('📴 Shutting down...'); process.exit(0); });

// ========================================================
// START
// ========================================================

app.listen(port, () => {
    console.log('═══════════════════════════════════════');
    console.log(`🚀 SAB Waitlist Server running on port ${port}`);
    console.log(`🔑 API Key: ${process.env.API_KEY ? 'Configured ✓' : 'Not Set ✗'}`);
    console.log('═══════════════════════════════════════');
});
