require('dotenv').config();

const express = require('express');
const path = require('path');
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 10000);
const EMBED_COLOR = normaliseHex(process.env.EMBED_COLOR || '#D99AB5');
const BOT_STATUS = process.env.BOT_STATUS || 'welcoming you to Room 7';
const BANNER_PATH = path.join(__dirname, 'assets', 'room7-banner.png');
const BANNER_NAME = 'room7-banner.png';

const colourRoles = [
  { label: 'Midnight', emoji: '🖤', hex: '#1C1C1E', env: 'COLOR_MIDNIGHT_ROLE_ID' },
  { label: 'Frost', emoji: '🤍', hex: '#ECECEC', env: 'COLOR_FROST_ROLE_ID' },
  { label: 'Blush', emoji: '🌸', hex: '#C98FA0', env: 'COLOR_BLUSH_ROLE_ID' },
  { label: 'Mauve', emoji: '💜', hex: '#8D7AAE', env: 'COLOR_MAUVE_ROLE_ID' },
  { label: 'Slate', emoji: '💙', hex: '#6F88B6', env: 'COLOR_SLATE_ROLE_ID' },
  { label: 'Steel', emoji: '🩶', hex: '#7D848F', env: 'COLOR_STEEL_ROLE_ID' },
  { label: 'Sage', emoji: '💚', hex: '#7F9C8B', env: 'COLOR_SAGE_ROLE_ID' },
  { label: 'Mocha', emoji: '🤎', hex: '#8B6F63', env: 'COLOR_MOCHA_ROLE_ID' },
].map((role) => ({ ...role, id: process.env[role.env] })).filter((role) => role.id);

const pingRoles = [
  { label: 'Announcements', emoji: '📢', description: 'Important Room 7 updates', env: 'PING_ANNOUNCEMENTS_ROLE_ID' },
  { label: 'Giveaways', emoji: '🎁', description: 'Giveaway alerts and winners', env: 'PING_GIVEAWAYS_ROLE_ID' },
  { label: 'Events', emoji: '🎉', description: 'Community events and activities', env: 'PING_EVENTS_ROLE_ID' },
  { label: 'Movie Night', emoji: '🎬', description: 'Movie night reminders', env: 'PING_MOVIE_NIGHT_ROLE_ID' },
].map((role) => ({ ...role, id: process.env[role.env] })).filter((role) => role.id);

const commands = [
  new SlashCommandBuilder()
    .setName('setuproles')
    .setDescription('Post the official Room 7 role selection panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Open your private Room 7 role selector.'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('View the Room 7 bot command guide.'),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot status and response time.'),
].map((command) => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function normaliseHex(value) {
  const clean = String(value).replace('#', '').trim();
  return /^[0-9A-Fa-f]{6}$/.test(clean) ? Number.parseInt(clean, 16) : 0xD99AB5;
}

function makeBanner() {
  return new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME });
}

function baseEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setImage(`attachment://${BANNER_NAME}`)
    .setFooter({ text: 'Room 7 • Your place. Our people.' });
}

function rolePanelEmbed() {
  return baseEmbed()
    .setTitle('Welcome to Room 7')
    .setDescription([
      'Make Room 7 feel like your own by choosing your preferred roles below.',
      '',
      '**Ping Roles**',
      'Choose which announcements, giveaways and events you want to hear about.',
      '',
      '**Color Roles**',
      'Choose one colour to personalise how your name appears around the server.',
      '',
      '-# You can update your choices whenever you like.',
    ].join('\n'));
}

function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('room7_open_ping_roles')
      .setLabel('Get your Ping Roles')
      .setEmoji('🔔')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('room7_open_colour_roles')
      .setLabel('Get your Color Roles')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Primary),
  );
}

function colourMenu() {
  const options = colourRoles.map((role) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(role.label)
      .setDescription(role.hex)
      .setEmoji(role.emoji)
      .setValue(role.id),
  );

  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('Remove Color')
      .setDescription('Remove your current color role')
      .setEmoji('🗑️')
      .setValue('remove_colour'),
  );

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('room7_colour_roles')
      .setPlaceholder('Choose your color...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options),
  );
}

function pingMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('room7_ping_roles')
      .setPlaceholder('Choose your ping roles...')
      .setMinValues(0)
      .setMaxValues(Math.max(1, pingRoles.length))
      .addOptions(
        pingRoles.map((role) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(role.label)
            .setDescription(role.description)
            .setEmoji(role.emoji)
            .setValue(role.id),
        ),
      ),
  );
}

function privateColourEmbed() {
  return baseEmbed()
    .setTitle('Choose your Color Role')
    .setDescription('Select one colour below. Choosing a new colour automatically replaces your old one.');
}

function privatePingEmbed() {
  return baseEmbed()
    .setTitle('Choose your Ping Roles')
    .setDescription('Select every notification you want. Submit with nothing selected to remove all ping roles.');
}

async function safeRoleUpdate(member, removeIds, addIds) {
  const botMember = member.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('I need the Manage Roles permission.');
  }

  const allIds = [...new Set([...removeIds, ...addIds])];
  const invalid = allIds
    .map((id) => member.guild.roles.cache.get(id))
    .filter(Boolean)
    .filter((role) => role.position >= botMember.roles.highest.position);

  if (invalid.length) {
    throw new Error(`Move the Room 7 bot role above: ${invalid.map((role) => role.name).join(', ')}`);
  }

  if (removeIds.length) await member.roles.remove(removeIds);
  if (addIds.length) await member.roles.add(addIds);
}

async function handleColourSelection(interaction) {
  const selected = interaction.values[0];
  const allColourIds = colourRoles.map((role) => role.id);
  const removeIds = allColourIds.filter((id) => interaction.member.roles.cache.has(id));
  const addIds = selected === 'remove_colour' ? [] : [selected];

  await safeRoleUpdate(interaction.member, removeIds, addIds);
  const selectedRole = colourRoles.find((role) => role.id === selected);

  const embed = baseEmbed()
    .setTitle(selectedRole ? 'Color Updated' : 'Color Removed')
    .setDescription(selectedRole
      ? `${selectedRole.emoji} Your colour is now **${selectedRole.label}**.`
      : '🗑️ Your colour role has been removed.');

  await interaction.update({ embeds: [embed], components: [colourMenu()], files: [makeBanner()] });
}

async function handlePingSelection(interaction) {
  const allPingIds = pingRoles.map((role) => role.id);
  const selectedIds = interaction.values;
  const currentIds = allPingIds.filter((id) => interaction.member.roles.cache.has(id));
  const removeIds = currentIds.filter((id) => !selectedIds.includes(id));
  const addIds = selectedIds.filter((id) => !interaction.member.roles.cache.has(id));

  await safeRoleUpdate(interaction.member, removeIds, addIds);
  const names = pingRoles
    .filter((role) => selectedIds.includes(role.id))
    .map((role) => `${role.emoji} ${role.label}`);

  const embed = baseEmbed()
    .setTitle('Ping Roles Updated')
    .setDescription(names.length
      ? `You will now receive: **${names.join(', ')}**.`
      : '🔕 All of your ping roles have been removed.');

  await interaction.update({ embeds: [embed], components: [pingMenu()], files: [makeBanner()] });
}

async function openPrivateRoleSelector(interaction, type) {
  if (type === 'colour' && !colourRoles.length) {
    return interaction.reply({ content: 'No colour roles have been configured yet.', flags: MessageFlags.Ephemeral });
  }
  if (type === 'ping' && !pingRoles.length) {
    return interaction.reply({ content: 'No ping roles have been configured yet.', flags: MessageFlags.Ephemeral });
  }

  const isColour = type === 'colour';
  return interaction.reply({
    embeds: [isColour ? privateColourEmbed() : privatePingEmbed()],
    components: [isColour ? colourMenu() : pingMenu()],
    files: [makeBanner()],
    flags: MessageFlags.Ephemeral,
  });
}

async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`Registered ${commands.length} guild command(s) in ${GUILD_ID}.`);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: BOT_STATUS }], status: 'online' });

  try {
    await deployCommands();
  } catch (error) {
    console.error('Command registration failed:', error);
  }

  console.log(`Loaded ${colourRoles.length} colour role(s) and ${pingRoles.length} ping role(s).`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setuproles') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: 'You need **Manage Roles** to use this command.', flags: MessageFlags.Ephemeral });
        }
        if (!colourRoles.length || !pingRoles.length) {
          return interaction.reply({
            content: 'Add at least one colour role ID and one ping role ID to your Render environment variables first.',
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.channel.send({
          embeds: [rolePanelEmbed()],
          components: [panelButtons()],
          files: [makeBanner()],
        });
        return interaction.editReply('✅ The Room 7 role panel has been posted.');
      }

      if (interaction.commandName === 'roles') {
        return interaction.reply({
          embeds: [rolePanelEmbed()],
          components: [panelButtons()],
          files: [makeBanner()],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.commandName === 'help') {
        const embed = baseEmbed()
          .setTitle('Room 7 Bot Commands')
          .setDescription('Everything you need, kept simple and easy to use.')
          .addFields(
            { name: 'Member Commands', value: '`/roles` — Open your private role selector\n`/ping` — Check the bot response time' },
            { name: 'Staff Commands', value: '`/setuproles` — Post the official role panel' },
          );
        return interaction.reply({ embeds: [embed], files: [makeBanner()], flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === 'ping') {
        const embed = baseEmbed()
          .setTitle('Room 7 is Online')
          .setDescription(`Everything is working normally.\n\n**Response time:** ${client.ws.ping}ms`);
        return interaction.reply({ embeds: [embed], files: [makeBanner()], flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'room7_open_ping_roles') return openPrivateRoleSelector(interaction, 'ping');
      if (interaction.customId === 'room7_open_colour_roles') return openPrivateRoleSelector(interaction, 'colour');
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'room7_colour_roles') return handleColourSelection(interaction);
      if (interaction.customId === 'room7_ping_roles') return handlePingSelection(interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error);
    const message = `❌ ${error.message || 'Something went wrong while updating your roles.'}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
  }
});

client.on('error', (error) => console.error('Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

const app = express();
app.get('/', (_req, res) => {
  res.status(200).send(`Room 7 bot is ${client.isReady() ? 'online' : 'starting'}.`);
});
app.listen(PORT, () => console.log(`Health server listening on port ${PORT}.`));

client.login(TOKEN);
