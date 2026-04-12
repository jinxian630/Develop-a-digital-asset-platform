use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: Uuid,
    pub side: Side,
    pub coin_type: String,       // e.g. "0x2::sui::SUI"
    pub amount: u64,             // base units, must be >= MIN_TRADE_AMOUNT
    pub price: u64,              // base units per unit
    pub owner_address: String,   // Sui address of the trader
    pub coin_object_id: String,  // on-chain object ID from getCoins()
    pub timestamp: u64,          // Unix ms — determines FIFO priority
}

// Incoming POST /order body from the frontend
#[derive(Debug, Deserialize)]
pub struct NewOrderRequest {
    pub side: Side,
    pub coin_type: String,
    pub amount: u64,
    pub price: u64,
    pub owner_address: String,
    pub coin_object_id: String,
}
