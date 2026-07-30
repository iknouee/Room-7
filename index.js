require('dotenv').config();

const express = require('express');
const path = require('path');
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  OverwriteType,
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
const BOT_STATUS = process.env.BOT_STATUS || 'welcoming you to Room 7';
const EMBED_COLOR = 0xD99AB5;
const BANNER_PATH = path.join(__dirname, 'assets', 'room7-banner.png');
const BANNER_NAME = 'room7-banner.png';
const DATA_CHANNEL_NAME = 'room7-bot-data';
const DATA_PREFIX = 'ROOM7_CONFIG:';
const TIME_ZONE = 'Europe/London';
const PORTAL_BANNER_URL = 'https://cdn.discordapp.com/attachments/1525775191152525332/1531111904854937690/image.png?ex=6a680694&is=6a66b514&hm=a693e867da6b1be4681055cb7c8c77f4d3cc69f4fc824445a03aedc563443eaa';
const PORTAL_INVITE_URL = 'https://discord.gg/joinblvd';

const defaultConfig = {
  colours: [],
  pings: [],
  panel: { channelId: null, messageId: null },
  welcome: { channelId: null },
  qotd: { channelId: null, roleId: null, time: '18:00', lastPostedDate: null },
  moderation: {
    enabled: true,
    logChannelId: null,
    antispam: { enabled: true, messages: 6, seconds: 8, timeoutMinutes: 10 },
    links: { enabled: false },
    invites: { enabled: true },
    massMentions: { enabled: true, limit: 5, timeoutMinutes: 10 },
    raid: { enabled: true, joins: 8, seconds: 20, lockdownMinutes: 10, activeUntil: 0 },
    accountAge: { enabled: true, minimumDays: 3, action: 'alert' },
    lockedChannels: {},
  },
  warnings: {},
  autoresponders: [],
  leveling: { enabled: true, xp: {} },
  reputation: { users: {}, cooldowns: {} },
  birthdays: { channelId: null, users: {}, lastCheckedDate: null },
  milestones: { channelId: null, announced: [] },
  giveaways: {},
  lastToLeave: {
    voiceChannelId: null,
    activityChannelId: null,
    logChannelId: null,
    contestantRoleId: null,
    active: false,
    paused: false,
    startedAt: null,
    checkIntervalMinutes: 60,
    responseWindowMinutes: 30,
    checkNumber: 0,
    nextCheckAt: null,
    contestants: [],
    eliminated: [],
    currentCheck: null,
  },
};

const questions = [
  'What is one thing that made you smile today?',
  'What is your dream holiday destination?',
  'Which song have you had on repeat lately?',
  'What is your favourite comfort food?',
  'Would you rather have unlimited money or unlimited free time?',
  'What is one skill you would love to learn?',
  'Which app do you use the most?',
  'What is your favourite memory from this year?',
  'If you could meet any celebrity, who would it be?',
  'What is the best film or series you have watched recently?',
  'Are you more of a morning person or a night owl?',
  'What is one thing on your bucket list?',
  'Which three emojis describe your mood today?',
  'What is your most-used phrase?',
  'If you could instantly travel anywhere right now, where would you go?',
  'What is your favourite thing about weekends?',
  'Which fictional character would you be friends with?',
  'What is the funniest thing that happened to you recently?',
  'What is one food you could eat every day?',
  'What is your current favourite game?',
  'Would you rather live by the beach or in a big city?',
  'What is one unpopular opinion you have?',
  'Which season matches your personality best?',
  'What is the best gift you have ever received?',
  'What is one thing you are looking forward to?',
  'If Room 7 had a theme song, what should it be?',
  'What is your favourite late-night snack?',
  'Which colour best represents you?',
  'What is something everyone should try at least once?',
  'Who in Room 7 would survive longest in a zombie apocalypse?',
];

let config = structuredClone(defaultConfig);
let dataChannel = null;
let dataMessages = [];
let qotdTimer = null;
let communityTimer = null;
let lastToLeaveTimer = null;
const giveawayTimers = new Map();
const spamTracker = new Map();
const xpCooldowns = new Map();
let xpSaveTimer = null;
const recentJoins = [];
const invitePattern = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg)\/[a-z0-9-]+/i;
const urlPattern = /https?:\/\/[^\s<]+/i;

const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the Room 7 bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub
      .setName('add-color')
      .setDescription('Add a role to the color selector.')
      .addRoleOption((option) => option.setName('role').setDescription('The Discord color role.').setRequired(true))
      .addStringOption((option) => option.setName('name').setDescription('Name shown in the menu.').setMaxLength(50))
      .addStringOption((option) => option.setName('emoji').setDescription('Emoji shown beside the color.').setMaxLength(50)))
    .addSubcommand((sub) => sub
      .setName('add-ping')
      .setDescription('Add a role to the ping selector.')
      .addRoleOption((option) => option.setName('role').setDescription('The Discord ping role.').setRequired(true))
      .addStringOption((option) => option.setName('name').setDescription('Name shown in the menu.').setMaxLength(50))
      .addStringOption((option) => option.setName('emoji').setDescription('Emoji shown beside the ping.').setMaxLength(50))
      .addStringOption((option) => option.setName('description').setDescription('Short explanation of this ping.').setMaxLength(100)))
    .addSubcommand((sub) => sub
      .setName('remove-color')
      .setDescription('Remove a role from the color selector.')
      .addRoleOption((option) => option.setName('role').setDescription('The color role to remove.').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('remove-ping')
      .setDescription('Remove a role from the ping selector.')
      .addRoleOption((option) => option.setName('role').setDescription('The ping role to remove.').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('welcome')
      .setDescription('Choose where welcome messages are sent.')
      .addChannelOption((option) => option.setName('channel').setDescription('The welcome channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('qotd')
      .setDescription('Configure the automatic Question of the Day.')
      .addChannelOption((option) => option.setName('channel').setDescription('The QOTD channel.').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('The role to ping each day.').setRequired(true))
      .addStringOption((option) => option.setName('time').setDescription('UK time in 24-hour format, e.g. 18:00.').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('moderation')
      .setDescription('Enable or disable automatic moderation.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Whether automatic moderation is enabled.').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('modlogs')
      .setDescription('Choose the moderation log channel.')
      .addChannelOption((option) => option.setName('channel').setDescription('Where moderation actions are logged.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('antispam')
      .setDescription('Configure automatic spam protection.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable spam protection.').setRequired(true))
      .addIntegerOption((option) => option.setName('messages').setDescription('Messages allowed within the time window.').setMinValue(3).setMaxValue(15))
      .addIntegerOption((option) => option.setName('seconds').setDescription('Spam time window in seconds.').setMinValue(3).setMaxValue(30))
      .addIntegerOption((option) => option.setName('timeout').setDescription('Timeout length in minutes.').setMinValue(1).setMaxValue(1440)))
    .addSubcommand((sub) => sub
      .setName('links')
      .setDescription('Configure blocking of regular website links.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Block regular website links.').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('invites')
      .setDescription('Configure blocking of Discord invite links.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Block Discord invite links.').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('raid-protection')
      .setDescription('Configure join-flood raid protection.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable raid protection.').setRequired(true))
      .addIntegerOption((option) => option.setName('joins').setDescription('Joins needed to trigger lockdown.').setMinValue(3).setMaxValue(50))
      .addIntegerOption((option) => option.setName('seconds').setDescription('Join detection window in seconds.').setMinValue(5).setMaxValue(120))
      .addIntegerOption((option) => option.setName('lockdown').setDescription('Lockdown length in minutes.').setMinValue(1).setMaxValue(120)))
    .addSubcommand((sub) => sub
      .setName('account-age')
      .setDescription('Configure protection for very new Discord accounts.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Enable new-account checks.').setRequired(true))
      .addIntegerOption((option) => option.setName('days').setDescription('Minimum account age in days.').setMinValue(0).setMaxValue(365))
      .addStringOption((option) => option.setName('action').setDescription('Action taken for new accounts.').addChoices(
        { name: 'Alert staff only', value: 'alert' },
        { name: 'Timeout for 24 hours', value: 'timeout' },
        { name: 'Kick from server', value: 'kick' },
      )))
    .addSubcommand((sub) => sub
      .setName('birthdays')
      .setDescription('Choose where birthday announcements are posted.')
      .addChannelOption((option) => option.setName('channel').setDescription('Birthday announcement channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('milestones')
      .setDescription('Choose where member milestone announcements are posted.')
      .addChannelOption((option) => option.setName('channel').setDescription('Milestone announcement channel.').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('leveling')
      .setDescription('Enable or disable the leveling system.')
      .addBooleanOption((option) => option.setName('enabled').setDescription('Whether members earn XP from chatting.').setRequired(true)))
    .addSubcommand((sub) => sub.setName('list').setDescription('View the current bot configuration.'))
    .addSubcommand((sub) => sub
      .setName('clear')
      .setDescription('Clear configured color roles, ping roles, or both.')
      .addStringOption((option) => option.setName('section').setDescription('Which section should be cleared?').setRequired(true).addChoices(
        { name: 'Color roles', value: 'colours' },
        { name: 'Ping roles', value: 'pings' },
        { name: 'Everything', value: 'everything' },
      ))),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Post official Room 7 embeds.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('roles').setDescription('Post or refresh the role panel.'))
    .addSubcommand((sub) => sub.setName('rules').setDescription('Post the official rules embed.'))
    .addSubcommand((sub) => sub.setName('about').setDescription('Post the official About Room 7 embed.')),
  new SlashCommandBuilder()
    .setName('qotd')
    .setDescription('Question of the Day controls.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('post').setDescription('Post a random question now.')),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('member').setDescription('Member to warn.').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the warning.').setRequired(true).setMaxLength(500)),
  new SlashCommandBuilder().setName('warnings').setDescription('View a member’s warnings.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('member').setDescription('Member whose warnings to view.').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarnings').setDescription('Clear a member’s warnings.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('member').setDescription('Member whose warnings to clear.').setRequired(true)),
  new SlashCommandBuilder().setName('timeout').setDescription('Temporarily timeout a member.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('member').setDescription('Member to timeout.').setRequired(true))
    .addIntegerOption((option) => option.setName('minutes').setDescription('Timeout length in minutes.').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the timeout.').setMaxLength(500)),
  new SlashCommandBuilder().setName('untimeout').setDescription('Remove a member’s timeout.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('member').setDescription('Member to remove timeout from.').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for removing it.').setMaxLength(500)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member.').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName('member').setDescription('Member to kick.').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the kick.').setRequired(true).setMaxLength(500)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member.').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName('member').setDescription('Member to ban.').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the ban.').setRequired(true).setMaxLength(500))
    .addIntegerOption((option) => option.setName('delete-days').setDescription('Delete recent messages from this many days.').setMinValue(0).setMaxValue(7)),
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID.').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) => option.setName('user-id').setDescription('The banned user’s Discord ID.').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the unban.').setMaxLength(500)),
  new SlashCommandBuilder().setName('purge').setDescription('Delete recent messages.').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) => option.setName('amount').setDescription('Number of messages to delete.').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((option) => option.setName('member').setDescription('Only delete messages from this member.')),
  new SlashCommandBuilder().setName('slowmode').setDescription('Set this channel’s slowmode.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((option) => option.setName('seconds').setDescription('Slowmode delay; use 0 to disable.').setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder().setName('lock').setDescription('Lock the current channel.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) => option.setName('reason').setDescription('Reason for locking the channel.').setMaxLength(500)),
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock the current channel.').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) => option.setName('reason').setDescription('Reason for unlocking the channel.').setMaxLength(500)),
  new SlashCommandBuilder()
    .setName('autorespond')
    .setDescription('Manage automatic trigger replies.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('add').setDescription('Add an automatic reply.')
      .addStringOption((option) => option.setName('trigger').setDescription('Word or phrase to detect.').setRequired(true).setMaxLength(100))
      .addStringOption((option) => option.setName('response').setDescription('What the bot should say.').setRequired(true).setMaxLength(1800)))
    .addSubcommand((sub) => sub.setName('remove').setDescription('Remove an automatic reply.')
      .addStringOption((option) => option.setName('trigger').setDescription('Trigger to remove.').setRequired(true).setMaxLength(100)))
    .addSubcommand((sub) => sub.setName('list').setDescription('List every automatic reply.')),
  new SlashCommandBuilder().setName('rank').setDescription('View your level or another member’s level.')
    .addUserOption((option) => option.setName('member').setDescription('Member to view.')),
  new SlashCommandBuilder().setName('leaderboard').setDescription('View the Room 7 XP leaderboard.'),
  new SlashCommandBuilder().setName('rep').setDescription('Give a member one reputation point.')
    .addUserOption((option) => option.setName('member').setDescription('Member to give reputation to.').setRequired(true)),
  new SlashCommandBuilder().setName('reputation').setDescription('View reputation.')
    .addUserOption((option) => option.setName('member').setDescription('Member to view.')),
  new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Set or remove your birthday.')
    .addSubcommand((sub) => sub.setName('set').setDescription('Set your birthday.')
      .addIntegerOption((option) => option.setName('day').setDescription('Day of the month.').setRequired(true).setMinValue(1).setMaxValue(31))
      .addIntegerOption((option) => option.setName('month').setDescription('Month number.').setRequired(true).setMinValue(1).setMaxValue(12)))
    .addSubcommand((sub) => sub.setName('remove').setDescription('Remove your saved birthday.'))
    .addSubcommand((sub) => sub.setName('list').setDescription('See upcoming birthdays.')),
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create a Room 7 event announcement.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption((option) => option.setName('title').setDescription('Event title.').setRequired(true).setMaxLength(100))
    .addStringOption((option) => option.setName('when').setDescription('Date/time text, e.g. Friday 8 PM UK.').setRequired(true).setMaxLength(100))
    .addStringOption((option) => option.setName('details').setDescription('Event details.').setRequired(true).setMaxLength(1000))
    .addRoleOption((option) => option.setName('ping-role').setDescription('Optional role to ping.')),
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a button-entry giveaway.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption((option) => option.setName('prize').setDescription('Giveaway prize.').setRequired(true).setMaxLength(200))
    .addIntegerOption((option) => option.setName('minutes').setDescription('Duration in minutes.').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addIntegerOption((option) => option.setName('winners').setDescription('Number of winners.').setMinValue(1).setMaxValue(10))
    .addRoleOption((option) => option.setName('ping-role').setDescription('Optional role to ping.')),
  new SlashCommandBuilder().setName('serverstats').setDescription('View live Room 7 server statistics.'),
  new SlashCommandBuilder()
    .setName('media')
    .setDescription('Media of the Week tools.')
    .addSubcommand((sub) => sub.setName('nominate').setDescription('Nominate a message using its link.')
      .addStringOption((option) => option.setName('message-link').setDescription('Discord message link.').setRequired(true)))
    .addSubcommand((sub) => sub.setName('pick').setDescription('Pick the most-starred nominated post in this channel.')),
  new SlashCommandBuilder()
    .setName('sendportal')
    .setDescription('Post the Beloved partner portal advertisement.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('roles').setDescription('Open your private Room 7 role selector.'),
  new SlashCommandBuilder().setName('help').setDescription('View the Room 7 bot command guide.'),
  new SlashCommandBuilder()
    .setName('lasttoleave')
    .setDescription('Manage the Room 7 Last to Leave VC event.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Configure the event channels and optional contestant role.')
      .addChannelOption((option) => option.setName('voice-channel').setDescription('The event voice channel.').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
      .addChannelOption((option) => option.setName('activity-channel').setDescription('Where activity checks are posted.').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption((option) => option.setName('contestant-role').setDescription('Optional role given to contestants.'))
      .addChannelOption((option) => option.setName('log-channel').setDescription('Optional private event log channel.').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((sub) => sub.setName('start').setDescription('Start the event with everyone currently in the configured VC.'))
    .addSubcommand((sub) => sub.setName('check-now').setDescription('Start a 30-minute activity check immediately.'))
    .addSubcommand((sub) => sub.setName('status').setDescription('View the live event status and remaining contestants.'))
    .addSubcommand((sub) => sub.setName('pause').setDescription('Pause automatic hourly activity checks.'))
    .addSubcommand((sub) => sub.setName('resume').setDescription('Resume automatic hourly activity checks.'))
    .addSubcommand((sub) => sub.setName('end').setDescription('End the event and close any active check.'))
    .addSubcommand((sub) => sub
      .setName('eliminate')
      .setDescription('Manually eliminate and disconnect a contestant.')
      .addUserOption((option) => option.setName('member').setDescription('Contestant to eliminate.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason for elimination.').setMaxLength(300)))
    .addSubcommand((sub) => sub
      .setName('restore')
      .setDescription('Restore a contestant after a mistake or disconnect.')
      .addUserOption((option) => option.setName('member').setDescription('Contestant to restore.').setRequired(true))),
  new SlashCommandBuilder().setName('ping').setDescription('Check the bot status and response time.'),
].map((command) => command.toJSON());

const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildVoiceStates,
] });

function makeBanner() {
  return new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME });
}

function baseEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setImage(`attachment://${BANNER_NAME}`)
    .setFooter({ text: 'Room 7 • Your place. Our people.' });
}

function portalEmbed() {
  return new EmbedBuilder()
    .setColor(0xF2A7C3)
    .setTitle('୨ৎ Welcome to Beloved')
    .setDescription([
      '°❀⋆.ೃ࿔:･°❀⋆.ೃ࿔:°❀⋆.ೃ࿔:･°❀⋆.ೃ࿔:',
      '',
      'A friendly community made for meeting new people, having fun and making memories. 💗',
      '',
      '📣 **Pings** — `@here`',
      '💬 **Social**',
      '🫂 **BB Friend Group**',
      '🎉 **Giveaways**',
      '🎙️ **Hostings**',
      '',
      '👑 **Representatives:** @ari & @audrey',
      '',
      '──────────୨ৎ──────────',
      `### [Join Beloved](${PORTAL_INVITE_URL})`,
    ].join('\n'))
    .setImage(PORTAL_BANNER_URL)
    .setFooter({ text: 'Room 7 Portal • Partner Advertisement' });
}

function rolePanelEmbed() {
  return baseEmbed().setTitle('Make Room 7 Yours').setDescription([
    'Personalise your Room 7 experience using the buttons below.',
    '',
    '🔔 **Ping Roles**',
    'Choose the announcements, giveaways and events you want to receive.',
    '',
    '🎨 **Color Roles**',
    'Choose one colour to personalise your name throughout the server.',
    '',
    '-# You can update your selections whenever you like.',
  ].join('\n'));
}

function rulesEmbed() {
  return baseEmbed().setTitle('Room 7 Rules').setDescription('Welcome to **Room 7**. Keep the server friendly, comfortable and enjoyable for everyone.').addFields(
    { name: '01 • Respect Everyone', value: 'No harassment, bullying, discrimination, threats or targeted arguments.' },
    { name: '02 • Keep Drama Private', value: 'Do not bring personal disputes into public channels. Sort problems calmly in DMs or contact staff.' },
    { name: '03 • Keep It Appropriate', value: 'No NSFW content, gore, disturbing media or inappropriate profile content.' },
    { name: '04 • No Spam or Advertising', value: 'Avoid flooding chats, mass mentions, unsolicited DMs and promoting other servers without permission.' },
    { name: '05 • Use Channels Properly', value: 'Post content in the correct place and follow any channel-specific instructions.' },
    { name: '06 • Follow Discord Guidelines', value: 'You must follow Discord’s Terms of Service and Community Guidelines at all times.' },
    { name: 'Staff Decisions', value: 'Staff may act on situations not listed here when needed to protect the community. Use the support channel to appeal calmly.' },
  );
}

function aboutEmbed(guild) {
  return baseEmbed().setTitle('About Room 7').setDescription([
    '**Room 7** is a friendly social hangout built for meeting people, sharing moments and having somewhere comfortable to come back to.',
    '',
    '🛋️ **Hang Out**',
    'Chat, laugh, share photos and join conversations whenever you feel like it.',
    '',
    '📸 **Be Yourself**',
    'Share face reveals, pet reveals, memories, clips and the things you enjoy.',
    '',
    '🎉 **Get Involved**',
    'Take part in daily questions, community events, giveaways and voice chats.',
    '',
    `We currently have **${guild.memberCount.toLocaleString()} members** checked into Room 7.`,
  ].join('\n'));
}

function welcomeEmbed(member) {
  return baseEmbed().setTitle(`Welcome to Room 7, ${member.user.displayName}!`).setDescription([
    `Hey ${member}, you are member **#${member.guild.memberCount.toLocaleString()}**. We’re glad you found us.`,
    '',
    '📜 Read the rules before getting started.',
    '🎨 Choose your colour and notification roles.',
    '💬 Introduce yourself and join the conversation.',
    '',
    '**Your place. Our people. Welcome to Room 7.**',
  ].join('\n')).setThumbnail(member.user.displayAvatarURL({ size: 256 }));
}

function qotdEmbed(question) {
  return baseEmbed().setTitle('Question of the Day').setDescription([
    `## ${question}`,
    '',
    'Share your answer below and reply to other members too.',
    '-# A new question is posted every day.',
  ].join('\n'));
}

function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('room7_open_ping_roles').setLabel('Get your Ping Roles').setEmoji('🔔').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('room7_open_colour_roles').setLabel('Get your Color Roles').setEmoji('🎨').setStyle(ButtonStyle.Primary),
  );
}

function normaliseComponentEmoji(value) {
  if (!value || typeof value !== 'string') return null;
  const emoji = value.trim();
  if (!emoji) return null;

  // Discord custom emoji: <:name:id> or <a:name:id>
  const custom = emoji.match(/^<(?:(a)?):([A-Za-z0-9_]{2,32}):(\d{17,20})>$/);
  if (custom) return { animated: Boolean(custom[1]), name: custom[2], id: custom[3] };

  // Reject colon aliases such as :pink_heart: and other plain text values.
  if (/^:[^:]+:$/.test(emoji) || /[A-Za-z0-9]/.test(emoji)) return null;

  // Unicode emoji. Discord accepts the raw unicode string as the name.
  return { name: emoji };
}

function setOptionEmojiSafely(option, value) {
  const emoji = normaliseComponentEmoji(value);
  if (!emoji) return option;
  try {
    option.setEmoji(emoji);
  } catch (_) {
    // Invalid or inaccessible emojis are simply omitted from the menu.
  }
  return option;
}

function isUnknownInteraction(error) {
  return error?.code === 10062 || error?.rawError?.code === 10062;
}

async function safelyDeferReply(interaction, options = {}) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferReply(options);
    return true;
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    throw error;
  }
}

async function safelyDeferUpdate(interaction) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (error) {
    if (isUnknownInteraction(error)) return false;
    throw error;
  }
}

function colourMenu(member) {
  const options = config.colours.map((item) => {
    const role = member.guild.roles.cache.get(item.id);
    const option = new StringSelectMenuOptionBuilder().setLabel(item.name).setDescription(role ? `Role color: ${role.hexColor}` : 'Color role').setValue(item.id).setDefault(member.roles.cache.has(item.id));
    setOptionEmojiSafely(option, item.emoji);
    return option;
  });
  options.push(new StringSelectMenuOptionBuilder().setLabel('Remove Color').setDescription('Remove your current color role').setEmoji('🗑️').setValue('remove_colour'));
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('room7_colour_roles').setPlaceholder('Choose your color...').setMinValues(1).setMaxValues(1).addOptions(options));
}

function pingMenu(member) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('room7_ping_roles').setPlaceholder('Choose your ping roles...').setMinValues(0).setMaxValues(config.pings.length).addOptions(config.pings.map((item) => {
    const option = new StringSelectMenuOptionBuilder().setLabel(item.name).setDescription(item.description || 'Receive this notification').setValue(item.id).setDefault(member.roles.cache.has(item.id));
    setOptionEmojiSafely(option, item.emoji);
    return option;
  })));
}

async function fetchAllConfigMessages(channel, maxMessages = 1000) {
  const collected = [];
  let before;

  while (collected.length < maxMessages) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, maxMessages - collected.length),
      ...(before ? { before } : {}),
    });
    if (!batch.size) break;

    collected.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return collected
    .filter((message) => message.author.id === client.user.id && message.content.startsWith(DATA_PREFIX))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function parseStoredConfigMessages(messages) {
  const candidates = [];

  // New storage format: ROOM7_CONFIG:v2:<snapshotId>:<index>:<total>:<json chunk>
  const snapshots = new Map();
  for (const message of messages) {
    const match = message.content.match(/^ROOM7_CONFIG:v2:([^:]+):(\d+):(\d+):([\s\S]*)$/);
    if (!match) continue;

    const [, snapshotId, indexRaw, totalRaw, content] = match;
    const index = Number(indexRaw);
    const total = Number(totalRaw);
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total) continue;

    if (!snapshots.has(snapshotId)) snapshots.set(snapshotId, { total, chunks: new Map(), messages: [], timestamp: 0 });
    const snapshot = snapshots.get(snapshotId);
    if (snapshot.total !== total) continue;
    snapshot.chunks.set(index, content);
    snapshot.messages.push(message);
    snapshot.timestamp = Math.max(snapshot.timestamp, message.createdTimestamp);
  }

  for (const [snapshotId, snapshot] of snapshots) {
    if (snapshot.chunks.size !== snapshot.total) continue;
    const complete = Array.from({ length: snapshot.total }, (_, offset) => snapshot.chunks.get(offset + 1));
    if (complete.some((chunk) => typeof chunk !== 'string')) continue;
    candidates.push({
      format: 'v2',
      snapshotId,
      raw: complete.join(''),
      messages: snapshot.messages,
      timestamp: snapshot.timestamp,
    });
  }

  // Old chunk format. Reconstruct separate sequential batches instead of mixing every old save together.
  let current = null;
  for (const message of messages) {
    const match = message.content.match(/^ROOM7_CONFIG:(\d+):(\d+):([\s\S]*)$/);
    if (!match) continue;

    const index = Number(match[1]);
    const total = Number(match[2]);
    const content = match[3];

    if (index === 1) current = { total, chunks: [content], messages: [message], timestamp: message.createdTimestamp };
    else if (current && total === current.total && index === current.chunks.length + 1) {
      current.chunks.push(content);
      current.messages.push(message);
      current.timestamp = message.createdTimestamp;
    } else {
      current = null;
    }

    if (current && current.chunks.length === current.total) {
      candidates.push({
        format: 'legacy-chunks',
        raw: current.chunks.join(''),
        messages: [...current.messages],
        timestamp: current.timestamp,
      });
      current = null;
    }
  }

  // Very old single-message format.
  for (const message of messages) {
    if (/^ROOM7_CONFIG:(?:v2:|\d+:\d+:)/.test(message.content)) continue;
    candidates.push({
      format: 'legacy-single',
      raw: message.content.slice(DATA_PREFIX.length),
      messages: [message],
      timestamp: message.createdTimestamp,
    });
  }

  // Use the newest complete snapshot that contains valid JSON.
  candidates.sort((a, b) => b.timestamp - a.timestamp);
  for (const candidate of candidates) {
    try {
      const stored = JSON.parse(candidate.raw);
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) continue;
      return { stored, candidate };
    } catch (_) {}
  }

  return null;
}

function applyStoredConfig(stored) {
  config = { ...structuredClone(defaultConfig), ...stored };
  config.colours = Array.isArray(stored.colours) ? stored.colours : [];
  config.pings = Array.isArray(stored.pings) ? stored.pings : [];
  config.panel = { ...defaultConfig.panel, ...(stored.panel || {}) };
  config.welcome = { ...defaultConfig.welcome, ...(stored.welcome || {}) };
  config.qotd = { ...defaultConfig.qotd, ...(stored.qotd || {}) };
  config.moderation = { ...structuredClone(defaultConfig.moderation), ...(stored.moderation || {}) };
  config.moderation.antispam = { ...defaultConfig.moderation.antispam, ...(stored.moderation?.antispam || {}) };
  config.moderation.links = { ...defaultConfig.moderation.links, ...(stored.moderation?.links || {}) };
  config.moderation.invites = { ...defaultConfig.moderation.invites, ...(stored.moderation?.invites || {}) };
  config.moderation.massMentions = { ...defaultConfig.moderation.massMentions, ...(stored.moderation?.massMentions || {}) };
  config.moderation.raid = { ...defaultConfig.moderation.raid, ...(stored.moderation?.raid || {}) };
  config.moderation.accountAge = { ...defaultConfig.moderation.accountAge, ...(stored.moderation?.accountAge || {}) };
  config.moderation.lockedChannels = stored.moderation?.lockedChannels || {};
  config.warnings = stored.warnings && typeof stored.warnings === 'object' ? stored.warnings : {};
  config.autoresponders = Array.isArray(stored.autoresponders) ? stored.autoresponders : [];
  config.leveling = { ...defaultConfig.leveling, ...(stored.leveling || {}), xp: stored.leveling?.xp || {} };
  config.reputation = { ...defaultConfig.reputation, ...(stored.reputation || {}), users: stored.reputation?.users || {}, cooldowns: stored.reputation?.cooldowns || {} };
  config.birthdays = { ...defaultConfig.birthdays, ...(stored.birthdays || {}), users: stored.birthdays?.users || {} };
  config.milestones = { ...defaultConfig.milestones, ...(stored.milestones || {}), announced: Array.isArray(stored.milestones?.announced) ? stored.milestones.announced : [] };
  config.giveaways = stored.giveaways && typeof stored.giveaways === 'object' ? stored.giveaways : {};
  config.lastToLeave = { ...structuredClone(defaultConfig.lastToLeave), ...(stored.lastToLeave || {}) };
  config.lastToLeave.contestants = Array.isArray(stored.lastToLeave?.contestants) ? stored.lastToLeave.contestants : [];
  config.lastToLeave.eliminated = Array.isArray(stored.lastToLeave?.eliminated) ? stored.lastToLeave.eliminated : [];
  config.lastToLeave.currentCheck = stored.lastToLeave?.currentCheck && typeof stored.lastToLeave.currentCheck === 'object' ? stored.lastToLeave.currentCheck : null;
}

async function ensureDataStore(guild) {
  dataChannel = guild.channels.cache.find((channel) => channel.name === DATA_CHANNEL_NAME && channel.type === ChannelType.GuildText);
  if (!dataChannel) {
    dataChannel = await guild.channels.create({
      name: DATA_CHANNEL_NAME,
      type: ChannelType.GuildText,
      reason: 'Persistent Room 7 bot configuration storage',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
      ],
    });
  }

  const allConfigMessages = await fetchAllConfigMessages(dataChannel);
  const parsed = parseStoredConfigMessages(allConfigMessages);

  if (parsed) {
    applyStoredConfig(parsed.stored);
    dataMessages = parsed.candidate.messages;
    console.log(`Loaded Room 7 configuration (${parsed.candidate.format}): ${config.colours.length} color role(s), ${config.pings.length} ping role(s).`);

    // Migrate old data into the safer snapshot format after it has loaded successfully.
    if (parsed.candidate.format !== 'v2') await saveConfig();
    return;
  }

  if (allConfigMessages.length) {
    // Never silently overwrite a populated data channel with blank defaults.
    throw new Error(`Found ${allConfigMessages.length} config message(s), but no complete valid configuration snapshot could be read. The existing messages were left untouched.`);
  }

  config = structuredClone(defaultConfig);
  dataMessages = [];
  await saveConfig();
  console.log('Created a new Room 7 configuration store.');
}

async function saveConfig() {
  if (!dataChannel) throw new Error('The configuration store is unavailable.');

  const json = JSON.stringify(config);
  const chunkSize = 1650;
  const chunks = [];
  for (let index = 0; index < json.length; index += chunkSize) chunks.push(json.slice(index, index + chunkSize));

  const snapshotId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const newMessages = [];

  // Write and verify the complete new snapshot before removing the previous one.
  for (let index = 0; index < chunks.length; index += 1) {
    const message = await dataChannel.send(`${DATA_PREFIX}v2:${snapshotId}:${index + 1}:${chunks.length}:${chunks[index]}`);
    newMessages.push(message);
  }

  const verification = parseStoredConfigMessages(newMessages);
  if (!verification || verification.candidate.snapshotId !== snapshotId) {
    await Promise.all(newMessages.map((message) => message.delete().catch(() => null)));
    throw new Error('The new configuration snapshot could not be verified, so the previous configuration was kept.');
  }

  const oldMessages = [...dataMessages];
  dataMessages = newMessages;
  await Promise.all(oldMessages.map((message) => message.delete().catch(() => null)));
}

function validateTime(value) {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) throw new Error('Use 24-hour time in `HH:MM` format, for example `18:00`.');
}

function validateAssignableRole(guild, role) {
  if (role.id === guild.roles.everyone.id) throw new Error('The @everyone role cannot be used.');
  if (role.managed) throw new Error('Managed integration or bot roles cannot be assigned through this panel.');
  const botMember = guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Give the bot the **Manage Roles** permission.');
  if (role.position >= botMember.roles.highest.position) throw new Error(`Move the Room 7 bot role above **${role.name}** first.`);
}

async function safeRoleUpdate(member, removeIds, addIds) {
  const botMember = member.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('I need the Manage Roles permission.');
  const roles = [...new Set([...removeIds, ...addIds])].map((id) => member.guild.roles.cache.get(id)).filter(Boolean);
  const invalid = roles.filter((role) => role.position >= botMember.roles.highest.position || role.managed);
  if (invalid.length) throw new Error(`Move the Room 7 bot role above: ${invalid.map((role) => role.name).join(', ')}`);
  if (removeIds.length) await member.roles.remove(removeIds);
  if (addIds.length) await member.roles.add(addIds);
}

async function refreshPanel(guild) {
  if (!config.panel?.channelId || !config.panel?.messageId) return;
  const channel = await guild.channels.fetch(config.panel.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(config.panel.messageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [rolePanelEmbed()], components: [panelButtons()], files: [makeBanner()] }).catch(() => null);
}

async function postQotd(guild, channelOverride = null) {
  const channelId = channelOverride || config.qotd.channelId;
  if (!channelId) throw new Error('Configure QOTD first with `/config qotd`.');
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error('The configured QOTD channel could not be found.');
  const question = questions[Math.floor(Math.random() * questions.length)];
  const roleMention = config.qotd.roleId ? `<@&${config.qotd.roleId}>` : '';
  const message = await channel.send({
    content: roleMention,
    embeds: [qotdEmbed(question)],
    files: [makeBanner()],
    allowedMentions: config.qotd.roleId ? { roles: [config.qotd.roleId] } : { parse: [] },
  });
  await message.startThread({ name: `QOTD • ${new Date().toLocaleDateString('en-GB', { timeZone: TIME_ZONE, day: '2-digit', month: 'short' })}`, autoArchiveDuration: 1440 }).catch(() => null);
  return message;
}

function londonParts() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

async function checkQotdSchedule() {
  try {
    if (!client.isReady() || !config.qotd.channelId || !config.qotd.roleId) return;
    const now = londonParts();
    const dateKey = `${now.year}-${now.month}-${now.day}`;
    const timeKey = `${now.hour}:${now.minute}`;
    if (timeKey !== config.qotd.time || config.qotd.lastPostedDate === dateKey) return;
    const guild = await client.guilds.fetch(GUILD_ID);
    await postQotd(guild);
    config.qotd.lastPostedDate = dateKey;
    await saveConfig();
  } catch (error) {
    console.error('QOTD scheduler error:', error);
  }
}


function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

function xpForLevel(level) {
  return level * level * 100;
}

async function awardXp(message) {
  if (!config.leveling.enabled || !message.member) return;
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if ((xpCooldowns.get(key) || 0) > now) return;
  xpCooldowns.set(key, now + 60_000);
  const before = Number(config.leveling.xp[message.author.id] || 0);
  const gain = 15 + Math.floor(Math.random() * 11);
  const after = before + gain;
  config.leveling.xp[message.author.id] = after;
  const oldLevel = levelFromXp(before);
  const newLevel = levelFromXp(after);
  if (newLevel > oldLevel) {
    await message.channel.send({ content: `🎉 ${message.author}, you reached **Level ${newLevel}** in Room 7!`, allowedMentions: { users: [message.author.id] } }).catch(() => null);
  }
  if (!xpSaveTimer) {
    xpSaveTimer = setTimeout(() => {
      xpSaveTimer = null;
      saveConfig().catch((error) => console.error('XP save error:', error));
    }, 30_000);
  }
}

function autoresponderMatch(content) {
  const lower = content.toLowerCase();
  return [...config.autoresponders]
    .sort((a, b) => b.trigger.length - a.trigger.length)
    .find((item) => {
      const trigger = item.trigger.toLowerCase();
      if (/^[a-z0-9_]+$/i.test(trigger)) {
        return new RegExp(`(^|\\W)${trigger.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?=\\W|$)`, 'i').test(content);
      }
      return lower.includes(trigger);
    });
}

async function checkBirthdays() {
  if (!client.isReady() || !config.birthdays.channelId) return;
  const now = londonParts();
  const dateKey = `${now.year}-${now.month}-${now.day}`;
  if (config.birthdays.lastCheckedDate === dateKey) return;
  config.birthdays.lastCheckedDate = dateKey;
  const day = Number(now.day);
  const month = Number(now.month);
  const birthdayIds = Object.entries(config.birthdays.users)
    .filter(([, value]) => value.day === day && value.month === month)
    .map(([id]) => id);
  if (birthdayIds.length) {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(config.birthdays.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({
        content: birthdayIds.map((id) => `<@${id}>`).join(' '),
        embeds: [baseEmbed().setTitle('🎂 Happy Birthday!').setDescription(`Everyone wish ${birthdayIds.map((id) => `<@${id}>`).join(', ')} a very happy birthday! 💗`)],
        files: [makeBanner()],
        allowedMentions: { users: birthdayIds },
      });
    }
  }
  await saveConfig();
}

async function announceMilestone(guild) {
  if (!config.milestones.channelId) return;
  const count = guild.memberCount;
  const milestones = [25, 50, 100, 250, 500, 750, 1000, 2500, 5000, 10000];
  const hit = milestones.find((value) => count >= value && !config.milestones.announced.includes(value));
  if (!hit) return;
  const channel = await guild.channels.fetch(config.milestones.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [baseEmbed().setTitle(`🎉 ${hit.toLocaleString()} Members!`).setDescription(`Room 7 has officially reached **${hit.toLocaleString()} members**.\n\nThank you to everyone helping the community grow!`) ], files: [makeBanner()] });
  }
  config.milestones.announced.push(hit);
  await saveConfig();
}

function giveawayButton(messageId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`giveaway_enter:${messageId}`).setLabel('Enter Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  );
}

async function endGiveaway(messageId) {
  const data = config.giveaways[messageId];
  if (!data || data.ended) return;
  data.ended = true;
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = await guild.channels.fetch(data.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(messageId).catch(() => null) : null;
  const entrants = [...new Set(data.entrants || [])];
  const shuffled = entrants.sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, Math.min(data.winners, shuffled.length));
  if (message) {
    const embed = EmbedBuilder.from(message.embeds[0] || new EmbedBuilder())
      .setColor(EMBED_COLOR)
      .setDescription(`**Prize:** ${data.prize}\n\n**Ended:** <t:${Math.floor(Date.now() / 1000)}:R>\n**Entries:** ${entrants.length}\n**Winner(s):** ${winners.length ? winners.map((id) => `<@${id}>`).join(', ') : 'No valid entries'}`);
    await message.edit({ embeds: [embed], components: [giveawayButton(messageId, true)] }).catch(() => null);
    await channel.send({ content: winners.length ? `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(', ')}! You won **${data.prize}**.` : `The giveaway for **${data.prize}** ended with no valid entries.`, allowedMentions: { users: winners } }).catch(() => null);
  }
  await saveConfig();
}

function scheduleGiveaway(messageId) {
  const data = config.giveaways[messageId];
  if (!data || data.ended) return;
  if (giveawayTimers.has(messageId)) clearTimeout(giveawayTimers.get(messageId));
  const delay = Math.max(0, data.endAt - Date.now());
  const timer = setTimeout(() => endGiveaway(messageId).catch(console.error), Math.min(delay, 2_147_000_000));
  giveawayTimers.set(messageId, timer);
}

async function restoreGiveaways() {
  for (const [messageId, data] of Object.entries(config.giveaways)) {
    if (!data.ended) {
      if (data.endAt <= Date.now()) await endGiveaway(messageId);
      else scheduleGiveaway(messageId);
    }
  }
}


function lastToLeaveSettings() {
  config.lastToLeave = { ...structuredClone(defaultConfig.lastToLeave), ...(config.lastToLeave || {}) };
  config.lastToLeave.contestants = Array.isArray(config.lastToLeave.contestants) ? config.lastToLeave.contestants : [];
  config.lastToLeave.eliminated = Array.isArray(config.lastToLeave.eliminated) ? config.lastToLeave.eliminated : [];
  return config.lastToLeave;
}

function activityCheckButton(checkNumber, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lasttoleave_active:${checkNumber}`)
      .setLabel(disabled ? 'Activity Check Closed' : "I'm Active")
      .setEmoji(disabled ? '🔒' : '✅')
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

function mentionList(ids, limit = 40) {
  if (!ids?.length) return '*Nobody*';
  const shown = ids.slice(0, limit).map((id) => `<@${id}>`).join(', ');
  return ids.length > limit ? `${shown}\n…and **${ids.length - limit} more**` : shown;
}

async function sendLastToLeaveLog(guild, title, description) {
  const settings = lastToLeaveSettings();
  if (!settings.logChannelId) return;
  const channel = await guild.channels.fetch(settings.logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle(title).setDescription(description).setTimestamp().setFooter({ text: 'Room 7 • Last to Leave VC' })],
    allowedMentions: { parse: [] },
  }).catch(() => null);
}

async function getEventVoiceChannel(guild) {
  const settings = lastToLeaveSettings();
  if (!settings.voiceChannelId) return null;
  const channel = await guild.channels.fetch(settings.voiceChannelId).catch(() => null);
  return channel?.type === ChannelType.GuildVoice ? channel : null;
}

async function updateActivityCheckMessage(guild, closed = false) {
  const settings = lastToLeaveSettings();
  const check = settings.currentCheck;
  if (!check?.messageId || !check.channelId) return;
  const channel = await guild.channels.fetch(check.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(check.messageId).catch(() => null) : null;
  if (!message) return;
  const responded = Array.isArray(check.responded) ? check.responded : [];
  const eligible = Array.isArray(check.eligible) ? check.eligible : [];
  const waiting = eligible.filter((id) => !responded.includes(id));
  const endUnix = Math.floor(check.endsAt / 1000);
  const embed = new EmbedBuilder()
    .setColor(closed ? 0x7F8C8D : EMBED_COLOR)
    .setTitle(`${closed ? '🔒' : '⚠️'} Activity Check #${check.number}${closed ? ' Closed' : ''}`)
    .setDescription(closed
      ? `This activity check has ended.\n\n**Responded:** ${responded.length}/${eligible.length}`
      : `Press **I'm Active** before <t:${endUnix}:R>.\n\nAnyone who does not respond within **30 minutes** will be disconnected from the event VC and disqualified.`)
    .addFields(
      { name: '✅ Responded', value: `${responded.length}/${eligible.length}`, inline: true },
      { name: '⏳ Waiting', value: String(waiting.length), inline: true },
      { name: closed ? 'Ended' : 'Closes', value: `<t:${endUnix}:${closed ? 'R' : 'T'}>`, inline: true },
    )
    .setFooter({ text: 'Room 7 • Last to Leave VC' })
    .setTimestamp();
  await message.edit({ embeds: [embed], components: [activityCheckButton(check.number, closed)] }).catch(() => null);
}

async function startActivityCheck(guild, source = 'automatic') {
  const settings = lastToLeaveSettings();
  if (!settings.active) throw new Error('The Last to Leave event is not active.');
  if (settings.paused && source === 'automatic') return false;
  if (settings.currentCheck && !settings.currentCheck.closed) throw new Error('An activity check is already running.');

  const voiceChannel = await getEventVoiceChannel(guild);
  if (!voiceChannel) throw new Error('The configured event voice channel could not be found. Run `/lasttoleave setup` again.');
  const activityChannel = await guild.channels.fetch(settings.activityChannelId).catch(() => null);
  if (!activityChannel?.isTextBased()) throw new Error('The configured activity-check channel could not be found.');

  const contestantSet = new Set(settings.contestants);
  const eligible = [...voiceChannel.members.values()]
    .filter((member) => !member.user.bot && contestantSet.has(member.id))
    .map((member) => member.id);

  settings.checkNumber += 1;
  const startedAt = Date.now();
  const endsAt = startedAt + settings.responseWindowMinutes * 60_000;
  const check = {
    number: settings.checkNumber,
    source,
    channelId: activityChannel.id,
    messageId: null,
    startedAt,
    endsAt,
    eligible,
    responded: [],
    closed: false,
  };
  settings.currentCheck = check;
  settings.nextCheckAt = startedAt + settings.checkIntervalMinutes * 60_000;

  const message = await activityChannel.send({
    content: eligible.length ? eligible.map((id) => `<@${id}>`).join(' ') : '',
    embeds: [new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`⚠️ Activity Check #${check.number}`)
      .setDescription(`Press **I'm Active** within **30 minutes**.\n\nAnyone who does not respond will be disconnected from <#${voiceChannel.id}> and disqualified.`)
      .addFields(
        { name: '✅ Responded', value: `0/${eligible.length}`, inline: true },
        { name: '⏳ Waiting', value: String(eligible.length), inline: true },
        { name: 'Closes', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: 'Room 7 • Last to Leave VC' })
      .setTimestamp()],
    components: [activityCheckButton(check.number)],
    allowedMentions: { users: eligible },
  });
  check.messageId = message.id;
  await saveConfig();
  await sendLastToLeaveLog(guild, `Activity Check #${check.number} Started`, `Eligible contestants: **${eligible.length}**\nCloses: <t:${Math.floor(endsAt / 1000)}:F>\nStarted by: **${source}**`);
  return true;
}

async function eliminateContestant(guild, userId, reason = 'Did not complete the activity check', disconnect = true) {
  const settings = lastToLeaveSettings();
  if (!settings.contestants.includes(userId)) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (disconnect && member?.voice?.channelId === settings.voiceChannelId && member.voice.disconnectable) {
    await member.voice.disconnect(reason).catch(() => null);
  }
  if (settings.contestantRoleId && member?.roles.cache.has(settings.contestantRoleId)) {
    await member.roles.remove(settings.contestantRoleId, reason).catch(() => null);
  }
  settings.contestants = settings.contestants.filter((id) => id !== userId);
  if (!settings.eliminated.some((entry) => entry.userId === userId)) {
    settings.eliminated.push({ userId, reason, eliminatedAt: Date.now(), placement: settings.contestants.length + 1 });
  }
  return true;
}

async function closeActivityCheck(guild, reason = 'timer') {
  const settings = lastToLeaveSettings();
  const check = settings.currentCheck;
  if (!check || check.closed) return;
  check.closed = true;
  const responded = Array.isArray(check.responded) ? check.responded : [];
  const eligible = Array.isArray(check.eligible) ? check.eligible : [];
  const failed = eligible.filter((id) => !responded.includes(id));
  const eliminated = [];
  for (const userId of failed) {
    if (await eliminateContestant(guild, userId, `Failed Activity Check #${check.number}`, true)) eliminated.push(userId);
  }

  await updateActivityCheckMessage(guild, true);
  const channel = await guild.channels.fetch(check.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(eliminated.length ? 0xE74C3C : 0x57C785)
        .setTitle(`Activity Check #${check.number} Complete`)
        .setDescription([
          `✅ **Passed:** ${responded.length}`,
          `❌ **Disqualified:** ${eliminated.length}`,
          `🎙️ **Contestants remaining:** ${settings.contestants.length}`,
          '',
          eliminated.length ? `**Removed from the VC:**\n${mentionList(eliminated)}` : '**Everyone responded in time!**',
        ].join('\n'))
        .setFooter({ text: 'Room 7 • Last to Leave VC' })
        .setTimestamp()],
      allowedMentions: { users: eliminated },
    }).catch(() => null);
  }
  await sendLastToLeaveLog(guild, `Activity Check #${check.number} Completed`, `Passed: **${responded.length}**\nDisqualified: **${eliminated.length}**\nRemaining: **${settings.contestants.length}**\nClosed by: **${reason}**`);
  await saveConfig();
}

async function processLastToLeaveSchedule() {
  if (!client.isReady()) return;
  const settings = lastToLeaveSettings();
  if (!settings.active) return;
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;
  const now = Date.now();
  if (settings.currentCheck && !settings.currentCheck.closed && now >= settings.currentCheck.endsAt) {
    await closeActivityCheck(guild, '30-minute timer');
    return;
  }
  if (!settings.paused && (!settings.currentCheck || settings.currentCheck.closed) && settings.nextCheckAt && now >= settings.nextCheckAt) {
    await startActivityCheck(guild, 'automatic');
  }
}

async function handleLastToLeaveCommand(interaction) {
  if (!await safelyDeferReply(interaction, { flags: MessageFlags.Ephemeral })) return;
  const settings = lastToLeaveSettings();
  const sub = interaction.options.getSubcommand();

  if (sub === 'setup') {
    const voice = interaction.options.getChannel('voice-channel', true);
    const activity = interaction.options.getChannel('activity-channel', true);
    const role = interaction.options.getRole('contestant-role');
    const log = interaction.options.getChannel('log-channel');
    if (role) validateAssignableRole(interaction.guild, role);
    settings.voiceChannelId = voice.id;
    settings.activityChannelId = activity.id;
    settings.contestantRoleId = role?.id || null;
    settings.logChannelId = log?.id || null;
    settings.checkIntervalMinutes = 60;
    settings.responseWindowMinutes = 30;
    await saveConfig();
    return interaction.editReply(`✅ Last to Leave configured.\n\n**Event VC:** ${voice}\n**Activity checks:** ${activity}\n**Contestant role:** ${role || 'None'}\n**Checks:** Every hour, open for 30 minutes.`);
  }

  if (sub === 'start') {
    if (settings.active) throw new Error('The event is already active. End it first before starting again.');
    const voice = await getEventVoiceChannel(interaction.guild);
    if (!voice || !settings.activityChannelId) throw new Error('Run `/lasttoleave setup` first.');
    const members = [...voice.members.values()].filter((member) => !member.user.bot);
    if (!members.length) throw new Error('There is nobody in the configured event VC.');
    settings.active = true;
    settings.paused = false;
    settings.startedAt = Date.now();
    settings.checkNumber = 0;
    settings.nextCheckAt = Date.now() + 60 * 60_000;
    settings.contestants = members.map((member) => member.id);
    settings.eliminated = [];
    settings.currentCheck = null;
    if (settings.contestantRoleId) {
      for (const member of members) await member.roles.add(settings.contestantRoleId, 'Room 7 Last to Leave contestant').catch(() => null);
    }
    await saveConfig();
    const activity = await interaction.guild.channels.fetch(settings.activityChannelId).catch(() => null);
    if (activity?.isTextBased()) {
      await activity.send({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle('🏆 Last to Leave VC Has Started!').setDescription(`**${members.length} contestants** have entered.\n\nThe first activity check will begin <t:${Math.floor(settings.nextCheckAt / 1000)}:R>. Each check stays open for **30 minutes**.\n\n🏆 **Prize: 3,000 Robux**`).setFooter({ text: 'Room 7 • Last to Leave VC' }).setTimestamp()] });
    }
    await sendLastToLeaveLog(interaction.guild, 'Event Started', `${members.length} contestants entered.\nFirst activity check: <t:${Math.floor(settings.nextCheckAt / 1000)}:F>`);
    return interaction.editReply(`✅ Event started with **${members.length} contestants**. The first activity check starts in **1 hour**.`);
  }

  if (sub === 'check-now') {
    await startActivityCheck(interaction.guild, `manual • ${interaction.user.tag}`);
    return interaction.editReply('✅ A 30-minute activity check has started.');
  }

  if (sub === 'pause') {
    if (!settings.active) throw new Error('The event is not active.');
    settings.paused = true;
    await saveConfig();
    return interaction.editReply('⏸️ Automatic hourly checks are paused. Any check already open will still finish normally.');
  }

  if (sub === 'resume') {
    if (!settings.active) throw new Error('The event is not active.');
    settings.paused = false;
    settings.nextCheckAt = Date.now() + 60 * 60_000;
    await saveConfig();
    return interaction.editReply('▶️ Automatic checks resumed. The next check begins in **1 hour**.');
  }

  if (sub === 'end') {
    if (!settings.active) throw new Error('The event is not active.');
    if (settings.currentCheck && !settings.currentCheck.closed) await closeActivityCheck(interaction.guild, `event ended by ${interaction.user.tag}`);
    settings.active = false;
    settings.paused = false;
    settings.nextCheckAt = null;
    const remaining = [...settings.contestants];
    await saveConfig();
    await sendLastToLeaveLog(interaction.guild, 'Event Ended', `Remaining contestants: **${remaining.length}**\n${mentionList(remaining)}`);
    return interaction.editReply(`🏁 Event ended. **${remaining.length} contestant(s)** remained.\n${mentionList(remaining, 20)}`);
  }

  if (sub === 'eliminate') {
    if (!settings.active) throw new Error('The event is not active.');
    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || `Manually eliminated by ${interaction.user.tag}`;
    if (!await eliminateContestant(interaction.guild, user.id, reason, true)) throw new Error('That member is not an active contestant.');
    await saveConfig();
    await sendLastToLeaveLog(interaction.guild, 'Contestant Manually Eliminated', `${user.tag} (${user.id})\nReason: ${reason}\nRemaining: ${settings.contestants.length}`);
    return interaction.editReply(`❌ **${user.tag}** was disconnected and eliminated. **${settings.contestants.length}** remain.`);
  }

  if (sub === 'restore') {
    if (!settings.active) throw new Error('The event is not active.');
    const user = interaction.options.getUser('member', true);
    if (settings.contestants.includes(user.id)) throw new Error('That member is already an active contestant.');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) throw new Error('That member could not be found.');
    settings.contestants.push(user.id);
    settings.eliminated = settings.eliminated.filter((entry) => entry.userId !== user.id);
    if (settings.contestantRoleId) await member.roles.add(settings.contestantRoleId, 'Restored to Last to Leave event').catch(() => null);
    await saveConfig();
    await sendLastToLeaveLog(interaction.guild, 'Contestant Restored', `${user.tag} (${user.id}) was restored by ${interaction.user.tag}.`);
    return interaction.editReply(`✅ **${user.tag}** has been restored. They must rejoin <#${settings.voiceChannelId}> themselves.`);
  }

  const check = settings.currentCheck && !settings.currentCheck.closed ? settings.currentCheck : null;
  const status = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('🏆 Last to Leave VC Status')
    .addFields(
      { name: 'Event', value: settings.active ? (settings.paused ? '⏸️ Active • checks paused' : '🟢 Active') : '🔴 Not active', inline: true },
      { name: 'Remaining', value: String(settings.contestants.length), inline: true },
      { name: 'Eliminated', value: String(settings.eliminated.length), inline: true },
      { name: 'Event VC', value: settings.voiceChannelId ? `<#${settings.voiceChannelId}>` : '*Not configured*', inline: true },
      { name: 'Activity Channel', value: settings.activityChannelId ? `<#${settings.activityChannelId}>` : '*Not configured*', inline: true },
      { name: check ? `Current Check #${check.number}` : 'Next Check', value: check ? `Closes <t:${Math.floor(check.endsAt / 1000)}:R> • ${check.responded.length}/${check.eligible.length} responded` : (settings.active && settings.nextCheckAt ? `<t:${Math.floor(settings.nextCheckAt / 1000)}:R>` : '*None*') },
      { name: 'Contestants', value: mentionList(settings.contestants, 30) },
    )
    .setFooter({ text: 'Every hour • 30 minutes to respond' })
    .setTimestamp();
  return interaction.editReply({ embeds: [status], allowedMentions: { parse: [] } });
}

async function handleCommunityCommand(interaction) {
  const name = interaction.commandName;
  if (name === 'autorespond') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      const trigger = interaction.options.getString('trigger', true).trim();
      const response = interaction.options.getString('response', true).trim();
      if (!trigger || !response) throw new Error('Trigger and response cannot be empty.');
      const existing = config.autoresponders.find((item) => item.trigger.toLowerCase() === trigger.toLowerCase());
      if (existing) existing.response = response;
      else {
        if (config.autoresponders.length >= 100) throw new Error('You can configure up to 100 autoresponders.');
        config.autoresponders.push({ trigger, response });
      }
      await saveConfig();
      return interaction.reply({ content: `✅ When someone says **${trigger}**, I will reply with:\n${response}`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'remove') {
      const trigger = interaction.options.getString('trigger', true).trim();
      const before = config.autoresponders.length;
      config.autoresponders = config.autoresponders.filter((item) => item.trigger.toLowerCase() !== trigger.toLowerCase());
      if (before === config.autoresponders.length) throw new Error('That trigger is not configured.');
      await saveConfig();
      return interaction.reply({ content: `✅ Removed the **${trigger}** autoresponder.`, flags: MessageFlags.Ephemeral });
    }
    const text = config.autoresponders.length
      ? config.autoresponders.map((item, index) => `**${index + 1}. ${item.trigger}** → ${truncate(item.response, 100)}`).join('\n')
      : '*No autoresponders configured.*';
    return interaction.reply({ embeds: [baseEmbed().setTitle('Automatic Replies').setDescription(text)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
  }

  if (name === 'rank') {
    const user = interaction.options.getUser('member') || interaction.user;
    const xp = Number(config.leveling.xp[user.id] || 0);
    const level = levelFromXp(xp);
    const currentBase = xpForLevel(level);
    const nextBase = xpForLevel(level + 1);
    return interaction.reply({ embeds: [baseEmbed().setTitle(`${user.username}'s Rank`).setThumbnail(user.displayAvatarURL()).addFields(
      { name: 'Level', value: String(level), inline: true },
      { name: 'Total XP', value: xp.toLocaleString(), inline: true },
      { name: 'Progress', value: `${xp - currentBase}/${nextBase - currentBase} XP`, inline: true },
    )], files: [makeBanner()] });
  }

  if (name === 'leaderboard') {
    const rows = Object.entries(config.leveling.xp).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const text = rows.length ? rows.map(([id, xp], index) => `**${index + 1}.** <@${id}> — Level **${levelFromXp(xp)}** • ${Number(xp).toLocaleString()} XP`).join('\n') : '*No XP has been earned yet.*';
    return interaction.reply({ embeds: [baseEmbed().setTitle('🏆 Room 7 Leaderboard').setDescription(text)], files: [makeBanner()], allowedMentions: { parse: [] } });
  }

  if (name === 'rep') {
    const user = interaction.options.getUser('member', true);
    if (user.id === interaction.user.id) throw new Error('You cannot give reputation to yourself.');
    if (user.bot) throw new Error('You cannot give reputation to a bot.');
    const last = Number(config.reputation.cooldowns[interaction.user.id] || 0);
    if (Date.now() - last < 86_400_000) {
      const next = Math.floor((last + 86_400_000) / 1000);
      throw new Error(`You can give reputation again <t:${next}:R>.`);
    }
    config.reputation.cooldowns[interaction.user.id] = Date.now();
    config.reputation.users[user.id] = Number(config.reputation.users[user.id] || 0) + 1;
    await saveConfig();
    return interaction.reply({ content: `💗 ${interaction.user} gave ${user} a reputation point! They now have **${config.reputation.users[user.id]} rep**.`, allowedMentions: { users: [interaction.user.id, user.id] } });
  }

  if (name === 'reputation') {
    const user = interaction.options.getUser('member') || interaction.user;
    return interaction.reply({ embeds: [baseEmbed().setTitle(`${user.username}'s Reputation`).setThumbnail(user.displayAvatarURL()).setDescription(`💗 **${Number(config.reputation.users[user.id] || 0)} reputation point(s)**`)], files: [makeBanner()] });
  }

  if (name === 'birthday') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const day = interaction.options.getInteger('day', true);
      const month = interaction.options.getInteger('month', true);
      const test = new Date(2024, month - 1, day);
      if (test.getMonth() !== month - 1 || test.getDate() !== day) throw new Error('That is not a valid calendar date.');
      config.birthdays.users[interaction.user.id] = { day, month };
      await saveConfig();
      return interaction.reply({ content: `🎂 Your birthday is saved as **${day}/${month}**.`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'remove') {
      delete config.birthdays.users[interaction.user.id];
      await saveConfig();
      return interaction.reply({ content: '✅ Your birthday has been removed.', flags: MessageFlags.Ephemeral });
    }
    const upcoming = Object.entries(config.birthdays.users).slice(0, 30).map(([id, value]) => `<@${id}> — **${value.day}/${value.month}**`).join('\n') || '*No birthdays saved yet.*';
    return interaction.reply({ embeds: [baseEmbed().setTitle('🎂 Room 7 Birthdays').setDescription(upcoming)], files: [makeBanner()], allowedMentions: { parse: [] } });
  }

  if (name === 'event') {
    const title = interaction.options.getString('title', true);
    const when = interaction.options.getString('when', true);
    const details = interaction.options.getString('details', true);
    const role = interaction.options.getRole('ping-role');
    await interaction.channel.send({
      content: role ? `${role}` : '',
      embeds: [baseEmbed().setTitle(`📅 ${title}`).setDescription(details).addFields({ name: 'When', value: when }, { name: 'Hosted by', value: `${interaction.user}` })],
      files: [makeBanner()],
      allowedMentions: role ? { roles: [role.id] } : { parse: [] },
    });
    return interaction.reply({ content: '✅ Event announcement posted.', flags: MessageFlags.Ephemeral });
  }

  if (name === 'giveaway') {
    const prize = interaction.options.getString('prize', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const winners = interaction.options.getInteger('winners') || 1;
    const role = interaction.options.getRole('ping-role');
    const endAt = Date.now() + minutes * 60_000;
    if (!await safelyDeferReply(interaction, { flags: MessageFlags.Ephemeral })) return;
    const message = await interaction.channel.send({
      content: role ? `${role}` : '',
      embeds: [baseEmbed().setTitle('🎉 Room 7 Giveaway').setDescription(`**Prize:** ${prize}\n\nClick the button below to enter.\n**Ends:** <t:${Math.floor(endAt / 1000)}:R>\n**Winners:** ${winners}\n**Hosted by:** ${interaction.user}`)],
      files: [makeBanner()],
      allowedMentions: role ? { roles: [role.id] } : { parse: [] },
    });
    await message.edit({ components: [giveawayButton(message.id)] });
    config.giveaways[message.id] = { channelId: interaction.channelId, prize, winners, endAt, entrants: [], ended: false };
    await saveConfig();
    scheduleGiveaway(message.id);
    return interaction.editReply('✅ Giveaway started.');
  }

  if (name === 'serverstats') {
    await interaction.guild.members.fetch().catch(() => null);
    const humans = interaction.guild.members.cache.filter((member) => !member.user.bot).size;
    const bots = interaction.guild.members.cache.filter((member) => member.user.bot).size;
    return interaction.reply({ embeds: [baseEmbed().setTitle('📊 Room 7 Server Stats').addFields(
      { name: 'Members', value: interaction.guild.memberCount.toLocaleString(), inline: true },
      { name: 'People', value: humans.toLocaleString(), inline: true },
      { name: 'Bots', value: bots.toLocaleString(), inline: true },
      { name: 'Boosts', value: String(interaction.guild.premiumSubscriptionCount || 0), inline: true },
      { name: 'Channels', value: String(interaction.guild.channels.cache.size), inline: true },
      { name: 'Roles', value: String(interaction.guild.roles.cache.size), inline: true },
      { name: 'Created', value: `<t:${Math.floor(interaction.guild.createdTimestamp / 1000)}:R>` },
    )], files: [makeBanner()] });
  }

  if (name === 'media') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'nominate') {
      const link = interaction.options.getString('message-link', true);
      const match = link.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
      if (!match || match[1] !== interaction.guildId) throw new Error('Use a valid message link from this server.');
      const channel = await interaction.guild.channels.fetch(match[2]).catch(() => null);
      const target = channel?.isTextBased() ? await channel.messages.fetch(match[3]).catch(() => null) : null;
      if (!target) throw new Error('That message could not be found.');
      await target.react('⭐');
      await target.reply({ content: `⭐ Nominated for **Media of the Week** by ${interaction.user}. React with ⭐ to vote!`, allowedMentions: { users: [interaction.user.id] } });
      return interaction.reply({ content: '✅ Media nominated.', flags: MessageFlags.Ephemeral });
    }
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) throw new Error('Only staff can pick Media of the Week.');
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const candidates = messages.filter((message) => message.reactions.cache.get('⭐') && (message.attachments.size || message.embeds.length));
    const winner = candidates.sort((a, b) => (b.reactions.cache.get('⭐')?.count || 0) - (a.reactions.cache.get('⭐')?.count || 0)).first();
    if (!winner) throw new Error('No starred media posts were found in this channel.');
    await interaction.channel.send({ embeds: [baseEmbed().setTitle('⭐ Media of the Week').setDescription(`Congratulations ${winner.author}!\n\n[View the winning post](${winner.url})\n\n**Votes:** ${winner.reactions.cache.get('⭐')?.count || 0}`)], files: [makeBanner()] });
    return interaction.reply({ content: '✅ Media of the Week posted.', flags: MessageFlags.Ephemeral });
  }
}

function truncate(value, length = 1000) {
  const text = String(value || 'Not provided');
  return text.length > length ? `${text.slice(0, length - 3)}...` : text;
}

function isStaff(member) {
  return member.permissions.has(PermissionFlagsBits.ManageMessages)
    || member.permissions.has(PermissionFlagsBits.ModerateMembers)
    || member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function canActOn(actor, target) {
  if (!target) throw new Error('That member could not be found.');
  if (target.id === actor.id) throw new Error('You cannot use this command on yourself.');
  if (target.id === target.guild.ownerId) throw new Error('The server owner cannot be moderated.');
  if (actor.id !== target.guild.ownerId && target.roles.highest.position >= actor.roles.highest.position) {
    throw new Error('That member has an equal or higher role than you.');
  }
  const botMember = target.guild.members.me;
  if (target.roles.highest.position >= botMember.roles.highest.position) {
    throw new Error('Move the Room 7 bot role above that member’s highest role first.');
  }
}

async function sendModLog(guild, title, fields = [], color = EMBED_COLOR) {
  if (!config.moderation.logChannelId) return;
  const channel = await guild.channels.fetch(config.moderation.logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(fields.map((field) => ({ ...field, value: truncate(field.value) })))
    .setTimestamp()
    .setFooter({ text: 'Room 7 Moderation' });
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

async function notifyUser(user, title, description) {
  await user.send({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle(title).setDescription(description).setFooter({ text: 'Room 7 Moderation' })] }).catch(() => null);
}

function warningList(userId) {
  return Array.isArray(config.warnings[userId]) ? config.warnings[userId] : [];
}

async function addWarning(guild, user, moderator, reason, source = 'Manual warning') {
  const warnings = warningList(user.id);
  warnings.push({ reason, moderatorId: moderator?.id || client.user.id, source, timestamp: Date.now() });
  config.warnings[user.id] = warnings.slice(-25);
  await saveConfig();
  await notifyUser(user, 'You received a warning in Room 7', `**Reason:** ${reason}\n\nPlease review the server rules. You now have **${config.warnings[user.id].length} warning(s)**.`);
  await sendModLog(guild, 'Member Warned', [
    { name: 'Member', value: `${user.tag} (${user.id})`, inline: true },
    { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Room 7 AutoMod', inline: true },
    { name: 'Total Warnings', value: String(config.warnings[user.id].length), inline: true },
    { name: 'Reason', value: reason },
    { name: 'Source', value: source },
  ], 0xF0B35A);
  return config.warnings[user.id].length;
}

async function deleteAndExplain(message, reason) {
  await message.delete().catch(() => null);
  const notice = await message.channel.send({ content: `${message.author}, ${reason}`, allowedMentions: { users: [message.author.id] } }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => null), 6000);
}

async function triggerRaidLockdown(guild) {
  const settings = config.moderation.raid;
  if (settings.activeUntil > Date.now()) return;
  settings.activeUntil = Date.now() + settings.lockdownMinutes * 60_000;
  const changed = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText) continue;
    try {
      const current = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
      const previous = current?.allow.has(PermissionFlagsBits.SendMessages) ? 'raid-allowed' : current?.deny.has(PermissionFlagsBits.SendMessages) ? 'raid-denied' : 'raid-neutral';
      config.moderation.lockedChannels[channel.id] = previous;
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: 'Room 7 automatic raid lockdown' });
      changed.push(channel.id);
    } catch (_) {}
  }
  await saveConfig();
  await sendModLog(guild, '🚨 Automatic Raid Lockdown', [
    { name: 'Reason', value: `${settings.joins} or more joins were detected within ${settings.seconds} seconds.` },
    { name: 'Channels Locked', value: String(changed.length), inline: true },
    { name: 'Duration', value: `${settings.lockdownMinutes} minutes`, inline: true },
  ], 0xE74C3C);
  setTimeout(async () => {
    for (const channelId of changed) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) continue;
      const previous = config.moderation.lockedChannels[channelId];
      if (typeof previous === 'string' && previous.startsWith('raid-')) {
        const restore = previous === 'raid-allowed' ? true : previous === 'raid-denied' ? false : null;
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: restore }, { reason: 'Room 7 raid lockdown ended' }).catch(() => null);
        delete config.moderation.lockedChannels[channelId];
      }
    }
    settings.activeUntil = 0;
    await saveConfig().catch(() => null);
    await sendModLog(guild, 'Raid Lockdown Ended', [{ name: 'Status', value: 'Automatically restored affected channels.' }], 0x57C785);
  }, settings.lockdownMinutes * 60_000);
}

async function handleModerationCommand(interaction) {
  const command = interaction.commandName;
  const actor = interaction.member;

  if (command === 'warn' || command === 'warnings' || command === 'clearwarnings' || command === 'timeout' || command === 'untimeout' || command === 'kick' || command === 'ban') {
    const user = interaction.options.getUser('member', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (command !== 'warnings' && command !== 'clearwarnings') canActOn(actor, member);

    if (command === 'warn') {
      const reason = interaction.options.getString('reason', true);
      const count = await addWarning(interaction.guild, user, interaction.user, reason);
      return interaction.reply({ content: `✅ Warned **${user.tag}**. They now have **${count} warning(s)**.`, flags: MessageFlags.Ephemeral });
    }
    if (command === 'warnings') {
      const warnings = warningList(user.id);
      const description = warnings.length
        ? warnings.slice(-10).map((entry, index) => `**${index + 1}.** ${truncate(entry.reason, 180)}\n<t:${Math.floor(entry.timestamp / 1000)}:R> • <@${entry.moderatorId}>`).join('\n\n')
        : 'This member has no warnings.';
      return interaction.reply({ embeds: [baseEmbed().setTitle(`Warnings • ${user.tag}`).setDescription(description)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
    }
    if (command === 'clearwarnings') {
      const removed = warningList(user.id).length;
      delete config.warnings[user.id];
      await saveConfig();
      await sendModLog(interaction.guild, 'Warnings Cleared', [
        { name: 'Member', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
        { name: 'Warnings Removed', value: String(removed), inline: true },
      ], 0x57C785);
      return interaction.reply({ content: `✅ Cleared **${removed} warning(s)** from **${user.tag}**.`, flags: MessageFlags.Ephemeral });
    }
    if (command === 'timeout') {
      const minutes = interaction.options.getInteger('minutes', true);
      const reason = interaction.options.getString('reason') || 'No reason provided.';
      if (!member.moderatable) throw new Error('I cannot timeout that member. Check my role position and permissions.');
      await member.timeout(minutes * 60_000, reason);
      await notifyUser(user, 'You were timed out in Room 7', `**Length:** ${minutes} minute(s)\n**Reason:** ${reason}`);
      await sendModLog(interaction.guild, 'Member Timed Out', [
        { name: 'Member', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
        { name: 'Length', value: `${minutes} minute(s)`, inline: true },
        { name: 'Reason', value: reason },
      ], 0xE67E22);
      return interaction.reply({ content: `✅ Timed out **${user.tag}** for **${minutes} minute(s)**.`, flags: MessageFlags.Ephemeral });
    }
    if (command === 'untimeout') {
      const reason = interaction.options.getString('reason') || 'Timeout removed by staff.';
      if (!member.moderatable) throw new Error('I cannot update that member. Check my role position and permissions.');
      await member.timeout(null, reason);
      await sendModLog(interaction.guild, 'Timeout Removed', [
        { name: 'Member', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
        { name: 'Reason', value: reason },
      ], 0x57C785);
      return interaction.reply({ content: `✅ Removed **${user.tag}**’s timeout.`, flags: MessageFlags.Ephemeral });
    }
    if (command === 'kick') {
      const reason = interaction.options.getString('reason', true);
      if (!member.kickable) throw new Error('I cannot kick that member. Check my role position and permissions.');
      await notifyUser(user, 'You were removed from Room 7', `**Reason:** ${reason}`);
      await member.kick(reason);
      await sendModLog(interaction.guild, 'Member Kicked', [
        { name: 'Member', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
        { name: 'Reason', value: reason },
      ], 0xE67E22);
      return interaction.reply({ content: `✅ Kicked **${user.tag}**.`, flags: MessageFlags.Ephemeral });
    }
    if (command === 'ban') {
      const reason = interaction.options.getString('reason', true);
      const deleteDays = interaction.options.getInteger('delete-days') || 0;
      if (!member.bannable) throw new Error('I cannot ban that member. Check my role position and permissions.');
      await notifyUser(user, 'You were banned from Room 7', `**Reason:** ${reason}`);
      await member.ban({ deleteMessageSeconds: deleteDays * 86_400, reason });
      await sendModLog(interaction.guild, 'Member Banned', [
        { name: 'Member', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
        { name: 'Messages Deleted', value: `${deleteDays} day(s)`, inline: true },
        { name: 'Reason', value: reason },
      ], 0xD64541);
      return interaction.reply({ content: `✅ Banned **${user.tag}**.`, flags: MessageFlags.Ephemeral });
    }
  }

  if (command === 'unban') {
    const userId = interaction.options.getString('user-id', true).trim();
    if (!/^\d{17,20}$/.test(userId)) throw new Error('Enter a valid Discord user ID.');
    const reason = interaction.options.getString('reason') || 'Unbanned by staff.';
    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) throw new Error('That user is not currently banned.');
    await interaction.guild.members.unban(userId, reason);
    await sendModLog(interaction.guild, 'User Unbanned', [
      { name: 'User', value: `${ban.user.tag} (${userId})`, inline: true },
      { name: 'Moderator', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
      { name: 'Reason', value: reason },
    ], 0x57C785);
    return interaction.reply({ content: `✅ Unbanned **${ban.user.tag}**.`, flags: MessageFlags.Ephemeral });
  }

  if (command === 'purge') {
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('member');
    const fetched = await interaction.channel.messages.fetch({ limit: 100 });
    const selected = fetched.filter((message) => !user || message.author.id === user.id).first(amount);
    if (!selected.length) throw new Error('No matching recent messages were found.');
    const deleted = await interaction.channel.bulkDelete(selected, true);
    await sendModLog(interaction.guild, 'Messages Purged', [
      { name: 'Moderator', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
      { name: 'Channel', value: `${interaction.channel}`, inline: true },
      { name: 'Deleted', value: String(deleted.size), inline: true },
      { name: 'Filter', value: user ? `${user.tag} (${user.id})` : 'All members' },
    ]);
    return interaction.reply({ content: `✅ Deleted **${deleted.size}** message(s).`, flags: MessageFlags.Ephemeral });
  }

  if (command === 'slowmode') {
    const seconds = interaction.options.getInteger('seconds', true);
    if (!interaction.channel.setRateLimitPerUser) throw new Error('Slowmode cannot be changed in this channel.');
    await interaction.channel.setRateLimitPerUser(seconds, `Changed by ${interaction.user.tag}`);
    await sendModLog(interaction.guild, 'Slowmode Updated', [
      { name: 'Channel', value: `${interaction.channel}`, inline: true },
      { name: 'Delay', value: seconds ? `${seconds} second(s)` : 'Disabled', inline: true },
      { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
    ]);
    return interaction.reply({ content: seconds ? `✅ Slowmode set to **${seconds} seconds**.` : '✅ Slowmode disabled.', flags: MessageFlags.Ephemeral });
  }

  if (command === 'lock' || command === 'unlock') {
    if (!interaction.channel.permissionOverwrites) throw new Error('This channel cannot be locked.');
    const reason = interaction.options.getString('reason') || `${command === 'lock' ? 'Locked' : 'Unlocked'} by staff.`;
    const locked = command === 'lock';
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: locked ? false : null }, { reason });
    if (locked) config.moderation.lockedChannels[interaction.channelId] = 'manual';
    else delete config.moderation.lockedChannels[interaction.channelId];
    await saveConfig();
    await sendModLog(interaction.guild, locked ? 'Channel Locked' : 'Channel Unlocked', [
      { name: 'Channel', value: `${interaction.channel}`, inline: true },
      { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
      { name: 'Reason', value: reason },
    ], locked ? 0xE67E22 : 0x57C785);
    return interaction.reply({ content: locked ? '🔒 This channel has been locked.' : '🔓 This channel has been unlocked.' });
  }
}

async function handleConfig(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'welcome') {
    const channel = interaction.options.getChannel('channel', true);
    config.welcome.channelId = channel.id;
    await saveConfig();
    return interaction.editReply({ embeds: [baseEmbed().setTitle('Welcome Messages Configured').setDescription(`New member welcomes will now be sent in ${channel}.`)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'qotd') {
    const channel = interaction.options.getChannel('channel', true);
    const role = interaction.options.getRole('role', true);
    const time = interaction.options.getString('time') || '18:00';
    validateTime(time);
    config.qotd = { ...config.qotd, channelId: channel.id, roleId: role.id, time };
    await saveConfig();
    return interaction.editReply({ embeds: [baseEmbed().setTitle('Question of the Day Configured').setDescription(`A random question will post in ${channel} every day at **${time} UK time**, pinging ${role}.`)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'birthdays') {
    const channel = interaction.options.getChannel('channel', true);
    config.birthdays.channelId = channel.id;
    await saveConfig();
    return interaction.editReply({ content: `✅ Birthday announcements will be posted in ${channel}.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'milestones') {
    const channel = interaction.options.getChannel('channel', true);
    config.milestones.channelId = channel.id;
    await saveConfig();
    return interaction.editReply({ content: `✅ Member milestones will be posted in ${channel}.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'leveling') {
    config.leveling.enabled = interaction.options.getBoolean('enabled', true);
    await saveConfig();
    return interaction.editReply({ content: `✅ Leveling is now **${config.leveling.enabled ? 'enabled' : 'disabled'}**.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'moderation') {
    config.moderation.enabled = interaction.options.getBoolean('enabled', true);
    await saveConfig();
    return interaction.editReply({ content: `✅ Automatic moderation is now **${config.moderation.enabled ? 'enabled' : 'disabled'}**.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'modlogs') {
    const channel = interaction.options.getChannel('channel', true);
    config.moderation.logChannelId = channel.id;
    await saveConfig();
    return interaction.editReply({ content: `✅ Moderation actions will be logged in ${channel}.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'antispam') {
    const settings = config.moderation.antispam;
    settings.enabled = interaction.options.getBoolean('enabled', true);
    settings.messages = interaction.options.getInteger('messages') || settings.messages;
    settings.seconds = interaction.options.getInteger('seconds') || settings.seconds;
    settings.timeoutMinutes = interaction.options.getInteger('timeout') || settings.timeoutMinutes;
    await saveConfig();
    return interaction.editReply({ content: `✅ Anti-spam is **${settings.enabled ? 'enabled' : 'disabled'}** — ${settings.messages} messages in ${settings.seconds}s triggers a ${settings.timeoutMinutes}-minute timeout.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'links' || subcommand === 'invites') {
    const enabled = interaction.options.getBoolean('enabled', true);
    config.moderation[subcommand].enabled = enabled;
    await saveConfig();
    return interaction.editReply({ content: `✅ ${subcommand === 'links' ? 'Regular link' : 'Discord invite'} blocking is now **${enabled ? 'enabled' : 'disabled'}**.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'raid-protection') {
    const settings = config.moderation.raid;
    settings.enabled = interaction.options.getBoolean('enabled', true);
    settings.joins = interaction.options.getInteger('joins') || settings.joins;
    settings.seconds = interaction.options.getInteger('seconds') || settings.seconds;
    settings.lockdownMinutes = interaction.options.getInteger('lockdown') || settings.lockdownMinutes;
    await saveConfig();
    return interaction.editReply({ content: `✅ Raid protection is **${settings.enabled ? 'enabled' : 'disabled'}** — ${settings.joins} joins in ${settings.seconds}s triggers a ${settings.lockdownMinutes}-minute lockdown.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'account-age') {
    const settings = config.moderation.accountAge;
    settings.enabled = interaction.options.getBoolean('enabled', true);
    settings.minimumDays = interaction.options.getInteger('days') ?? settings.minimumDays;
    settings.action = interaction.options.getString('action') || settings.action;
    await saveConfig();
    return interaction.editReply({ content: `✅ New-account protection is **${settings.enabled ? 'enabled' : 'disabled'}** — accounts under ${settings.minimumDays} day(s) will receive action: **${settings.action}**.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'add-color' || subcommand === 'add-ping') {
    const role = interaction.options.getRole('role', true);
    validateAssignableRole(interaction.guild, role);
    const isColour = subcommand === 'add-color';
    const target = isColour ? config.colours : config.pings;
    const other = isColour ? config.pings : config.colours;
    const limit = isColour ? 24 : 25;
    if (target.some((item) => item.id === role.id)) throw new Error(`**${role.name}** is already configured there.`);
    if (other.some((item) => item.id === role.id)) throw new Error(`**${role.name}** is already being used in the other role menu.`);
    if (target.length >= limit) throw new Error(`Discord allows a maximum of ${limit} roles in this menu.`);
    const name = interaction.options.getString('name')?.trim() || role.name;
    const emoji = interaction.options.getString('emoji')?.trim() || (isColour ? '🎨' : '🔔');
    const item = { id: role.id, name, emoji };
    if (!isColour) item.description = interaction.options.getString('description')?.trim() || `Receive ${name} notifications`;
    target.push(item);
    await saveConfig();
    await refreshPanel(interaction.guild);
    return interaction.editReply({ embeds: [baseEmbed().setTitle(isColour ? 'Color Role Added' : 'Ping Role Added').setDescription(`${emoji} ${role} now appears as **${name}** in the role menu.`)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'remove-color' || subcommand === 'remove-ping') {
    const role = interaction.options.getRole('role', true);
    const isColour = subcommand === 'remove-color';
    const key = isColour ? 'colours' : 'pings';
    const before = config[key].length;
    config[key] = config[key].filter((item) => item.id !== role.id);
    if (config[key].length === before) throw new Error(`**${role.name}** is not configured in that menu.`);
    await saveConfig();
    await refreshPanel(interaction.guild);
    return interaction.editReply({ content: `✅ Removed **${role.name}** from the ${isColour ? 'color' : 'ping'} menu.`, flags: MessageFlags.Ephemeral });
  }
  if (subcommand === 'clear') {
    const section = interaction.options.getString('section', true);
    if (section === 'everything' || section === 'colours') config.colours = [];
    if (section === 'everything' || section === 'pings') config.pings = [];
    await saveConfig();
    await refreshPanel(interaction.guild);
    return interaction.editReply({ content: '✅ The selected configuration has been cleared.', flags: MessageFlags.Ephemeral });
  }
  const colourList = config.colours.length ? config.colours.map((item) => `${item.emoji || '🎨'} <@&${item.id}>`).join('\n') : '*Not configured.*';
  const pingList = config.pings.length ? config.pings.map((item) => `${item.emoji || '🔔'} <@&${item.id}>`).join('\n') : '*Not configured.*';
  return interaction.editReply({
    embeds: [baseEmbed().setTitle('Room 7 Configuration').addFields(
      { name: `🎨 Color Roles (${config.colours.length})`, value: colourList, inline: true },
      { name: `🔔 Ping Roles (${config.pings.length})`, value: pingList, inline: true },
      { name: '👋 Welcome Channel', value: config.welcome.channelId ? `<#${config.welcome.channelId}>` : '*Not configured.*' },
      { name: '❓ Question of the Day', value: config.qotd.channelId ? `<#${config.qotd.channelId}> • <@&${config.qotd.roleId}> • **${config.qotd.time} UK**` : '*Not configured.*' },
      { name: '🛡️ Moderation', value: `AutoMod: **${config.moderation.enabled ? 'On' : 'Off'}**\nLogs: ${config.moderation.logChannelId ? `<#${config.moderation.logChannelId}>` : '*Not configured*'}\nAnti-spam: **${config.moderation.antispam.enabled ? 'On' : 'Off'}**\nLinks: **${config.moderation.links.enabled ? 'Blocked' : 'Allowed'}** • Invites: **${config.moderation.invites.enabled ? 'Blocked' : 'Allowed'}**` },
      { name: '🚨 Security', value: `Raid protection: **${config.moderation.raid.enabled ? 'On' : 'Off'}**\nNew-account check: **${config.moderation.accountAge.enabled ? `${config.moderation.accountAge.minimumDays}+ days (${config.moderation.accountAge.action})` : 'Off'}**` },
      { name: '✨ Community', value: `Leveling: **${config.leveling.enabled ? 'On' : 'Off'}**\nAutoresponders: **${config.autoresponders.length}**\nBirthdays: ${config.birthdays.channelId ? `<#${config.birthdays.channelId}>` : '*Not configured*'}\nMilestones: ${config.milestones.channelId ? `<#${config.milestones.channelId}>` : '*Not configured*'}` },
    )],
    files: [makeBanner()],
    flags: MessageFlags.Ephemeral,
  });
}

async function openPrivateRoleSelector(interaction, type) {
  const isColour = type === 'colour';
  const items = isColour ? config.colours : config.pings;

  // Acknowledge the button immediately so Discord does not expire the interaction.
  if (!await safelyDeferReply(interaction, { flags: MessageFlags.Ephemeral })) return;

  if (!items.length) {
    return interaction.editReply({ content: `No ${isColour ? 'color' : 'ping'} roles have been configured yet.` });
  }

  // Refresh the member so the selected/default roles are always accurate.
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
  return interaction.editReply({
    embeds: [baseEmbed()
      .setTitle(isColour ? 'Choose Your Color' : 'Choose Your Notifications')
      .setDescription(isColour
        ? 'Select one color below. Choosing another automatically replaces your current one.'
        : 'Select every notification you want. Clear your selections to remove all ping roles.')],
    components: [isColour ? colourMenu(member) : pingMenu(member)],
    files: [makeBanner()],
  });
}

async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`Registered ${commands.length} guild command(s).`);
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({ activities: [{ name: BOT_STATUS }], status: 'online' });
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.roles.fetch();
    await guild.channels.fetch();
    await ensureDataStore(guild);
    await deployCommands();
    if (qotdTimer) clearInterval(qotdTimer);
    if (communityTimer) clearInterval(communityTimer);
    if (lastToLeaveTimer) clearInterval(lastToLeaveTimer);
    qotdTimer = setInterval(checkQotdSchedule, 30_000);
    communityTimer = setInterval(() => checkBirthdays().catch(console.error), 60_000);
    lastToLeaveTimer = setInterval(() => processLastToLeaveSchedule().catch((error) => console.error('Last to Leave scheduler error:', error)), 15_000);
    await checkQotdSchedule();
    await checkBirthdays();
    await restoreGiveaways();
    await processLastToLeaveSchedule();
    console.log('Room 7 systems loaded successfully.');
  } catch (error) {
    console.error('Startup setup failed:', error);
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    if (member.guild.id !== GUILD_ID) return;

    if (config.moderation.enabled) {
      const now = Date.now();
      const ageDays = Math.floor((now - member.user.createdTimestamp) / 86_400_000);
      const accountSettings = config.moderation.accountAge;
      if (accountSettings.enabled && ageDays < accountSettings.minimumDays) {
        await sendModLog(member.guild, '⚠️ New Account Joined', [
          { name: 'Member', value: `${member.user.tag} (${member.id})`, inline: true },
          { name: 'Account Age', value: `${ageDays} day(s)`, inline: true },
          { name: 'Configured Action', value: accountSettings.action, inline: true },
          { name: 'Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>` },
        ], 0xF0B35A);
        if (accountSettings.action === 'timeout' && member.moderatable) {
          await member.timeout(86_400_000, `Account younger than ${accountSettings.minimumDays} day(s)`).catch(() => null);
        } else if (accountSettings.action === 'kick' && member.kickable) {
          await notifyUser(member.user, 'Room 7 account-age protection', `Your Discord account is under **${accountSettings.minimumDays} day(s)** old. Please try joining again when your account is older.`);
          await member.kick(`Account younger than ${accountSettings.minimumDays} day(s)`).catch(() => null);
          return;
        }
      }

      const raid = config.moderation.raid;
      if (raid.enabled) {
        recentJoins.push(now);
        while (recentJoins.length && recentJoins[0] < now - raid.seconds * 1000) recentJoins.shift();
        if (recentJoins.length >= raid.joins) await triggerRaidLockdown(member.guild);
      }
    }

    if (config.welcome.channelId) {
      const channel = await member.guild.channels.fetch(config.welcome.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({ content: `${member}`, embeds: [welcomeEmbed(member)], files: [makeBanner()], allowedMentions: { users: [member.id] } });
      }
    }
    await announceMilestone(member.guild);
  } catch (error) {
    console.error('Member join handling error:', error);
  }
});

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.guild.id !== GUILD_ID || message.author.bot) return;

    if (!message.member) return;
    const bypassModeration = !config.moderation.enabled || isStaff(message.member);
    if (bypassModeration) {
      await awardXp(message);
      const auto = autoresponderMatch(message.content || '');
      if (auto) await message.reply({ content: auto.response, allowedMentions: { repliedUser: false, parse: [] } }).catch(() => null);
      return;
    }

    const content = message.content || '';
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    const mass = config.moderation.massMentions;
    if (mass.enabled && mentionCount >= mass.limit) {
      await deleteAndExplain(message, `mass mentions are not allowed. You have been timed out for ${mass.timeoutMinutes} minutes.`);
      if (message.member.moderatable) await message.member.timeout(mass.timeoutMinutes * 60_000, 'Room 7 AutoMod: mass mentions').catch(() => null);
      await addWarning(message.guild, message.author, null, `Mass mentioning ${mentionCount} users/roles`, 'AutoMod: mass mentions');
      return;
    }

    if (config.moderation.invites.enabled && invitePattern.test(content)) {
      await deleteAndExplain(message, 'Discord invite links are not allowed here.');
      await addWarning(message.guild, message.author, null, 'Posted a Discord invite link', 'AutoMod: invite filter');
      return;
    }

    if (config.moderation.links.enabled && urlPattern.test(content)) {
      await deleteAndExplain(message, 'links are currently blocked in this server.');
      await sendModLog(message.guild, 'Link Blocked', [
        { name: 'Member', value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: 'Channel', value: `${message.channel}`, inline: true },
        { name: 'Content', value: content },
      ], 0xF0B35A);
      return;
    }

    const spam = config.moderation.antispam;
    if (spam.enabled) {
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const entry = spamTracker.get(key) || [];
      entry.push({ time: now, content: content.trim().toLowerCase() });
      const recent = entry.filter((item) => item.time >= now - spam.seconds * 1000);
      spamTracker.set(key, recent);
      const repeated = recent.length >= 4 && recent.slice(-4).every((item) => item.content && item.content === recent[recent.length - 1].content);
      if (recent.length >= spam.messages || repeated) {
        spamTracker.delete(key);
        const fetched = await message.channel.messages.fetch({ limit: 25 }).catch(() => null);
        if (fetched) {
          const matching = fetched.filter((item) => item.author.id === message.author.id && item.createdTimestamp >= now - spam.seconds * 1000);
          await message.channel.bulkDelete(matching, true).catch(() => null);
        } else {
          await message.delete().catch(() => null);
        }
        if (message.member.moderatable) await message.member.timeout(spam.timeoutMinutes * 60_000, 'Room 7 AutoMod: spam').catch(() => null);
        await addWarning(message.guild, message.author, null, 'Spam or repeated-message flooding', 'AutoMod: anti-spam');
        const notice = await message.channel.send({ content: `${message.author}, spam is not allowed. You have been timed out for ${spam.timeoutMinutes} minutes.`, allowedMentions: { users: [message.author.id] } }).catch(() => null);
        if (notice) setTimeout(() => notice.delete().catch(() => null), 7000);
        return;
      }
    }

    await awardXp(message);
    const auto = autoresponderMatch(content);
    if (auto) await message.reply({ content: auto.response, allowedMentions: { repliedUser: false, parse: [] } }).catch(() => null);
  } catch (error) {
    console.error('Message handling error:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'lasttoleave') return handleLastToLeaveCommand(interaction);
      if (interaction.commandName === 'config') {
        if (!await safelyDeferReply(interaction, { flags: MessageFlags.Ephemeral })) return;
        return handleConfig(interaction);
      }
      if (['autorespond', 'rank', 'leaderboard', 'rep', 'reputation', 'birthday', 'event', 'giveaway', 'serverstats', 'media'].includes(interaction.commandName)) {
        return handleCommunityCommand(interaction);
      }
      if (interaction.commandName === 'setup') {
        const sub = interaction.options.getSubcommand();
        if (!await safelyDeferReply(interaction, { flags: MessageFlags.Ephemeral })) return;
        if (sub === 'roles') {
          if (!config.colours.length && !config.pings.length) return interaction.editReply('Add roles first with `/config add-color` and `/config add-ping`.');
          const message = await interaction.channel.send({ embeds: [rolePanelEmbed()], components: [panelButtons()], files: [makeBanner()] });
          config.panel = { channelId: interaction.channelId, messageId: message.id };
          await saveConfig();
          return interaction.editReply('✅ The official role panel has been posted.');
        }
        if (sub === 'rules') {
          await interaction.channel.send({ embeds: [rulesEmbed()], files: [makeBanner()] });
          return interaction.editReply('✅ The rules embed has been posted.');
        }
        if (sub === 'about') {
          await interaction.channel.send({ embeds: [aboutEmbed(interaction.guild)], files: [makeBanner()] });
          return interaction.editReply('✅ The About Room 7 embed has been posted.');
        }
      }
      if (interaction.commandName === 'qotd') {
        if (!await safelyDeferReply(interaction, { flags: MessageFlags.Ephemeral })) return;
        await postQotd(interaction.guild, interaction.channelId);
        return interaction.editReply('✅ A Question of the Day has been posted here.');
      }
      if (['warn', 'warnings', 'clearwarnings', 'timeout', 'untimeout', 'kick', 'ban', 'unban', 'purge', 'slowmode', 'lock', 'unlock'].includes(interaction.commandName)) {
        return handleModerationCommand(interaction);
      }
      if (interaction.commandName === 'sendportal') {
        if (!await safelyDeferReply(interaction, { flags: MessageFlags.Ephemeral })) return;
        await interaction.channel.send({
          content: '@here',
          embeds: [portalEmbed()],
          allowedMentions: { parse: ['everyone'] },
        });
        return interaction.editReply('✅ The Beloved portal advertisement has been posted.');
      }
      if (interaction.commandName === 'roles') return interaction.reply({ embeds: [rolePanelEmbed()], components: [panelButtons()], files: [makeBanner()], flags: MessageFlags.Ephemeral });
      if (interaction.commandName === 'help') return interaction.reply({ embeds: [baseEmbed().setTitle('Room 7 Bot Commands').addFields(
        { name: 'Member Commands', value: '`/roles` • `/rank` • `/leaderboard`\n`/rep` • `/reputation` • `/birthday`\n`/serverstats` • `/media nominate` • `/ping`' },
        { name: 'Staff Setup', value: '`/config add-color` • `/config add-ping`\n`/config welcome` • `/config qotd`\n`/config list` • `/setup roles`\n`/setup rules` • `/setup about`\n`/qotd post` — Post a question now' },
        { name: 'Moderation', value: '`/warn` • `/warnings` • `/clearwarnings`\n`/timeout` • `/untimeout` • `/kick` • `/ban` • `/unban`\n`/purge` • `/slowmode` • `/lock` • `/unlock`' },
        { name: 'Security Setup', value: '`/config modlogs` • `/config moderation`\n`/config antispam` • `/config links` • `/config invites`\n`/config raid-protection` • `/config account-age`' },
        { name: 'Community Setup', value: '`/autorespond add` • `/autorespond remove` • `/autorespond list`\n`/config leveling` • `/config birthdays` • `/config milestones`\n`/event` • `/giveaway` • `/media pick` • `/sendportal`' },
        { name: 'Last to Leave Event', value: '`/lasttoleave setup` • `/lasttoleave start` • `/lasttoleave status`\n`/lasttoleave check-now` • `/lasttoleave pause` • `/lasttoleave resume`\n`/lasttoleave eliminate` • `/lasttoleave restore` • `/lasttoleave end`' },
      )], files: [makeBanner()], flags: MessageFlags.Ephemeral });
      if (interaction.commandName === 'ping') return interaction.reply({ embeds: [baseEmbed().setTitle('Room 7 is Online').setDescription(`Everything is working normally.\n\n**Response time:** ${client.ws.ping}ms`)], files: [makeBanner()], flags: MessageFlags.Ephemeral });
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('lasttoleave_active:')) {
        if (!await safelyDeferReply(interaction, { flags: MessageFlags.Ephemeral })) return;
        const settings = lastToLeaveSettings();
        const checkNumber = Number(interaction.customId.split(':')[1]);
        const check = settings.currentCheck;
        if (!settings.active || !check || check.closed || check.number !== checkNumber) return interaction.editReply('This activity check is no longer active.');
        if (Date.now() >= check.endsAt) {
          await closeActivityCheck(interaction.guild, 'expired button click');
          return interaction.editReply('This activity check has just closed.');
        }
        if (!check.eligible.includes(interaction.user.id) || !settings.contestants.includes(interaction.user.id)) return interaction.editReply('You are not an eligible contestant for this activity check.');
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member || member.voice.channelId !== settings.voiceChannelId) return interaction.editReply('You must be inside the event VC when you press the button.');
        if (check.responded.includes(interaction.user.id)) return interaction.editReply('✅ You already passed this activity check.');
        check.responded.push(interaction.user.id);
        await saveConfig();
        await updateActivityCheckMessage(interaction.guild, false);
        return interaction.editReply(`✅ You passed Activity Check #${check.number}.`);
      }
      if (interaction.customId.startsWith('giveaway_enter:')) {
        const messageId = interaction.customId.split(':')[1];
        const data = config.giveaways[messageId];
        if (!data || data.ended) return interaction.reply({ content: 'This giveaway has already ended.', flags: MessageFlags.Ephemeral });
        data.entrants = Array.isArray(data.entrants) ? data.entrants : [];
        if (data.entrants.includes(interaction.user.id)) {
          data.entrants = data.entrants.filter((id) => id !== interaction.user.id);
          await saveConfig();
          return interaction.reply({ content: 'You have left the giveaway.', flags: MessageFlags.Ephemeral });
        }
        data.entrants.push(interaction.user.id);
        await saveConfig();
        return interaction.reply({ content: `🎉 You entered the giveaway for **${data.prize}**!`, flags: MessageFlags.Ephemeral });
      }
      if (interaction.customId === 'room7_open_ping_roles') return openPrivateRoleSelector(interaction, 'ping');
      if (interaction.customId === 'room7_open_colour_roles') return openPrivateRoleSelector(interaction, 'colour');
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'room7_colour_roles') {
        if (!await safelyDeferUpdate(interaction)) return;
        const selected = interaction.values[0];
        const allIds = config.colours.map((item) => item.id);
        const removeIds = allIds.filter((id) => interaction.member.roles.cache.has(id));
        const addIds = selected === 'remove_colour' ? [] : [selected];
        await safeRoleUpdate(interaction.member, removeIds, addIds);
        const item = config.colours.find((entry) => entry.id === selected);
        return interaction.editReply({ embeds: [baseEmbed().setTitle(item ? 'Color Updated' : 'Color Removed').setDescription(item ? `${item.emoji || '🎨'} Your color is now **${item.name}**.` : '🗑️ Your color role has been removed.')], components: [colourMenu(interaction.member)], files: [makeBanner()] });
      }
      if (interaction.customId === 'room7_ping_roles') {
        if (!await safelyDeferUpdate(interaction)) return;
        const allIds = config.pings.map((item) => item.id);
        const selectedIds = interaction.values;
        const currentIds = allIds.filter((id) => interaction.member.roles.cache.has(id));
        await safeRoleUpdate(interaction.member, currentIds.filter((id) => !selectedIds.includes(id)), selectedIds.filter((id) => !interaction.member.roles.cache.has(id)));
        const names = config.pings.filter((item) => selectedIds.includes(item.id)).map((item) => `${item.emoji || '🔔'} ${item.name}`);
        return interaction.editReply({ embeds: [baseEmbed().setTitle('Ping Roles Updated').setDescription(names.length ? `You will now receive:\n${names.map((name) => `• **${name}**`).join('\n')}` : '🔕 All of your ping roles have been removed.')], components: [pingMenu(interaction.member)], files: [makeBanner()] });
      }
    }
  } catch (error) {
    if (isUnknownInteraction(error)) {
      console.warn(`Ignored expired interaction ${interaction.id}.`);
      return;
    }
    console.error('Interaction error:', error);
    const message = `❌ ${error.message || 'Something went wrong.'}`;
    if (interaction.deferred) await interaction.editReply({ content: message, embeds: [], components: [], files: [] }).catch(() => null);
    else if (interaction.replied) await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
  }
});

client.on('error', (error) => console.error('Discord client error:', error));
process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

const app = express();
app.get('/', (_req, res) => res.status(200).send(`Room 7 bot is ${client.isReady() ? 'online' : 'starting'}.`));
app.listen(PORT, () => console.log(`Health server listening on port ${PORT}.`));
client.login(TOKEN);
