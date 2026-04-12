use serde::Serialize;

#[derive(Serialize)]
pub struct OrderResponse {
    pub order_id: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct CancelResponse {
    pub cancelled: bool,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Serialize)]
pub struct OrderBookSnapshot {
    pub bids: Vec<PriceLevel>,
    pub asks: Vec<PriceLevel>,
}

#[derive(Serialize)]
pub struct PriceLevel {
    pub price: u64,
    pub orders: Vec<OrderSummary>,
}

#[derive(Serialize)]
pub struct OrderSummary {
    pub id: String,
    pub amount: u64,
    pub owner_address: String,
}
