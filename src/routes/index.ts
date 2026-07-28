NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/swiftchain
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=10
LOG_LEVEL=debug

# Comma-separated list of allowed frontend origins. Use "*" to allow any origin (not recommended for production).
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ─── Stellar / Soroban ─────────────────────────────────────────────────────────
# Soroban RPC endpoint.
# Testnet  : https://soroban-testnet.stellar.org
# Mainnet  : https://soroban-mainnet.stellar.org (or a custom Horizon/RPC node)
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Network passphrase — must match SOROBAN_RPC_URL.
# Testnet  : Test SDF Network ; September 2015
# Mainnet  : Public Global Stellar Network ; September 2015
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Friendly alias used in logs/responses ("mainnet" | "testnet" | "futurenet")
STELLAR_NETWORK=testnet

# Request timeout (ms) for Soroban RPC calls. Default: 10000
SOROBAN_RPC_TIMEOUT_MS=10000

# ─── Indexer lag monitoring ────────────────────────────────────────────────────
# Number of ledgers the indexer may fall behind the network before a critical
# alert is raised. Default: 50
INDEXER_LAG_ALERT_THRESHOLD=50

# How often (ms) the background monitor compares processed vs. network ledger.
# Default: 60000 (1 minute)
INDEXER_LAG_CHECK_INTERVAL_MS=60000

# Optional webhook URL notified (HTTP POST) whenever the lag threshold is
# breached. Leave blank to disable webhook notifications (alerts are still
# logged and persisted either way).
INDEXER_LAG_WEBHOOK_URL=

# ─── Escrow indexer ─────────────────────────────────────────────────────────────
# Deployed escrow Soroban contract id (the "C..." address) whose events the
# escrow indexer subscribes to.
ESCROW_CONTRACT_ID=

# Event topic emitted by the escrow contract when funds are locked. Default: escrow_funded
ESCROW_FUNDED_EVENT_TOPIC=escrow_funded