# Room 7 Discord Bot

A Render-ready Discord bot with one polished role panel for Room 7.

## Commands

- `/setuproles` — Staff-only command that posts the public role panel.
- `/roles` — Opens the role panel privately for the member.
- `/help` — Shows the command guide.
- `/ping` — Shows the bot response time.

The public panel contains two buttons:

- **Get your Ping Roles**
- **Get your Color Roles**

Each button opens a private select menu, keeping the roles channel clean.

## Render

- Build command: `npm install`
- Start command: `npm start`

Copy every value from `.env.example` into Render's Environment section.

## Discord permissions

The bot needs:

- View Channels
- Send Messages
- Embed Links
- Attach Files
- Manage Roles
- Use Application Commands

Move the bot's Discord role above every color and ping role it needs to assign.
