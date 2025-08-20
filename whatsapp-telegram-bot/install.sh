#!/bin/bash

# WhatsApp Telegram Bot Auto Installation Script
# For Ubuntu/Debian VPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} WhatsApp Telegram Bot Installer${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root for security reasons."
        print_status "Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Install Node.js
install_nodejs() {
    print_status "Installing Node.js..."
    
    # Check if Node.js is already installed
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        print_status "Node.js is already installed: $NODE_VERSION"
        
        # Check if version is 18+
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [ "$MAJOR_VERSION" -ge 18 ]; then
            print_status "Node.js version is sufficient (18+)"
            return
        else
            print_warning "Node.js version is too old. Upgrading..."
        fi
    fi
    
    # Install Node.js 18.x
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    print_status "Node.js installed: $(node -v)"
    print_status "npm installed: $(npm -v)"
}

# Install system dependencies
install_system_deps() {
    print_status "Installing system dependencies..."
    
    sudo apt update
    sudo apt install -y \
        curl \
        wget \
        git \
        build-essential \
        python3 \
        python3-pip \
        nginx \
        certbot \
        python3-certbot-nginx \
        htop \
        unzip \
        software-properties-common
}

# Install Redis (optional)
install_redis() {
    read -p "Do you want to install Redis for better caching? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Installing Redis..."
        sudo apt install -y redis-server
        sudo systemctl enable redis-server
        sudo systemctl start redis-server
        print_status "Redis installed and started"
    else
        print_status "Skipping Redis installation. File cache will be used."
    fi
}

# Install PM2
install_pm2() {
    print_status "Installing PM2..."
    sudo npm install -g pm2
    
    # Setup PM2 startup
    pm2 startup | tail -1 | sudo bash
    print_status "PM2 installed and configured"
}

# Create application user and directory
setup_app() {
    print_status "Setting up application..."
    
    # Create app directory
    sudo mkdir -p /var/www/whatsapp-telegram-bot
    sudo chown $USER:$USER /var/www/whatsapp-telegram-bot
    
    # Clone repository (you'll need to replace this with actual repo URL)
    read -p "Enter your repository URL (or press Enter to skip): " REPO_URL
    
    if [ ! -z "$REPO_URL" ]; then
        print_status "Cloning repository..."
        git clone $REPO_URL /var/www/whatsapp-telegram-bot
    else
        print_status "Repository not cloned. You'll need to upload files manually to /var/www/whatsapp-telegram-bot"
    fi
    
    cd /var/www/whatsapp-telegram-bot
    
    # Install dependencies if package.json exists
    if [ -f "package.json" ]; then
        print_status "Installing Node.js dependencies..."
        npm install --production
    fi
    
    # Create required directories
    mkdir -p sessions logs cache
}

# Setup environment file
setup_environment() {
    print_status "Setting up environment configuration..."
    
    cd /var/www/whatsapp-telegram-bot
    
    if [ ! -f ".env" ]; then
        # Create .env file
        read -p "Enter your Telegram Bot Token: " BOT_TOKEN
        read -p "Enter your Telegram User ID: " USER_ID
        read -p "Enter Redis URL (or press Enter for file cache): " REDIS_URL
        
        cat > .env << EOF
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=$BOT_TOKEN
OWNER_TELEGRAM_ID=$USER_ID

# Server Configuration
PORT=3000
NODE_ENV=production

# Cache Configuration
CACHE_TYPE=${REDIS_URL:+redis}${REDIS_URL:-file}
REDIS_URL=${REDIS_URL:-redis://localhost:6379}

# WhatsApp Session
SESSION_PATH=./sessions
EOF
        
        print_status ".env file created"
    else
        print_status ".env file already exists"
    fi
}

# Setup Nginx reverse proxy
setup_nginx() {
    read -p "Do you want to setup Nginx reverse proxy? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your domain name (e.g., bot.yourdomain.com): " DOMAIN
        
        if [ ! -z "$DOMAIN" ]; then
            print_status "Setting up Nginx for $DOMAIN..."
            
            sudo tee /etc/nginx/sites-available/whatsapp-telegram-bot << EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
            
            sudo ln -sf /etc/nginx/sites-available/whatsapp-telegram-bot /etc/nginx/sites-enabled/
            sudo nginx -t && sudo systemctl reload nginx
            
            # Setup SSL with Let's Encrypt
            read -p "Do you want to setup SSL certificate with Let's Encrypt? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                sudo certbot --nginx -d $DOMAIN
                print_status "SSL certificate installed"
            fi
            
            print_status "Nginx configured for $DOMAIN"
        fi
    fi
}

# Setup systemd service
setup_systemd() {
    print_status "Setting up systemd service..."
    
    sudo tee /etc/systemd/system/wa-telegram-bot.service << 'EOF'
[Unit]
Description=WhatsApp Telegram Bot
Documentation=https://github.com/username/whatsapp-telegram-bot
After=network.target

[Service]
Environment=NODE_ENV=production
Type=simple
User=www-data
WorkingDirectory=/var/www/whatsapp-telegram-bot
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
KillMode=mixed
KillSignal=SIGTERM
TimeoutSec=60

# Resource limits for low-spec VPS
MemoryLimit=512M
CPUQuota=80%

# Security settings
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/www/whatsapp-telegram-bot/sessions
ReadWritePaths=/var/www/whatsapp-telegram-bot/logs
ReadWritePaths=/var/www/whatsapp-telegram-bot/cache

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=wa-telegram-bot

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable wa-telegram-bot
    
    print_status "Systemd service configured"
}

# Start application
start_app() {
    print_status "Starting application..."
    
    cd /var/www/whatsapp-telegram-bot
    
    # Choose startup method
    echo "Choose startup method:"
    echo "1) PM2 (Recommended)"
    echo "2) Systemd service"
    echo "3) Manual start (for testing)"
    read -p "Enter choice (1-3): " -n 1 -r
    echo
    
    case $REPLY in
        1)
            pm2 start ecosystem.config.js --env production
            pm2 save
            print_status "Application started with PM2"
            ;;
        2)
            sudo systemctl start wa-telegram-bot
            print_status "Application started with systemd"
            ;;
        3)
            print_status "To start manually, run: cd /var/www/whatsapp-telegram-bot && npm start"
            ;;
        *)
            print_error "Invalid choice"
            ;;
    esac
}

# Setup log rotation
setup_logrotate() {
    print_status "Setting up log rotation..."
    
    sudo tee /etc/logrotate.d/wa-telegram-bot << EOF
/var/www/whatsapp-telegram-bot/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 $USER $USER
    postrotate
        pm2 reload wa-telegram-bot > /dev/null 2>&1 || true
    endscript
}
EOF
    
    print_status "Log rotation configured"
}

# Setup firewall
setup_firewall() {
    read -p "Do you want to configure UFW firewall? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Configuring UFW firewall..."
        
        sudo ufw --force reset
        sudo ufw default deny incoming
        sudo ufw default allow outgoing
        
        # Allow SSH
        sudo ufw allow ssh
        
        # Allow HTTP and HTTPS
        sudo ufw allow 'Nginx Full'
        
        # Allow application port (only if not using Nginx)
        read -p "Are you using Nginx reverse proxy? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            sudo ufw allow 3000
        fi
        
        sudo ufw --force enable
        print_status "Firewall configured"
    fi
}

# Main installation function
main() {
    print_header
    
    check_root
    
    print_status "Starting installation process..."
    
    # Ask for confirmation
    read -p "This will install WhatsApp Telegram Bot on your VPS. Continue? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Installation cancelled."
        exit 0
    fi
    
    # Installation steps
    install_system_deps
    install_nodejs
    install_redis
    install_pm2
    setup_app
    setup_environment
    setup_nginx
    setup_systemd
    setup_logrotate
    setup_firewall
    start_app
    
    print_header
    print_status "Installation completed successfully!"
    echo
    print_status "Next steps:"
    echo "1. Configure your .env file if needed: nano /var/www/whatsapp-telegram-bot/.env"
    echo "2. Start your Telegram bot and send /login <your_whatsapp_number>"
    echo "3. Monitor logs: pm2 logs or journalctl -u wa-telegram-bot -f"
    echo "4. Check status: pm2 status or systemctl status wa-telegram-bot"
    echo
    print_status "For support, check the README.md file"
}

# Run main function
main "$@"