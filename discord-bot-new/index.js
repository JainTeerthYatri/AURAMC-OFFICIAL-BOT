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

// Store active giveaways in memory
const activeGiveaways = new Map();

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
});

// Welcome Message Event
client.on('guildMemberAdd', member => {
  if (!config.welcomeChannelId) return;
  const welcomeChannel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!welcomeChannel) return;

  welcomeChannel.send(`Welcome to the server, ${member}! We are glad to have you here. 🎉`);
});

// Leave Message Event
client.on('guildMemberRemove', member => {
  if (!config.leaveChannelId) return;
  const leaveChannel = member.guild.channels.cache.get(config.leaveChannelId);
  if (!leaveChannel) return;

  leaveChannel.send(`${member.user.tag} has left the server. We hope to see you again! 👋`);
});

// Auto-Moderation: Anti-Invite & Bad Words Filter
client.on('messageCreate', async message => {
  if (message.author.bot || !config.autoModEnabled) return;

  const content = message.content.toLowerCase();

  // Check for Discord invite links
  if (content.includes('discord.gg/') || content.includes('discord.com/invite/')) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await message.delete();
      const warning = await message.channel.send(`${message.author}, posting invite links is not allowed here!`);
      setTimeout(() => warning.delete(), 5000);
      return;
    }
  }

  // Example bad words filter
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

// Slash Commands & Interactions Handler
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    // Ticket System buttons
    if (interaction.customId === 'create_ticket') {
      const guild = interaction.guild;
      const userName = interaction.user.username;
      
      const ticketChannel = await guild.channels.create({
        name: `ticket-${userName}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
        ],
      });

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('🔒 Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `Hello ${interaction.user}, our support team will be with you shortly.`,
        components: [closeButton]
      });

      await interaction.reply({ content: `Ticket created: ${ticketChannel}`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ content: 'Closing ticket in 5 seconds...', flags: MessageFlags.Ephemeral });
      setTimeout(() => interaction.channel.delete(), 5000);
    }

    // Giveaway Button Entry
    if (interaction.customId.startsWith('enter_gwy_')) {
      const messageId = interaction.customId.split('_')[2];
      const giveaway = activeGiveaways.get(messageId);

      if (!giveaway) {
        return interaction.reply({ content: 'This giveaway has already ended or is invalid.', flags: MessageFlags.Ephemeral });
      }

      if (giveaway.participants.has(interaction.user.id)) {
        return interaction.reply({ content: 'You are already entered into this giveaway!', flags: MessageFlags.Ephemeral });
      }

      giveaway.participants.add(interaction.user.id);
      await interaction.reply({ content: '🎉 You have successfully entered the giveaway!', flags: MessageFlags.Ephemeral });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, channel, guild } = interaction;

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
      await ch.permissionOverwrites.edit(guild.roles.everyone, { 
        SendMessages: action === 'unlock' ? true : false 
      });
    });

    if (action === 'lock') {
      await interaction.reply('🚨 Server Lockdown active! All text channels have been locked.');
    } else {
      await interaction.reply('✅ Server Lockdown lifted! All text channels are now unlocked.');
    }
  }

  else if (commandName === 'purge') {
    const count = options.getInteger('count');
    if (count < 1 || count > 100) {
      return interaction.reply({ content: 'Please provide a number between 1 and 100!', flags: MessageFlags.Ephemeral });
    }
    await channel.bulkDelete(count, true);
    await interaction.reply({ content: `Successfully deleted ${count} messages.`, flags: MessageFlags.Ephemeral });
  }

  else if (commandName === 'ticket') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('🎫 Create Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      content: '**Support Ticket System**\nClick the button below to create a support ticket:',
      components: [row]
    });
    await interaction.reply({ content: 'Ticket panel sent successfully!', flags: MessageFlags.Ephemeral });
  }

  else if (commandName === 'setwelcome') {
    const selectedChannel = options.getChannel('channel');
    config.welcomeChannelId = selectedChannel.id;
    await interaction.reply({ content: `Welcome channel successfully set to ${selectedChannel}!`, flags: MessageFlags.Ephemeral });
  }

  else if (commandName === 'setleave') {
    const selectedChannel = options.getChannel('channel');
    config.leaveChannelId = selectedChannel.id;
    await interaction.reply({ content: `Leave channel successfully set to ${selectedChannel}!`, flags: MessageFlags.Ephemeral });
  }

  else if (commandName === 'automod') {
    const status = options.getString('status');
    config.autoModEnabled = (status === 'on');
    await interaction.reply({ content: `Auto-Moderation has been turned **${status.toUpperCase()}**!`, flags: MessageFlags.Ephemeral });
  }

  else if (commandName === 'poll') {
    const question = options.getString('question');
    const opt1 = options.getString('option1');
    const opt2 = options.getString('option2');

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📊 Server Poll')
      .setDescription(`**${question}**\n\n🇦 ${opt1}\n\n🇧 ${opt2}`)
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

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('placeholder') // Will be updated with unique ID
        .setLabel('🎉 Enter Giveaway')
        .setStyle(ButtonStyle.Success)
    );

    const sentMsg = await channel.send({ embeds: [embed], components: [] });
    
    // Update button with message ID reference
    const uniqueButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`enter_gwy_${sentMsg.id}`)
        .setLabel('🎉 Enter Giveaway')
        .setStyle(ButtonStyle.Success)
    );

    await sentMsg.edit({ components: [uniqueButton] });

    // Save to active giveaways map
    activeGiveaways.set(sentMsg.id, {
      prize: prize,
      participants: new Set()
    });

    await interaction.reply({ content: 'Giveaway started successfully!', flags: MessageFlags.Ephemeral });

    // Automatically end giveaway after duration
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
});

client.login(process.env.BOT_TOKEN);
