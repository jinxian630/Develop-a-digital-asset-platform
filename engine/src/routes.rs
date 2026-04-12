use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::order::{NewOrderRequest, Order};
use crate::orderbook::OrderBook;
use crate::types::*;

pub type SharedBook = Arc<Mutex<OrderBook>>;

// POST /order
// Accepts a new order, validates it, adds to the book, then attempts a match.
pub async fn post_order(
    State(book): State<SharedBook>,
    Json(req): Json<NewOrderRequest>,
) -> Result<Json<OrderResponse>, (StatusCode, Json<ErrorResponse>)> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let order = Order {
        id: Uuid::new_v4(),
        side: req.side,
        coin_type: req.coin_type,
        amount: req.amount,
        price: req.price,
        owner_address: req.owner_address,
        coin_object_id: req.coin_object_id,
        timestamp,
    };

    let order_id = order.id.to_string();
    let side_label = format!("{:?}", order.side).to_uppercase();

    println!(
        "\n[ORDER] New {:?} order received",
        order.side
    );
    println!(
        "  ID      : {}",
        order_id
    );
    println!(
        "  Amount  : {} raw units",
        order.amount
    );
    println!(
        "  Price   : {} raw units",
        order.price
    );
    println!(
        "  Owner   : {}…{}",
        &order.owner_address[..8.min(order.owner_address.len())],
        &order.owner_address[order.owner_address.len().saturating_sub(4)..]
    );

    let mut book = book.lock().await;

    // Add to book with validation
    book.add_order(order).map_err(|e| {
        println!("[ORDER] ✗ Rejected: {}", e);
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: e }),
        )
    })?;

    println!(
        "[BOOK]  {} side added → Bids: {} level(s) | Asks: {} level(s)",
        side_label,
        book.bids.len(),
        book.asks.len()
    );

    // Attempt match after every new order
    println!("[MATCH] Checking for match...");
    if let Some((buy, sell)) = book.match_orders() {
        println!(
            "[MATCH] ✓ MATCHED!  Buy {} @ {}  <->  Sell {} @ {}",
            &buy.id.to_string()[..8], buy.price,
            &sell.id.to_string()[..8], sell.price
        );
        println!("[MATCH] Notifying gas station for settlement...");
        // Drop the lock before making an async HTTP call
        drop(book);
        emit_to_gas_station(buy, sell).await;
    } else {
        println!("[MATCH] No match yet — order resting in book.");
    }

    Ok(Json(OrderResponse {
        order_id,
        status: "accepted".to_string(),
    }))
}


// GET /orderbook
// Returns a snapshot of current bids and asks.
pub async fn get_orderbook(
    State(book): State<SharedBook>,
) -> Json<OrderBookSnapshot> {
    let book = book.lock().await;

    let bids = book
        .bids
        .iter()
        .rev() // highest price first
        .map(|(price, queue)| PriceLevel {
            price: *price,
            orders: queue
                .iter()
                .map(|o| OrderSummary {
                    id: o.id.to_string(),
                    amount: o.amount,
                    owner_address: o.owner_address.clone(),
                })
                .collect(),
        })
        .collect();

    let asks = book
        .asks
        .iter() // lowest price first
        .map(|(price, queue)| PriceLevel {
            price: *price,
            orders: queue
                .iter()
                .map(|o| OrderSummary {
                    id: o.id.to_string(),
                    amount: o.amount,
                    owner_address: o.owner_address.clone(),
                })
                .collect(),
        })
        .collect();

    Json(OrderBookSnapshot { bids, asks })
}

// DELETE /order/:id
// Cancels an order by UUID.
pub async fn delete_order(
    State(book): State<SharedBook>,
    Path(id): Path<String>,
) -> Result<Json<CancelResponse>, (StatusCode, Json<ErrorResponse>)> {
    let order_id = Uuid::parse_str(&id).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid order ID format".to_string(),
            }),
        )
    })?;

    let mut book = book.lock().await;
    let cancelled = book.cancel_order(order_id);

    Ok(Json(CancelResponse { cancelled }))
}

// Internal: emit matched pair to the Node.js gas station
async fn emit_to_gas_station(buy: Order, sell: Order) {
    let gas_station_url = std::env::var("GAS_STATION_URL")
        .unwrap_or_else(|_| "http://localhost:8081".to_string());

    let payload = serde_json::json!({
        "coinAObjectId": buy.coin_object_id,
        "coinBObjectId": sell.coin_object_id,
        "coinTypeA": buy.coin_type,
        "coinTypeB": sell.coin_type,
        "recipientA": buy.owner_address,
        "recipientB": sell.owner_address,
        "buyOrderId": buy.id,
        "sellOrderId": sell.id,
        "amount": buy.amount,
    });

    println!(
        "[MATCH] Buy {} @ {} <-> Sell {} @ {}",
        buy.id, buy.price, sell.id, sell.price
    );

    match reqwest::Client::new()
        .post(format!("{}/api/sponsor", gas_station_url))
        .json(&payload)
        .send()
        .await
    {
        Ok(res) => println!("[SPONSOR] Gas station responded: {}", res.status()),
        Err(e) => println!("[SPONSOR] Gas station error: {}", e),
    }
}
