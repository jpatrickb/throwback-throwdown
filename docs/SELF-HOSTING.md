# Self-hosting Throwback Throwdown

The whole game runs on **one computer**, usually the laptop plugged into the TV. That computer serves
the TV screen, the phones and the photos. No cloud account or database is needed.

## Requirements

- **Node.js 22.9 or newer** and npm
- A computer connected to the TV by HDMI. Its browser shows `/tv`.
- Optional: [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/),
  so phones can join over cellular or from any network

```sh
git clone https://github.com/jpatrickb/throwback-throwdown.git
cd throwback-throwdown
npm install
cp .env.example .env    # optional; every setting has a default
```

## Choose how phones reach the game

### Option A: same wifi (simplest, no setup)

```sh
npm run party
```

The QR code on the TV points at the computer's local address (for example `http://192.168.1.20:3000`).
Every phone must be on the **same wifi** as the computer.

Office and hotel networks often block devices from talking to each other ("client isolation"). If phones
can't load the page, use a tunnel, or put everyone on a phone hotspot or travel router.

### Option B: Cloudflare quick tunnel (no account, no domain)

```sh
npm run tunnel:quick     # terminal 1: prints a https://<random>.trycloudflare.com URL
```

Copy that URL into `.env` as `PUBLIC_URL=https://<random>.trycloudflare.com`, then:

```sh
npm run party            # terminal 2
```

Phones can now join on wifi or cellular. The URL changes every time you restart the tunnel, which is fine
because the QR code on the TV always shows the current one. Quick tunnels have no uptime guarantee, so for
the real party, a named tunnel is better.

### Option C: Cloudflare named tunnel on your own domain (recommended for the real game)

You need a free Cloudflare account and a domain on Cloudflare DNS. One-time setup:

```sh
cloudflared tunnel login                                   # pick your domain in the browser
cloudflared tunnel create party
cloudflared tunnel route dns party party.yourdomain.com
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <the tunnel id printed by `create`>
credentials-file: /Users/<you>/.cloudflared/<tunnel id>.json
ingress:
  - hostname: party.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

In `.env`, set `PUBLIC_URL=https://party.yourdomain.com`. Then each time you play:

```sh
npm run party     # terminal 1
npm run tunnel    # terminal 2 (runs the tunnel named in TUNNEL_NAME, default "party")
```

The tunnel credentials stay in `~/.cloudflared/`. Never commit them.

## Configuration (`.env`)

| Variable | Default | What it does |
|---|---|---|
| `PUBLIC_URL` | unset (uses the local address) | The address phones use, encoded in the TV's QR code |
| `HOST_PIN` | random 6 digits | The PIN for `/host`. It's printed at startup and kept across restarts. |
| `ROOM_CODE` | random 4 letters | The code players type if they don't scan the QR |
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `data` | Where photos (`data/photos/`) and the saved game (`data/state.json`) live |
| `TUNNEL_NAME` | `party` | The named tunnel `npm run tunnel` runs |

`RESET_STATE=1` (set on the command line) starts a brand-new game and ignores the saved one.

## Photos

Two ways, which you can mix:

- **The host uploads from their phone:** on `/host`, open **Photo queue**, tap **Add photos**, and pick several at once.
  Photos are resized on the phone before upload. iPhone photos are converted to JPEG automatically.
  The host can add more mid-game.
- **Preload a folder:** put JPEG, PNG or WebP files in `data/photos/` before starting. They're queued in filename
  order, so name them `01 - ….jpg`, `02 - ….jpg`, and so on. HEIC files in the folder are skipped (convert them first).

## Starting fresh vs. resuming

The server saves the game after every change.

- **Restart after a crash or a closed terminal:** run `npm run party` again. You get the same room code, PIN,
  players, teams and scores, and phones reconnect by themselves.
- **A new game with no leftovers from testing:** run `npm run fresh`. It moves old photos and the saved game into
  `data/archive/<time>/` (nothing is deleted), then starts a clean game. If you're preloading photos, run
  `npx tsx scripts/fresh.ts` first, then add your photos, then start with `RESET_STATE=1 npm run party`.

## Game day

- Before guests arrive: start the server and tunnel, open `/tv` fullscreen, and click **"Click to start the party!"**
  (browsers need one click before they'll play sound).
- Join once on wifi and once on cellular to be sure both work.
- Keep the laptop awake: on macOS run `caffeinate -dis` in another terminal, and turn on Do Not Disturb.
- On the TV, press `S` for settings: theme, music and sound-effect volume, fullscreen, and the backup join address.

The full rehearsal checklist and troubleshooting table are in [DEVICE-CHECKLIST.md](DEVICE-CHECKLIST.md), and
there's a one-page guide for the host in [HOST-CHEATSHEET.md](HOST-CHEATSHEET.md).

## Troubleshooting

| Problem | Fix |
|---|---|
| Phones can't load the page on the same wifi | The network probably isolates devices. Use a tunnel (option B or C) or a hotspot. |
| The QR code shows the wrong address | Set `PUBLIC_URL` in `.env` and restart `npm run party`. |
| No sound on the TV | Click the start overlay on `/tv`, check that the computer's audio output is the TV, and press `M` to toggle mute. |
| The host is locked out ("Too many tries") | Wait a minute. The PIN is printed in the server terminal. |
| You need to change the PIN or room code | Set `HOST_PIN` / `ROOM_CODE` in `.env` and restart. |
