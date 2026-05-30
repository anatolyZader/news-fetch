#!/usr/bin/env bash
# Example iptables egress hardening on a bare Linux VM (Ubuntu/Debian).
# ADAPT interface and run as root. Test on staging; wrong rules can lock out SSH.
set -euo pipefail

IFACE="${EGRESS_IFACE:-eth0}"

echo "Applying egress deny for RFC1918 + link-local on ${IFACE} (example only)"

# Allow established
iptables -A OUTPUT -o "${IFACE}" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow HTTPS to internet (broad — tighten with ipset/domain proxy if needed)
iptables -A OUTPUT -o "${IFACE}" -p tcp --dport 443 -j ACCEPT

# Deny private/metadata destinations
for cidr in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16; do
  iptables -A OUTPUT -o "${IFACE}" -d "${cidr}" -j REJECT
done

echo "Rules applied. Persist with iptables-persistent or nftables equivalent."
