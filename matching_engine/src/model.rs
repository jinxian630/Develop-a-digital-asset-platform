use serde::{Deserialize, Serialize};

/// Represents the side of an order in the matching engine.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum OrderSide {
    Buy,
    Sell,
}

/// A single order submitted to the off-chain matching engine.
///
/// - `price` and `quantity` use `u64` (fixed-point) to avoid floating-point errors.
/// - `timestamp` is milliseconds since UNIX epoch for time-priority ordering.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Order {
    #[serde(alias = "order_id")]
    pub id: u64,
    pub player_address: String,
    #[serde(default)]
    pub asset: String,
    pub price: u64,
    #[serde(alias = "quantity")]
    pub amount: u64,
    #[serde(alias = "type")]
    pub side: OrderSide,
    #[serde(default)]
    pub timestamp: u128,
}

/// The result of a successful match between a buy and a sell order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult {
    pub buy_order_id: u64,
    pub sell_order_id: u64,
    pub matched_price: u64,
    pub matched_amount: u64,
}

/// Real-time engine log event sent back to the Admin Dashboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineLog {
    pub timestamp: String,
    pub module: String,
    pub event: String,
    pub performance: String,
    pub phase: String,
    pub gas_saved_estimate: String,
}

/// Combined response to send Match Result and Logging metadata back to Next.js
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse {
    pub match_result: Option<MatchResult>,
    pub logs: Vec<EngineLog>,
}
