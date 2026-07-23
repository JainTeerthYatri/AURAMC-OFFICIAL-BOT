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
  AttachmentBuilder
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
const userWarnings = new Map(); // Store user warnings: userId -> array of warnings

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
    // ================= PUBLIC COMMANDS (Visible to Everyone) =================
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


    // ================= ADMIN & MODERATION COMMANDS (Visible only to Admins/Mods) =================
    new SlashCommandBuilder()
      .setName('snipe')
      .setDescription('Recovers the last deleted message in this channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('poll')
      .setDescription('Creates a voting poll')
      .addStringOption(option => 
        option.setName('question')
          .setDescription('The poll question')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('option1')
          .setDescription('First option')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('option2')
          .setDescription('Second option')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Makes the bot repeat your message')
      .addStringOption(option => 
        option.setName('message')
          .setDescription('The message for the bot to send')
          .setRequired(true)
      )
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
          .addChoices(
            { name: 'Lock', value: 'lock' },
            { name: 'Unlock', value: 'unlock' }
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Deletes a specified number of messages')
      .addIntegerOption(option =>
        option.setName('count')
          .setDescription('Number of messages to delete (1-100)')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Sets the slowmode delay for the current channel')
      .addIntegerOption(option => 
        option.setName('seconds')
          .setDescription('Delay in seconds (0 to disable)')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Temporarily timeout a member')
      .addUserOption(option => 
        option.setName('user')
          .setDescription('The user to timeout')
          .setRequired(true)
      )
      .addIntegerOption(option => 
        option.setName('minutes')
          .setDescription('Duration in minutes')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('reason')
          .setDescription('Reason for timeout')
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick a member from the server')
      .addUserOption(option => 
        option.setName('user')
          .setDescription('The user to kick')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('reason')
          .setDescription('Reason for kicking')
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban a member from the server')
      .addUserOption(option => 
        option.setName('user')
          .setDescription('The user to ban')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('reason')
          .setDescription('Reason for banning')
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Unban a user from the server using their User ID')
      .addStringOption(option => 
        option.setName('userid')
          .setDescription('The User ID of the person to unban')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Issue a formal warning to a member')
      .addUserOption(option => 
        option.setName('user')
          .setDescription('The user to warn')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('reason')
          .setDescription('Reason for the warning')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('Check active warnings for a member')
      .addUserOption(option => 
        option.setName('user')
          .setDescription('The user to check warnings for')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('nick')
      .setDescription('Change the nickname of a server member')
      .addUserOption(option => 
        option.setName('user')
          .setDescription('The user to target')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('nickname')
          .setDescription('The new nickname (leave blank to reset)')
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

    new SlashCommandBuilder()
      .setName('ticketsetup')
      .setDescription('Creates a customizable support ticket panel')
      .addStringOption(option => 
        option.setName('title')
          .setDescription('Title of the ticket panel')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('description')
          .setDescription('Description inside the ticket panel')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('button1')
          .setDescription('Name for the 1st ticket button')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('button2')
          .setDescription('Name for the 2nd ticket button (Optional)')
          .setRequired(false)
      )
      .addStringOption(option => 
        option.setName('button3')
          .setDescription('Name for the 3rd ticket button (Optional)')
          .setRequired(false)
      )
      .addStringOption(option => 
        option.setName('button4')
          .setDescription('Name for the 4th ticket button (Optional)')
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('transcript')
      .setDescription('Saves and exports the current ticket chat history into a text file')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
      .setName('setwelcome')
      .setDescription('Sets the channel for welcome messages')
      .addChannelOption(option => 
        option.setName('channel')
          .setDescription('Select the welcome channel')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('setleave')
      .setDescription('Sets the channel for leave messages')
      .addChannelOption(option => 
        option.setName('channel')
          .setDescription('Select the leave channel')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('automod')
      .setDescription('Enable or disable auto-moderation')
      .addStringOption(option =>
        option.setName('status')
          .setDescription('Turn Auto-Mod On or Off')
          .setRequired(true)
          .addChoices(
            { name: 'Enable', value: 'on' },
            { name: 'Disable', value: 'off' }
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('giveaway')
      .setDescription('Host an advanced giveaway with preset or custom time')
      .addStringOption(option => 
        option.setName('prize')
          .setDescription('The prize being given away')
          .setRequired(true)
      )
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
      .addStringOption(option => 
        option.setName('custom_time')
          .setDescription('Example: 15m, 2h (Only if Custom is selected)')
          .setRequired(false)
      )
      .addIntegerOption(option => 
        option.setName('winners')
          .setDescription('Number of winners (Default: 1)')
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('notify')
      .setDescription('Manage YouTube upload notifications')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Auto-post latest YouTube videos to a Discord channel')
          .addStringOption(option => 
            option.setName('username')
              .setDescription('YouTube handle')
              .setRequired(true)
          )
          .addChannelOption(option => 
            option.setName('channel')
              .setDescription('Discord channel')
              .setRequired(true)
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('reactionrole')
      .setDescription('Sends the self-assignable role panel')
      .addRoleOption(option => 
        option.setName('role1')
          .setDescription('First role')
          .setRequired(true)
      )
      .addRoleOption(option => 
        option.setName('role2')
          .setDescription('Second role')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Creates a custom embed message in the channel')
      .addStringOption(option => 
        option.setName('title')
          .setDescription('The embed title')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('description')
          .setDescription('The embed description')
          .setRequired(true)
      )
      .addStringOption(option => 
        option.setName('color')
          .setDescription('Hex color code (e.g., #FF0000)')
          .setRequired(false)
      )
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
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('ticket_btn_')) {
      const category = interaction.customId.replace('ticket_btn_', '');
      const guild = interaction.guild;
      
      const safeCategory = category.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const channelName = `ticket-${safeCategory}-${interaction.user.username.toLowerCase()}`;

      const existingChannel = guild.channels.cache.find(c => c.name === channelName);
      if (existingChannel) {
        return interaction.reply({ 
          content: `You already have an open ticket for this category in ${existingChannel}!`, 
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
        .setDescription(`Hello ${interaction.user},\nThank you for opening a ticket regarding **${category}**.\nPlease describe your issue or request below.`)
        .setTimestamp();

      await ticketChannel.send({ 
        content: `${interaction.user}`, 
        embeds: [embed], 
        components: [closeButton] 
      });
      
      await interaction.reply({ 
        content: `Your support ticket has been created: ${ticketChannel}`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ 
        content: '🔒 Closing ticket and generating transcript...', 
        flags: MessageFlags.Ephemeral 
      });
      
      try {
        const channel = interaction.channel;
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcriptArr = messages.reverse().map(m => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content}`).join('\n');
        
        const buffer = Buffer.from(transcriptArr, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });

        await channel.send({ content: 'Here is the chat transcript:', files: [attachment] });
      } catch (err) {
        console.error('Transcript error:', err);
      }
      
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    if (interaction.customId.startsWith('enter_gwy_')) {
      const messageId = interaction.customId.split('_')[2];
      const giveaway = activeGiveaways.get(messageId);
      
      if (!giveaway) {
        return interaction.reply({ content: 'This giveaway has already ended.', flags: MessageFlags.Ephemeral });
      }
      
      if (giveaway.participants.has(interaction.user.id)) {
        return interaction.reply({ content: 'You are already entered!', flags: MessageFlags.Ephemeral });
      }
      
      giveaway.participants.add(interaction.user.id);
      await interaction.reply({ content: '🎉 You have successfully entered the giveaway!', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('role_')) {
      const roleId = interaction.customId.split('_')[1];
      const role = interaction.guild.roles.cache.get(roleId);
      
      if (!role) {
        return interaction.reply({ content: 'Role not found!', flags: MessageFlags.Ephemeral });
      }

      const member = interaction.member;
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        await interaction.reply({ content: `Removed the **${role.name}** role from you!`, flags: MessageFlags.Ephemeral });
      } else {
        await member.roles.add(roleId);
        await interaction.reply({ content: `Given you the **${role.name}** role!`, flags: MessageFlags.Ephemeral });
      }
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, channel, guild, member } = interaction;

  // --- Public Command Handlers ---
  if (commandName === 'askai') {
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
      .setDescription(`Total Members: **${guild.memberCount}**`)
      .setTimestamp();
      
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'afk') {
    const reason = options.getString('reason') || 'No reason provided';
    afkUsers.set(interaction.user.id, { reason: reason });
    await interaction.reply({ content: `💤 You are now marked as AFK: **${reason}**` });
  }
  else if (commandName === 'avatar') {
    const targetUser = options.getUser('user') || interaction.user;
    const avatarUrl = targetUser.displayAvatarURL({ size: 1024, dynamic: true });
    
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle(`${targetUser.username}'s Avatar`)
      .setImage(avatarUrl);
      
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'serverinfo') {
    const owner = await guild.fetchOwner();
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        { name: '👑 Owner', value: `${owner.user.tag}`, inline: true },
        { name: '👥 Total Members', value: `${guild.memberCount}`, inline: true },
        { name: '📅 Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }
      )
      .setTimestamp();
      
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'userinfo') {
    const targetUser = options.getUser('user') || interaction.user;
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
      .addFields({ name: '🆔 User ID', value: targetUser.id, inline: true })
      .setTimestamp();
      
    await interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'remind') {
    const minutes = options.getInteger('minutes');
    const reminderMessage = options.getString('message');
    
    await interaction.reply({ content: `✅ Reminder set for ${minutes} minute(s).`, flags: MessageFlags.Ephemeral });
    
    setTimeout(() => {
      interaction.user.send(`⏰ **Reminder:** ${reminderMessage}`).catch(() => {});
    }, minutes * 60 * 1000);
  }
  else if (commandName === 'account') {
    if (!process.env.YOUTUBE_API_KEY) {
      return interaction.reply({ content: '❌ YouTube API key is missing in environment variables!', flags: MessageFlags.Ephemeral });
    }
    
    await interaction.deferReply();
    
    try {
      const cleanHandle = options.getString('username').replace('@', '');
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanHandle)}&type=channel&key=${process.env.YOUTUBE_API_KEY}`;
      const searchRes = await axios.get(searchUrl);
      
      if (!searchRes.data.items || searchRes.data.items.length === 0) {
        return interaction.editReply({ content: '❌ YouTube channel not found with this handle/name!' });
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

      // Professional UI Embed Design
      const embed = new EmbedBuilder()
        .setColor('#FF0000') // YouTube Red Brand Color
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

      // Professional Action Row Button Component for Direct Redirect
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

  // --- Admin/Mod Handlers (With Strict Verification) ---
  else if (commandName === 'snipe') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const snipedMessage = snipeCache.get(channel.id);
    if (!snipedMessage) {
      return interaction.reply({ content: '❌ No recent deleted messages to snipe!', flags: MessageFlags.Ephemeral });
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
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📊 Server Poll')
      .setDescription(`**${options.getString('question')}**\n\n🇦 ${options.getString('option1')}\n\n🇧 ${options.getString('option2')}`)
      .setTimestamp();
      
    const pollMessage = await channel.send({ embeds: [embed] });
    await pollMessage.react('🇦');
    await pollMessage.react('🇧');
    
    await interaction.reply({ content: 'Poll created!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'say') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    await interaction.channel.send(options.getString('message'));
    await interaction.reply({ content: 'Sent!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'lock') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    await interaction.reply('Channel locked! 🔒');
  }
  else if (commandName === 'lockdown') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const action = options.getString('action');
    guild.channels.cache.filter(c => c.type === ChannelType.GuildText).forEach(async ch => {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: action === 'unlock' });
    });
    await interaction.reply(action === 'lock' ? '🚨 Lockdown active!' : '✅ Lockdown lifted!');
  }
  else if (commandName === 'purge') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const count = options.getInteger('count');
    await channel.bulkDelete(count, true);
    await interaction.reply({ content: `Deleted ${count} messages.`, flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'slowmode') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const seconds = options.getInteger('seconds');
    await channel.setRateLimitPerUser(seconds);
    await interaction.reply({ content: `Slowmode set to ${seconds}s.` });
  }
  else if (commandName === 'timeout') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const minutes = options.getInteger('minutes');
    const reason = options.getString('reason') || 'No reason provided';
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    
    if (targetMember) {
      await targetMember.timeout(minutes * 60 * 1000, reason);
      await interaction.reply({ content: `Timed out ${targetUser.tag} for ${minutes} minute(s). Reason: ${reason}` });
    } else {
      await interaction.reply({ content: 'Could not find that member.', flags: MessageFlags.Ephemeral });
    }
  }
  else if (commandName === 'kick') {
    if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided';
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    
    if (targetMember) {
      await targetMember.kick(reason);
      await interaction.reply({ content: `Kicked ${targetUser.tag}. Reason: ${reason}` });
    } else {
      await interaction.reply({ content: 'Could not find that member.', flags: MessageFlags.Ephemeral });
    }
  }
  else if (commandName === 'ban') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const reason = options.getString('reason') || 'No reason provided';
    await guild.members.ban(targetUser.id, { reason });
    await interaction.reply({ content: `Banned ${targetUser.tag}. Reason: ${reason}` });
  }
  else if (commandName === 'unban') {
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const userId = options.getString('userid');
    try {
      await guild.members.unban(userId);
      await interaction.reply({ content: `Successfully unbanned user ID: \`${userId}\`` });
    } catch (err) {
      await interaction.reply({ content: `Failed to unban user. Make sure the User ID is valid and banned.`, flags: MessageFlags.Ephemeral });
    }
  }
  else if (commandName === 'warn') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
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

    await interaction.reply({ content: `⚠️ Issued a warning to **${targetUser.tag}**. Reason: ${reason}` });
    
    try {
      await targetUser.send(`⚠️ You have been warned in **${guild.name}** for: **${reason}**`);
    } catch (err) {
      // DMs closed
    }
  }
  else if (commandName === 'warnings') {
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const warns = userWarnings.get(targetUser.id) || [];

    if (warns.length === 0) {
      return interaction.reply({ content: `✅ **${targetUser.tag}** has no active warnings.`, flags: MessageFlags.Ephemeral });
    }

    const warnList = warns.map((w, index) => `**${index + 1}.** ${w.reason} (Moderator: ${w.moderator}, Date: ${w.date})`).join('\n');
    const embed = new EmbedBuilder()
      .setColor('#FFCC00')
      .setTitle(`⚠️ Warnings for ${targetUser.tag}`)
      .setDescription(warnList)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'nick') {
    if (!member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const targetUser = options.getUser('user');
    const nickname = options.getString('nickname') || null;
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.reply({ content: 'Member not found!', flags: MessageFlags.Ephemeral });
    }

    try {
      await targetMember.setNickname(nickname);
      await interaction.reply({ content: `Successfully updated nickname for **${targetUser.tag}**.` });
    } catch (err) {
      await interaction.reply({ content: `Failed to change nickname. Ensure my role is higher than the target user's role.`, flags: MessageFlags.Ephemeral });
    }
  }
  else if (commandName === 'ticketsetup') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const title = options.getString('title');
    const desc = options.getString('description');
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_btn_Support').setLabel('Support').setStyle(ButtonStyle.Secondary)
    );
    
    const embed = new EmbedBuilder().setTitle(title).setDescription(desc);
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Ticket panel deployed!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'transcript') {
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const messages = await channel.messages.fetch({ limit: 100 });
    const transcriptArr = messages.reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n');
    const buffer = Buffer.from(transcriptArr, 'utf-8');
    await interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'transcript.txt' })] });
  }
  else if (commandName === 'setwelcome') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    config.welcomeChannelId = options.getChannel('channel').id;
    await interaction.reply({ content: 'Welcome channel set!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'setleave') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    config.leaveChannelId = options.getChannel('channel').id;
    await interaction.reply({ content: 'Leave channel set!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'automod') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    config.autoModEnabled = (options.getString('status') === 'on');
    await interaction.reply({ content: 'AutoMod updated!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'giveaway') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const prize = options.getString('prize');
    const durationMs = parseTime(options.getString('time') === 'custom' ? options.getString('custom_time') : options.getString('time'));
    
    if (!durationMs) {
      return interaction.reply({ content: 'Invalid time duration provided!', flags: MessageFlags.Ephemeral });
    }

    const sentMsg = await channel.send({ content: `🎉 Giveaway for **${prize}** started!` });
    activeGiveaways.set(sentMsg.id, { prize, participants: new Set() });
    
    await interaction.reply({ content: 'Giveaway started!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'notify') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    ytSubscriptions.set(options.getString('username'), { discordChannelId: options.getChannel('channel').id, lastVideoId: null });
    await interaction.reply({ content: 'Notify setup complete!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'reactionrole') {
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    const role1 = options.getRole('role1');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`role_${role1.id}`).setLabel(role1.name).setStyle(ButtonStyle.Primary)
    );
    
    await channel.send({ embeds: [new EmbedBuilder().setTitle('Reaction Roles')], components: [row] });
    await interaction.reply({ content: 'Panel sent!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'embed') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
    }
    await channel.send({ 
      embeds: [new EmbedBuilder().setTitle(options.getString('title')).setDescription(options.getString('description'))] 
    });
    await interaction.reply({ content: 'Embed sent!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'embed-advanced') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'Advanced embed sent!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'poll-advanced') {
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command!', flags: MessageFlags.Ephemeral });
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
      .setTitle('📊 Advanced Poll')
      .setDescription(desc)
      .setTimestamp();

    const pollMessage = await channel.send({ embeds: [embed] });
    await pollMessage.react('🇦');
    await pollMessage.react('🇧');
    if (opt3) await pollMessage.react('🇨');
    if (opt4) await pollMessage.react('🇩');

    await interaction.reply({ content: 'Advanced poll created!', flags: MessageFlags.Ephemeral });
  }
});

client.login(process.env.BOT_TOKEN);
