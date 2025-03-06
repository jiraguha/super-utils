# Pulumi Environment Config Manager

A simple utility for setting Pulumi configuration values from environment variables in `.env` files.

## Overview

This tool allows you to easily configure Pulumi stack settings from a `.env` file. It automatically:

- Reads `.env` files and sets values as Pulumi configuration
- Handles secrets marked with `#@secret` annotations
- Converts `UPPER_SNAKE_CASE` to `camelCase` by default (optional)
- Provides a dry run mode for testing configurations

## Features

- **Secret Detection**: Automatically identifies variables marked with `#@secret` comments
- **Name Transformation**: Converts environment variable names to camelCase (configurable)
- **Dry Run**: Test what configuration would be set without making changes
- **Custom Environments**: Specify different `.env` files for different environments
- **Shell Integration**: Convenient ZSH functions for daily use

## Prerequisites

- [Deno](https://deno.land/#installation) installed on your system
- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/) installed and configured

## Installation

### Quick Install

Install with a single command:

```bash
curl -s https://raw.githubusercontent.com/jiraguha/super-utils/main/pulumi-env/install.sh | zsh
```

This will:
1. Clone the repository to `~/.pulumi-env-config`
2. Add the ZSH functions to your `.zshrc` file

### Manual Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jiraguha/super-utils/pulumi-env.git
   ```

2. Add the following to your `.zshrc` file:
   ```bash
   source /path/to/pulumi-env/zshrc-functions.sh
   ```

## Usage

### Basic Usage with ZSH Functions

After installation, you can use these convenient functions:

```bash
# Apply configuration from default .env file
penv

# Dry run to see what would be configured without making changes
penvd

# Use raw variable names (no camelCase conversion)
penvr
```

### With Custom .env Files

```bash
# Use a specific environment file
penv production.env

# Dry run with staging environment
penvd staging.env

# No camelCase with dry run for testing
penvr dev.env true
```

### Using the Deno Script Directly

```bash
# Basic usage
./deno-pulumi-env.ts

# With options
./deno-pulumi-env.ts --env-file=production.env --dry-run
```

## Env File Format

Create a `.env` file with the following format:

```
# Regular variable
DEBUG=false

#@secret
API_KEY=your-api-key

#@secret
DATABASE_URL=postgres://user:password@localhost:5432/db
```

The `#@secret` annotation must be on a line by itself, directly before the variable it applies to.

## Configuration

The following command-line options are available:

| Option | Description | Default |
|--------|-------------|---------|
| `--env-file=FILE` | Specify a different .env file | `.env` |
| `--dry-run` | Show what would be set without making changes | `false` |
| `--no-camel-case` | Keep original variable names | `false` |

## Examples

### Example 1: Basic Usage

```bash
# Create a .env file
cat > .env << EOL
#@secret
API_KEY=1234567890
DEBUG=true
MAX_CONNECTIONS=100
EOL

# Set Pulumi config
penv
```

This will set:
- `apiKey` as a secret with value `1234567890`
- `debug` with value `true`
- `maxConnections` with value `100`

### Example 2: Production Environment

```bash
# Create a production.env file
cat > production.env << EOL
#@secret
API_KEY=prod-key-12345
#@secret
DATABASE_URL=postgres://user:password@prod-db:5432/app
DEBUG=false
CACHE_TTL=3600
EOL

# Test it first with dry run
penvd production.env

# Then apply if everything looks good
penv production.env
```

### Example 3: Keeping Original Names

```bash
# Create a .env file with specific naming requirements
cat > terraform.env << EOL
#@secret
TF_VAR_api_key=abcdef123456
TF_VAR_region=us-west-2
TF_VAR_instance_count=5
EOL

# Use original names (no camelCase conversion)
penvr terraform.env
```

## Troubleshooting

### Common Issues

1. **Permission denied**: Make sure the script is executable with `chmod +x pulumi-env.ts`
2. **Deno not found**: Install Deno from [deno.land](https://deno.land/#installation)
3. **Pulumi not configured**: Run `pulumi login` to configure Pulumi CLI
4. **No active stack**: Use `pulumi stack select` to select a stack

### Debug Tips

- Run with `--dry-run` to see what would be configured without making changes
- Check your `.env` file syntax for proper formatting
- Ensure `#@secret` annotations are on their own line

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.