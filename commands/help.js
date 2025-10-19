import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { bot } from '../index.js';
import { logCommandUsage } from '../utils/webhookLogger.js';

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('List of available commands'),
  async execute(interaction) {
    let commands = bot.slashCommandsMap;

    await logCommandUsage(interaction, 'help', {
      result: `Displayed help menu with ${commands.size} commands`
    });

    let helpEmbed = new EmbedBuilder()
      .setTitle('Help')
      .setDescription('List of available commands')
      .setColor('#6571ff');

    commands.forEach((cmd) => {
      helpEmbed.addFields({
        name: `**${cmd.data.name}**`,
        value: `${cmd.data.description}`,
        inline: true
      });
    });

    helpEmbed.setTimestamp();

    return interaction.reply({ embeds: [helpEmbed] }).catch(console.error);
  }
};
