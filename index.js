const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

let currentJobId = null;
let exemptList = new Set(); // Whitelisted users
let activePlayers = new Map(); // Currently in server
let waitlist = new Map(); // Discord ID -> {username, position, brainrotPaid, steals, addedAt}

app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
    res.send(`
        <h1>🎮 SAB Waitlist System</h1>
        <p>📋 Current JobId: ${currentJobId || 'Not set'}</p>
        <p>👥 Active Players: ${activePlayers.size}</p>
        <p>✅ Exempt Users: ${exemptList.size}</p>
        <p>⏳ Waitlist: ${waitlist.size} users</p>
    `);
});

// ========================================================
// JOBID MANAGEMENT
// ========================================================

app.post('/update', (req, res) => {
    const { jobId, username } = req.body;
    
    currentJobId = jobId;
    console.log('✅ JobId updated:', currentJobId, 'by', username);
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
    
    activePlayers.set(username, {
        username,
        displayName: displayName || username,
        userId: userId || 0,
        device: device || 'Unknown',
        avatar: avatar || `https://www.roblox.com/headshot-thumbnail/image?userId=${userId || 1}&width=420&height=420&format=png`,
        joinedAt: Date.now()
    });
    
    console.log(`✅ Player joined: ${username} (${displayName}) on ${device}`);
    res.json({ success: true });
});

app.post('/player/leave', (req, res) => {
    const { username } = req.body;
    activePlayers.delete(username);
    console.log(`🚪 Player left: ${username}`);
    res.json({ success: true });
});

app.get('/players/list', (req, res) => {
    const players = Array.from(activePlayers.values());
    res.json({ 
        players,
        count: players.length,
        jobId: currentJobId
    });
});

// ========================================================
// EXEMPT LIST (WHITELIST)
// ========================================================

app.post('/exempt/add', (req, res) => {
    const { username, apiKey } = req.body;
    
    if (apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Invalid API key' });
    }
    
    exemptList.add(username.toLowerCase());
    console.log(`✅ Added to exempt list: ${username}`);
    res.json({ success: true, username });
});

app.post('/exempt/remove', (req, res) => {
    const { username, apiKey } = req.body;
    
    if (apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Invalid API key' });
    }
    
    exemptList.delete(username.toLowerCase());
    console.log(`🗑️ Removed from exempt list: ${username}`);
    res.json({ success: true, username });
});

app.get('/exempt/check/:username', (req, res) => {
    const username = req.params.username.toLowerCase();
    res.json({ exempt: exemptList.has(username) });
});

app.get('/exempt/list', (req, res) => {
    const users = Array.from(exemptList);
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
    
    const isWhitelisted = exemptList.has(username.toLowerCase());
    
    console.log(`🔍 Whitelist check for ${username}: ${isWhitelisted}`);
    
    res.json({ 
        isWhitelisted,
        username 
    });
});

// ========================================================
// WAITLIST MANAGEMENT
// ========================================================

app.post('/waitlist/add', (req, res) => {
    const { discordId, discordUsername, brainrotPaid, steals, apiKey } = req.body;
    
    if (apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Invalid API key' });
    }
    
    // Calculate position (last position + 1)
    let maxPosition = 0;
    waitlist.forEach(user => {
        if (user.position > maxPosition) maxPosition = user.position;
    });
    
    waitlist.set(discordId, {
        discordId,
        discordUsername,
        position: maxPosition + 1,
        brainrotPaid: brainrotPaid || 0,
        steals: steals || 0,
        addedAt: Date.now()
    });
    
    console.log(`✅ Added to waitlist: ${discordUsername} (Position: ${maxPosition + 1})`);
    res.json({ 
        success: true, 
        position: maxPosition + 1,
        user: waitlist.get(discordId)
    });
});

app.post('/waitlist/remove', (req, res) => {
    const { discordId, apiKey } = req.body;
    
    if (apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Invalid API key' });
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

app.post('/waitlist/addsteals', (req, res) => {
    const { discordId, amount, apiKey } = req.body;
    
    if (apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Invalid API key' });
    }
    
    const user = waitlist.get(discordId);
    if (user) {
        user.steals = (user.steals || 0) + amount;
        console.log(`✅ Added ${amount} steals to ${user.discordUsername} (Total: ${user.steals})`);
        res.json({ success: true, user });
    } else {
        res.status(404).json({ error: 'User not in waitlist' });
    }
});

app.post('/waitlist/usesteals', (req, res) => {
    const { discordId, amount } = req.body;
    
    const user = waitlist.get(discordId);
    if (user) {
        user.steals = Math.max(0, (user.steals || 0) - amount);
        
        // If steals reach 0, remove from waitlist
        if (user.steals === 0) {
            waitlist.delete(discordId);
            console.log(`🗑️ User ran out of steals, removed: ${user.discordUsername}`);
            res.json({ success: true, removed: true, user });
        } else {
            console.log(`📉 Used ${amount} steals for ${user.discordUsername} (Remaining: ${user.steals})`);
            res.json({ success: true, removed: false, user });
        }
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
    const user = waitlist.get(req.params.discordId);
    if (user) {
        res.json({ success: true, user });
    } else {
        res.status(404).json({ error: 'User not in waitlist' });
    }
});

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
}, 300000);

app.listen(port, () => {
    console.log(`🚀 SAB Waitlist Server running on port ${port}`);
    console.log(`📋 JobId: ${currentJobId || 'Not set'}`);
    console.log(`✅ Ready!`);
});
