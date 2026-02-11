const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
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
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : [];
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID || ''; // Role to remove when steals reach 0

// Helper function to handle API errors
const handleApiError = (error, defaultMessage = 'An error occurred') => {
    if (error.response) {
        // Server responded with error status
        const status = error.response.status;
        const message = error.response.data?.error || error.response.data?.message || defaultMessage;
        
        if (status === 404) return `❌ Not found: ${message}`;
        if (status === 403) return `❌ Access denied: ${message}`;
        if (status === 400) return `❌ Invalid request: ${message}`;
        if (status === 409) return `❌ ${message}`;
        
        return `❌ Error (${status}): ${message}`;
    } else if (error.request) {
        // Request made but no response
        return `❌ Cannot connect to server. Please try again later.`;
    } else {
        // Something else happened
        return `❌ ${error.message || defaultMessage}`;
    }
};

// Check for required environment variables
if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN is not set!');
    process.exit(1);
}

if (!API_KEY) {
    console.warn('⚠️ API_KEY is not set! Some commands may not work.');
}

if (OWNER_IDS.length === 0) {
    console.warn('⚠️ OWNER_IDS is not set! Owner commands will not work for anyone.');
}

if (!BUYER_ROLE_ID) {
    console.warn('⚠️ BUYER_ROLE_ID is not set! Role management will not work.');
}

client.on('ready', () => {
    console.log(`✅ SAB Bot logged in as ${client.user.tag}`);
    console.log(`📋 Config Check:`);
    console.log(`   - Railway URL: ${RAILWAY_URL}`);
    console.log(`   - API Key: ${API_KEY ? 'Set ✓' : 'Not Set ✗'}`);
    console.log(`   - Owner IDs: ${OWNER_IDS.length > 0 ? OWNER_IDS.join(', ') : 'None ✗'}`);
    console.log(`   - Buyer Role ID: ${BUYER_ROLE_ID || 'Not Set ✗'}`);
    client.user.setActivity('SAB Waitlist System', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const isOwner = OWNER_IDS.includes(message.author.id);
    const hasBuyerRole = BUYER_ROLE_ID ? message.member.roles.cache.has(BUYER_ROLE_ID) : false;
    
    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    
    // ========================================================
    // !SLOTS - Show all active players (BUYER ROLE REQUIRED)
    // ========================================================
    
    if (command === '!slots') {
        if (!hasBuyerRole && !isOwner) {
            return message.reply('❌ You need the Buyer role to use this command!');
        }
        
        try {
            const response = await axios.get(`${RAILWAY_URL}/players/list`);
            const { players, count, jobId } = response.data;
            
            if (count === 0) {
                return message.reply('📊 No players currently in the server');
            }
            
            const embed = new EmbedBuilder()
                .setTitle('👥 Active Players in SAB Server')
                .setColor(0x00ffff)
                .setFooter({ text: `${count} player(s) online` })
                .setTimestamp();
            
            let description = `**JobId:** \`${jobId || 'Not set'}\`\n\n`;
            
            const displayCount = Math.min(players.length, 10);
            for (let i = 0; i < displayCount; i++) {
                const p = players[i];
                description += `**${i + 1}. ${p.displayName}** (@${p.username})\n`;
                description += `   📱 Device: ${p.device}\n`;
                description += `   🆔 UserId: \`${p.userId}\`\n`;
                if (p.avatar) {
                    description += `   🖼️ [Avatar](${p.avatar})\n`;
                }
                description += '\n';
            }
            
            if (players.length > 10) {
                description += `\n*...and ${players.length - 10} more players*`;
            }
            
            embed.setDescription(description);
            
            if (players.length > 0 && players[0].avatar) {
                embed.setThumbnail(players[0].avatar);
            }
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching player list:', error);
            message.reply(handleApiError(error, 'Failed to fetch player list'));
        }
    }
    
    // ========================================================
    // !WHITELIST - Add user to exempt list (OWNER ONLY)
    // ========================================================
    
    else if (command === '!whitelist') {
        if (!isOwner) {
            return message.reply('❌ This command is owner-only!');
        }
        
        const username = args[1];
        
        if (!username) {
            return message.reply('**Usage:** `!whitelist <roblox_username>`\n**Example:** `!whitelist JohnDoe123`');
        }
        
        try {
            const response = await axios.post(`${RAILWAY_URL}/exempt/add`, {
                username,
                apiKey: API_KEY
            });
            
            const embed = new EmbedBuilder()
                .setTitle('✅ User Whitelisted')
                .setColor(0x00ff00)
                .addFields({ name: 'Roblox Username', value: `\`${response.data.username}\`` })
                .setFooter({ text: 'This user will not be kicked from the server' })
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error whitelisting user:', error);
            message.reply(handleApiError(error, 'Failed to whitelist user'));
        }
    }
    
    // ========================================================
    // !UNWHITELIST - Remove from exempt list (OWNER ONLY)
    // ========================================================
    
    else if (command === '!unwhitelist') {
        if (!isOwner) {
            return message.reply('❌ This command is owner-only!');
        }
        
        const username = args[1];
        
        if (!username) {
            return message.reply('**Usage:** `!unwhitelist <roblox_username>`\n**Example:** `!unwhitelist JohnDoe123`');
        }
        
        try {
            const response = await axios.post(`${RAILWAY_URL}/exempt/remove`, {
                username,
                apiKey: API_KEY
            });
            
            const embed = new EmbedBuilder()
                .setTitle('✅ User Removed from Whitelist')
                .setColor(0xff9900)
                .addFields({ name: 'Roblox Username', value: `\`${response.data.username}\`` })
                .setFooter({ text: response.data.existed ? 'User was in whitelist' : 'User was not in whitelist' })
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error removing from whitelist:', error);
            message.reply(handleApiError(error, 'Failed to remove from whitelist'));
        }
    }
    
    // ========================================================
    // !JOINSERVER - Get clickable join link (BUYER ROLE REQUIRED)
    // ========================================================
    
    else if (command === '!joinserver') {
        if (!hasBuyerRole && !isOwner) {
            return message.reply('❌ You need the Buyer role to use this command!');
        }
        
        try {
            const response = await axios.get(`${RAILWAY_URL}/getjobid`);
            const jobId = response.data.jobId;
            
            if (!jobId) {
                return message.reply('❌ No active server JobId set!');
            }
            
            const placeId = 109983668079237; // SAB Place ID
            const joinLink = `https://www.roblox.com/games/start?placeId=${placeId}&launchData=${encodeURIComponent(jobId)}`;
            
            const embed = new EmbedBuilder()
                .setTitle('🎮 Join SAB Server')
                .setColor(0x00bfff)
                .setDescription(`[**Click here to join the server**](${joinLink})`)
                .addFields(
                    { name: 'JobId', value: `\`${jobId}\`` },
                    { name: 'Place ID', value: `\`${placeId}\`` }
                )
                .setFooter({ text: 'Link expires when server restarts' })
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error getting join link:', error);
            if (error.response && error.response.status === 404) {
                message.reply('❌ No active server JobId set! Please wait for the server to start.');
            } else {
                message.reply(handleApiError(error, 'Failed to get join link'));
            }
        }
    }
    
    // ========================================================
    // !WAITLIST - Show current waitlist (BUYER ROLE REQUIRED)
    // ========================================================
    
    else if (command === '!waitlist') {
        if (!hasBuyerRole && !isOwner) {
            return message.reply('❌ You need the Buyer role to use this command!');
        }
        
        try {
            const response = await axios.get(`${RAILWAY_URL}/waitlist/list`);
            const { active, waiting, activeCount, waitingCount } = response.data;
            
            if (activeCount === 0 && waitingCount === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('⏳ SAB Waitlist Status')
                    .setDescription('📋 Waitlist is currently empty')
                    .setColor(0x808080)
                    .setTimestamp();
                
                return message.reply({ embeds: [embed] });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('⏳ SAB Waitlist Status')
                .setColor(0xffd700)
                .setFooter({ text: `Active: ${activeCount} | Waiting: ${waitingCount} | Total: ${activeCount + waitingCount}` })
                .setTimestamp();
            
            let description = '';
            
            if (activeCount > 0) {
                description += '**🟢 Currently in Server (Position > 1):**\n';
                active.slice(0, 15).forEach((user, i) => {
                    description += `${i + 1}. <@${user.discordId}> - Pos: \`${user.position}\` | Steals: \`${user.steals}\`\n`;
                });
                if (active.length > 15) {
                    description += `*...and ${active.length - 15} more*\n`;
                }
            }
            
            if (waitingCount > 0) {
                description += '\n**🔴 On Waitlist (Position ≤ 1):**\n';
                waiting.slice(0, 15).forEach((user, i) => {
                    description += `${i + 1}. <@${user.discordId}> - Pos: \`${user.position}\` | Steals: \`${user.steals}\`\n`;
                });
                if (waiting.length > 15) {
                    description += `*...and ${waiting.length - 15} more*\n`;
                }
            }
            
            embed.setDescription(description || 'No users in waitlist');
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching waitlist:', error);
            message.reply(handleApiError(error, 'Failed to fetch waitlist'));
        }
    }
    
    // ========================================================
    // !STEALS - Show steals for specific user or all (BUYER ROLE REQUIRED)
    // ========================================================
    
    else if (command === '!steals') {
        if (!hasBuyerRole && !isOwner) {
            return message.reply('❌ You need the Buyer role to use this command!');
        }
        
        const userId = args[1] ? args[1].replace(/[<@!>]/g, '') : message.author.id;
        
        try {
            const response = await axios.get(`${RAILWAY_URL}/waitlist/get/${userId}`);
            const user = response.data.user;
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Steals Information')
                .setColor(user.steals > 0 ? 0x00ff00 : 0xff0000)
                .addFields(
                    { name: 'User', value: `<@${user.discordId}>`, inline: true },
                    { name: 'Steals Remaining', value: `**${user.steals}**`, inline: true },
                    { name: 'Position', value: `\`${user.position}\``, inline: true },
                    { name: 'Brainrot Paid', value: `${user.brainrotPaid}`, inline: true },
                    { name: 'Status', value: user.position > 1 ? '🟢 In Server' : '🔴 On Waitlist', inline: true }
                )
                .setTimestamp();
            
            if (user.steals === 0) {
                embed.setDescription('⚠️ **Out of steals!** User will be removed from waitlist on next use.');
            } else if (user.steals <= 3) {
                embed.setDescription(`⚠️ **Low steals warning!** Only ${user.steals} steal(s) remaining.`);
            }
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching steals:', error);
            if (error.response && error.response.status === 404) {
                message.reply(`❌ <@${userId}> is not in the waitlist!`);
            } else {
                message.reply(handleApiError(error, 'Failed to fetch steals'));
            }
        }
    }
    
    // ========================================================
    // !ADDWAITLIST - Add user to waitlist (Owner only)
    // ========================================================
    
    else if (command === '!addwaitlist') {
        if (!isOwner) {
            return message.reply('❌ This command is owner-only!');
        }
        
        const userMention = args[1];
        const brainrotPaid = parseInt(args[2]);
        const initialSteals = parseInt(args[3]) || 0;
        
        if (!userMention) {
            return message.reply('**Usage:** `!addwaitlist <@user> <brainrot_paid> [initial_steals]`\n**Example:** `!addwaitlist @User 100 5`');
        }
        
        if (isNaN(brainrotPaid) || brainrotPaid < 0) {
            return message.reply('❌ Brainrot paid must be a positive number!');
        }
        
        if (initialSteals < 0) {
            return message.reply('❌ Initial steals must be a positive number!');
        }
        
        const discordId = userMention.replace(/[<@!>]/g, '');
        
        try {
            const member = await message.guild.members.fetch(discordId);
            
            const response = await axios.post(`${RAILWAY_URL}/waitlist/add`, {
                discordId,
                discordUsername: member.user.tag,
                brainrotPaid,
                steals: initialSteals,
                apiKey: API_KEY
            });
            
            // Add buyer role
            if (BUYER_ROLE_ID) {
                try {
                    await member.roles.add(BUYER_ROLE_ID);
                    console.log(`✅ Added buyer role to ${member.user.tag}`);
                } catch (err) {
                    console.error('Failed to add buyer role:', err);
                }
            }
            
            const user = response.data.user;
            const embed = new EmbedBuilder()
                .setTitle('✅ Added to Waitlist')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'User', value: `<@${discordId}>`, inline: true },
                    { name: 'Position', value: `\`${user.position}\``, inline: true },
                    { name: 'Brainrot Paid', value: `${brainrotPaid}`, inline: true },
                    { name: 'Initial Steals', value: `${initialSteals}`, inline: true }
                )
                .setFooter({ text: 'Buyer role has been added' })
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error adding to waitlist:', error);
            
            // If user already exists, suggest using addsteals instead
            if (error.response && error.response.status === 409) {
                message.reply('❌ This user is already in the waitlist! Use `!addsteals` to add more steals.');
            } else {
                message.reply(handleApiError(error, 'Failed to add to waitlist'));
            }
        }
    }
    
    // ========================================================
    // !ADDSTEALS - Add steals to user (Owner only)
    // ========================================================
    
    else if (command === '!addsteals') {
        if (!isOwner) {
            return message.reply('❌ This command is owner-only!');
        }
        
        const userMention = args[1];
        const amount = parseInt(args[2]);
        
        if (!userMention || !amount) {
            return message.reply('**Usage:** `!addsteals <@user> <amount>`\n**Example:** `!addsteals @User 5`');
        }
        
        if (isNaN(amount) || amount <= 0) {
            return message.reply('❌ Amount must be a positive number!');
        }
        
        const discordId = userMention.replace(/[<@!>]/g, '');
        
        try {
            const response = await axios.post(`${RAILWAY_URL}/waitlist/addsteals`, {
                discordId,
                amount,
                apiKey: API_KEY
            });
            
            const user = response.data.user;
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Steals Added')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'User', value: `<@${discordId}>`, inline: true },
                    { name: 'Amount Added', value: `+${amount}`, inline: true },
                    { name: 'Total Steals', value: `**${user.steals}**`, inline: true },
                    { name: 'Position', value: `\`${user.position}\``, inline: true }
                )
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error adding steals:', error);
            if (error.response && error.response.status === 404) {
                message.reply('❌ User not found in waitlist! Use `!addwaitlist` first.');
            } else {
                message.reply(handleApiError(error, 'Failed to add steals'));
            }
        }
    }
    
    // ========================================================
    // !REMOVESTEALS - Remove steals from user (Owner only)
    // ========================================================
    
    else if (command === '!removesteals') {
        if (!isOwner) {
            return message.reply('❌ This command is owner-only!');
        }
        
        const userMention = args[1];
        const amount = parseInt(args[2]) || 1;
        
        if (!userMention) {
            return message.reply('**Usage:** `!removesteals <@user> [amount]`\n**Example:** `!removesteals @User 2`\n*Default amount: 1*');
        }
        
        if (amount <= 0) {
            return message.reply('❌ Amount must be a positive number!');
        }
        
        const discordId = userMention.replace(/[<@!>]/g, '');
        
        try {
            const response = await axios.post(`${RAILWAY_URL}/waitlist/usesteals`, {
                discordId,
                amount
            });
            
            const { removed, user } = response.data;
            
            if (removed) {
                // Remove buyer role
                if (BUYER_ROLE_ID) {
                    try {
                        const member = await message.guild.members.fetch(discordId);
                        await member.roles.remove(BUYER_ROLE_ID);
                        console.log(`✅ Removed buyer role from ${member.user.tag}`);
                    } catch (err) {
                        console.error('Failed to remove buyer role:', err);
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ User Removed from Waitlist')
                    .setColor(0xff0000)
                    .setDescription(`<@${discordId}> ran out of steals and was removed from the waitlist.`)
                    .addFields(
                        { name: 'Final Steals', value: '`0`' },
                        { name: 'Buyer Role', value: '❌ Removed' }
                    )
                    .setTimestamp();
                
                // Try to DM the user
                try {
                    const member = await message.guild.members.fetch(discordId);
                    await member.send(`⚠️ You have been removed from the SAB waitlist because you ran out of steals. Contact an admin to purchase more steals and rejoin.`);
                } catch (err) {
                    console.log('Could not DM user about removal');
                }
                
                message.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('📉 Steals Removed')
                    .setColor(0xff9900)
                    .addFields(
                        { name: 'User', value: `<@${discordId}>`, inline: true },
                        { name: 'Amount Removed', value: `-${amount}`, inline: true },
                        { name: 'Remaining Steals', value: `**${user.steals}**`, inline: true },
                        { name: 'Position', value: `\`${user.position}\``, inline: true }
                    )
                    .setTimestamp();
                
                if (user.steals <= 3 && user.steals > 0) {
                    embed.setDescription(`⚠️ **Low steals warning!** Only ${user.steals} steal(s) remaining.`);
                }
                
                message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error removing steals:', error);
            if (error.response && error.response.status === 404) {
                message.reply('❌ User not found in waitlist!');
            } else {
                message.reply(handleApiError(error, 'Failed to remove steals'));
            }
        }
    }
    
    // ========================================================
    // !HELP - Command list
    // ========================================================
    
    else if (command === '!help') {
        const userCommands = new EmbedBuilder()
            .setTitle('📋 SAB Waitlist Bot - User Commands')
            .setColor(0x00ffff)
            .setDescription('Commands available to users with the **Buyer** role:')
            .addFields(
                { name: '!joinserver', value: '🎮 Get a clickable link to join the SAB server', inline: false },
                { name: '!waitlist', value: '⏳ View the current waitlist status and positions', inline: false },
                { name: '!steals [@user]', value: '📊 Check steal count for yourself or another user', inline: false },
                { name: '!slots', value: '👥 View all active players currently in the server', inline: false }
            )
            .setFooter({ text: 'Use !help to see this menu again' })
            .setTimestamp();
        
        if (isOwner) {
            const ownerCommands = new EmbedBuilder()
                .setTitle('🔧 SAB Waitlist Bot - Owner Commands')
                .setColor(0xff6b6b)
                .setDescription('Commands available to server owners only:')
                .addFields(
                    { name: '!whitelist <username>', value: 'Add a Roblox user to the exempt list (won\'t be kicked)', inline: false },
                    { name: '!unwhitelist <username>', value: 'Remove a Roblox user from the exempt list', inline: false },
                    { name: '!addwaitlist <@user> <brainrot> [steals]', value: 'Add a user to the waitlist with initial steals', inline: false },
                    { name: '!addsteals <@user> <amount>', value: 'Add steals to a user\'s account', inline: false },
                    { name: '!removesteals <@user> [amount]', value: 'Remove steals from a user (default: 1)', inline: false }
                )
                .setFooter({ text: 'Owner commands require API key configuration' })
                .setTimestamp();
            
            message.reply({ embeds: [userCommands, ownerCommands] });
        } else {
            message.reply({ embeds: [userCommands] });
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
    console.error('❌ Failed to login to Discord:', error.message);
    process.exit(1);
});

// Handle Discord client errors
client.on('error', error => {
    console.error('❌ Discord client error:', error);
});

// Handle warnings
client.on('warn', warning => {
    console.warn('⚠️ Discord warning:', warning);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 SIGTERM received, shutting down bot...');
    client.destroy();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 SIGINT received, shutting down bot...');
    client.destroy();
    process.exit(0);
});
