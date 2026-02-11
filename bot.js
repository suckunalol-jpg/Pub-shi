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
const OWNER_IDS = process.env.OWNER_IDS.split(',');
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID; // Role to remove when steals reach 0

client.on('ready', () => {
    console.log(`✅ SAB Bot logged in as ${client.user.tag}`);
    client.user.setActivity('SAB Waitlist System', { type: 'WATCHING' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const isOwner = OWNER_IDS.includes(message.author.id);
    const hasBuyerRole = message.member.roles.cache.has(BUYER_ROLE_ID);
    
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
                .setDescription(`JobId: \`${jobId || 'Not set'}\``)
                .setFooter({ text: `${count} player(s) online` })
                .setTimestamp();
            
            let description = '';
            
            for (let i = 0; i < Math.min(players.length, 10); i++) {
                const p = players[i];
                description += `**${i + 1}. ${p.displayName}** (@${p.username})\n`;
                description += `   📱 Device: ${p.device}\n`;
                description += `   🆔 UserId: ${p.userId}\n`;
                if (p.avatar) {
                    description += `   🖼️ [Avatar](${p.avatar})\n`;
                }
                description += '\n';
            }
            
            embed.setDescription(description || 'No players');
            
            if (players.length > 0 && players[0].avatar) {
                embed.setThumbnail(players[0].avatar);
            }
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Failed to fetch player list: ' + error.message);
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
            return message.reply('Usage: `!whitelist <roblox_username>`');
        }
        
        try {
            await axios.post(`${RAILWAY_URL}/exempt/add`, {
                username,
                apiKey: API_KEY
            });
            
            const embed = new EmbedBuilder()
                .setTitle('✅ User Whitelisted')
                .setColor(0x00ff00)
                .addFields({ name: 'Roblox Username', value: username })
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Failed to whitelist: ' + error.message);
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
            return message.reply('Usage: `!unwhitelist <roblox_username>`');
        }
        
        try {
            await axios.post(`${RAILWAY_URL}/exempt/remove`, {
                username,
                apiKey: API_KEY
            });
            
            const embed = new EmbedBuilder()
                .setTitle('✅ User Removed from Whitelist')
                .setColor(0xff9900)
                .addFields({ name: 'Roblox Username', value: username })
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Failed to remove from whitelist: ' + error.message);
        }
    }
    
    // ========================================================
    // !JOINSERVER - Get clickable join link
    // ========================================================
    
    else if (command === '!joinserver') {
        try {
            const response = await axios.get(`${RAILWAY_URL}/getjobid`);
            const jobId = response.data.jobId;
            
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
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            if (error.response && error.response.status === 404) {
                message.reply('❌ No active server JobId set!');
            } else {
                message.reply('❌ Failed to get join link: ' + error.message);
            }
        }
    }
    
    // ========================================================
    // !WAITLIST - Show current waitlist
    // ========================================================
    
    else if (command === '!waitlist') {
        try {
            const response = await axios.get(`${RAILWAY_URL}/waitlist/list`);
            const { active, waiting, activeCount, waitingCount } = response.data;
            
            if (activeCount === 0 && waitingCount === 0) {
                return message.reply('📋 Waitlist is empty');
            }
            
            const embed = new EmbedBuilder()
                .setTitle('⏳ SAB Waitlist Status')
                .setColor(0xffd700)
                .setFooter({ text: `Active: ${activeCount} | Waiting: ${waitingCount}` })
                .setTimestamp();
            
            let activeDesc = '';
            if (activeCount > 0) {
                activeDesc = '**🟢 Currently in Server (Position > 1):**\n';
                active.forEach((user, i) => {
                    activeDesc += `${i + 1}. <@${user.discordId}> - Pos: ${user.position} | Steals: ${user.steals}\n`;
                });
            }
            
            let waitingDesc = '';
            if (waitingCount > 0) {
                waitingDesc = '\n**🔴 On Waitlist (Position ≤ 1):**\n';
                waiting.forEach((user, i) => {
                    waitingDesc += `${i + 1}. <@${user.discordId}> - Pos: ${user.position} | Steals: ${user.steals}\n`;
                });
            }
            
            embed.setDescription((activeDesc + waitingDesc) || 'No users in waitlist');
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Failed to fetch waitlist: ' + error.message);
        }
    }
    
    // ========================================================
    // !STEALS - Show steals for specific user or all
    // ========================================================
    
    else if (command === '!steals') {
        const userId = args[1] ? args[1].replace(/[<@!>]/g, '') : message.author.id;
        
        try {
            const response = await axios.get(`${RAILWAY_URL}/waitlist/get/${userId}`);
            const user = response.data.user;
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Steals Information')
                .setColor(user.steals > 0 ? 0x00ff00 : 0xff0000)
                .addFields(
                    { name: 'User', value: `<@${user.discordId}>` },
                    { name: 'Steals Remaining', value: `**${user.steals}**` },
                    { name: 'Position', value: `${user.position}` },
                    { name: 'Brainrot Paid', value: `${user.brainrotPaid}` }
                )
                .setTimestamp();
            
            if (user.steals === 0) {
                embed.setDescription('⚠️ **Out of steals!** Buyer role will be removed.');
            }
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            if (error.response && error.response.status === 404) {
                message.reply('❌ User not found in waitlist!');
            } else {
                message.reply('❌ Failed to fetch steals: ' + error.message);
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
        const brainrotPaid = parseInt(args[2]) || 0;
        const initialSteals = parseInt(args[3]) || 0;
        
        if (!userMention) {
            return message.reply('Usage: `!addwaitlist <@user> <brainrot_paid> [initial_steals]`');
        }
        
        const discordId = userMention.replace(/[<@!>]/g, '');
        
        try {
            const member = await message.guild.members.fetch(discordId);
            
            await axios.post(`${RAILWAY_URL}/waitlist/add`, {
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
                } catch (err) {
                    console.error('Failed to add buyer role:', err);
                }
            }
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Added to Waitlist')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'User', value: `<@${discordId}>` },
                    { name: 'Brainrot Paid', value: `${brainrotPaid}` },
                    { name: 'Initial Steals', value: `${initialSteals}` }
                )
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            message.reply('❌ Failed to add to waitlist: ' + error.message);
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
            return message.reply('Usage: `!addsteals <@user> <amount>`');
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
                    { name: 'User', value: `<@${discordId}>` },
                    { name: 'Amount Added', value: `+${amount}` },
                    { name: 'Total Steals', value: `**${user.steals}**` }
                )
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            if (error.response && error.response.status === 404) {
                message.reply('❌ User not found in waitlist!');
            } else {
                message.reply('❌ Failed to add steals: ' + error.message);
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
            return message.reply('Usage: `!removesteals <@user> [amount]`');
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
                    } catch (err) {
                        console.error('Failed to remove buyer role:', err);
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ User Removed from Waitlist')
                    .setColor(0xff0000)
                    .setDescription(`<@${discordId}> ran out of steals and was removed from the waitlist.`)
                    .addFields({ name: 'Final Steals', value: '0' })
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('📉 Steals Removed')
                    .setColor(0xff9900)
                    .addFields(
                        { name: 'User', value: `<@${discordId}>` },
                        { name: 'Amount Removed', value: `-${amount}` },
                        { name: 'Remaining Steals', value: `**${user.steals}**` }
                    )
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                message.reply('❌ User not found in waitlist!');
            } else {
                message.reply('❌ Failed to remove steals: ' + error.message);
            }
        }
    }
    
    // ========================================================
    // !HELP - Command list
    // ========================================================
    
    else if (command === '!help') {
        const embed = new EmbedBuilder()
            .setTitle('📋 SAB Waitlist Bot Commands')
            .setColor(0x00ffff)
            .addFields(
                { name: '!joinserver', value: 'Get clickable link to join the server' },
                { name: '!waitlist', value: 'View current waitlist status' },
                { name: '!steals [@user]', value: 'Check steals for yourself or another user' },
                { name: '\u200B', value: '**Buyer Role Commands:**' },
                { name: '!slots', value: 'View all active players with details' },
                { name: '\u200B', value: '**Owner Commands:**' },
                { name: '!whitelist <username>', value: 'Add Roblox user to exempt list' },
                { name: '!unwhitelist <username>', value: 'Remove Roblox user from exempt list' },
                { name: '!addwaitlist <@user> <brainrot> [steals]', value: 'Add user to waitlist' },
                { name: '!addsteals <@user> <amount>', value: 'Add steals to a user' },
                { name: '!removesteals <@user> [amount]', value: 'Remove steals from a user' }
            )
            .setTimestamp();
        
        message.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
