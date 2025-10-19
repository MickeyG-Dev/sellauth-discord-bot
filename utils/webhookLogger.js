import { EmbedBuilder, WebhookClient } from 'discord.js';

// Initialize the webhook client with your webhook URL
const webhookClient = new WebhookClient({ url: 'https://discord.com/api/webhooks/1429382750665965659/zRHZGW6oyx8wXZzVC7tDtFGBqiBViT-cchEPgmOa0DYvXr4kFfNKSSEX98Wx6yzaMa5r' });

/**
 * Logs command usage to a Discord webhook
 * @param {Object} interaction - The Discord interaction object
 * @param {string} commandName - Name of the command executed
 * @param {Object} commandData - Data/results from the command execution
 */
export async function logCommandUsage(interaction, commandName, commandData = {}) {
  try {
    const user = interaction.user;
    const guild = interaction.guild;
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle('Command Used')
      .setColor('#6571ff')
      .setTimestamp()
      .addFields([
        { name: 'Command', value: `\`/${commandName}\``, inline: true },
        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Channel', value: `${interaction.channel.name}`, inline: true }
      ]);

    // Add guild info if available
    if (guild) {
      embed.addFields({ name: 'Server', value: `${guild.name}`, inline: true });
    }

    // Add command options if any were provided
    const options = [];
    interaction.options.data.forEach(option => {
      options.push(`**${option.name}**: ${option.value}`);
    });

    if (options.length > 0) {
      embed.addFields({ name: 'Options', value: options.join('\n'), inline: false });
    }

    // Add any additional data (like results, errors, etc.)
    if (commandData.result) {
      embed.addFields({ name: 'Result', value: commandData.result, inline: false });
    }

    if (commandData.error) {
      embed.addFields({ name: 'Error', value: `\`\`\`${commandData.error}\`\`\``, inline: false });
      embed.setColor('#e74c3c'); // Red color for errors
    }

    // Send to webhook
    await webhookClient.send({
      username: 'Bot Command Logger',
      embeds: [embed]
    });

  } catch (error) {
    console.error('Error logging command usage:', error);
  }
}