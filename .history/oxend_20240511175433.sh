#!/bin/bash

# Define variables
DO_TOKEN="YOUR_DIGITALOCEAN_API_TOKEN"
NODE_NAME="oxen-node"
REGION="nyc1"
SIZE="s-2vcpu-4gb"  # 4GB of RAM
IMAGE="ubuntu-20-04-x64"
SSH_KEY="YOUR_SSH_KEY_ID"

# Create droplet
DROPLET_ID=$(curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $DO_TOKEN" -d '{"name":"'$NODE_NAME'","region":"'$REGION'","size":"'$SIZE'","image":"'$IMAGE'","ssh_keys":["'$SSH_KEY'"],"tags":["oxen-node"]}' "https://api.digitalocean.com/v2/droplets" | jq -r '.droplet.id')

echo "Droplet created with ID: $DROPLET_ID"

# Wait for droplet to be ready
while true; do
    STATUS=$(curl -s -X GET -H "Content-Type: application/json" -H "Authorization: Bearer $DO_TOKEN" "https://api.digitalocean.com/v2/droplets/$DROPLET_ID" | jq -r '.droplet.status')
    if [ "$STATUS" = "active" ]; then
        break
    else
        echo "Waiting for droplet to be ready..."
        sleep 10
    fi
done

# Get droplet IP address
IP_ADDRESS=$(curl -s -X GET -H "Content-Type: application/json" -H "Authorization: Bearer $DO_TOKEN" "https://api.digitalocean.com/v2/droplets/$DROPLET_ID" | jq -r '.droplet.networks.v4[0].ip_address')

echo "Droplet IP address: $IP_ADDRESS"

# SSH into droplet and set up Oxen Service Node
ssh root@$IP_ADDRESS << EOF
    sudo apt update
    sudo apt upgrade -y
    sudo ufw allow 22020/tcp
    sudo ufw allow 22021/tcp
    sudo ufw allow 22022/tcp
    sudo ufw allow 22025/tcp
    sudo ufw allow 1090/udp
    sudo ufw allow 22020/udp
    sudo curl -so /etc/apt/trusted.gpg.d/oxen.gpg https://deb.oxen.io/pub.gpg
    sudo echo "deb https://deb.oxen.io jammy main" | sudo tee /etc/apt/sources.list.d/oxen.list
    sudo apt update
    sudo apt install oxen-service-node -y
    systemctl status oxen-node.service
    oxend status
    sudo oxend-download-lmdb https://public.loki.foundation/loki/data.mdb
    oxend status
    oxend prepare_registration
EOF

echo "Oxen Service Node setup complete"
