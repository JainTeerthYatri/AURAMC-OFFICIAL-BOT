require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  AttachmentBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize AURAMC AI Engine with gemini-3.5-flash
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Express server to prevent Render Web Service from sleeping
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord bot is alive and running!');
});

app.listen(PORT, () => {
  console.log(`Express server is listening on port ${PORT}`);
});

const config = {
  welcomeChannelId: null,
  leaveChannelId: null,
  autoModEnabled: true
};

const activeGiveaways = new Map();
const ytSubscriptions = new Map();
const snipeCache = new Map(); 
const afkUsers = new Map();
const userWarnings = new Map(); 
const activeTicketSetups = new Map(); 

function parseTime(timeStr) {
  const match = timeStr.toLowerCase().match(/^(\d+)([mhd])$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  return null;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  const commands = [
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Displays the interactive professional command directory and categories'),

    new SlashCommandBuilder()
      .setName('askai')
      .setDescription('Ask anything to AURAMC directly on Discord')
      .addStringOption(option => 
        option.setName('prompt')
          .setDescription('Your question or prompt for AURAMC')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('membercount')
      .setDescription('Displays current server member statistics'),

    new SlashCommandBuilder()
      .setName('afk')
      .setDescription('Sets your AFK status so the bot replies when you are pinged')
      .addStringOption(option => 
        option.setName('reason')
          .setDescription('Reason for being AFK')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('Displays a user\'s avatar')
      .addUserOption(option => 
        option.setName('user')
          .setDescription('The user to get the avatar for')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('serverinfo')
      .setDescription('Displays server statistics'),

    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Displays information about a user')
      .addUserOption(option => 
        option.setName('user')
          .setDescription('The user to inspect')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('remind')
      .setDescription('Set a personal reminder')
      .addIntegerOption(option => 
        option.setName('minutes')
          .setDescription('Time in minutes until reminder')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('message')
          .setDescription('What to remind you about')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('account')
      .setDescription('View professional YouTube channel analytics and overview')
      .addStringOption(option => 
        option.setName('username')
          .setDescription('YouTube channel handle (e.g. @MrBeast)')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('snipe')
      .setDescription('Recovers the last deleted message in this channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('poll')
      .setDescription('Creates a voting poll')
      .addStringOption(option => option.setName('question').setDescription('The poll question').setRequired(true))
      .addStringOption(option => option.setName('option1').setDescription('First option').setRequired(true))
      .addStringOption(option => option.setName('option2').setDescription('Second option').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Makes the bot repeat your message')
      .addStringOption(option => option.setName('message').setDescription('The message for the bot to send').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Locks the current channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
      .setName('lockdown')
      .setDescription('Locks or unlocks all text channels in the server')
      .addStringOption(option =>
        option.setName('action')
          .setDescription('Choose Lock or Unlock')
          .setRequired(true)
          .addChoices({ name: 'Lock', value: 'lock' }, { name: 'Unlock', value: 'unlock' })
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Deletes a specified number of messages')
      .addIntegerOption(option => option.setName('count').setDescription('Number of messages to delete (1-100)').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Sets the slowmode delay for the current channel')
      .addIntegerOption(option => option.setName('seconds').setDescription('Delay in seconds (0 to disable)').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Temporarily timeout a member')
      .addUserOption(option => option.setName('user').setDescription('The user to timeout').setRequired(true))
      .addIntegerOption(option => option.setName('minutes').setDescription('Duration in minutes').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Reason for timeout').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member from the server')
      .addUserOption(option => option.setName('user').setDescription('The user to kick').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Reason for kicking').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member from the server')
      .addUserOption(option => option.setName('user').setDescription('The user to ban').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Reason for banning').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Unban a user from the server using their User ID')
      .addStringOption(option => option.setName('userid').setDescription('The User ID of the person to unban').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Issue a formal warning to a member')
      .addUserOption(option => option.setName('user').setDescription('The user to warn').setRequired(true))
      .addStringOption(option => option.setName('reason').setDescription('Reason for the warning').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('Check active warnings for a member')
      .addUserOption(option => option.setName('user').setDescription('The user to check warnings for').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('nick')
      .setDescription('Change the nickname of a server member')
      .addUserOption(option => option.setName('user').setDescription('The user to target').setRequired(true))
      .addStringOption(option => option.setName('nickname').setDescription('The new nickname (leave blank to reset)').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

    new SlashCommandBuilder()
      .setName('ticketsetup')
      .setDescription('Deploys an interactive live ticket builder control panel')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('transcript')
      .setDescription('Saves and exports the current ticket chat history into a text file')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
      .setName('setwelcome')
      .setDescription('Sets the channel for welcome messages')
      .addChannelOption(option => option.setName('channel').setDescription('Select the welcome channel').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('setleave')
      .setDescription('Sets the channel for leave messages')
      .addChannelOption(option => option.setName('channel').setDescription('Select the leave channel').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('automod')
      .setDescription('Enable or disable auto-moderation')
      .addStringOption(option =>
        option.setName('status')
          .setDescription('Turn Auto-Mod On or Off')
          .setRequired(true)
          .addChoices({ name: 'Enable', value: 'on' }, { name: 'Disable', value: 'off' })
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Host a professional interactive giveaway session')
      .addStringOption(option => option.setName('prize').setDescription('The prize being given away').setRequired(true))
      .addStringOption(option =>
        option.setName('time')
          .setDescription('Select a preset time OR select Custom')
          .setRequired(true)
          .addChoices(
            { name: '10 Minutes', value: '10m' },
            { name: '30 Minutes', value: '30m' },
            { name: '1 Hour', value: '1h' },
            { name: '6 Hours', value: '6h' },
            { name: '12 Hours', value: '12h' },
            { name: '1 Day', value: '1d' },
            { name: 'Custom Time', value: 'custom' }
          )
      )
      .addStringOption(option => option.setName('custom_time').setDescription('Example: 15m, 2h (Only if Custom is selected)').setRequired(false))
      .addIntegerOption(option => option.setName('winners').setDescription('Number of winners (Default: 1)').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('notify')
      .setDescription('Manage YouTube upload notifications')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Auto-post latest YouTube videos to a Discord channel')
          .addStringOption(option => option.setName('username').setDescription('YouTube handle').setRequired(true))
          .addChannelOption(option => option.setName('channel').setDescription('Discord channel').setRequired(true))
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('reactionrole')
      .setDescription('Sends the self-assignable role panel')
      .addRoleOption(option => option.setName('role1').setDescription('First role').setRequired(true))
      .addRoleOption(option => option.setName('role2').setDescription('Second role').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Creates a custom embed message in the channel')
      .addStringOption(option => option.setName('title').setDescription('The embed title').setRequired(true))
      .addStringOption(option => option.setName('description').setDescription('The embed description').setRequired(true))
      .addStringOption(option => option.setName('color').setDescription('Hex color code (e.g., #FF0000)').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('embed-advanced')
      .setDescription('Creates an advanced custom rich embed with title, description, thumbnail, and footer')
      .addStringOption(option => option.setName('title').setDescription('Embed title').setRequired(true))
      .addStringOption(option => option.setName('description').setDescription('Embed description').setRequired(true))
      .addStringOption(option => option.setName('color').setDescription('Hex color code (e.g. #5865F2)').setRequired(false))
      .addStringOption(option => option.setName('thumbnail').setDescription('Thumbnail image URL').setRequired(false))
      .addStringOption(option => option.setName('footer').setDescription('Footer text').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('poll-advanced')
      .setDescription('Creates a rich multi-option poll (up to 4 options)')
      .addStringOption(option => option.setName('question').setDescription('Poll question').setRequired(true))
      .addStringOption(option => option.setName('option1').setDescription('First option').setRequired(true))
      .addStringOption(option => option.setName('option2').setDescription('Second option').setRequired(true))
      .addStringOption(option => option.setName('option3').setDescription('Third option (Optional)').setRequired(false))
      .addStringOption(option => option.setName('option4').setDescription('Fourth option (Optional)').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }

  setInterval(checkYouTubeUploads, 10 * 60 * 1000);
});

async function checkYouTubeUploads() {
  if (ytSubscriptions.size === 0 || !process.env.YOUTUBE_API_KEY) return;
  for (const [handle, data] of ytSubscriptions.entries()) {
    try {
      const cleanHandle = handle.replace('@', '');
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanHandle)}&type=channel&key=${process.env.YOUTUBE_API_KEY}`;
      const searchRes = await axios.get(searchUrl);
      if (!searchRes.data.items || searchRes.data.items.length === 0) continue;
      
      const channelId = searchRes.data.items[0].id.channelId;
      const channelDetailsUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`;
      const channelRes = await axios.get(channelDetailsUrl);
      const uploadsPlaylistId = channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=1&key=${process.env.YOUTUBE_API_KEY}`;
      const playlistRes = await axios.get(playlistUrl);
      if (!playlistRes.data.items || playlistRes.data.items.length === 0) continue;
      
      const latestVideo = playlistRes.data.items[0].snippet;
      const videoId = latestVideo.resourceId.videoId;
      if (data.lastVideoId !== videoId) {
        data.lastVideoId = videoId;
        const discordChannel = client.channels.cache.get(data.discordChannelId);
        if (discordChannel) {
          discordChannel.send(`🚨 **New Video Uploaded!** 🚨\n**${latestVideo.title}**\nhttps://www.youtube.com/watch?v=${videoId}`);
        }
      }
    } catch (err) {
      console.error(`Error checking YouTube updates for ${handle}:`, err.message);
    }
  }
}

client.on('guildMemberAdd', member => {
  if (!config.welcomeChannelId) return;
  const welcomeChannel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!welcomeChannel) return;
  welcomeChannel.send(`Welcome to the server, ${member}! We are glad to have you here. 🎉`);
});

client.on('guildMemberRemove', member => {
  if (!config.leaveChannelId) return;
  const leaveChannel = member.guild.channels.cache.get(config.leaveChannelId);
  if (!leaveChannel) return;
  leaveChannel.send(`${member.user.tag} has left the server. We hope to see you again! 👋`);
});

client.on('messageDelete', message => {
  if (!message.author || message.author.bot) return;
  snipeCache.set(message.channel.id, {
    content: message.content || '[No Text Content / Attachment]',
    author: message.author.tag,
    avatar: message.author.displayAvatarURL(),
    timestamp: new Date().toLocaleTimeString()
  });
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (afkUsers.has(message.author.id)) {
    afkUsers.delete(message.author.id);
    const welcomeBack = await message.channel.send(`Welcome back ${message.author}, I removed your AFK status!`);
    setTimeout(() => welcomeBack.delete().catch(() => {}), 5000);
  }

  if (message.mentions.users.size > 0) {
    message.mentions.users.forEach(user => {
      if (afkUsers.has(user.id)) {
        const afkData = afkUsers.get(user.id);
        message.channel.send(`💤 **${user.tag}** is currently AFK: ${afkData.reason}`);
      }
    });
  }

  if (!config.autoModEnabled) return;
  const content = message.content.toLowerCase();
  if (content.includes('discord.gg/') || content.includes('discord.com/invite/')) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete();
      const warning = await message.channel.send(`${message.author}, posting invite links is not allowed here!`);
      setTimeout(() => warning.delete(), 5000);
      return;
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'help_menu') {
      const selectedVal = interaction.values[0];
      let embed = new EmbedBuilder().setColor('#5865F2').setTimestamp();

      if (selectedVal === 'public') {
        embed.setTitle('📂 Public & Utility Commands')
          .setDescription('List of all available public commands for users.')
          .addFields(
            { name: '/help', value: 'Displays the interactive command directory.' },
            { name: '/askai', value: 'Interact directly with the AURAMC AI engine.' },
            { name: '/account', value: 'View professional YouTube channel metrics.' },
            { name: '/serverinfo', value: 'Displays detailed server specifications.' },
            { name: '/userinfo', value: 'Displays targeted user information.' },
            { name: '/avatar', value: 'Fetches high-resolution user avatars.' },
            { name: '/membercount', value: 'Displays current server census.' },
            { name: '/afk', value: 'Sets your automated Away-From-Keyboard status.' },
            { name: '/remind', value: 'Sets a personal scheduled reminder.' }
          );
      } else if (selectedVal === 'moderation') {
        embed.setTitle('🛡️ Moderation & Security Commands')
          .setDescription('Commands restricted to moderators for server upkeep.')
          .addFields(
            { name: '/warn', value: 'Issues a formal strike/warning to a user.' },
            { name: '/warnings', value: 'Inspects active strikes for a user.' },
            { name: '/timeout', value: 'Temporarily restricts a member from chatting.' },
            { name: '/kick', value: 'Removes a member from the guild.' },
            { name: '/ban', value: 'Permanently bans a member from the guild.' },
            { name: '/unban', value: 'Revokes a server ban using User ID.' },
            { name: '/purge', value: 'Bulk deletes message history.' },
            { name: '/snipe', value: 'Recovers the most recently deleted message.' },
            { name: '/nick', value: 'Modifies a member nickname.' }
          );
      } else if (selectedVal === 'admin') {
        embed.setTitle('⚙️ Administrator & Utility Commands')
          .setDescription('High-level configuration and management commands.')
          .addFields(
            { name: '/lock / lockdown', value: 'Secures text channels instantly.' },
            { name: '/slowmode', value: 'Imposes rate limits on channels.' },
            { name: '/ticketsetup', value: 'Deploys an interactive support ticket panel.' },
            { name: '/giveaway', value: 'Hosts automated giveaways.' },
            { name: '/embed / embed-advanced', value: 'Publishes tailored rich embeds.' },
            { name: '/poll / poll-advanced', value: 'Deploys reaction-based voting polls.' },
            { name: '/setwelcome / setleave', value: 'Configures welcome and leave channels.' },
            { name: '/automod', value: 'Toggles automated safety filters.' },
            { name: '/notify', value: 'Configures YouTube upload alerts.' },
            { name: '/reactionrole', value: 'Deploys self-assignable role panels.' }
          );
      }

      await interaction.update({ embeds: [embed] });
    }
  }

  if (interaction.isButton()) {
    
    // --- LIVE INTERACTIVE TICKET BUILDER LOGIC ---
    if (interaction.customId.startsWith('ts_')) {
      const parts = interaction.customId.split('_');
      const action = parts[1]; 
      const panelId = parts[2];
      
      const setupData = activeTicketSetups.get(panelId);
      if (!setupData) {
        return interaction.reply({ content: '❌ This setup session has expired or is invalid.', flags: MessageFlags.Ephemeral });
      }

      const panelMessage = await interaction.channel.messages.fetch(panelId).catch(() => null);
      if (!panelMessage) return;

      if (action === 'finish') {
        const controlMessage = await interaction.channel.messages.fetch(setupData.controlMessageId).catch(() => null);
        if (controlMessage) await controlMessage.delete();
        activeTicketSetups.delete(panelId);
        return interaction.reply({ content: '✅ Panel setup has been finalized successfully.', flags: MessageFlags.Ephemeral });
      }

      const askForInput = async (promptText) => {
        await interaction.reply({ content: promptText, fetchReply: true });
        
        try {
          const filter = m => m.author.id === interaction.user.id;
          const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
          const userMessage = collected.first();
          const content = userMessage.content;
          
          await userMessage.delete().catch(() => {});
          await interaction.deleteReply().catch(() => {});
          
          return content;
        } catch (error) {
          await interaction.editReply({ content: '❌ Request timed out. Please click the button to try again.' });
          return null;
        }
      };

      if (action === 'title') {
        const newTitle = await askForInput('📝 Please type the **Title** for this ticket panel in the chat below:');
        if (newTitle) {
          setupData.title = newTitle;
          const embed = EmbedBuilder.from(panelMessage.embeds[0]).setTitle(setupData.title);
          await panelMessage.edit({ embeds: [embed] });
        }
      }

      if (action === 'desc') {
        const newDesc = await askForInput('📝 Please type the **Description** for this ticket panel in the chat below:');
        if (newDesc) {
          setupData.desc = newDesc;
          const embed = EmbedBuilder.from(panelMessage.embeds[0]).setDescription(setupData.desc);
          await panelMessage.edit({ embeds: [embed] });
        }
      }

      if (action === 'addbtn') {
        if (setupData.buttons.length >= 25) {
          return interaction.reply({ content: '❌ You have reached the maximum Discord limit of 25 buttons per message.', flags: MessageFlags.Ephemeral });
        }

        const btnName = await askForInput('🔘 Please type the **Label/Name** for your new ticket button (e.g., Support, Reports):');
        if (!btnName) return;

        const botPrompt = await interaction.channel.send('🎨 Please type the **Color** for this button in professional English. Valid options: `blue`, `green`, `red`, `grey`.');
        
        try {
          const filter = m => m.author.id === interaction.user.id;
          const collectedColor = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
          const colorMsg = collectedColor.first();
          const colorInput = colorMsg.content.toLowerCase();
          
          await colorMsg.delete().catch(() => {});
          await botPrompt.delete().catch(() => {});

          let btnStyle = ButtonStyle.Secondary; 
          if (colorInput.includes('blue')) btnStyle = ButtonStyle.Primary;
          if (colorInput.includes('green')) btnStyle = ButtonStyle.Success;
          if (colorInput.includes('red')) btnStyle = ButtonStyle.Danger;

          setupData.buttons.push({ label: btnName, style: btnStyle, customId: `ticket_btn_${btnName.replace(/\s+/g, '')}` });

          const actionRows = [];
          for (let i = 0; i < setupData.buttons.length; i += 5) {
            const chunk = setupData.buttons.slice(i, i + 5);
            const row = new ActionRowBuilder();
            chunk.forEach(btn => {
              row.addComponents(new ButtonBuilder().setCustomId(btn.customId).setLabel(btn.label).setStyle(btn.style));
            });
            actionRows.push(row);
          }

          await panelMessage.edit({ components: actionRows });
        } catch (error) {
          await botPrompt.edit('❌ Request timed out. Button creation cancelled.').then(m => setTimeout(() => m.delete(), 3000));
        }
      }
      return;
    }

    if (interaction.customId.startsWith('ticket_btn_')) {
      const category = interaction.customId.replace('ticket_btn_', '');
      const guild = interaction.guild;
      
      const safeCategory = category.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const channelName = `ticket-${safeCategory}-${interaction.user.username.toLowerCase()}`;

      const existingChannel = guild.channels.cache.find(c => c.name === channelName);
      if (existingChannel) {
        return interaction.reply({ 
          content: `You already have an active support ticket open in ${existingChannel}.`, 
          flags: MessageFlags.Ephemeral 
        });
      }

      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
      });

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('🔒 Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`Support Ticket: ${category}`)
        .setDescription(`Hello ${interaction.user},\nThank you for reaching out to support regarding **${category}**.\nPlease describe your query or concern below in detail.`)
        .setTimestamp();

      await ticketChannel.send({ 
        content: `${interaction.user}`, 
        embeds: [embed], 
        components: [closeButton] 
      });
      
      await interaction.reply({ 
        content: `Your support ticket has been successfully created: ${ticketChannel}`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ 
        content: '🔒 Closing ticket session and generating chat transcript...', 
        flags: MessageFlags.Ephemeral 
      });
      
      try {
        const channel = interaction.channel;
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcriptArr = messages.reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`).join('\n');
        
        const buffer = Buffer.from(transcriptArr, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });

        await channel.send({ content: 'Here is the archived chat transcript:', files: [attachment] });
      } catch (err) {
        console.error('Transcript generation error:', err);
      }
      
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    // --- UPGRADED PROFESSIONAL GIVEAWAY ENTRY BUTTON ---
    if (interaction.customId === 'gwy_enter_btn') {
      const giveaway = activeGiveaways.get(interaction.message.id);
      
      if (!giveaway) {
        return interaction.reply({ content: '❌ This giveaway session has already concluded.', flags: MessageFlags.Ephemeral });
      }
      
      if (giveaway.participants.has(interaction.user.id)) {
        return interaction.reply({ content: '⚠️ You are already registered for this giveaway.', flags: MessageFlags.Ephemeral });
      }
      
      giveaway.participants.add(interaction.user.id);
      await interaction.reply({ content: '✅ You have successfully entered the giveaway! Best of luck!', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('role_')) {
      const roleId = interaction.customId.split('_')[1];
      const role = interaction.guild.roles.cache.get(roleId);
      
      if (!role) {
        return interaction.reply({ content: 'Target role could not be located.', flags: MessageFlags.Ephemeral });
      }

      const member = interaction.member;
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        await interaction.reply({ content: `Successfully removed the **${role.name}** role from your profile.`, flags: MessageFlags.Ephemeral });
      } else {
        await member.roles.add(roleId);
        await interaction.reply({ content: `Successfully assigned the **${role.name}** role to your profile.`, flags: MessageFlags.Ephemeral });
      }
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, channel, guild, member } = interaction;

  // --- Public Command Handlers ---
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({ name: 'AURAMC Command Directory', iconURL: client.user.displayAvatarURL() })
      .setTitle('📖 Interactive Help Center')
      .setDescription('Welcome to the official command directory. Please select a specific category from the dropdown menu below to view detailed command listings and their descriptions.')
      .addFields(
        { name: '📂 Public Category', value: 'General user utilities, AI engine, and stats.', inline: true },
        { name: '🛡️ Moderation Category', value: 'Member safety, strikes, and restriction tools.', inline: true },
        { name: '⚙️ Administrator Category', value: 'Server configuration and advanced setups.', inline: true }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_menu')
        .setPlaceholder('Select a command category...')
        .addOptions([
          { label: 'Public Commands', description: 'View public utilities and AI features', value: 'public', emoji: '📂' },
          { label: 'Moderation Commands', description: 'View moderation and security tools', value: 'moderation', emoji: '🛡️' },
          { label: 'Administrator Commands', description: 'View server config and administration tools', value: 'admin', emoji: '⚙️' }
        ])
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }
  else if (commandName === 'askai') {
    const prompt = options.getString('prompt');
    await interaction.deferReply();

    try {
      const model = genAI.getGenerativeModel({ model: 'models/gemini-3.5-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const aiReply = response.text() || 'No response generated.';
      
      const embed = new EmbedBuilder()
        .setColor('#10a37f')
        .setTitle('🤖 AURAMC Intelligence')
        .setDescription(aiReply.length > 4000 ? aiReply.substring(0, 4000) + '...' : aiReply)
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('AURAMC AI Error:', err);
      await interaction.editReply(`❌ Failed to fetch response from AURAMC. Error: \`${err.message || 'Unknown error'}\``);
    }
  }
  else if (commandName === 'membercount') {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 ${guild.name} Member Statistics`)
      .setDescription(`Total Registered Members: **${guild.memberCount}**`)
      .setTimestamp();
      
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'afk') {
    const reason = options.getString('reason') || 'No reason provided';
    afkUsers.set(interaction.user.id, { reason: reason });
    await interaction.reply({ content: `💤 Your status has been set to AFK: **${reason}**` });
  }
  else if (commandName === 'avatar') {
    const targetUser = options.getUser('user') || interaction.user;
    const avatarUrl = targetUser.displayAvatarURL({ size: 1024, dynamic: true });
    
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle(`${targetUser.username}'s Avatar`)
      .setImage(avatarUrl);
      
    await interaction.reply({ embeds: [embed] });
  }else if (commandName === 'serverinfo') {
    const owner = await guild.fetchOwner();
    const channels = guild.channels.cache;
    const roles = guild.roles.cache.size;
    const boosters = guild.premiumSubscriptionCount;
    const boostTier = guild.premiumTier;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        { name: '👑 Server Owner', value: `<@${owner.id}>`, inline: true },
        { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
        { name: '📅 Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`, inline: false },
        { name: '👥 Members', value: `Total: **${guild.memberCount}**`, inline: true },
        { name: '💬 Channels', value: `Text: **${channels.filter(c => c.type === ChannelType.GuildText).size}** | Voice: **${channels.filter(c => c.type === ChannelType.GuildVoice).size}**`, inline: true },
        { name: '🛡️ Security', value: `Roles: **${roles}** | Boosts: **${boosters}** (Tier ${boostTier})`, inline: false }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();
      
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'userinfo') {
    const targetUser = options.getUser('user') || interaction.user;
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    
    const roles = targetMember ? targetMember.roles.cache.filter(r => r.id !== guild.id).map(r => `<@&${r.id}>`).join(', ') || 'None' : 'Not in server';
    const joinedAt = targetMember ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D>` : 'Unknown';
    const createdAt = `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`;

    const embed = new EmbedBuilder()
      .setColor(targetMember?.displayHexColor || '#2b2d31')
      .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
      .addFields(
        { name: '🆔 User ID', value: `\`${targetUser.id}\``, inline: true },
        { name: '🤖 Bot Account', value: targetUser.bot ? 'Yes' : 'No', inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '📅 Discord Joined', value: createdAt, inline: true },
        { name: '📥 Server Joined', value: joinedAt, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '🎭 Roles', value: roles.length > 1024 ? roles.substring(0, 1020) + '...' : roles, inline: false }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();
      
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'remind') {
    const minutes = options.getInteger('minutes');
    const reminderMessage = options.getString('message');
    
    await interaction.reply({ content: `✅ Reminder successfully scheduled for ${minutes} minute(s) from now.`, flags: MessageFlags.Ephemeral });
    
    setTimeout(() => {
      interaction.user.send(`⏰ **Reminder Alert:** ${reminderMessage}`).catch(() => {});
    }, minutes * 60 * 1000);
  }
  else if (commandName === 'account') {
    if (!process.env.YOUTUBE_API_KEY) {
      return interaction.reply({ content: '❌ YouTube API key is missing in environment variables.', flags: MessageFlags.Ephemeral });
    }
    
    await interaction.deferReply();
    
    try {
      const cleanHandle = options.getString('username').replace('@', '');
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanHandle)}&type=channel&key=${process.env.YOUTUBE_API_KEY}`;
      const searchRes = await axios.get(searchUrl);
      
      if (!searchRes.data.items || searchRes.data.items.length === 0) {
        return interaction.editReply({ content: '❌ YouTube channel could not be found with this handle or query.' });
      }
      
      const channelId = searchRes.data.items[0].id.channelId;
      const detailsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`;
      const detailsRes = await axios.get(detailsUrl);
      const chData = detailsRes.data.items[0];

      const channelTitle = chData.snippet.title;
      const channelDesc = chData.snippet.description ? (chData.snippet.description.length > 150 ? chData.snippet.description.substring(0, 147) + '...' : chData.snippet.description) : 'No description available.';
      const thumbnail = chData.snippet.thumbnails?.high?.url || chData.snippet.thumbnails?.default?.url;
      const customUrl = chData.snippet.customUrl ? `https://www.youtube.com/${chData.snippet.customUrl}` : `https://www.youtube.com/channel/${channelId}`;
      
      const subs = Number(chData.statistics.subscriberCount).toLocaleString() || 'Hidden';
      const views = Number(chData.statistics.viewCount).toLocaleString() || '0';
      const videos = Number(chData.statistics.videoCount).toLocaleString() || '0';
      const publishedAt = `<t:${Math.floor(new Date(chData.snippet.publishedAt).getTime() / 1000)}:D>`;

      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setAuthor({ name: 'YouTube Channel Analytics & Overview', iconURL: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Youtube_logo_%282013-2017%29.svg' })
        .setTitle(`📺 ${channelTitle}`)
        .setURL(customUrl)
        .setDescription(`> ${channelDesc}\n\n`)
        .setThumbnail(thumbnail)
        .addFields(
          { name: '👥 Subscribers', value: `\`${subs}\``, inline: true },
          { name: '👁️ Total Views', value: `\`${views}\``, inline: true },
          { name: '🎬 Total Videos', value: `\`${videos}\``, inline: true },
          { name: '📅 Created On', value: `${publishedAt}`, inline: true },
          { name: '🔗 Channel Link', value: `[Click Here to Visit Channel](${customUrl})`, inline: false }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('▶️ Visit Channel on YouTube')
          .setURL(customUrl)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('YouTube API Error:', error);
      await interaction.editReply({ content: '❌ Failed to fetch professional YouTube channel data. Please try again later.' });
    }
  }

  // --- Admin/Mod Handlers ---
  else if (commandName === 'snipe') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const snipedMessage = snipeCache.get(channel.id);
    if (!snipedMessage) {
      return interaction.reply({ content: '❌ No recent deleted messages available to recover.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setAuthor({ name: snipedMessage.author, iconURL: snipedMessage.avatar })
      .setDescription(snipedMessage.content)
      .setFooter({ text: `Deleted at ${snipedMessage.timestamp}` });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'poll') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📊 Server Poll')
      .setDescription(`**${options.getString('question')}**\n\n🇦 ${options.getString('option1')}\n\n🇧 ${options.getString('option2')}`)
      .setTimestamp();
      
    const pollMessage = await channel.send({ embeds: [embed] });
    await pollMessage.react('🇦');
    await pollMessage.react('🇧');
    
    await interaction.reply({ content: 'Poll successfully created and deployed.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'say') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    await interaction.channel.send(options.getString('message'));
    await interaction.reply({ content: 'Message dispatched successfully.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'lock') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    await interaction.reply('Channel locked successfully. 🔒');
  }
  else if (commandName === 'lockdown') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const action = options.getString('action');
    guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(async ch => {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: action === 'unlock' });
    });
    await interaction.reply(action === 'lock' ? '🚨 Server lockdown protocol activated.' : '✅ Server lockdown protocol lifted.');
  }
  else if (commandName === 'purge') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const count = options.getInteger('count');
    await channel.bulkDelete(count, true);
    await interaction.reply({ content: `Successfully purged ${count} messages.`, flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'slowmode') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const seconds = options.getInteger('seconds');
    await channel.setRateLimitPerUser(seconds);
    await interaction.reply({ content: `Channel slowmode updated to ${seconds} second(s).` });
  }
  else if (commandName === 'timeout') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const minutes = options.getInteger('minutes');
    const reason = options.getString('reason') || 'No reason provided';
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    
    if (targetMember) {
      await targetMember.timeout(minutes * 60 * 1000, reason);
      await interaction.reply({ content: `Successfully timed out ${targetUser.tag} for ${minutes} minute(s). Reason: ${reason}` });
    } else {
      await interaction.reply({ content: 'Target member could not be found.', flags: MessageFlags.Ephemeral });
    }
  }
  else if (commandName === 'kick') {
    if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided';
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    
    if (targetMember) {
      await targetMember.kick(reason);
      await interaction.reply({ content: `Successfully kicked ${targetUser.tag}. Reason: ${reason}` });
    } else {
      await interaction.reply({ content: 'Target member could not be found.', flags: MessageFlags.Ephemeral });
    }
  }
  else if (commandName === 'ban') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided';
    await guild.members.ban(targetUser.id, { reason });
    await interaction.reply({ content: `Successfully banned ${targetUser.tag}. Reason: ${reason}` });
  }
  else if (commandName === 'unban') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const userId = options.getString('userid');
    try {
      await guild.members.unban(userId);
      await interaction.reply({ content: `Successfully unbanned user ID: \`${userId}\`` });
    } catch (err) {
      await interaction.reply({ content: 'Failed to unban user. Ensure the User ID is valid and currently banned.', flags: MessageFlags.Ephemeral });
    }
  }
  else if (commandName === 'warn') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const reason = options.getString('reason');
    
    if (!userWarnings.has(targetUser.id)) {
      userWarnings.set(targetUser.id, []);
    }
    
    userWarnings.get(targetUser.id).push({
      reason,
      moderator: interaction.user.tag,
      date: new Date().toLocaleDateString()
    });

    await interaction.reply({ content: `⚠️ Successfully issued a warning to **${targetUser.tag}**. Reason: ${reason}` });
    
    try {
      await targetUser.send(`⚠️ You have received a formal warning in **${guild.name}** for: **${reason}**`);
    } catch (err) {}
  }
  else if (commandName === 'warnings') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const warns = userWarnings.get(targetUser.id) || [];

    if (warns.length === 0) {
      return interaction.reply({ content: `✅ **${targetUser.tag}** has no active warnings on record.`, flags: MessageFlags.Ephemeral });
    }

    const warnList = warns.map((w, index) => `**${index + 1}.** ${w.reason} (Moderator: ${w.moderator}, Date: ${w.date})`).join('\n');
    const embed = new EmbedBuilder()
      .setColor('#FFCC00')
      .setTitle(`⚠️ Active Warnings for ${targetUser.tag}`)
      .setDescription(warnList)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'nick') {
    if (!member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const nickname = options.getString('nickname') || null;
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({ content: 'Target member could not be found.', flags: MessageFlags.Ephemeral });
    }

    try {
      await targetMember.setNickname(nickname);
      await interaction.reply({ content: `Successfully updated nickname for **${targetUser.tag}**.` });
    } catch (err) {
      await interaction.reply({ content: 'Failed to modify nickname. Ensure my role hierarchy is positioned above the target user.', flags: MessageFlags.Ephemeral });
    }
  }
  else if (commandName === 'ticketsetup') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    
    const emptyEmbed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle('⚙️ Panel Title (Pending)')
      .setDescription('Panel description is currently pending configuration.');

    const panelMessage = await channel.send({ embeds: [emptyEmbed] });

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ts_title_${panelMessage.id}`).setLabel('Set Title').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ts_desc_${panelMessage.id}`).setLabel('Set Description').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ts_addbtn_${panelMessage.id}`).setLabel('Add Ticket Button').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ts_finish_${panelMessage.id}`).setLabel('Finish Setup').setStyle(ButtonStyle.Success)
    );

    const controlMessage = await channel.send({ 
      content: '🛠️ **Interactive Ticket Builder Control Panel**\nUse the modules below to configure your panel live. Click **Finish Setup** when done.', 
      components: [controlRow] 
    });

    activeTicketSetups.set(panelMessage.id, { 
      controlMessageId: controlMessage.id,
      title: '⚙️ Panel Title (Pending)', 
      desc: 'Panel description is currently pending configuration.', 
      buttons: [] 
    });

    await interaction.reply({ content: '✅ Interactive builder deployed successfully in the channel.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'transcript') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const messages = await channel.messages.fetch({ limit: 100 });
    const transcriptArr = messages.reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n');
    const buffer = Buffer.from(transcriptArr, 'utf-8');
    await interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'transcript.txt' })] });
  }
  else if (commandName === 'setwelcome') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    config.welcomeChannelId = options.getChannel('channel').id;
    await interaction.reply({ content: 'Welcome channel configured successfully.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'setleave') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    config.leaveChannelId = options.getChannel('channel').id;
    await interaction.reply({ content: 'Leave channel configured successfully.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'automod') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    config.autoModEnabled = (options.getString('status') === 'on');
    await interaction.reply({ content: 'AutoMod configurations updated successfully.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'giveaway') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    
    const prize = options.getString('prize');
    const timeArg = options.getString('time');
    const customTime = options.getString('custom_time');
    const winnerCount = options.getInteger('winners') || 1;

    const rawTime = timeArg === 'custom' ? customTime : timeArg;
    const durationMs = parseTime(rawTime);

    if (!durationMs) {
      return interaction.reply({ content: '❌ Invalid time duration syntax provided. (e.g., 10m, 1h, 1d)', flags: MessageFlags.Ephemeral });
    }

    const endsAt = Math.floor((Date.now() + durationMs) / 1000);

    const embed = new EmbedBuilder()
      .setColor('#FF73FA')
      .setTitle('🎉 PROFESSIONAL GIVEAWAY 🎉')
      .setDescription(`Win **${prize}**!\n\nClick the button below to participate in this giveaway session.\n\n⏱️ **Ends:** <t:${endsAt}:R> (<t:${endsAt}:F>)\n👑 **Winners:** \`${winnerCount}\`\n🎁 **Hosted By:** ${interaction.user}`)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('gwy_enter_btn')
        .setLabel('🎉 Enter Giveaway')
        .setStyle(ButtonStyle.Success)
    );

    const sentMsg = await channel.send({ embeds: [embed], components: [row] });
    activeGiveaways.set(sentMsg.id, { prize, winners: winnerCount, participants: new Set(), host: interaction.user.id });

    await interaction.reply({ content: '✅ Advanced giveaway successfully initiated.', flags: MessageFlags.Ephemeral });

    setTimeout(async () => {
      const giveawayData = activeGiveaways.get(sentMsg.id);
      if (!giveawayData) return;

      const participantsArr = Array.from(giveawayData.participants);
      if (participantsArr.length === 0) {
        await channel.send(`❌ Giveaway for **${prize}** has concluded. Unfortunately, no valid participants entered.`);
        activeGiveaways.delete(sentMsg.id);
        return;
      }

      const winners = [];
      for (let i = 0; i < Math.min(winnerCount, participantsArr.length); i++) {
        const randomIndex = Math.floor(Math.random() * participantsArr.length);
        winners.push(participantsArr.splice(randomIndex, 1)[0]);
      }

      const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
      await channel.send(`🎊 **GIVEAWAY CONCLUDED!** 🎊\nCongratulations ${winnerMentions}! You won **${prize}**! Please contact <@${giveawayData.host}> to claim your reward.`);
      activeGiveaways.delete(sentMsg.id);
    }, durationMs);
  }
  else if (commandName === 'notify') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    ytSubscriptions.set(options.getString('username'), { discordChannelId: options.getChannel('channel').id, lastVideoId: null });
    await interaction.reply({ content: 'YouTube notification subscription configured successfully.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'reactionrole') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const role1 = options.getRole('role1');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`role_${role1.id}`).setLabel(role1.name).setStyle(ButtonStyle.Primary)
    );
    
    await channel.send({ embeds: [new EmbedBuilder().setTitle('Reaction Role Panel')], components: [row] });
    await interaction.reply({ content: 'Reaction role panel deployed.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'embed') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    await channel.send({ 
      embeds: [new EmbedBuilder().setTitle(options.getString('title')).setDescription(options.getString('description'))] 
    });
    await interaction.reply({ content: 'Custom embed dispatched successfully.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'embed-advanced') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const title = options.getString('title');
    const description = options.getString('description');
    const color = options.getString('color') || '#5865F2';
    const thumbnail = options.getString('thumbnail');
    const footer = options.getString('footer');

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color);

    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer) embed.setFooter({ text: footer });

    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: 'Advanced embed dispatched successfully.', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'poll-advanced') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have sufficient permissions to execute this command.', flags: MessageFlags.Ephemeral });
    }
    const question = options.getString('question');
    const opt1 = options.getString('option1');
    const opt2 = options.getString('option2');
    const opt3 = options.getString('option3');
    const opt4 = options.getString('option4');

    let desc = `**${question}**\n\n🇦 ${opt1}\n\n🇧 ${opt2}`;
    if (opt3) desc += `\n\n🇨 ${opt3}`;
    if (opt4) desc += `\n\n🇩 ${opt4}`;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📊 Advanced Voting Poll')
      .setDescription(desc)
      .setTimestamp();

    const pollMessage = await channel.send({ embeds: [embed] });
    await pollMessage.react('🇦');
    await pollMessage.react('🇧');
    if (opt3) await pollMessage.react('🇨');
    if (opt4) await pollMessage.react('🇩');

    await interaction.reply({ content: 'Advanced voting poll created successfully.', flags: MessageFlags.Ephemeral });
  }
});

client.login(process.env.BOT_TOKEN);
