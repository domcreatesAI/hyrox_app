# Race Day CRM

A small CRM for race-day media clients (Hyrox, Deadly Dozen and similar). It keeps each client's start time, package, price, deposit, balance, music and notes in one place, and writes every booking into Google Calendar.

Runs as an installable app on desktop (Chrome / Edge → *Install app*) and on phone (*Add to Home Screen*). It's a single web app (React + TypeScript + Vite PWA) with no server.

## What it does

- **Races**: each race weekend (e.g. *HYROX Berlin, 29–31 May*) has its own time zone, so start times land correctly in your calendar when you travel.
- **Run sheet per race**: clients grouped by day and sorted by start time. When start waves are announced, type each time straight into the table. Click a payment badge to mark the deposit or balance as paid. Use **Print run sheet** for a paper copy on the day.
- **Bookings**: client and partner, Instagram, contact details, division, wave, start time, package and add-ons (price fills in automatically and can be changed), deposit paid and date, balance paid, music (track, artist, link, or just a style), notes, and status (enquiry → booked → filmed → delivered).
- **Meet time and meet point**: each booking can have its own meet time (e.g. 09:15 by the warm-up area). Leave it blank and it defaults to 45 minutes before their start (change this in Settings). The calendar entry runs from meet time until 2 hours after the start.
- **Message templates** in your own voice: booking + deposit request, deposit reminder, start times are out, music check, race-day plan, follow-up, content delivered. They fill in the client's name, race, start and meet time, package, deposit and balance. Then **Copy**, or open **Instagram** (message copied for you to paste), **WhatsApp**, **Text** or **Email**. From a race page, **Message clients** pre-selects who needs it (e.g. everyone without a start time) so you can work down the list. Each booking keeps a history of what was sent. Edit or add templates in Settings.
- **Dashboard**: deposits outstanding, money to collect on race days, and a *Needs attention* list (no deposit, start time missing within 10 days of the race, no music within 3 weeks, not yet synced).
- **Google Calendar sync**: one entry per client, coloured red (no deposit), yellow (deposit paid, balance due) or green (paid in full). The description holds the package, money, music, Instagram handle and notes. The entry runs from meet time and the title shows the start time. Clients without a start time show as all-day *start TBC* entries until you add one.
- **Import from Google Calendar**: pull in race weekends and any clients you already added to the calendar.
- **Laptop ↔ phone sync** through a private app-only file in your Google Drive.
- **Backup / export**: JSON backup and restore, and CSV export for spreadsheets or accounts.

Packages are pre-filled from the current price list (Race Photos £120, Content Pack £180, Highlights Reel £200, Raw clip pack add-on £50, £50 deposit). Edit them in **Settings**.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Build for production:

```bash
npm run build      # outputs dist/
npm run preview    # serve the build at http://localhost:4173
```

### Install as a desktop app
Open the app in Chrome or Edge and click the install icon in the address bar (or menu → *Install Race Day CRM*). It then opens in its own window and works offline.

### Use it on your phone
The phone needs the app at a web address. Host the `dist/` folder anywhere static, for example Netlify (drag `dist/` onto app.netlify.com/drop), Vercel, Cloudflare Pages or GitHub Pages. Open that address on the phone and choose *Add to Home Screen*. Add the address to your Google OAuth client's *Authorised JavaScript origins* (see below).

## Google Calendar setup (one-time)

The app talks to Google directly from your browser, so you need your own free OAuth Client ID:

1. In [Google Cloud Console](https://console.cloud.google.com/projectcreate), create a project.
2. Enable the **Google Calendar API** and the **Google Drive API** (Drive is only used for laptop ↔ phone sync).
3. Under **Google Auth Platform**, configure the consent screen as *External* and add your own Google account as a **test user**.
4. Under **Clients**, create an OAuth client of type **Web application**. Add every address you'll open the app from to **Authorised JavaScript origins**, e.g. `http://localhost:5173`, `http://localhost:4173` and your hosted URL.
5. Paste the Client ID into **Settings → Google Calendar** in the app and click **Connect Google**.

Google will warn *"Google hasn't verified this app"*. That's normal for a private app you made yourself: choose **Continue**.

Optional: put the Client ID in a `.env` file as `VITE_GOOGLE_CLIENT_ID=...` (see `.env.example`) so it's built in.

Permissions requested: create/edit calendar events, list your calendars (to choose which calendar to use), and a private app-data folder in Drive. The app can't see your other Drive files.

## Where data lives

All data is kept in the browser's local database (IndexedDB) on each device. Use **Settings → Laptop ↔ phone sync** to keep devices in step, and **Download backup** now and then. Clearing the browser's site data deletes the local copy.

## Project layout

```
src/
  types.ts              data model (Booking, RaceEvent, Package, Settings)
  db.ts                 IndexedDB (Dexie) + default packages
  lib/google.ts         Google sign-in (Identity Services token flow)
  lib/calendar.ts       Calendar entry format + create/update/delete/list
  lib/drive.ts          Drive app-folder sync and record-level merge
  lib/data.ts           saving bookings/races + calendar auto-sync
  lib/backup.ts         JSON backup/restore, CSV export
  lib/templates.ts      message templates, placeholder filling, Instagram/WhatsApp/SMS/email links
  components/           booking & race editors, toasts, UI bits
  pages/                Dashboard, Races, RaceDetail (run sheet), Clients, Import, Settings
```
