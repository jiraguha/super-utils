#!/usr/bin/env zsh

# Pulumi Env Config Manager Installer
# This script downloads and sets up the Pulumi Env Config Manager without cloning

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
GITHUB_USER="jiraguha"
REPO_NAME="super-utils"
INSTALL_DIR="$HOME/.local/bin"
CONFIG_DIR="$HOME/.super-script"
ZSH_FUNCTIONS_NAME="aws-param-store-env"
ZSH_FUNCTIONS_FILE="$ZSH_FUNCTIONS_NAME.sh"
ZSHRC_FILE="$HOME/.zshrc"
BASHRC_FILE="$HOME/.bashrc"

# Log a message with color
log() {
  local color=$1
  local message=$2
  echo "${color}${message}${NC}"
}

# Check if curl is installed
check_curl() {
  if ! command -v curl &> /dev/null; then
    log $RED "curl is not installed!"
    echo "Please install curl before continuing."
    return 1
  fi

  return 0
}

# Create necessary directories
create_dirs() {
  mkdir -p "$INSTALL_DIR" "$CONFIG_DIR"

  if [[ $? -ne 0 ]]; then
    log $RED "Failed to create directories."
    return 1
  fi

  return 0
}

# Download files directly from GitHub
download_files() {
  # Download the zsh functions file
  local funcs_url="https://raw.githubusercontent.com/$GITHUB_USER/$REPO_NAME/main/$ZSH_FUNCTIONS_NAME/zshrc-functions.sh"
  local funcs_dest="$CONFIG_DIR/$ZSH_FUNCTIONS_FILE"

  log $YELLOW "Downloading shell functions..."
  if curl -s "$funcs_url" -o "$funcs_dest"; then
    log $GREEN "Shell functions downloaded!"
  else
    log $RED "Failed to download shell functions."
    return 1
  fi

  return 0
}

# Update shell configuration
update_shell_config() {
  local shell_type

  # Determine which shell configuration to update
  if [[ -n "$ZSH_VERSION" ]]; then
    shell_type="zsh"
    config_file="$ZSHRC_FILE"
  elif [[ -n "$BASH_VERSION" ]]; then
    shell_type="bash"
    config_file="$BASHRC_FILE"
  else
    log $YELLOW "Unknown shell. Defaulting to zsh."
    shell_type="zsh"
    config_file="$ZSHRC_FILE"
  fi

  log $YELLOW "Updating $shell_type configuration..."

  # Check if already sourced
  if grep -q "$CONFIG_DIR/$ZSH_FUNCTIONS_FILE" "$config_file"; then
    log $YELLOW "Functions are already sourced in your $shell_type configuration."
    return 0
  fi

  # Add source line to shell config
  echo "" >> "$config_file"
  echo "# Added by AWS Parameter Store Env Config installer on $(date)" >> "$config_file"
  echo "if [[ -f \"$CONFIG_DIR/$ZSH_FUNCTIONS_FILE\" ]]; then" >> "$config_file"
  echo "  source \"$CONFIG_DIR/$ZSH_FUNCTIONS_FILE\"" >> "$config_file"
  echo "fi" >> "$config_file"

  # Make sure the bin directory is in PATH
  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "" >> "$config_file"
    echo "# Add AWS Parameter Store Env Config to PATH" >> "$config_file"
    echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$config_file"

    # Update current session
    export PATH="$PATH:$INSTALL_DIR"
  fi

  log $GREEN "Updated $shell_type configuration to source the functions file."
  return 0
}


# Main installation function
main() {
  echo ""
  log $YELLOW "AWS Parameter Store Env Config Manager..."

  # Check dependencies
  check_curl || return 1

  # Install
  create_dirs || return 1
  download_files || return 1
  update_shell_config
}

# Run the installation
main