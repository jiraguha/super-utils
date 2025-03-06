#!/usr/bin/env zsh

# Pulumi Env Config Manager Installer
# This script clones the repo and sources the zsh functions file

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
GITHUB_USER="jiraguha"
REPO_NAME="pulumi-env"
INSTALL_DIR="$HOME/.pulumi-env"
ZSH_FUNCTIONS_FILE="zshrc-functions.sh"
ZSHRC_FILE="$HOME/.zshrc"
BASHRC_FILE="$HOME/.bashrc"

# Log a message with color
log() {
  local color=$1
  local message=$2
  echo "${color}${message}${NC}"
}

# Check if git is installed
check_git() {
  if ! command -v git &> /dev/null; then
    log $RED "Git is not installed!"
    echo "Please install Git before continuing."
    return 1
  fi
  
  return 0
}

# Clone or update the repository
clone_repo() {
  if [[ -d "$INSTALL_DIR" ]]; then
    log $YELLOW "Repository already exists. Updating..."
    cd "$INSTALL_DIR" && git pull
  else
    log $YELLOW "Cloning repository..."
    git clone "https://github.com/$GITHUB_USER/super-utils/$REPO_NAME.git" "$INSTALL_DIR"
  fi
  
  if [[ $? -ne 0 ]]; then
    log $RED "Failed to clone or update repository."
    return 1
  fi
  
  log $GREEN "Repository ready."
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
  if grep -q "$INSTALL_DIR/$ZSH_FUNCTIONS_FILE" "$config_file"; then
    log $YELLOW "Functions are already sourced in your $shell_type configuration."
    return 0
  fi
  
  # Add source line to shell config
  echo "" >> "$config_file"
  echo "# Added by Pulumi Env Config installer on $(date)" >> "$config_file"
  echo "if [[ -f \"$INSTALL_DIR/$ZSH_FUNCTIONS_FILE\" ]]; then" >> "$config_file"
  echo "  source \"$INSTALL_DIR/$ZSH_FUNCTIONS_FILE\"" >> "$config_file"
  echo "fi" >> "$config_file"
  
  log $GREEN "Updated $shell_type configuration to source the functions file."
  return 0
}

# Display usage information
show_usage() {
  echo ""
  log $GREEN "Installation Complete!"
  echo ""
  echo "To start using Pulumi Env Config:"
  echo "  1. Restart your shell or run: source $ZSHRC_FILE"
  echo "  2. Use the commands:"
  echo "     - penv                    # Use default .env file"
  echo "     - penvd                   # Dry run with default .env file"
  echo "     - penvr                   # Use raw variable names (no camelCase)"
  echo ""
  
  if [[ "$GITHUB_USER" == "YOUR_USERNAME" ]]; then
    log $YELLOW "Don't forget to update the repository URL in this script"
    log $YELLOW "before distributing it (replace YOUR_USERNAME)."
  fi
}

# Main installation function
main() {
  echo ""
  log $YELLOW "Installing Pulumi Env Config Manager..."
  
  # Check dependencies
  check_git || return 1
  
  # Install
  clone_repo || return 1
  update_shell_config
  show_usage
}

# Run the installation
main