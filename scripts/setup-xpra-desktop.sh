#!/usr/bin/env bash
set -e

echo "=== Updating system ==="
sudo apt update

echo "=== Installing Xpra ==="
sudo apt install -y xpra

echo "=== Installing XFCE desktop ==="
sudo apt install -y \
  xfce4 \
  xfce4-session \
  xfce4-terminal \
  dbus-x11

echo "=== Stopping any existing Xpra session (:100) ==="
xpra stop :100 || true

echo "=== Starting Xpra with full desktop on :100 ==="
xpra start :100 \
  --start-child=xfce4-session \
  --exit-with-children \
  --bind-tcp=0.0.0.0:14500 \
  --html=on

echo
echo "==============================================="
echo "Xpra desktop started!"
echo "Open in browser:"
echo "  http://<EC2_PUBLIC_IP>:14500"
echo "==============================================="

