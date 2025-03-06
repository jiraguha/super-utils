# Pulumi Env Config Functions for .zshrc
# Add these functions to your .zshrc file

# Base alias to run the script from URL
alias pulumi-env="deno run --allow-read --allow-run https://raw.githubusercontent.com/jiraguha/super-utils/refs/heads/main/pulumi-env/index.ts"

# Convenience aliases
alias penv="pulumi-env"
alias penvd="pulumi-env --dry-run"
alias penvr="pulumi-env --no-camel-case"
alias penvdr="pulumi-env --dry-run --no-camel-case"

# Enhanced completion for pulumi-env commands
_pulumi_env_complete() {
  local state
  local -a env_files options

  _arguments -C \
    '--env-file=[Specify an environment file]:env file:->env_files' \
    '--dry-run[Test without making changes]' \
    '--no-camel-case[Keep original variable names]' \
    '*:env file:->env_files'

  case $state in
    env_files)
      # Find all .env* files in current directory
      env_files=($(ls -1 | grep -E '\.env.*$' 2>/dev/null))
      if [[ ${#env_files} -eq 0 ]]; then
        # If no .env files found, suggest creating one
        _message "No .env files found. Create one first."
      else
        # Show available .env files with descriptions
        local -a env_file_descriptions
        for file in $env_files; do
          # Add description based on filename
          case $file in
            .env.production|production.env)
              env_file_descriptions+=("$file:Production environment")
              ;;
            .env.staging|staging.env)
              env_file_descriptions+=("$file:Staging environment")
              ;;
            .env.development|development.env|.env.dev|dev.env)
              env_file_descriptions+=("$file:Development environment")
              ;;
            .env.local|local.env)
              env_file_descriptions+=("$file:Local environment")
              ;;
            .env)
              env_file_descriptions+=("$file:Default environment")
              ;;
            *)
              env_file_descriptions+=("$file:Custom environment")
              ;;
          esac
        done
        _describe -t env_files "Environment files" env_file_descriptions
      fi
      ;;
  esac
}

# Register completion
compdef _pulumi_env_complete pulumi-env penv penvd penvr penvdr

# Print usage info for the command
pulumi_env_help() {
  echo "Pulumi Env Config - Set Pulumi config from .env files"
  echo
  echo "Usage:"
  echo "  penv [options] [file]      Set Pulumi config from .env file"
  echo "  penvd [file]               Dry run (test without making changes)"
  echo "  penvr [file]               Use raw variable names (no camelCase)"
  echo "  penvdr [file]              Dry run with raw variable names"
  echo
  echo "Options:"
  echo "  --env-file=FILE            Specify an environment file (default: .env)"
  echo "  --dry-run                  Test without making changes"
  echo "  --no-camel-case            Keep original variable names"
  echo
  echo "Examples:"
  echo "  penv                       # Use default .env file"
  echo "  penv production.env        # Use production.env file"
  echo "  penvd staging.env          # Dry run with staging.env"
  echo "  penvr .env.local           # Use raw names with .env.local"
}

# Alias for help
alias penvh="pulumi_env_help"