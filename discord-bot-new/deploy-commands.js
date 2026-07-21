require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

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

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    // Agar aapko globally register karna hai to Routes.applicationCommands use karein, 
    // par instant update ke liye guild commands behtar hain (CLIENT_ID aur GUILD_ID `.env` me daal sakte hain).
    // Filhaal hum global commands register kar rahe hain:
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
