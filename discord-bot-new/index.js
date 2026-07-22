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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const express = require('express');
const axios = require('axios');

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
      .setName('ticketsetup')
      .setDescription('Sends the advanced dropdown support ticket panel')
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

    new SlashCommandBuilder()
      .setName('reactionrole')
      .setDescription('Sends the self-assignable role panel')
      .addRoleOption(option => option.setName('role1').setDescription('First role').setRequired(true))
      .addRoleOption(option => option.setName('role2').setDescription('Second role').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // --- NEW COMMANDS ADDED BELOW ---

    new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('Displays a user\'s avatar')
      .addUserOption(option => option.setName('user').setDescription('The user to get the avatar for').setRequired(false)),

    new SlashCommandBuilder()
      .setName('serverinfo')
      .setDescription('Displays server statistics'),

    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Creates a custom embed message in the channel')
      .addStringOption(option => option.setName('title').setDescription('The embed title').setRequired(true))
      .addStringOption(option => option.setName('description').setDescription('The embed description').setRequired(true))
      .addStringOption(option => option.setName('color').setDescription('Hex color code (e.g., #FF0000)').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('remind')
      .setDescription('Set a personal reminder')
      .addIntegerOption(option => option.setName('minutes').setDescription('Time in minutes until reminder').setRequired(true))
      .addStringOption(option => option.setName('message').setDescription('What to remind you about').setRequired(true)),

    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Displays information about a user')
      .addUserOption(option => option.setName('user').setDescription('The user to inspect').setRequired(false)),

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
  const badWords = ['badword1', 'badword2']; 
  const hasBadWord = badWords.some(word => content.includes(word));
  if (hasBadWord) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete();
      const warning = await message.channel.send(`${message.author}, please watch your language! That word is not allowed.`);
      setTimeout(() => warning.delete(), 5000);
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_select_menu') {
      const selectedCategory = interaction.values[0];
      const guild = interaction.guild;
      const userName = interaction.user.username;

      const existingChannel = guild.channels.cache.find(c => c.name === `ticket-${selectedCategory}-${userName.toLowerCase()}`);
      if (existingChannel) {
        return interaction.reply({ content: `You already have an open ticket in ${existingChannel}!`, flags: MessageFlags.Ephemeral });
      }

      const ticketChannel = await guild.channels.create({
        name: `ticket-${selectedCategory}-${userName}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
      });

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`Support Ticket: ${selectedCategory.toUpperCase()}`)
        .setDescription(`Hello ${interaction.user},\nThank you for reaching out to support. Please describe your issue in detail below.`)
        .setTimestamp();

      await ticketChannel.send({ content: `${interaction.user}`, embeds: [embed], components: [closeButton] });
      await interaction.reply({ content: `Your support ticket has been created: ${ticketChannel}`, flags: MessageFlags.Ephemeral });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ content: 'Closing ticket in 5 seconds...', flags: MessageFlags.Ephemeral });
      setTimeout(() => interaction.channel.delete(), 5000);
    }

    if (interaction.customId.startsWith('enter_gwy_')) {
      const messageId = interaction.customId.split('_')[2];
      const giveaway = activeGiveaways.get(messageId);
      if (!giveaway) return interaction.reply({ content: 'This giveaway has already ended.', flags: MessageFlags.Ephemeral });
      if (giveaway.participants.has(interaction.user.id)) return interaction.reply({ content: 'You are already entered!', flags: MessageFlags.Ephemeral });
      
      giveaway.participants.add(interaction.user.id);
      await interaction.reply({ content: '🎉 You have successfully entered the giveaway!', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('role_')) {
      const roleId = interaction.customId.split('_')[1];
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: 'Role not found or deleted!', flags: MessageFlags.Ephemeral });

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

  const { commandName, options, channel, guild } = interaction;

  // --- EXISTING COMMANDS LOGIC ---
  if (commandName === 'say') {
    const msg = options.getString('message');
    await interaction.channel.send(msg);
    await interaction.reply({ content: 'Message sent successfully!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'lock') {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    await interaction.reply('This channel has been locked! 🔒');
  }
  else if (commandName === 'lockdown') {
    const action = options.getString('action');
    const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
    channels.forEach(async (ch) => {
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: action === 'unlock' ? true : false });
    });
    await interaction.reply(action === 'lock' ? '🚨 Server Lockdown active!' : '✅ Server Lockdown lifted!');
  }
  else if (commandName === 'purge') {
    const count = options.getInteger('count');
    if (count < 1 || count > 100) return interaction.reply({ content: 'Provide a number between 1 and 100!', flags: MessageFlags.Ephemeral });
    await channel.bulkDelete(count, true);
    await interaction.reply({ content: `Successfully deleted ${count} messages.`, flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'ticketsetup') {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select_menu')
      .setPlaceholder('Select a ticket category...')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('General Support').setDescription('Get help with general server questions').setValue('general').setEmoji('💬'),
        new StringSelectMenuOptionBuilder().setLabel('Bug Report').setDescription('Report technical issues or bot bugs').setValue('bug').setEmoji('🐛'),
        new StringSelectMenuOptionBuilder().setLabel('Partnership').setDescription('Inquire about server partnerships or collaborations').setValue('partnership').setEmoji('🤝')
      );
    const row = new ActionRowBuilder().addComponents(selectMenu);
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle('🎫 Advanced Support Center')
      .setDescription('Need assistance? Please select the appropriate category from the dropdown menu below to open a private ticket channel.');
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Advanced ticket panel successfully deployed!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'setwelcome') {
    config.welcomeChannelId = options.getChannel('channel').id;
    await interaction.reply({ content: `Welcome channel set!`, flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'setleave') {
    config.leaveChannelId = options.getChannel('channel').id;
    await interaction.reply({ content: `Leave channel set!`, flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'automod') {
    const status = options.getString('status');
    config.autoModEnabled = (status === 'on');
    await interaction.reply({ content: `Auto-Moderation turned **${status.toUpperCase()}**!`, flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'poll') {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📊 Server Poll')
      .setDescription(`**${options.getString('question')}**\n\n🇦 ${options.getString('option1')}\n\n🇧 ${options.getString('option2')}`)
      .setTimestamp();
    const pollMessage = await channel.send({ embeds: [embed] });
    await pollMessage.react('🇦');
    await pollMessage.react('🇧');
    await interaction.reply({ content: 'Poll created successfully!', flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'gcreate') {
    const prize = options.getString('prize');
    const durationMinutes = options.getInteger('duration');
    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🎉 GIVEAWAY 🎉')
      .setDescription(`Prize: **${prize}**\nDuration: **${durationMinutes} minutes**\nClick the button below to enter!`)
      .setTimestamp(Date.now() + durationMinutes * 60 * 1000);
    const sentMsg = await channel.send({ embeds: [embed] });
    const uniqueButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`enter_gwy_${sentMsg.id}`).setLabel('🎉 Enter Giveaway').setStyle(ButtonStyle.Success)
    );
    await sentMsg.edit({ components: [uniqueButton] });
    activeGiveaways.set(sentMsg.id, { prize: prize, participants: new Set() });
    await interaction.reply({ content: 'Giveaway started!', flags: MessageFlags.Ephemeral });

    setTimeout(async () => {
      const giveaway = activeGiveaways.get(sentMsg.id);
      if (!giveaway) return;
      const participantsArray = Array.from(giveaway.participants);
      let winnerText = 'No valid participants entered the giveaway.';
      if (participantsArray.length > 0) {
        const winnerId = participantsArray[Math.floor(Math.random() * participantsArray.length)];
        winnerText = `🏆 Winner: <@${winnerId}>! Congratulations! 🎉`;
      }
      const endedEmbed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('🎉 GIVEAWAY ENDED 🎉')
        .setDescription(`Prize: **${prize}**\n\n${winnerText}`)
        .setTimestamp();
      await sentMsg.edit({ embeds: [endedEmbed], components: [] });
      channel.send(winnerText);
      activeGiveaways.delete(sentMsg.id);
    }, durationMinutes * 60 * 1000);
  }
  else if (commandName === 'account') {
    if (!process.env.YOUTUBE_API_KEY) return interaction.reply({ content: 'YouTube API key missing!', flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    try {
      const cleanHandle = options.getString('username').replace('@', '');
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanHandle)}&type=channel&key=${process.env.YOUTUBE_API_KEY}`;
      const searchRes = await axios.get(searchUrl);
      if (!searchRes.data.items || searchRes.data.items.length === 0) return interaction.editReply('Channel not found!');
      
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
      await interaction.editReply('Error fetching YouTube data.');
    }
  }
  else if (commandName === 'notify') {
    const handle = options.getString('username');
    const targetChannel = options.getChannel('channel');
    ytSubscriptions.set(handle, { discordChannelId: targetChannel.id, lastVideoId: null });
    await interaction.reply({ content: `Linked YouTube handle **${handle}** uploads to ${targetChannel}!`, flags: MessageFlags.Ephemeral });
  }
  else if (commandName === 'reactionrole') {
    const role1 = options.getRole('role1');
    const role2 = options.getRole('role2');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`role_${role1.id}`).setLabel(role1.name).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`role_${role2.id}`).setLabel(role2.name).setStyle(ButtonStyle.Primary)
    );
    const embed = new EmbedBuilder().setColor('#5865F2').setTitle('🎭 Self-Roles Panel').setDescription('Click the buttons below to toggle your roles!');
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Reaction role panel sent!', flags: MessageFlags.Ephemeral });
  }

  // --- NEW COMMANDS LOGIC ADDED HERE ---

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
    const { guild } = interaction;
    const owner = await guild.fetchOwner();
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        { name: '👑 Owner', value: `${owner.user.tag}`, inline: true },
        { name: '👥 Total Members', value: `${guild.memberCount}`, inline: true },
        { name: '📅 Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '💬 Channels', value: `${guild.channels.cache.size}`, inline: true },
        { name: '💎 Boost Level', value: `Level ${guild.premiumTier}`, inline: true },
        { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true }
      )
      .setFooter({ text: `Server ID: ${guild.id}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'embed') {
    const title = options.getString('title');
    const desc = options.getString('description');
    const colorInput = options.getString('color') || '#5865F2';

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc);

    try {
      embed.setColor(colorInput);
    } catch (error) {
      embed.setColor('#5865F2'); // Fallback color if the hex code provided by user is invalid
    }

    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: 'Custom embed successfully sent to the channel!', flags: MessageFlags.Ephemeral });
  }

  else if (commandName === 'remind') {
    const minutes = options.getInteger('minutes');
    const reminderMessage = options.getString('message');

    await interaction.reply({ 
      content: `✅ Got it! I will remind you about **"${reminderMessage}"** in ${minutes} minute(s).`, 
      flags: MessageFlags.Ephemeral 
    });

    setTimeout(() => {
      interaction.user.send(`⏰ **Reminder:** ${reminderMessage}`)
        .catch(() => {
          // Fallback if user's DMs are disabled
          channel.send(`⏰ <@${interaction.user.id}>, your reminder: **${reminderMessage}**`);
        });
    }, minutes * 60 * 1000);
  }

  else if (commandName === 'userinfo') {
    const targetUser = options.getUser('user') || interaction.user;
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🆔 User ID', value: targetUser.id, inline: true },
        { name: '🗓️ Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`, inline: true }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    // If the user is currently in the server, show extra server details
    if (targetMember) {
      const rolesList = targetMember.roles.cache
        .filter(role => role.id !== guild.id) // Filter out @everyone
        .map(role => role.toString())
        .join(', ');

      embed.addFields(
        { name: '📥 Joined Server', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D>`, inline: true },
        { name: `🎭 Roles [${targetMember.roles.cache.size - 1}]`, value: rolesList || 'None', inline: false }
      );
    }

    await interaction.reply({ embeds: [embed] });
  }
});

client.login(process.env.BOT_TOKEN);
