const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

let currentJobId = null;
let exemptList = new Set(); // Whitelisted users
let activePlayers = new Map(); // Currently in server
let waitlist = new Map(); // Discord ID -> {username, position, brainrotPaid, steals, addedAt}

app.use(express.json());

// Middleware for API key validation
const requireApiKey = (req, res, next) => {
    const apiKey = req.body.apiKey || req.query.apiKey || req.headers['x-api-key'];
    
    if (!process.env.API_KEY) {
        console.warn('⚠️ API_KEY not set in environment variables!');
        return next();
    }
    
    if (apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Invalid or missing API key' });
    }
    
    next();
};

// Root endpoint
app.get('/', (req, res) => {
    res.send(`
        <h1>🎮 SAB Waitlist System</h1>
        <p>📋 Current JobId: ${currentJobId || 'Not set'}</p>
        <p>👥 Active Players: ${activePlayers.size}</p>
        <p>✅ Exempt Users: ${exemptList.size}</p>
        <p>⏳ Waitlist: ${waitlist.size} users</p>
        <hr>
        <h2>📡 API Status</h2>
        <p>✅ Server is running</p>
        <p>🔑 API Key: ${process.env.API_KEY ? 'Configured' : '❌ Not Set'}</p>
    `);
});

// Health check endpoint
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
    
    if (!jobId) {
        return res.status(400).json({ error: 'JobId is required' });
    }
    
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
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    
    const avatarUrl = avatar || (userId ? 
        `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png` : 
        'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png'
    );
    
    activePlayers.set(username, {
        username,
        displayName: displayName || username,
        userId: userId || 0,
        device: device || 'Unknown',
        avatar: avatarUrl,
        joinedAt: Date.now()
    });
    
    console.log(`✅ Player joined: ${username} (${displayName || username}) on ${device || 'Unknown'}`);
    res.json({ success: true, player: activePlayers.get(username) });
});

app.post('/player/leave', (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    
    const existed = activePlayers.has(username);
    activePlayers.delete(username);
    
    if (existed) {
        console.log(`🚪 Player left: ${username}`);
    }
    
    res.json({ success: true, existed });
});

app.get('/players/list', (req, res) => {
    const players = Array.from(activePlayers.values()).sort((a, b) => a.joinedAt - b.joinedAt);
    res.json({ 
        players,
        count: players.length,
        jobId: currentJobId
    });
});

app.get('/players/count', (req, res) => {
    res.json({ 
        count: activePlayers.size,
        jobId: currentJobId
    });
});

// ========================================================
// EXEMPT LIST (WHITELIST)
// ========================================================

app.post('/exempt/add', requireApiKey, (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    
    const normalizedUsername = username.toLowerCase().trim();
    exemptList.add(normalizedUsername);
    console.log(`✅ Added to exempt list: ${username}`);
    res.json({ success: true, username: normalizedUsername });
});

app.post('/exempt/remove', requireApiKey, (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    
    const normalizedUsername = username.toLowerCase().trim();
    const existed = exemptList.has(normalizedUsername);
    exemptList.delete(normalizedUsername);
    
    console.log(`${existed ? '🗑️' : '⚠️'} ${existed ? 'Removed' : 'Attempted to remove'} from exempt list: ${username}`);
    res.json({ success: true, username: normalizedUsername, existed });
});

app.get('/exempt/check/:username', (req, res) => {
    const username = req.params.username.toLowerCase().trim();
    const exempt = exemptList.has(username);
    res.json({ exempt, username });
});

app.get('/exempt/list', (req, res) => {
    const users = Array.from(exemptList).sort();
    res.json({ users, count: users.length });
});

// ========================================================
// WHITELIST CHECK (for Roblox game)
// ========================================================

app.get('/checkwhitelist', (req, res) => {
    const username = req.query.username;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    const normalizedUsername = username.toLowerCase().trim();
    const isWhitelisted = exemptList.has(normalizedUsername);
    
    console.log(`🔍 Whitelist check for ${username}: ${isWhitelisted}`);
    
    res.json({ 
        isWhitelisted,
        username: normalizedUsername
    });
});

// ========================================================
// WAITLIST MANAGEMENT
// ========================================================

app.post('/waitlist/add', requireApiKey, (req, res) => {
    const { discordId, discordUsername, brainrotPaid, steals } = req.body;
    
    if (!discordId || !discordUsername) {
        return res.status(400).json({ error: 'discordId and discordUsername are required' });
    }
    
    // Check if user already exists
    if (waitlist.has(discordId)) {
        return res.status(409).json({ 
            error: 'User already in waitlist',
            user: waitlist.get(discordId)
        });
    }
    
    // Calculate position (last position + 1)
    let maxPosition = 0;
    waitlist.forEach(user => {
        if (user.position > maxPosition) maxPosition = user.position;
    });
    
    const newUser = {
        discordId,
        discordUsername,
        position: maxPosition + 1,
        brainrotPaid: brainrotPaid || 0,
        steals: steals || 0,
        addedAt: Date.now()
    };
    
    waitlist.set(discordId, newUser);
    
    console.log(`✅ Added to waitlist: ${discordUsername} (Position: ${maxPosition + 1}, Steals: ${steals || 0})`);
    res.json({ 
        success: true, 
        position: maxPosition + 1,
        user: newUser
    });
});

app.post('/waitlist/remove', requireApiKey, (req, res) => {
    const { discordId } = req.body;
    
    if (!discordId) {
        return res.status(400).json({ error: 'discordId is required' });
    }
    
    const user = waitlist.get(discordId);
    if (user) {
        waitlist.delete(discordId);
        console.log(`🗑️ Removed from waitlist: ${user.discordUsername}`);
        res.json({ success: true, user });
    } else {
        res.status(404).json({ error: 'User not in waitlist' });
    }
});

app.post('/waitlist/addsteals', requireApiKey, (req, res) => {
    const { discordId, amount } = req.body;
    
    if (!discordId) {
        return res.status(400).json({ error: 'discordId is required' });
    }
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
    }
    
    const user = waitlist.get(discordId);
    if (user) {
        user.steals = (user.steals || 0) + amount;
        waitlist.set(discordId, user); // Update the map
        console.log(`✅ Added ${amount} steals to ${user.discordUsername} (Total: ${user.steals})`);
        res.json({ success: true, user });
    } else {
        res.status(404).json({ error: 'User not in waitlist' });
    }
});

app.post('/waitlist/usesteals', (req, res) => {
    const { discordId, amount } = req.body;
    
    if (!discordId) {
        return res.status(400).json({ error: 'discordId is required' });
    }
    
    const stealAmount = amount || 1;
    
    const user = waitlist.get(discordId);
    if (user) {
        const previousSteals = user.steals || 0;
        user.steals = Math.max(0, previousSteals - stealAmount);
        
        // If steals reach 0, remove from waitlist
        if (user.steals === 0) {
            waitlist.delete(discordId);
            console.log(`🗑️ User ran out of steals, removed: ${user.discordUsername}`);
            res.json({ success: true, removed: true, user });
        } else {
            waitlist.set(discordId, user); // Update the map
            console.log(`📉 Used ${stealAmount} steals for ${user.discordUsername} (${previousSteals} -> ${user.steals})`);
            res.json({ success: true, removed: false, user });
        }
    } else {
        res.status(404).json({ error: 'User not in waitlist' });
    }
});

app.post('/waitlist/updateposition', requireApiKey, (req, res) => {
    const { discordId, newPosition } = req.body;
    
    if (!discordId) {
        return res.status(400).json({ error: 'discordId is required' });
    }
    
    if (!newPosition || newPosition < 0) {
        return res.status(400).json({ error: 'newPosition must be a positive number' });
    }
    
    const user = waitlist.get(discordId);
    if (user) {
        const oldPosition = user.position;
        user.position = newPosition;
        waitlist.set(discordId, user);
        console.log(`📊 Updated position for ${user.discordUsername}: ${oldPosition} -> ${newPosition}`);
        res.json({ success: true, user, oldPosition });
    } else {
        res.status(404).json({ error: 'User not in waitlist' });
    }
});

app.get('/waitlist/list', (req, res) => {
    const users = Array.from(waitlist.values()).sort((a, b) => a.position - b.position);
    
    const activeUsers = users.filter(u => u.position > 1);
    const waitingUsers = users.filter(u => u.position <= 1);
    
    res.json({ 
        all: users,
        active: activeUsers,
        waiting: waitingUsers,
        totalCount: users.length,
        activeCount: activeUsers.length,
        waitingCount: waitingUsers.length
    });
});

app.get('/waitlist/get/:discordId', (req, res) => {
    const { discordId } = req.params;
    
    if (!discordId) {
        return res.status(400).json({ error: 'discordId is required' });
    }
    
    const user = waitlist.get(discordId);
    if (user) {
        res.json({ success: true, user });
    } else {
        res.status(404).json({ error: 'User not in waitlist' });
    }
});

// Bulk position update endpoint
app.post('/waitlist/reorder', requireApiKey, (req, res) => {
    const { positions } = req.body; // Array of {discordId, position}
    
    if (!positions || !Array.isArray(positions)) {
        return res.status(400).json({ error: 'positions array is required' });
    }
    
    let updated = 0;
    positions.forEach(({ discordId, position }) => {
        const user = waitlist.get(discordId);
        if (user && position >= 0) {
            user.position = position;
            waitlist.set(discordId, user);
            updated++;
        }
    });
    
    console.log(`📊 Bulk reorder: Updated ${updated} positions`);
    res.json({ success: true, updated });
});

// ========================================================
// ERROR HANDLING
// ========================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message
    });
});

// ========================================================
// CLEANUP & UTILITIES
// ========================================================

// Auto-cleanup stale player sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    let removed = 0;
    
    activePlayers.forEach((player, username) => {
        if (now - player.joinedAt > 600000) { // 10 minutes
            activePlayers.delete(username);
            removed++;
        }
    });
    
    if (removed > 0) {
        console.log(`🧹 Cleaned up ${removed} stale player sessions`);
    }
}, 300000); // Every 5 minutes

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 SIGINT received, shutting down gracefully...');
    process.exit(0);
});

// ========================================================
// SERVER START
// ========================================================

app.listen(port, () => {
    console.log('═══════════════════════════════════════');
    console.log(`🚀 SAB Waitlist Server Running`);
    console.log(`📡 Port: ${port}`);
    console.log(`📋 JobId: ${currentJobId || 'Not set'}`);
    console.log(`🔑 API Key: ${process.env.API_KEY ? 'Configured ✓' : 'Not Set ✗'}`);
    console.log(`✅ Server Ready!`);
    console.log('═══════════════════════════════════════');
});
