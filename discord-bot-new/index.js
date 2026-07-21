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
  EmbedBuilder
} = require('discord.js');
const express = require('express');
const axios = require('axios'); // Used to fetch data from YouTube API

// Express server to prevent Render Web Service from sleeping
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord bot is alive and running!');
});

app.listen(PORT, () => {
  console.log(`Express server is listening on port ${PORT}`);
});

// Store configuration and active data in memory
const config = {
  welcomeChannelId: null,
  leaveChannelId: null,
  autoModEnabled: true
};

const activeGiveaways = new Map();

// Store YouTube notification subscriptions: key = ytHandle, value = { discordChannelId, lastVideoId }
const ytSubscriptions = new Map();

// Discord Bot Setup with necessary intents
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

  // Registering Slash Commands automatically on startup
  const commands = [
    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Makes the bot repeat your message')
      .addStringOption(option => 
        option.setName('message').setDescription('The message for the bot to send').setRequired(true)),

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
          ))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Deletes a specified number of messages')
      .addIntegerOption(option =>
        option.setName('count')
          .setDescription('Number of messages to delete (1-100)')
          .setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Sends the support ticket panel')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('setwelcome')
      .setDescription('Sets the channel for welcome messages')
      .addChannelOption(option =>
        option.setName('channel').setDescription('Select the welcome channel').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('setleave')
      .setDescription('Sets the channel for leave messages')
      .addChannelOption(option =>
        option.setName('channel').setDescription('Select the leave channel').setRequired(true))
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
          ))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('poll')
      .setDescription('Creates a voting poll')
      .addStringOption(option => option.setName('question').setDescription('The poll question').setRequired(true))
      .addStringOption(option => option.setName('option1').setDescription('First option').setRequired(true))
      .addStringOption(option => option.setName('option2').setDescription('Second option').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('gcreate')
      .setDescription('Starts a giveaway')
      .addStringOption(option => option.setName('prize').setDescription('The prize being given away').setRequired(true))
      .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('account')
      .setDescription('View public YouTube channel details')
      .addStringOption(option => option.setName('username').setDescription('YouTube channel handle (e.g. @MrBeast)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('notify')
      .setDescription('Manage YouTube upload notifications')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Auto-post latest YouTube videos to a Discord channel')
          .addStringOption(option => option.setName('username').setDescription('YouTube handle (e.g. @channel)').setRequired(true))
          .addChannelOption(option => option.setName('channel').setDescription('Discord channel for notifications').setRequired(true))
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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

  // Background Task: Check for new YouTube uploads every 10 minutes
  setInterval(checkYouTubeUploads, 10 * 60 * 1000);
});

// Function to check YouTube channel uploads for notifications
async function checkYouTubeUploads() {
  if (ytSubscriptions.size === 0 || !process.env.YOUTUBE_API_KEY) return;

  for (const [handle, data] of ytSubscriptions.entries()) {
    try {
      const cleanHandle = handle.replace('@', '');
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanHandle)}&type=channel&key=${process.env.YOUTUBE_API_KEY}`;
      const searchRes = await axios.get(searchUrl);

      if (!searchRes.data.items || searchRes.data.items.length === 0) continue;
      const channelId = searchRes.data.items[0].id.channelId;

      // Get latest uploads from channel's uploads playlist
      const channelDetailsUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`;
      const channelRes = await axios.get(channelDetailsUrl);
      const uploadsPlaylistId = channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;

      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=1&key=${process.env.YOUTUBE_API_KEY}`;
      const playlistRes = await axios.get(playlistUrl);

      if (!playlistRes.data.items || playlistRes.data.items.length === 0) continue;
      const latestVideo = playlistRes.data.items[0].snippet;
      const videoId = latestVideo.resourceId.videoId;

      // If a new video is found
      if (data.lastVideoId !== videoId) {
        data.lastVideoId = videoId; // Update tracking ID

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

// Welcome, Leave, and Auto-Mod Events (Same as before)
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

client.on('messageCreate', async message => {
  if (message.author.bot || !config.autoModEnabled) return;
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

// Interactions Handler
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    if (interaction.customId === 'create_ticket') {
      const guild = interaction.guild;
      const userName = interaction.user.username;
      
      const ticketChannel = await guild.channels.create({
        name: `ticket-${userName}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
      });

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `Hello ${interaction.user}, our support team will be with you shortly.`, components: [closeButton] });
      await interaction.reply({ content: `Ticket created: ${ticketChannel}`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ content: 'Closing ticket in 5 seconds...', flags: MessageFlags.Ephemeral });
      setTimeout(() => interaction.channel.delete(), 5000);
    }

    if (interaction.customId.startsWith('enter_gwy_')) {
      const messageId = interaction.customId.split('_')[2];
      const giveaway = activeGiveaways.get(messageId);
      if (!giveaway) return interaction.reply({ content: 'Giveaway has ended.', flags: MessageFlags.Ephemeral });
      if (giveaway.participants.has(interaction.user.id)) return interaction.reply({ content: 'Already entered!', flags: MessageFlags.Ephemeral });
      giveaway.participants.add(interaction.user.id);
      await interaction.reply({ content: '🎉 Entered giveaway successfully!', flags: MessageFlags.Ephemeral });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, channel, guild } = interaction;

  if (commandName === 'account') {
    const handle = options.getString('username');
    if (!process.env.YOUTUBE_API_KEY) {
      return interaction.reply({ content: 'YouTube API key is not configured in environment variables!', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
      const cleanHandle = handle.replace('@', '');
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanHandle)}&type=channel&key=${process.env.YOUTUBE_API_KEY}`;
      const searchRes = await axios.get(searchUrl);

      if (!searchRes.data.items || searchRes.data.items.length === 0) {
        return interaction.editReply('Channel not found on YouTube!');
      }

      const channelId = searchRes.data.items[0].id.channelId;
      const detailsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`;
      const detailsRes = await axios.get(detailsUrl);
      const chData = detailsRes.data.items[0];

      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(chData.snippet.title)
        .setURL(`https://www.youtube.com/@${cleanHandle}`)
        .setThumbnail(chData.snippet.thumbnails.high.url)
        .setDescription(chData.snippet.description ? chData.snippet.description.substring(0, 300) + '...' : 'No description available.')
        .addFields(
          { name: '📊 Subscribers', value: Number(chData.statistics.subscriberCount).toLocaleString(), inline: true },
          { name: '👁️ Total Views', value: Number(chData.statistics.viewCount).toLocaleString(), inline: true },
          { name: '🎬 Total Videos', value: Number(chData.statistics.videoCount).toLocaleString(), inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(error);
      await interaction.editReply('An error occurred while fetching YouTube data.');
    }
  }

  else if (commandName === 'notify') {
    const sub = options.getSubcommand();
    if (sub === 'add') {
      const handle = options.getString('username');
      const targetChannel = options.getChannel('channel');

      ytSubscriptions.set(handle, {
        discordChannelId: targetChannel.id,
        lastVideoId: null
      });

      await interaction.reply({ content: `Successfully linked YouTube handle **${handle}** uploads to ${targetChannel}!`, flags: MessageFlags.Ephemeral });
    }
  }

  // Other commands handling
  else if (commandName === 'say') {
    const msg = options.getString('message');
    await interaction.channel.send(msg);
    await interaction.reply({ content: 'Message sent successfully!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'lock') {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    await interaction.reply('This channel has been locked! 🔒');
  }
  else if (commandName === 'purge') {
    const count = options.getInteger('count');
    await channel.bulkDelete(count, true);
    await interaction.reply({ content: `Deleted ${count} messages.`, flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'ticket') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('create_ticket').setLabel('🎫 Create Ticket').setStyle(ButtonStyle.Primary)
    );
    await channel.send({ content: '**Support Ticket System**', components: [row] });
    await interaction.reply({ content: 'Ticket panel sent!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'setwelcome') {
    config.welcomeChannelId = options.getChannel('channel').id;
    await interaction.reply({ content: 'Welcome channel set!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'setleave') {
    config.leaveChannelId = options.getChannel('channel').id;
    await interaction.reply({ content: 'Leave channel set!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'automod') {
    config.autoModEnabled = (options.getString('status') === 'on');
    await interaction.reply({ content: `Auto-Mod turned ${options.getString('status')}`, flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'poll') {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📊 Server Poll')
      .setDescription(`**${options.getString('question')}**\n\n🇦 ${options.getString('option1')}\n\n🇧 ${options.getString('option2')}`);
    const msg = await channel.send({ embeds: [embed] });
    await msg.react('🇦');
    await msg.react('🇧');
    await interaction.reply({ content: 'Poll created!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'gcreate') {
    const prize = options.getString('prize');
    const mins = options.getInteger('duration');
    const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🎉 GIVEAWAY 🎉').setDescription(`Prize: **${prize}**`);
    const sentMsg = await channel.send({ embeds: [embed] });
    const btn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`enter_gwy_${sentMsg.id}`).setLabel('🎉 Enter').setStyle(ButtonStyle.Success)
    );
    await sentMsg.edit({ components: [btn] });
    activeGiveaways.set(sentMsg.id, { prize, participants: new Set() });
    await interaction.reply({ content: 'Giveaway started!', flags: MessageFlags.Ephemeral });

    setTimeout(async () => {
      const gwy = activeGiveaways.get(sentMsg.id);
      if (!gwy) return;
      const arr = Array.from(gwy.participants);
      let winText = arr.length > 0 ? `🏆 Winner: <@${arr[Math.floor(Math.random() * arr.length)]}>!` : 'No participants.';
      await channel.send(winText);
      activeGiveaways.delete(sentMsg.id);
    }, mins * 60 * 1000);
  }
});

client.login(process.env.BOT_TOKEN);
