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
  SlashCommandBuilder
} = require('discord.js');
const express = require('express');

// Express server taaki Render Web Service sleep na ho
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord bot is alive and running!');
});

app.listen(PORT, () => {
  console.log(`Express server is listening on port ${PORT}`);
});

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Bot start hote hi commands automatically register ho jayengi
  const commands = [
    new SlashCommandBuilder()
      .setName('say')
      .setDescription('Kuch bhi bulwayein bot se')
      .addStringOption(option => 
        option.setName('message').setDescription('Jo message bot ko bolna hai').setRequired(true)),

    new SlashCommandBuilder()
      .setName('lock')
      .setDescription('Current channel ko lock karein')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
      .setName('lockdown')
      .setDescription('Poore server ke channels ko lock/unlock karein')
      .addStringOption(option =>
        option.setName('action')
          .setDescription('Lock ya Unlock')
          .setRequired(true)
          .addChoices(
            { name: 'Lock', value: 'lock' },
            { name: 'Unlock', value: 'unlock' }
          ))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('purge')
      .setDescription('Messages delete karein')
      .addIntegerOption(option =>
        option.setName('count')
          .setDescription('Kitne messages delete karne hain (1-100)')
          .setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Support ticket panel bhejta hai')
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

// Slash Commands & Interactions Handler
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
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
        content: `Hello ${interaction.user}, Support team jald hi aapse judelegi.`,
        components: [closeButton]
      });

      await interaction.reply({ content: `Ticket ban gaya: ${ticketChannel}`, ephemeral: true });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ content: 'Ticket 5 seconds mein band ho raha hai...' });
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, channel, guild } = interaction;

  if (commandName === 'say') {
    const msg = options.getString('message');
    await interaction.channel.send(msg);
    await interaction.reply({ content: 'Message bhej diya gaya hai!', ephemeral: true });
  }

  else if (commandName === 'lock') {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    await interaction.reply('Yeh channel lock kar diya gaya hai! 🔒');
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
      await interaction.reply('🚨 Server Lockdown active! Sabhi channels lock kar diye gaye hain.');
    } else {
      await interaction.reply('✅ Server Lockdown hata diya gaya hai! Channels unlock ho gaye hain.');
    }
  }

  else if (commandName === 'purge') {
    const count = options.getInteger('count');
    if (count < 1 || count > 100) {
      return interaction.reply({ content: 'Kripya 1 se 100 ke beech ki sankhya dalein!', ephemeral: true });
    }
    await channel.bulkDelete(count, true);
    await interaction.reply({ content: `${count} messages delete kar diye gaye hain.`, ephemeral: true });
  }

  else if (commandName === 'ticket') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('🎫 Create Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      content: '**Support Ticket System**\nNeeche diye gaye button par click karke apna support ticket banayein:',
      components: [row]
    });
    await interaction.reply({ content: 'Ticket panel successfully bhej diya gaya hai!', ephemeral: true });
  }
});

client.login(process.env.BOT_TOKEN);
