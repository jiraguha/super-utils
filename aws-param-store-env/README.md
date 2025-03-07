# AWS Parameter Store Env Config

A utility for setting AWS Parameter Store values from environment variables in `.env` files, with a security-first approach.

## Overview

This tool simplifies the process of loading configuration from `.env` files into AWS Parameter Store. It automatically:

- Reads `.env` files and creates corresponding SSM parameters
- Treats all variables as secrets by default (uses SecureString type)
- Supports the `#@notSecured` annotation for non-sensitive values
- Organizes parameters under path prefixes for different environments
- Provides a dry run mode for testing configuration
- Works with different environment files for staging, production, etc.

## Features

- **Security First**: All variables are treated as secrets by default (SecureString type)
- **Non-Secret Annotation**: Use `#@notSecured` for parameters that don't need encryption
- **Path Prefixing**: Groups parameters under environment-specific paths
- **Dry Run**: Test what parameters would be set without making changes
- **Quoted Values Support**: Properly handles quoted values in .env files
- **Shell Integration**: Convenient ZSH functions for daily use
- **Tab Completion**: Intelligent completion for environment files and stacks

## Prerequisites

- [Deno](https://deno.land/#installation) installed on your system
- [AWS CLI](https://aws.amazon.com/cli/) installed and configured with appropriate permissions
- Permissions to write to AWS Parameter Store

## Installation

### Quick Install

Install with a single command:

```bash
curl -s https://raw.githubusercontent.com/jiraguha/super-utils/refs/heads/main/aws-param-store-env/install.sh | zsh
```

This will:
1. Download the necessary files
2. Add the ZSH functions to your `.zshrc` or `.bashrc` file

### Manual Installation

1. Save the script:
   ```bash
   curl -s https://raw.githubusercontent.com/jiraguha/super-utils/refs/heads/main/aws-param-store-env/index.ts > ~/.local/bin/aws-param-store-env
   chmod +x ~/.local/bin/aws-param-store-env
   ```

2. Add the ZSH functions to your `.zshrc` file:
   ```bash
   curl -s https://raw.githubusercontent.com/jiraguha/super-utils/refs/heads/main/aws-param-store-env/zshrc-functions.sh >> ~/.zshrc
   ```

## Usage

### Basic Usage with ZSH Functions

After installation, you can use these environment-specific functions:

```bash
# Set parameters using the dev stack
apsenv-dev

# Set parameters using the staging stack with a specific env file
apsenv-staging staging.env

# Set parameters using the production stack with dry run enabled
apsenv-prod production.env true
```

### Direct Script Usage

```bash
# Basic usage (requires stack parameter)
aws-param-store-env --stack=myapp/dev

# With additional options
aws-param-store-env --env-file=production.env --stack=myapp/prod --dry-run
```

## Env File Format

Create a `.env` file with the following format:

```
# Regular parameter (will be a SecureString type by default)
API_KEY="your-api-key"
DATABASE_URL='postgres://user:password@localhost:5432/db'

# For non-sensitive values, use #@notSecured
#@notSecured
DEBUG=false

#@notSecured
LOG_LEVEL="info"
```

The `#@notSecured` annotation must be on a line by itself, directly before the variable it applies to. Values can be optionally quoted with single or double quotes.

## Configuration

The following command-line options are available:

| Option | Description | Default | Required |
|--------|-------------|---------|----------|
| `--stack=STACK` | Parameter Store path prefix | None | Yes |
| `--env-file=FILE` | Specify a different .env file | `.env` | No |
| `--dry-run` | Show what would be set without making changes | `false` | No |

## Examples

### Example 1: Basic Usage

```bash
# Create a .env file
cat > .env << EOL
API_KEY=1234567890
DATABASE_URL=postgres://user:password@localhost:5432/db
#@notSecured
DEBUG=true
#@notSecured
MAX_CONNECTIONS=100
EOL

# Set AWS Parameter Store values (stack is required)
aws-param-store-env --stack=myapp/common
```

This will create:
- `/myapp/common/API_KEY` as a SecureString with value `1234567890`
- `/myapp/common/DATABASE_URL` as a SecureString
- `/myapp/common/DEBUG` as a String with value `true`
- `/myapp/common/MAX_CONNECTIONS` as a String with value `100`

### Example 2: Production Environment

```bash
# Create a production.env file
cat > production.env << EOL
API_KEY=prod-key-12345
DATABASE_URL=postgres://user:password@prod-db:5432/app
#@notSecured
DEBUG=false
#@notSecured
CACHE_TTL=3600
EOL

# Test it first with dry run
aws-param-store-env --env-file=production.env --stack=myapp/prod --dry-run

# Then apply if everything looks good
aws-param-store-env --env-file=production.env --stack=myapp/prod
```

This will create parameters under the `/myapp/prod/` path:
- `/myapp/prod/API_KEY` as a SecureString
- `/myapp/prod/DATABASE_URL` as a SecureString
- `/myapp/prod/DEBUG` as a String
- `/myapp/prod/CACHE_TTL` as a String

### Example 3: Using Environment Shortcuts

```bash
# Use the production environment helper
apsenv-prod production.env

# Use the development environment helper with dry run
apsenv-dev .env true
```

## AWS Parameter Store Structure

The parameters will be organized in AWS Parameter Store based on the stack prefix:

```
/
├── myapp/
│   ├── dev/
│   │   ├── API_KEY (SecureString)
│   │   ├── DATABASE_URL (SecureString)
│   │   ├── DEBUG (String)
│   │   └── LOG_LEVEL (String)
│   ├── staging/
│   │   ├── API_KEY (SecureString)
│   │   ├── DATABASE_URL (SecureString)
│   │   ├── DEBUG (String)
│   │   └── LOG_LEVEL (String)
│   └── prod/
│       ├── API_KEY (SecureString)
│       ├── DATABASE_URL (SecureString)
│       ├── DEBUG (String)
│       └── LOG_LEVEL (String)
```

Note that by default, all parameters are created as SecureString except those explicitly marked with `#@notSecured`.

## Troubleshooting

### Common Issues

1. **Permission denied**: Make sure the script is executable with `chmod +x aws-param-store-env.ts`
2. **AWS CLI errors**: Verify your AWS credentials are properly configured
3. **Access denied to Parameter Store**: Check that your AWS user has permissions to write to SSM Parameter Store

### Debug Tips

- Run with `--dry-run` to see what would be configured without making changes
- Check your `.env` file syntax for proper formatting
- Ensure `#@notSecured` annotations are on their own line
- Verify AWS CLI configuration with `aws sts get-caller-identity`

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.