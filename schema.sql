CREATE DATABASE IF NOT EXISTS hex_db;
USE hex_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_address VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) DEFAULT 'HEX_Trader',
    kyc_status ENUM('Pending', 'Verified', 'Rejected') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS balances (
    wallet_address VARCHAR(255) PRIMARY KEY,
    hex_balance DECIMAL(18, 8) DEFAULT 0.00,
    myrc_balance DECIMAL(18, 8) DEFAULT 0.00,
    FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
);

CREATE TABLE IF NOT EXISTS trade_history (
    trade_id VARCHAR(100) PRIMARY KEY,
    wallet_address VARCHAR(255),
    side ENUM('Buy', 'Sell'),
    amount DECIMAL(18, 8),
    price DECIMAL(18, 8),
    latency_ms FLOAT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
