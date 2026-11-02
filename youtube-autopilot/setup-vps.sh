#!/usr/bin/env bash
# One-time setup for an Ubuntu 24.04 server (e.g. a $6/month DigitalOcean droplet).
# Run as root:  bash setup-vps.sh
# Afterwards, copy your config files in (see README) and the autopilot runs every day by itself.
set -euo pipefail

APP=/opt/youtube
AGENT=$APP/youtube-automation-agent
AUTOPILOT=$APP/youtube-autopilot
RUN_AT="${RUN_AT:-15:00}"   # daily run time, server timezone (UTC by default)

apt-get update
apt-get install -y curl git ca-certificates fonts-dejavu-core
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "$APP"
[ -d "$AGENT" ] || git clone --depth 1 https://github.com/darkzOGx/youtube-automation-agent.git "$AGENT"
cd "$AGENT"
npm install
npx playwright install --with-deps chromium

# The autopilot lives next to the agent. Copy this folder here before running (see README).
if [ ! -f "$AUTOPILOT/autopilot.js" ]; then
  echo "Copy the youtube-autopilot folder to $AUTOPILOT, then re-run this script." >&2
  exit 1
fi

cat >/etc/systemd/system/youtube-agent.service <<EOF
[Unit]
Description=YouTube automation agent
After=network-online.target

[Service]
WorkingDirectory=$AGENT
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/youtube-autopilot.service <<EOF
[Unit]
Description=Make and publish one animated video
After=youtube-agent.service
Wants=youtube-agent.service

[Service]
Type=oneshot
WorkingDirectory=$AUTOPILOT
Environment=AGENT_DIR=$AGENT
Environment=STATE_DIR=$AUTOPILOT/state
Environment=AGENT_RESTART_CMD=systemctl restart youtube-agent
ExecStart=/usr/bin/node autopilot.js
TimeoutStartSec=3h
EOF

cat >/etc/systemd/system/youtube-autopilot.timer <<EOF
[Unit]
Description=Daily animated video

[Timer]
OnCalendar=*-*-* $RUN_AT:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now youtube-agent.service
systemctl enable --now youtube-autopilot.timer
echo
echo "Done. Next run: $(systemctl list-timers youtube-autopilot.timer --no-legend | awk '{print $1, $2, $3}')"
echo "Run one now:   systemctl start youtube-autopilot"
echo "Watch it:      journalctl -u youtube-autopilot -f"
