const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// ========================================================
// EXPRESS SETUP
// ========================================================

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

let currentJobId = null;
let exemptList = new Set();
let activePlayers = new Map();
let waitlist = new Map();

const requireApiKey = (req, res, next) => {
    const apiKey = req.body.apiKey || req.query.apiKey || req.headers['x-api-key'];
    if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Invalid or missing API key' });
    }
    next();
};

app.get('/', (req, res) => {
    res.send(`
        <h1>🎮 SAB Waitlist System</h1>
        <p>📋 JobId: ${currentJobId || 'Not set'}</p>
        <p>👥 Active Players: ${activePlayers.size}</p>
        <p>✅ Exempt Users: ${exemptList.size}</p>
        <p>⏳ Waitlist: ${waitlist.size} users</p>
        <p>🔑 API Key: ${process.env.API_KEY ? 'Configured ✓' : '❌ Not Set'}</p>
    `);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), jobId: currentJobId, playerCount: activePlayers.size, waitlistCount: waitlist.size });
});

app.post('/update', (req, res) => {
    const { jobId, username } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });
    currentJobId = jobId;
    console.log(`✅ JobId updated: ${currentJobId}${username ? ` by ${username}` : ''}`);
    res.json({ success: true, jobId: currentJobId });
});

app.get('/getjobid', (req, res) => {
    if (currentJobId) return res.json({ jobId: currentJobId });
    res.status(404).json({ error: 'No JobId available' });
});

app.post('/player/join', (req, res) => {
    const { username, displayName, userId, device, avatar } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });
    const player = {
        username,
        displayName: displayName || username,
        userId: userId || 0,
        device: device || 'Unknown',
        avatar: avatar || `https://www.roblox.com/headshot-thumbnail/image?userId=${userId || 1}&width=420&height=420&format=png`,
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

app.post('/exempt/add', requireApiKey, (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });
    const normalized = username.toLowerCase().trim();
    exemptList.add(normalized);
    console.log(`✅ Exempt added: ${normalized}`);
    res.json({ success: true, username: normalized });
});

app.post('/exempt/remove', requireApiKey, (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });
    const normalized = username.toLowerCase().trim();
    const existed = exemptList.has(normalized);
    exemptList.delete(normalized);
    res.json({ success: true, username: normalized, existed });
});

app.get('/exempt/check/:username', (req, res) => {
    const username = req.params.username.toLowerCase().trim();
    res.json({ exempt: exemptList.has(username), username });
});

app.get('/exempt/list', (req, res) => {
    res.json({ users: Array.from(exemptList).sort(), count: exemptList.size });
});

app.get('/checkwhitelist', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username is required' });
    const normalized = username.toLowerCase().trim();
    const isWhitelisted = exemptList.has(normalized);
    console.log(`🔍 Whitelist check: ${normalized} = ${isWhitelisted}`);
    res.json({ isWhitelisted, username: normalized });
});

app.post('/waitlist/add', requireApiKey, (req, res) => {
    const { discordId, discordUsername, brainrotPaid, steals } = req.body;
    if (!discordId || !discordUsername) return res.status(400).json({ error: 'discordId and discordUsername are required' });
    if (waitlist.has(discordId)) return res.status(409).json({ error: 'User already in waitlist', user: waitlist.get(discordId) });
    let maxPosition = 0;
    waitlist.forEach(u => { if (u.position > maxPosition) maxPosition = u.position; });
    const newUser = { discordId, discordUsername, position: maxPosition + 1, brainrotPaid: brainrotPaid || 0, steals: steals || 0, addedAt: Date.now() };
    waitlist.set(discordId, newUser);
    console.log(`✅ Waitlist add: ${discordUsername} (pos ${newUser.position})`);
    res.json({ success: true, position: newUser.position, user: newUser });
});

app.post('/waitlist/remove', requireApiKey, (req, res) => {
    const { discordId } = req.body;
    if (!discordId) return res.status(400).json({ error: 'discordId is required' });
    const user = waitlist.get(discordId);
    if (!user) return res.status(404).json({ error: 'User not in waitlist' });
    waitlist.delete(discordId);
    res.json({ success: true, user });
});

app.post('/waitlist/addsteals', requireApiKey, (req, res) => {
    const { discordId, amount } = req.body;
    if (!discordId) return res.status(400).json({ error: 'discordId is required' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be positive' });
    const user = waitlist.get(discordId);
    if (!user) return res.status(404).json({ error: 'User not in waitlist' });
    user.steals = (user.steals || 0) + amount;
    waitlist.set(discordId, user);
    console.log(`✅ Added ${amount} steals to ${user.discordUsername} (total: ${user.steals})`);
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
        return res.json({ success: true, removed: true, user });
    }
    waitlist.set(discordId, user);
    console.log(`📉 ${user.discordUsername} steals: ${prev} -> ${user.steals}`);
    res.json({ success: true, removed: false, user });
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
    res.json({ success: true, user, oldPosition });
});

app.get('/waitlist/list', (req, res) => {
    const users = Array.from(waitlist.values()).sort((a, b) => a.position - b.position);
    const active = users.filter(u => u.position > 1);
    const waiting = users.filter(u => u.position <= 1);
    res.json({ all: users, active, waiting, totalCount: users.length, activeCount: active.length, waitingCount: waiting.length });
});

app.get('/waitlist/get/:discordId', (req, res) => {
    const user = waitlist.get(req.params.discordId);
    if (!user) return res.status(404).json({ error: 'User not in waitlist' });
    res.json({ success: true, user });
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found', path: req.path }));
app.use((err, req, res, next) => { console.error('❌', err); res.status(500).json({ error: 'Internal server error' }); });

setInterval(() => {
    const now = Date.now();
    let removed = 0;
    activePlayers.forEach((p, username) => { if (now - p.joinedAt > 600000) { activePlayers.delete(username); removed++; } });
    if (removed > 0) console.log(`🧹 Cleaned ${removed} stale player(s)`);
}, 300000);

app.listen(port, () => {
    console.log('═══════════════════════════════════════');
    console.log(`🚀 SAB API running on port ${port}`);
    console.log(`🔑 API Key: ${process.env.API_KEY ? 'Configured ✓' : 'Not Set ✗'}`);
    console.log('═══════════════════════════════════════');
});

// ========================================================
// DISCORD BOT
// ========================================================

const RAILWAY_URL = process.env.RAILWAY_URL || 'https://pub-shi-production.up.railway.app';
const API_KEY = process.env.API_KEY;
const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID || '';
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID || '';

if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN is not set!');
    process.exit(1);
}
if (!API_KEY) console.warn('⚠️ API_KEY is not set!');
if (!OWNER_ROLE_ID) console.warn('⚠️ OWNER_ROLE_ID is not set!');
if (!BUYER_ROLE_ID) console.warn('⚠️ BUYER_ROLE_ID is not set!');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const handleApiError = (error, fallback = 'An error occurred') => {
    if (error.response) {
        const msg = error.response.data?.error || fallback;
        const status = error.response.status;
        if (status === 404) return `❌ Not found: ${msg}`;
        if (status === 403) return `❌ Access denied: ${msg}`;
        if (status === 400) return `❌ Bad request: ${msg}`;
        if (status === 409) return `❌ ${msg}`;
        return `❌ Error (${status}): ${msg}`;
    }
    if (error.request) return `❌ Cannot reach server. Is it online?`;
    return `❌ ${error.message || fallback}`;
};

client.on('ready', () => {
    console.log('═══════════════════════════════════════');
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`   Railway URL: ${RAILWAY_URL}`);
    console.log(`   API Key: ${API_KEY ? 'Set ✓' : 'Not Set ✗'}`);
    console.log(`   Owner Role: ${OWNER_ROLE_ID || 'Not Set ✗'}`);
    console.log(`   Buyer Role: ${BUYER_ROLE_ID || 'Not Set ✗'}`);
    console.log('═══════════════════════════════════════');
    client.user.setActivity('SAB Waitlist System', { type: 3 });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content.startsWith('!')) return;

    const isOwner = OWNER_ROLE_ID && message.member
        ? message.member.roles.cache.has(OWNER_ROLE_ID)
        : false;
    const hasBuyerRole = BUYER_ROLE_ID && message.member
        ? message.member.roles.cache.has(BUYER_ROLE_ID)
        : false;

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // !HELP
    if (command === '!help') {
        const buyerEmbed = new EmbedBuilder()
            .setTitle('📋 SAB Bot — Buyer Commands')
            .setColor(0x00ffff)
            .addFields(
                { name: '!joinserver', value: 'Get a clickable link to join the SAB server' },
                { name: '!waitlist', value: 'View the current waitlist and positions' },
                { name: '!steals [@user]', value: 'Check steals for yourself or another user' },
                { name: '!slots', value: 'View all active players in the server' }
            )
            .setTimestamp();

        if (isOwner) {
            const ownerEmbed = new EmbedBuilder()
                .setTitle('🔧 SAB Bot — Owner Commands')
                .setColor(0xff6b6b)
                .addFields(
                    { name: '!addwaitlist <@user> <brainrot> [steals]', value: 'Add a user to the waitlist' },
                    { name: '!addsteals <@user> <amount>', value: 'Add steals to a user' },
                    { name: '!removesteals <@user> [amount]', value: 'Remove steals from a user (default: 1)' },
                    { name: '!whitelist <username>', value: 'Add a Roblox user to the exempt list' },
                    { name: '!unwhitelist <username>', value: 'Remove a Roblox user from the exempt list' }
                )
                .setTimestamp();
            return message.reply({ embeds: [buyerEmbed, ownerEmbed] });
        }
        return message.reply({ embeds: [buyerEmbed] });
    }

    // !SLOTS
    if (command === '!slots') {
        if (!hasBuyerRole && !isOwner) return message.reply('❌ You need the Buyer role to use this command!');
        try {
            const res = await axios.get(`${RAILWAY_URL}/players/list`);
            const { players, count, jobId } = res.data;
            if (count === 0) return message.reply('📊 No players currently in the server.');
            let desc = `**JobId:** \`${jobId || 'Not set'}\`\n\n`;
            players.slice(0, 10).forEach((p, i) => {
                desc += `**${i + 1}. ${p.displayName}** (@${p.username})\n`;
                desc += `   📱 ${p.device} | 🆔 \`${p.userId}\`\n\n`;
            });
            if (players.length > 10) desc += `*...and ${players.length - 10} more*`;
            const embed = new EmbedBuilder()
                .setTitle('👥 Active Players in SAB Server')
                .setDescription(desc)
                .setColor(0x00ffff)
                .setFooter({ text: `${count} player(s) online` })
                .setTimestamp();
            if (players[0]?.avatar) embed.setThumbnail(players[0].avatar);
            return message.reply({ embeds: [embed] });
        } catch (err) {
            return message.reply(handleApiError(err, 'Failed to fetch players'));
        }
    }

    // !JOINSERVER
    if (command === '!joinserver') {
        if (!hasBuyerRole && !isOwner) return message.reply('❌ You need the Buyer role to use this command!');
        try {
            const res = await axios.get(`${RAILWAY_URL}/getjobid`);
            const { jobId } = res.data;
            const placeId = 109983668079237;
            const link = `https://www.roblox.com/games/start?placeId=${placeId}&launchData=${encodeURIComponent(jobId)}`;
            const embed = new EmbedBuilder()
                .setTitle('🎮 Join SAB Server')
                .setDescription(`[**Click here to join**](${link})`)
                .setColor(0x00bfff)
                .addFields(
                    { name: 'JobId', value: `\`${jobId}\``, inline: true },
                    { name: 'Place ID', value: `\`${placeId}\``, inline: true }
                )
                .setFooter({ text: 'Link expires when server restarts' })
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        } catch (err) {
            if (err.response?.status === 404) return message.reply('❌ No active server JobId set!');
            return message.reply(handleApiError(err, 'Failed to get join link'));
        }
    }

    // !WAITLIST
    if (command === '!waitlist') {
        if (!hasBuyerRole && !isOwner) return message.reply('❌ You need the Buyer role to use this command!');
        try {
            const res = await axios.get(`${RAILWAY_URL}/waitlist/list`);
            const { active, waiting, activeCount, waitingCount } = res.data;
            const embed = new EmbedBuilder()
                .setTitle('⏳ SAB Waitlist Status')
                .setColor(0xffd700)
                .setFooter({ text: `Active: ${activeCount} | Waiting: ${waitingCount} | Total: ${activeCount + waitingCount}` })
                .setTimestamp();
            if (activeCount === 0 && waitingCount === 0) {
                embed.setDescription('📋 Waitlist is currently empty.');
                return message.reply({ embeds: [embed] });
            }
            let desc = '';
            if (activeCount > 0) {
                desc += '**🟢 In Server:**\n';
                active.slice(0, 15).forEach((u, i) => { desc += `${i + 1}. <@${u.discordId}> — Pos: \`${u.position}\` | Steals: \`${u.steals}\`\n`; });
                if (active.length > 15) desc += `*...and ${active.length - 15} more*\n`;
            }
            if (waitingCount > 0) {
                desc += '\n**🔴 Waiting:**\n';
                waiting.slice(0, 15).forEach((u, i) => { desc += `${i + 1}. <@${u.discordId}> — Pos: \`${u.position}\` | Steals: \`${u.steals}\`\n`; });
                if (waiting.length > 15) desc += `*...and ${waiting.length - 15} more*\n`;
            }
            embed.setDescription(desc);
            return message.reply({ embeds: [embed] });
        } catch (err) {
            return message.reply(handleApiError(err, 'Failed to fetch waitlist'));
        }
    }

    // !STEALS
    if (command === '!steals') {
        if (!hasBuyerRole && !isOwner) return message.reply('❌ You need the Buyer role to use this command!');
        const userId = args[1] ? args[1].replace(/[<@!>]/g, '') : message.author.id;
        try {
            const res = await axios.get(`${RAILWAY_URL}/waitlist/get/${userId}`);
            const user = res.data.user;
            const embed = new EmbedBuilder()
                .setTitle('📊 Steals Info')
                .setColor(user.steals > 3 ? 0x00ff00 : user.steals > 0 ? 0xff9900 : 0xff0000)
                .addFields(
                    { name: 'User', value: `<@${user.discordId}>`, inline: true },
                    { name: 'Steals', value: `**${user.steals}**`, inline: true },
                    { name: 'Position', value: `\`${user.position}\``, inline: true },
                    { name: 'Brainrot Paid', value: `${user.brainrotPaid}`, inline: true },
                    { name: 'Status', value: user.position > 1 ? '🟢 In Server' : '🔴 Waiting', inline: true }
                )
                .setTimestamp();
            if (user.steals === 0) embed.setDescription('⚠️ **Out of steals!**');
            else if (user.steals <= 3) embed.setDescription(`⚠️ **Low steals!** Only ${user.steals} remaining.`);
            return message.reply({ embeds: [embed] });
        } catch (err) {
            if (err.response?.status === 404) return message.reply(`❌ <@${userId}> is not in the waitlist!`);
            return message.reply(handleApiError(err, 'Failed to fetch steals'));
        }
    }

    // !ADDWAITLIST
    if (command === '!addwaitlist') {
        if (!isOwner) return message.reply('❌ This command is owner-only!');
        const mention = args[1];
        const brainrotPaid = parseInt(args[2]);
        const initialSteals = parseInt(args[3]) || 0;
        if (!mention) return message.reply('**Usage:** `!addwaitlist <@user> <brainrot_paid> [steals]`');
        if (isNaN(brainrotPaid) || brainrotPaid < 0) return message.reply('❌ Brainrot paid must be a valid number!');
        const discordId = mention.replace(/[<@!>]/g, '');
        try {
            const member = await message.guild.members.fetch(discordId);
            const res = await axios.post(`${RAILWAY_URL}/waitlist/add`, {
                discordId, discordUsername: member.user.tag, brainrotPaid, steals: initialSteals, apiKey: API_KEY
            });
            if (BUYER_ROLE_ID) {
                try { await member.roles.add(BUYER_ROLE_ID); } catch (e) { console.error('Failed to add buyer role:', e.message); }
            }
            const embed = new EmbedBuilder()
                .setTitle('✅ Added to Waitlist')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'User', value: `<@${discordId}>`, inline: true },
                    { name: 'Position', value: `\`${res.data.user.position}\``, inline: true },
                    { name: 'Brainrot Paid', value: `${brainrotPaid}`, inline: true },
                    { name: 'Steals', value: `${initialSteals}`, inline: true }
                )
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        } catch (err) {
            if (err.response?.status === 409) return message.reply('❌ User is already in the waitlist! Use `!addsteals` instead.');
            return message.reply(handleApiError(err, 'Failed to add to waitlist'));
        }
    }

    // !ADDSTEALS
    if (command === '!addsteals') {
        if (!isOwner) return message.reply('❌ This command is owner-only!');
        const mention = args[1];
        const amount = parseInt(args[2]);
        if (!mention || isNaN(amount) || amount <= 0) return message.reply('**Usage:** `!addsteals <@user> <amount>`');
        const discordId = mention.replace(/[<@!>]/g, '');
        try {
            const res = await axios.post(`${RAILWAY_URL}/waitlist/addsteals`, { discordId, amount, apiKey: API_KEY });
            const embed = new EmbedBuilder()
                .setTitle('✅ Steals Added')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'User', value: `<@${discordId}>`, inline: true },
                    { name: 'Added', value: `+${amount}`, inline: true },
                    { name: 'Total Steals', value: `**${res.data.user.steals}**`, inline: true }
                )
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        } catch (err) {
            if (err.response?.status === 404) return message.reply('❌ User not found! Use `!addwaitlist` first.');
            return message.reply(handleApiError(err, 'Failed to add steals'));
        }
    }

    // !REMOVESTEALS
    if (command === '!removesteals') {
        if (!isOwner) return message.reply('❌ This command is owner-only!');
        const mention = args[1];
        const amount = parseInt(args[2]) || 1;
        if (!mention) return message.reply('**Usage:** `!removesteals <@user> [amount]`');
        if (amount <= 0) return message.reply('❌ Amount must be positive!');
        const discordId = mention.replace(/[<@!>]/g, '');
        try {
            const res = await axios.post(`${RAILWAY_URL}/waitlist/usesteals`, { discordId, amount });
            const { removed, user } = res.data;
            if (removed) {
                if (BUYER_ROLE_ID) {
                    try { const m = await message.guild.members.fetch(discordId); await m.roles.remove(BUYER_ROLE_ID); }
                    catch (e) { console.error('Failed to remove buyer role:', e.message); }
                }
                try { const m = await message.guild.members.fetch(discordId); await m.send('⚠️ You have been removed from the SAB waitlist — out of steals. Contact an admin to rejoin.'); }
                catch (_) {}
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ User Removed from Waitlist')
                    .setDescription(`<@${discordId}> ran out of steals and was removed.`)
                    .setColor(0xff0000)
                    .addFields({ name: 'Steals', value: '`0`', inline: true }, { name: 'Buyer Role', value: '❌ Removed', inline: true })
                    .setTimestamp();
                return message.reply({ embeds: [embed] });
            }
            const embed = new EmbedBuilder()
                .setTitle('📉 Steals Removed')
                .setColor(0xff9900)
                .addFields(
                    { name: 'User', value: `<@${discordId}>`, inline: true },
                    { name: 'Removed', value: `-${amount}`, inline: true },
                    { name: 'Remaining', value: `**${user.steals}**`, inline: true }
                )
                .setTimestamp();
            if (user.steals <= 3) embed.setDescription(`⚠️ Low steals! Only ${user.steals} remaining.`);
            return message.reply({ embeds: [embed] });
        } catch (err) {
            if (err.response?.status === 404) return message.reply('❌ User not found in waitlist!');
            return message.reply(handleApiError(err, 'Failed to remove steals'));
        }
    }

    // !WHITELIST
    if (command === '!whitelist') {
        if (!isOwner) return message.reply('❌ This command is owner-only!');
        const username = args[1];
        if (!username) return message.reply('**Usage:** `!whitelist <roblox_username>`');
        try {
            const res = await axios.post(`${RAILWAY_URL}/exempt/add`, { username, apiKey: API_KEY });
            const embed = new EmbedBuilder()
                .setTitle('✅ User Whitelisted')
                .setColor(0x00ff00)
                .addFields({ name: 'Roblox Username', value: `\`${res.data.username}\`` })
                .setFooter({ text: 'This user will not be kicked' })
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        } catch (err) {
            return message.reply(handleApiError(err, 'Failed to whitelist user'));
        }
    }

    // !UNWHITELIST
    if (command === '!unwhitelist') {
        if (!isOwner) return message.reply('❌ This command is owner-only!');
        const username = args[1];
        if (!username) return message.reply('**Usage:** `!unwhitelist <roblox_username>`');
        try {
            const res = await axios.post(`${RAILWAY_URL}/exempt/remove`, { username, apiKey: API_KEY });
            const embed = new EmbedBuilder()
                .setTitle('✅ Removed from Whitelist')
                .setColor(0xff9900)
                .addFields({ name: 'Roblox Username', value: `\`${res.data.username}\`` })
                .setFooter({ text: res.data.existed ? 'User was in whitelist' : 'User was not in whitelist' })
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        } catch (err) {
            return message.reply(handleApiError(err, 'Failed to remove from whitelist'));
        }
    }
});

client.on('error', err => console.error('❌ Discord error:', err));
client.on('warn', msg => console.warn('⚠️ Discord warning:', msg));

process.on('SIGTERM', () => { client.destroy(); process.exit(0); });
process.on('SIGINT', () => { client.destroy(); process.exit(0); });

client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    console.error('❌ Failed to login:', err.message);
    process.exit(1);
});
