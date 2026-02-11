const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const RAILWAY_URL = process.env.RAILWAY_URL || 'https://pub-shi-production.up.railway.app';
const API_KEY = process.env.API_KEY;
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',').map(id => id.trim()) : [];
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID || '';

// ========================================================
// STARTUP CHECKS
// ========================================================

if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN is not set!');
    process.exit(1);
}
if (!API_KEY) console.warn('⚠️ API_KEY is not set!');
if (OWNER_IDS.length === 0) console.warn('⚠️ OWNER_IDS is not set!');
if (!BUYER_ROLE_ID) console.warn('⚠️ BUYER_ROLE_ID is not set!');

// ========================================================
// HELPERS
// ========================================================

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

// ========================================================
// READY
// ========================================================

client.on('ready', () => {
    console.log('═══════════════════════════════════════');
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`   Railway URL: ${RAILWAY_URL}`);
    console.log(`   API Key: ${API_KEY ? 'Set ✓' : 'Not Set ✗'}`);
    console.log(`   Owner IDs: ${OWNER_IDS.length > 0 ? OWNER_IDS.join(', ') : 'None ✗'}`);
    console.log(`   Buyer Role: ${BUYER_ROLE_ID || 'Not Set ✗'}`);
    console.log('═══════════════════════════════════════');
    client.user.setActivity('SAB Waitlist System', { type: 3 }); // 3 = WATCHING
});

// ========================================================
// COMMANDS
// ========================================================

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content.startsWith('!')) return;

    const isOwner = OWNER_IDS.includes(message.author.id);
    const hasBuyerRole = BUYER_ROLE_ID && message.member
        ? message.member.roles.cache.has(BUYER_ROLE_ID)
        : false;

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // ── !HELP ───────────────────────────────────────────
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

    // ── !SLOTS ──────────────────────────────────────────
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

    // ── !JOINSERVER ─────────────────────────────────────
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

    // ── !WAITLIST ────────────────────────────────────────
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
                active.slice(0, 15).forEach((u, i) => {
                    desc += `${i + 1}. <@${u.discordId}> — Pos: \`${u.position}\` | Steals: \`${u.steals}\`\n`;
                });
                if (active.length > 15) desc += `*...and ${active.length - 15} more*\n`;
            }
            if (waitingCount > 0) {
                desc += '\n**🔴 Waiting:**\n';
                waiting.slice(0, 15).forEach((u, i) => {
                    desc += `${i + 1}. <@${u.discordId}> — Pos: \`${u.position}\` | Steals: \`${u.steals}\`\n`;
                });
                if (waiting.length > 15) desc += `*...and ${waiting.length - 15} more*\n`;
            }

            embed.setDescription(desc);
            return message.reply({ embeds: [embed] });
        } catch (err) {
            return message.reply(handleApiError(err, 'Failed to fetch waitlist'));
        }
    }

    // ── !STEALS ──────────────────────────────────────────
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

            if (user.steals === 0) embed.setDescription('⚠️ **Out of steals!** Will be removed on next use.');
            else if (user.steals <= 3) embed.setDescription(`⚠️ **Low steals!** Only ${user.steals} remaining.`);

            return message.reply({ embeds: [embed] });
        } catch (err) {
            if (err.response?.status === 404) return message.reply(`❌ <@${userId}> is not in the waitlist!`);
            return message.reply(handleApiError(err, 'Failed to fetch steals'));
        }
    }

    // ── !ADDWAITLIST ─────────────────────────────────────
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
                discordId,
                discordUsername: member.user.tag,
                brainrotPaid,
                steals: initialSteals,
                apiKey: API_KEY
            });

            if (BUYER_ROLE_ID) {
                try { await member.roles.add(BUYER_ROLE_ID); }
                catch (e) { console.error('Failed to add buyer role:', e.message); }
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

    // ── !ADDSTEALS ───────────────────────────────────────
    if (command === '!addsteals') {
        if (!isOwner) return message.reply('❌ This command is owner-only!');

        const mention = args[1];
        const amount = parseInt(args[2]);

        if (!mention || isNaN(amount) || amount <= 0) return message.reply('**Usage:** `!addsteals <@user> <amount>`');

        const discordId = mention.replace(/[<@!>]/g, '');
        try {
            const res = await axios.post(`${RAILWAY_URL}/waitlist/addsteals`, {
                discordId,
                amount,
                apiKey: API_KEY
            });

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
            if (err.response?.status === 404) return message.reply('❌ User not found in waitlist! Use `!addwaitlist` first.');
            return message.reply(handleApiError(err, 'Failed to add steals'));
        }
    }

    // ── !REMOVESTEALS ────────────────────────────────────
    if (command === '!removesteals') {
        if (!isOwner) return message.reply('❌ This command is owner-only!');

        const mention = args[1];
        const amount = parseInt(args[2]) || 1;

        if (!mention) return message.reply('**Usage:** `!removesteals <@user> [amount]`\n*Default amount: 1*');
        if (amount <= 0) return message.reply('❌ Amount must be a positive number!');

        const discordId = mention.replace(/[<@!>]/g, '');
        try {
            const res = await axios.post(`${RAILWAY_URL}/waitlist/usesteals`, { discordId, amount });
            const { removed, user } = res.data;

            if (removed) {
                if (BUYER_ROLE_ID) {
                    try {
                        const member = await message.guild.members.fetch(discordId);
                        await member.roles.remove(BUYER_ROLE_ID);
                    } catch (e) { console.error('Failed to remove buyer role:', e.message); }
                }

                try {
                    const member = await message.guild.members.fetch(discordId);
                    await member.send('⚠️ You have been removed from the SAB waitlist — you ran out of steals. Contact an admin to rejoin.');
                } catch (_) {}

                const embed = new EmbedBuilder()
                    .setTitle('⚠️ User Removed from Waitlist')
                    .setDescription(`<@${discordId}> ran out of steals and was removed.`)
                    .setColor(0xff0000)
                    .addFields(
                        { name: 'Steals', value: '`0`', inline: true },
                        { name: 'Buyer Role', value: '❌ Removed', inline: true }
                    )
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

            if (user.steals <= 3) embed.setDescription(`⚠️ Low steals warning! Only ${user.steals} remaining.`);
            return message.reply({ embeds: [embed] });
        } catch (err) {
            if (err.response?.status === 404) return message.reply('❌ User not found in waitlist!');
            return message.reply(handleApiError(err, 'Failed to remove steals'));
        }
    }

    // ── !WHITELIST ───────────────────────────────────────
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

    // ── !UNWHITELIST ─────────────────────────────────────
    if (command === '!unwhitelist') {
        if (!isOwner) return message.reply('❌ This command is owner-only!');
        const username = args[1];
        if (!username) return message.reply('**Usage:** `!unwhitelist <roblox_username>`');
        try {
            const res = await axios.post(`${RAILWAY_URL}/exempt/remove`, { username, apiKey: API_KEY });
            const embed = new EmbedBuilder()
                .setTitle('✅ User Removed from Whitelist')
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

// ========================================================
// ERROR HANDLING & SHUTDOWN
// ========================================================

client.on('error', err => console.error('❌ Discord error:', err));
client.on('warn', msg => console.warn('⚠️ Discord warning:', msg));

process.on('SIGTERM', () => { client.destroy(); process.exit(0); });
process.on('SIGINT', () => { client.destroy(); process.exit(0); });

client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    console.error('❌ Failed to login:', err.message);
    process.exit(1);
});
